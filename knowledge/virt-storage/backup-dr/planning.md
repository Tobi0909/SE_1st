---
id: virt-storage.backup-dr.planning
title: "Disaster recovery: RTO/RPO, kế hoạch khôi phục"
domain: virt-storage
module: virt-storage.backup-dr
level: "chuyên sâu"
prerequisites: ["virt-storage.backup-dr.strategies"]
applies_to:
  - "DR planning cho datacenter on-premises và hybrid cloud"
  - "NIST SP 800-34 Contingency Planning Guide"
status: verified
sources:
  - "https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-34r1.pdf"
  - "https://docs.vmware.com/en/VMware-Live-Recovery/index.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Backup là **chiến thuật** — DR plan là **chiến lược**. Backup tốt mà không có DR plan vẫn có
thể dẫn đến 3 ngày downtime vì không ai biết restore theo thứ tự nào, ai có quyền làm gì, và
infrastructure DR đã sẵn sàng chưa.

NIST SP 800-34 định nghĩa Contingency Planning (kế hoạch dự phòng) là tập hợp các biện pháp
đảm bảo hệ thống thông tin tiếp tục hoạt động được khi có sự cố. DR plan là phần quan trọng
nhất — quyết định hệ thống có phục hồi kịp trong RTO hay không.

## 2. Khái niệm cốt lõi

### RTO và RPO — hai chỉ số nền tảng

**RPO (Recovery Point Objective)**: mất tối đa bao nhiêu **dữ liệu** — tính bằng thời gian
từ điểm backup/snapshot gần nhất đến khi disaster xảy ra.

**RTO (Recovery Time Objective)**: cần khôi phục trong bao lâu — tính từ lúc disaster xảy
ra đến khi hệ thống online lại và phục vụ được user.

```
Timeline của disaster:

  Backup chạy    Disaster      System         System
  lần cuối       xảy ra        detected       restored
      ├──────────────┤────────────┤─────────────┤
      └─── RPO ───┘             └──── RTO ────┘
```

RPO thấp (0-1h) yêu cầu replication liên tục hoặc backup gần realtime. RTO thấp (15min)
yêu cầu hot standby sẵn sàng chạy ngay, không cần restore từ backup.

### Tier hóa workload theo RTO/RPO

Không phải mọi hệ thống đều cần RPO = 0 và RTO = 15 phút — chi phí tăng theo hàm mũ khi
yêu cầu ngày càng strict. Best practice: **phân tier workload** theo mức độ quan trọng:

| Tier | Ví dụ | RPO | RTO | Giải pháp |
|------|-------|-----|-----|-----------|
| 1 — Mission Critical | Core banking, payment | 0 | 15 phút | Sync replication + hot standby |
| 2 — Business Critical | ERP, CRM, email | 1 giờ | 4 giờ | Async replication + warm standby |
| 3 — Important | Internal tools, dev/staging | 4 giờ | 8 giờ | Daily backup + restore |
| 4 — Non-Critical | Archive, static | 24 giờ | 48 giờ | Weekly backup + tape |

**Chi phí tỉ lệ nghịch với RTO/RPO**: Tier 1 có thể đắt hơn Tier 4 gấp 10-50 lần.

### Các loại DR site

**Hot standby** (active/standby): DR site sẵn sàng 100%, data được replication liên tục.
Failover trong phút. Chi phí cao nhất (chạy hệ thống đầy đủ song song liên tục).

**Warm standby**: DR site có sẵn infrastructure, data được sync định kỳ (vài tiếng một lần).
Failover mất vài tiếng (cần restore từ sync point mới nhất, start services).

**Cold standby**: infrastructure chưa provision đầy đủ, chỉ có backup. Failover mất ngày.
Dùng cho workload ít quan trọng hoặc khi budget hạn chế.

**Cloud DR**: sử dụng cloud infrastructure (AWS, Azure, GCP) làm DR site. Không tốn chi phí
cố định khi chưa cần failover (pay-per-use). Thời gian boot cloud instance có thể 5-15 phút.

### DR Plan — tài liệu không thể thiếu

DR Plan bao gồm:

1. **Scope và contact list**: ai được gọi khi disaster, ai có quyền quyết định failover
2. **Criteria kích hoạt**: điều kiện nào trigger DR activation (không phải mọi incident đều
   cần DR)
