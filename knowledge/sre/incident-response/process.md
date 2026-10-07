---
id: sre.incident-response.process
title: "Quy trình ứng phó sự cố: phát hiện, triage, escalation"
domain: sre
module: sre.incident-response
level: "vận hành"
prerequisites: ["monitoring.alerting-design.principles"]
applies_to:
  - "Nguyên lý chung áp dụng cho mọi quy mô team; ví dụ tham chiếu Google SRE và PagerDuty IRP"
status: draft
sources:
  - "https://sre.google/sre-book/managing-incidents/"
  - "https://response.pagerduty.com/before/different_roles/"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Khi hệ thống production gặp sự cố lúc 2 giờ sáng, panic là kẻ thù số một. Không có quy trình
rõ ràng, mọi người đồng thời SSH vào server, log thì chạy, ai cũng tự quyết định — kết quả là
các thay đổi xung đột nhau, không ai biết trạng thái hiện tại là gì, và MTTR tăng gấp đôi. Quy
trình incident response không phải bureaucracy — nó là hệ thống giúp team hành động có tổ chức
dưới áp lực cao.

## 2. Khái niệm cốt lõi

**Vòng đời incident** — 5 giai đoạn tuần tự:

```
Detection → Triage → Mitigation → Resolution → Postmortem
(phát hiện)  (phân loại) (giảm thiệt hại) (khắc phục)  (phân tích gốc rễ)
```

Phân biệt **Mitigation** và **Resolution**:
- **Mitigation**: dừng thiệt hại lan rộng — rollback, tăng capacity, tắt tính năng gây lỗi
- **Resolution**: sửa nguyên nhân gốc rễ thật sự — có thể mất nhiều giờ hoặc nhiều ngày

Trong incident, ưu tiên là mitigation (phục hồi service), không phải resolution. Google SRE
tóm gọn: **"Stop the bleeding, restore service, preserve evidence"**.

**Mức độ nghiêm trọng (severity)**:

| Mức | Ảnh hưởng | Thời gian phản hồi |
|-----|-----------|-------------------|
| **P1 (Critical)** | Toàn bộ service ngừng hoạt động hoặc data loss | Ngay lập tức, 24/7 |
| **P2 (High)** | Một phần lớn user bị ảnh hưởng; degraded nhưng không ngừng | < 30 phút |
| **P3 (Medium)** | Ảnh hưởng nhỏ, workaround tồn tại | Trong giờ làm việc |
| **P4 (Low)** | Cosmetic, không ảnh hưởng chức năng chính | Theo sprint/backlog |

**Khi nào khai báo incident?** (từ Google SRE Book): khai báo nếu:
- Cần thêm hơn 1 team để giải quyết
- User bị ảnh hưởng thật sự (không phải nội bộ)
- Vấn đề kéo dài hơn 1 tiếng mà chưa xác định được nguyên nhân

## 3. Cách nó hoạt động

### Giai đoạn 1: Detection — phát hiện sự cố

Nguồn phát hiện theo thứ tự ưu tiên:
1. **Alert tự động** (Prometheus/Alertmanager, Zabbix) — lý tưởng nhất
2. **Synthetic monitoring** — probe tự động gọi API mỗi 30-60 giây
3. **User/customer báo cáo** — đã đến tay user nghĩa là đã trễ
4. **Engineer tình cờ phát hiện** — unreliable, không nên là nguồn chính

**Detection time** ảnh hưởng trực tiếp MTTA và MTTR. Alert với `for: 5m` trước khi fire giúp
giảm false positive nhưng tăng detection time — trade-off cần cân nhắc theo mức độ nghiêm trọng
của metric.

### Giai đoạn 2: Triage — phân loại và đánh giá

Triage trả lời 3 câu hỏi trong 5 phút đầu:
1. **Scope**: bao nhiêu user bị ảnh hưởng? Toàn bộ hay một phần? Vùng địa lý nào?
2. **Severity**: đây là P1, P2, hay P3?
3. **Impact**: tính năng nào bị ảnh hưởng? Revenue-critical không?