3. **Recovery procedures**: từng bước khôi phục từng hệ thống theo thứ tự priority
4. **Dependencies map**: hệ thống A cần B trước, B cần C → thứ tự restore rõ ràng
5. **Test schedule**: DR plan phải được test định kỳ (ít nhất 1 lần/năm)
6. **Lessons learned**: cập nhật sau mỗi test hoặc real incident

### RTO testing — kết quả thường gây bất ngờ

Nhiều team **giả định** RTO mà không test thực tế. Khi test, phát hiện:
- Restore từ backup mất 6 giờ, không phải 2 giờ như kế hoạch (chưa tính download từ cloud)
- DNS TTL 1 giờ → user vẫn trỏ vào site cũ thêm 1 giờ sau failover
- License server chỉ có ở site chính → DR site không start được application
- Database backup restore OK nhưng application config trỏ về wrong DB host

## 3. Cách nó hoạt động

### VMware Site Recovery Manager (output minh họa)

VMware SRM là công cụ orchestrate DR cho vSphere — tự động hóa failover/failback:

```
Primary site                       DR site
vSphere Cluster A ──replication──> vSphere Cluster B
      │                                   │
 SRM Server (primary)             SRM Server (DR)
      └──────── SRM pairing ─────────────┘
```

Khi kích hoạt DR:
1. SRM dừng replication
2. Mount replicated datastore ở DR site
3. Start VM theo thứ tự đã định nghĩa trong Recovery Plan
4. Update DNS, load balancer IP

> **Output minh họa** — cần vSphere SRM thật.

### Runbook chi tiết cho một hệ thống web (ví dụ)

```
=== DR RUNBOOK: webApp Production ===
Owner: ops@company.com | Approved by: CTO
Last tested: 2026-09-01 | RTO target: 4h | RPO target: 1h

[Step 1] Confirm disaster declaration (approval from: IT Director or above)
[Step 2] Notify stakeholders (email DL: it-incidents@company.com, #ops-channel)
[Step 3] Restore database to DR site
   - Source: backup job "db-daily" trên S3 bucket DR-backup-bucket
   - Time estimate: 45 phút (50GB database)
   - Owner: DBA team (contact: dba-oncall@company.com)
   - Verify: psql -c "SELECT count(*) FROM orders" → compare with last known count
[Step 4] Start application servers in DR site (2 servers)
   - AMI ID: ami-XXXXXXXX (pre-baked) or deploy Terraform (15 phút)
   - Config: pull from S3 s3://app-config/prod/ 
[Step 5] Update DNS: app.company.com → 203.0.113.X (DR load balancer)
   - DNS TTL đã set sẵn 60s (không phải 3600s)
   - Verify: dig app.company.com @8.8.8.8
[Step 6] Smoke test: curl https://app.company.com/health
[Total estimated time: 2-3h | Buffer to RTO 4h: 1-2h]
```

## 4. Thực hành

**Tính RTO/RPO requirement theo tier** (chạy thật):

```bash
python3 -c "
tiers = [
    ('Tier 1 (Mission Critical)', 0, 15, 'Sync replication + hot standby'),
    ('Tier 2 (Business Critical)', 60, 240, 'Async replication + warm standby'),
    ('Tier 3 (Important)', 240, 480, 'Daily backup + restore'),
    ('Tier 4 (Non-Critical)', 1440, 2880, 'Weekly backup + tape'),
]

print(f'{\"Tier\":<30} {\"RPO\":>6}  {\"RTO\":>6}  Solution')
print('-' * 80)
for name, rpo_min, rto_min, sol in tiers:
    rpo = f'{rpo_min}min' if rpo_min < 60 else f'{rpo_min//60}h'
    rto = f'{rto_min}min' if rto_min < 60 else f'{rto_min//60}h'
    print(f'{name:<30} {rpo:>6}  {rto:>6}  {sol}')
"
```

Kết quả thực tế:

```
Tier                            RPO      RTO  Solution
--------------------------------------------------------------------------------
Tier 1 (Mission Critical)      0min    15min  Sync replication + hot standby
Tier 2 (Business Critical)       1h       4h  Async replication + warm standby
Tier 3 (Important)               4h       8h  Daily backup + restore
Tier 4 (Non-Critical)           24h      48h  Weekly backup + tape
```

**Kiểm tra DNS TTL trước khi DR test** (chạy thật):

```bash
# Kiểm tra TTL hiện tại của domain quan trọng (thay bằng domain thật)
# DNS TTL phải thấp (<300s) trước khi DR để failover nhanh
dig +noall +answer example.com | awk '{print "TTL:", $2, "seconds"}'
```