```bash
# Kiểm tra nhanh HTTP status của endpoint production (output minh họa)
curl -s -o /dev/null -w "HTTP %{http_code} | DNS %{time_namelookup}s | Connect %{time_connect}s | Total %{time_total}s\n" \
  https://api.example.com/health

# Xem log lỗi gần nhất (thay thế với công cụ logging thực tế)
journalctl -u myapp.service --since "5 minutes ago" --no-pager | grep -i "error\|fatal\|critical" | tail -20
```

### Giai đoạn 3: Escalation — leo thang đúng người

**Khi nào escalate**:
- Không xác định được nguyên nhân sau 15-20 phút
- Cần thay đổi infrastructure (database, network, cloud config)
- Incident leo thang severity (P3 → P2)

**Quy tắc escalation**:
- Escalate **sớm** hơn muộn — "thêm mắt" không tốn thêm chi phí, nhưng thiếu người đúng tốn
  nhiều thời gian
- Escalate **rõ ràng**: "Tôi cần X từ bạn, trong Y phút" — không phải "có thể giúp tôi không?"
- **Không bypass on-call chain**: nếu có on-call schedule, follow nó — poke thẳng người ngủ
  mà không qua schedule gây burn-out và làm on-call trở nên unreliable

### Giai đoạn 4: Mitigation — "stop the bleeding"

Ưu tiên hành động theo thứ tự:
1. **Rollback** — nếu incident sau deploy, đây là bước đầu tiên (không mất thời gian debug)
2. **Feature flag / circuit breaker** — tắt tính năng gây lỗi để isolate
3. **Scale up** — nếu do overload (thêm replica, tăng CPU/RAM)
4. **Failover** — chuyển traffic sang AZ/region dự phòng
5. **Chỉ sau đó mới debug** — khi service đã ổn định

**Nguyên tắc quan trọng**: trong incident, **chỉ một người thực hiện thay đổi tại một thời điểm**
(Ops Lead theo mô hình Google SRE). Nhiều người cùng thay đổi → không biết thay đổi nào có tác
dụng, khó rollback.

### Incident document — xương sống của coordination

Tạo doc chung ngay từ khi khai báo P1/P2. Template tối giản:

```
## Incident [ID] — [Tiêu đề ngắn]
**Thời gian bắt đầu**: 2026-10-07T02:15+07:00
**Severity**: P1
**IC**: [tên]
**Trạng thái hiện tại**: Investigating

## Timeline
02:15 - Alert fire: error_rate > 5% trên /api/payment
02:18 - [tên] xác nhận: 500 từ payment service, toàn bộ user
02:25 - Deploy v2.3.1 lúc 02:10 nghi ngờ nguyên nhân
02:30 - Rollback về v2.3.0 đang thực hiện

## Thay đổi đang thực hiện
- [tên] đang rollback payment-service về v2.3.0

## Người liên quan
- IC: A | Ops: B | Comms: C
```

## 4. Thực hành

**Kiểm tra timestamp chuẩn** cho incident timeline (chạy thật):

```bash
# Timestamp ISO 8601 với timezone — dùng trong incident doc
date "+%Y-%m-%dT%H:%M:%S%z"
```

Kết quả thực tế:

```
2026-10-07T09:20:21+0700
```

Dùng format này nhất quán trong toàn bộ incident doc — tránh nhầm lẫn UTC vs local time khi
team nhiều timezone.

**Kiểm tra HTTP health endpoint nhanh** (chạy thật với example.com):

```bash
curl -s -o /dev/null -w "HTTP %{http_code} | Total %{time_total}s\n" https://example.com
```

Kết quả thực tế:

```
HTTP 200 | Total 0.458s
```

Trong incident P1, script này chạy mỗi 30 giây để theo dõi recovery.

## 5. Lỗi thường gặp và cách chẩn đoán

**"Chúng ta sẽ fix luôn cho xong"** — trong P1, KHÔNG đồng thời investigate + fix. Tách biệt:
một người coordinate (IC), một người thực hiện thay đổi (Ops), những người còn lại theo dõi.
Cố gắng "vừa debug vừa deploy fix" dẫn đến mất track trạng thái và khó biết thay đổi nào có
tác dụng.

**Không rollback vì "deploy mất thêm 20 phút"** — trong P1, 20 phút downtime tránh được bằng
rollback quan trọng hơn. Nếu rollback pipeline chậm, đó là tech debt cần fix sau incident.

**Khai báo incident "quá muộn"** vì muốn tự giải quyết — khai báo sớm không xấu hổ. Nếu
sau 15 phút chưa xác định được nguyên nhân, khai báo P2 để có thêm người theo dõi. Upgrade
severity dễ hơn downgrade.

## 6. Tình huống thực tế

**Tình huống**: 03:42 sáng, alert fire: `payment_error_rate > 3%` từ 5 phút trước. On-call
(B) nhận alert.

```
03:42 - B nhận alert, check dashboard: lỗi từ payment-service
03:44 - B khai báo incident P1, tạo incident doc, ping IC (A) và Comms (C)
03:45 - A làm IC: "B là Ops, không ai thay đổi gì mà chưa hỏi tôi"
03:46 - B check deploy history: payment-service v2.4.0 deploy lúc 03:30
03:47 - A: "B, rollback payment-service về v2.3.9 ngay"
03:49 - B rollback xong, monitoring: error_rate đang giảm
03:52 - error_rate về 0%, service phục hồi
03:55 - A: "Incident resolved. B, viết timeline đầy đủ. C, gửi update cho stakeholder"
04:00 - C gửi email: "Payment service phục hồi 03:52, investigation tiếp tục vào sáng"
```

Toàn bộ từ khai báo đến resolved: **11 phút**. Không có quy trình, con số đó dễ thành 40+
phút vì mọi người tự debug song song, thay đổi lẫn nhau.

## 7. Tự kiểm tra

**Câu 1**: Sự khác biệt giữa Mitigation và Resolution trong incident response là gì?

a) Mitigation là fix tạm thời, Resolution là fix vĩnh viễn — cả hai xảy ra trong incident  
b) Mitigation dừng thiệt hại và phục hồi service nhanh; Resolution sửa nguyên nhân gốc rễ có thể mất nhiều ngày  
c) Mitigation chỉ dùng cho P1; Resolution cho P2 và P3  
d) Không có sự khác biệt — cả hai đều nghĩa là khắc phục sự cố

**Đáp án: b** — Mitigation là bước ưu tiên trong incident: dừng thiệt hại, phục hồi service
về trạng thái có thể chấp nhận được (rollback, feature flag, scale up). Không nhất thiết phải
hiểu nguyên nhân tại sao. Resolution là sửa nguyên nhân thật sự — có thể xảy ra sau incident,
trong giờ làm việc, không có áp lực 3 giờ sáng. Phân biệt này giúp team không bị mắc kẹt
"phải hiểu xong mới fix" khi user đang bị ảnh hưởng.

---

**Câu 2**: Tại sao trong incident P1, chỉ nên có một người thực hiện thay đổi hệ thống (Ops Lead)?

a) Vì hệ thống chỉ cho phép 1 người SSH vào cùng lúc  
b) Vì nhiều người thay đổi song song dẫn đến không biết thay đổi nào có tác dụng và khó rollback  
c) Vì IC cần phê duyệt từng bước nên chỉ có thể xử lý 1 Ops  
d) Vì quy định bảo mật không cho phép nhiều người cùng vào production