Kết quả thực tế:

```
TTL: 21600 seconds
```

TTL 21600 giây (6 tiếng) — nếu failover DNS bây giờ, user mất 6 tiếng mới trỏ sang DR site.
**Phải giảm TTL về ≤300s ít nhất 1 ngày trước DR test/activation**.

## 5. Lỗi thường gặp và cách chẩn đoán

**DR test "pass" trên paper nhưng fail khi cần thật**: DR plan không test end-to-end với
traffic thật và load thật. "Paper test" chỉ verify procedure tồn tại, không verify nó hoạt
động đúng. Fix: test DR ít nhất 1 lần/năm với traffic thật (dù chỉ 1-2 giờ trong production
hours thấp).

**RTO vi phạm do dependency không documented**: restore database OK trong 2 giờ nhưng app
server không start vì certificate hết hạn, hoặc external API key expired. Fix: DR plan phải
include checklist tất cả dependency (certificates, API keys, license servers, DNS records).

**DNS TTL cao làm failover mất nhiều giờ**: DNS record có TTL 24 tiếng, sau khi update DNS
trỏ sang DR site phải chờ đến khi cache expire. Fix: giảm TTL về 60-300s ít nhất 24 giờ
trước bất kỳ planned failover nào. Unplanned failover: vẫn phải chờ TTL expire.

**DR site data cũ hơn expected (RPO vi phạm)**: replication job fail âm thầm, không có alert.
Fix: monitor replication lag, alert khi lag vượt RPO/2 (early warning). Test restore từ DR
backup định kỳ, không chỉ check replication status.

**Failback phức tạp hơn failover**: sau khi DR site chạy production, data mới được tạo ở DR
site. Failback = phải sync data từ DR về primary (ngược chiều). Không plan failback = có thể
mất data mới khi failback. Fix: DR plan phải include failback procedure.

## 6. Tình huống thực tế

**Tình huống**: 14:30 thứ Sáu, datacenter chính bị cúp điện toàn bộ (UPS fail). Toàn bộ hệ
thống production down. DR Manager kích hoạt DR Plan cấp độ 1.

**Timeline theo DR Plan**:

```
14:30 — Power outage confirmed, DR Manager declared disaster
14:35 — Notifications sent: IT Director, CTO, ops team
14:40 — DR team bắt đầu theo Runbook

[DB Team] 14:40-15:25 — Restore database từ DR backup (45 phút đúng theo plan)
          15:25 — Verify row count matches last snapshot: OK

[Infra Team] 14:45-15:15 — Provision app servers ở DR site (Terraform 30 phút)
             15:15 — App servers running, config pulled from DR S3

[Network Team] 15:20 — DNS TTL đã là 60s (đã chuẩn bị trước)
               15:20 — Update DNS records → DR load balancer
               15:22 — Propagation complete (60s TTL)

15:25 — Smoke test: curl https://app.company.com/health → HTTP 200
15:30 — Full traffic restored to DR site
```

**Thực tế RTO**: 60 phút (target: 4 giờ) — **đạt**, thậm chí vượt trội vì:
- DR plan đã test 2 tháng trước và được optimize
- DNS TTL đã được set thấp từ trước
- DB team đã practice restore procedure nhiều lần

**Lesson**: DR plan test định kỳ không chỉ verify plan hoạt động — còn giúp team quen với
quy trình, reduce panic và mistakes khi real incident xảy ra.

## 7. Tự kiểm tra

**Câu 1**: RPO = 2 giờ có nghĩa là gì trong thực tế?

a) Hệ thống phải online lại trong 2 giờ  
b) Backup phải chạy xong trong 2 giờ  
c) Tổ chức chấp nhận mất tối đa 2 giờ dữ liệu — vì vậy backup/replication phải xảy ra ít nhất mỗi 2 giờ  
d) DR site phải cách primary site tối thiểu 2 giờ di chuyển

**Đáp án: c** — RPO = Recovery Point Objective = điểm dữ liệu cũ nhất chấp nhận được sau disaster. RPO 2 giờ: nếu disaster xảy ra, mất tối đa 2 giờ data (data từ 2 giờ trước vẫn còn). Điều này yêu cầu backup/snapshot chạy ít nhất mỗi 2 giờ. RTO mới là "bao lâu để online lại".

---