**Đáp án: b** — Khi nhiều người cùng deploy, restart service, thay đổi config — không có cách
biết thay đổi nào đã có tác dụng (hoặc gây thêm vấn đề). Nếu cần rollback, không biết rollback
về đâu. Google SRE gọi đây là "recursive separation of responsibilities": Ops Lead là người duy
nhất chạm vào hệ thống, IC coordinate, SME tư vấn.

---

**Câu 3**: Khi nào nên khai báo incident thay vì tự xử lý?

a) Chỉ khi toàn bộ service ngừng hoạt động hoàn toàn  
b) Khi cần thêm hơn 1 team, user bị ảnh hưởng, hoặc vấn đề kéo dài hơn 1 tiếng chưa xác định nguyên nhân  
c) Khi engineer on-call không biết cách xử lý  
d) Khi severity là P1 hoặc P2 theo định nghĩa của team

**Đáp án: b** — Đây là tiêu chí từ Google SRE Book: (1) cần thêm hơn 1 team/người, (2) user bị
ảnh hưởng, (3) vấn đề kéo dài > 1 tiếng chưa rõ nguyên nhân. Khai báo không phải "thừa nhận
thất bại" — là cơ chế để kích hoạt thêm nguồn lực và đảm bảo coordination. Đáp án d (theo severity)
là phổ biến nhưng chưa đủ — P3 tự xử lý được, P1 ngắn cũng có thể tự xử lý.

---

**Câu 4**: Trong timeline incident, tại sao nên dùng format timestamp ISO 8601 với timezone?

a) Vì ISO 8601 là yêu cầu của PagerDuty API  
b) Vì format này tránh nhầm lẫn khi team nhiều timezone và dễ sort/parse tự động  
c) Vì Unix timestamp khó đọc hơn  
d) Vì là tiêu chuẩn của Google SRE Book

**Đáp án: b** — Trong team nhiều timezone, "2:45 sáng" không rõ timezone nào. `2026-10-07T02:45:00+07:00`
không còn mơ hồ. Khi cần tính duration (MTTR) hoặc correlate với log của service khác (thường
log UTC), timestamp có timezone cho phép convert chính xác. Format cũng sortable và parseable
bởi công cụ analytics.

---

**Câu 5**: Tại sao rollback là hành động đầu tiên nên thử trong incident sau deployment?

a) Vì rollback luôn an toàn hơn fix forward  
b) Vì rollback không cần hiểu nguyên nhân và thường giải quyết vấn đề trong thời gian ngắn nhất  
c) Vì fix forward trong incident thường gây thêm bug mới  
d) Vì đây là quy định của deployment pipeline

**Đáp án: b** — Rollback không yêu cầu hiểu nguyên nhân tại sao (thông tin thường không có lúc
3 giờ sáng với áp lực cao). Nếu incident bắt đầu sau deploy, xác suất cao deploy là nguyên nhân.
Rollback nhanh phục hồi service trong vài phút trong khi debug có thể mất hàng tiếng. Sau khi
service ổn định, debug nguyên nhân thật sự trong điều kiện bình thường — không cần quyết định
dưới áp lực. Đáp án a sai vì rollback không phải luôn an toàn (có thể có schema migration).

## 8. Bài liên quan và nguồn tham khảo

**Bài tiếp theo trong module:**
- `sre.incident-response.roles` — vai trò cụ thể: IC, Deputy, Scribe, SME

**Bài liên quan ngoài module (xem thêm):**
- `monitoring.alerting-design.principles` — thiết kế alert actionable để detection nhanh
- `sre.postmortem.writing` — giai đoạn sau incident: phân tích gốc rễ blameless
- `sre.change-management.process` — thay đổi có kiểm soát để giảm incident do deploy
- `devops.cicd.concepts` — rollback trong CI/CD pipeline

**Nguồn tham khảo:**
- [Google SRE Book — Managing Incidents](https://sre.google/sre-book/managing-incidents/)
- [PagerDuty Incident Response Guide — Roles](https://response.pagerduty.com/before/different_roles/)