**Câu 2**: Vì sao không phải mọi hệ thống đều cần Tier 1 DR (RPO=0, RTO=15 phút)?

a) Vì Tier 1 chỉ dùng được cho database, không dùng cho web server  
b) Vì Tier 1 yêu cầu synchronous replication và hot standby — chi phí có thể gấp 10-50 lần Tier 4; phần lớn hệ thống không justify chi phí này dựa trên business impact thực tế  
c) Vì Tier 1 không đảm bảo RPO = 0 trên thực tế  
d) Vì regulation chỉ cho phép Tier 1 cho ngân hàng

**Đáp án: b** — Synchronous replication = mỗi write phải được confirm bởi DR site trước khi trả lời client → latency tăng, và cần full infrastructure ở DR site chạy 24/7. Chi phí rất cao. Đối với hệ thống internal tool mà downtime 8 giờ là acceptable, đầu tư vào Tier 1 không hợp lý về mặt kinh doanh.

---

**Câu 3**: Điểm khác biệt cốt lõi giữa hot standby và cold standby là gì?

a) Hot standby dùng SSD, cold standby dùng HDD  
b) Hot standby là cho database, cold standby cho file server  
c) Hot standby có infrastructure sẵn sàng 100% với data được replication liên tục, failover trong phút; cold standby chỉ có backup, cần provision infrastructure từ đầu, failover mất ngày — chi phí hot standby cao hơn nhiều  
d) Hot standby chỉ available trong giờ hành chính

**Đáp án: c** — Hot standby: pay full infrastructure cost 24/7, nhưng RTO rất thấp. Cold standby: không tốn gì khi không dùng, nhưng khi cần phải provision server, restore backup, configure network — mất ngày. Cloud DR thường dùng model gần với hot standby nhưng chỉ trả tiền khi cần (provision on-demand).

---

**Câu 4**: Tại sao DNS TTL phải giảm xuống thấp **trước** khi thực hiện DR failover?

a) Vì DNS server tại DR site cần warm-up time  
b) Vì DNS TTL thấp giúp backup nhanh hơn  
c) Để compliance  
d) Vì DNS record có TTL cao (ví dụ 24h) sẽ được cache bởi resolver trên toàn internet — sau khi đổi DNS trỏ sang DR IP, user vẫn tiếp tục kết nối vào old IP đến khi cache expire; TTL thấp (60-300s) giảm thời gian chờ này xuống còn vài phút

**Đáp án: d** — DNS TTL là thời gian client (browser, resolver) cache record. Nếu TTL = 86400 (1 ngày) và bạn đổi DNS, client vẫn dùng old record thêm 24 giờ. Không thể "flush" cache của mọi client trên internet. Vì vậy: giảm TTL về 60-300s ít nhất 1 TTL period trước failover để đảm bảo khi đổi DNS, propagation xảy ra trong vài phút.

---

**Câu 5**: DR Plan phải được test như thế nào để đảm bảo hiệu quả?

a) Chỉ cần review document hàng năm là đủ  
b) Test bằng cách simulate disaster trong giờ thấp điểm, thực sự switch traffic sang DR site, đo RTO thực tế và verify data integrity — "paper test" không phát hiện được dependency bị thiếu, certificate hết hạn, hay restore thực tế chậm hơn ước tính  
c) Chỉ DBA team cần test, không cần app team  
d) Test 1 lần khi setup xong là đủ

**Đáp án: b** — Paper test (đọc runbook và nói "sẽ làm thế này") không tìm ra vấn đề thực tế: license server chỉ có ở primary, firewall rule DR site chưa được update, hoặc DB restore mất 6 giờ chứ không phải 2 giờ như ước tính. End-to-end test (dù chỉ trong maintenance window) phát hiện những vấn đề này khi còn thời gian sửa — không phải khi real disaster xảy ra.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước trong module:**
- `virt-storage.backup-dr.strategies` — full/incremental backup, quy tắc 3-2-1

**Bài liên quan ngoài module:**
- `sre.incident-response.process` — incident response khi trigger DR
- `sre.postmortem.writing` — sau DR activation phải có postmortem
- `data.mysql-postgres.replication` — replication cho database Tier 1/2

**Nguồn tham khảo:**
- [NIST SP 800-34 Rev.1 — Contingency Planning Guide for Federal Information Systems](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-34r1.pdf)
- [VMware Live Recovery documentation](https://docs.vmware.com/en/VMware-Live-Recovery/index.html)
