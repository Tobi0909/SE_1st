---
id: virt-storage.backup-dr.strategies
title: "Chiến lược backup: full/incremental, quy tắc 3-2-1"
domain: virt-storage
module: virt-storage.backup-dr
level: "vận hành"
prerequisites: []
applies_to:
  - "Backup cho server Linux/Windows, VM, database"
  - "Quy tắc 3-2-1 và biến thể 3-2-1-1-0 cho môi trường hiện đại"
status: verified
sources:
  - "https://www.veeam.com/blog/321-backup-rule.html"
  - "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-209.pdf"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Một thống kê đáng suy nghĩ: không phải thảm họa mà **restore thất bại** mới là nguyên nhân
số 1 của data loss trong doanh nghiệp. Backup tồn tại nhưng không restore được vì:
- Backup file bị corrupt, không ai test restore
- Backup nằm trên cùng storage với production (cả 2 cùng mất khi SAN fail)
- Không có backup offsite — ransomware mã hóa cả backup

Hiểu chiến lược backup giúp bạn thiết kế hệ thống backup đúng và — quan trọng không kém —
**test restore định kỳ** để biết backup thực sự dùng được.

## 2. Khái niệm cốt lõi

### Ba loại backup

**Full backup**: copy toàn bộ dữ liệu. Đơn giản nhất, restore nhanh nhất, nhưng tốn storage và
thời gian backup nhất.

**Incremental backup**: chỉ copy dữ liệu thay đổi kể từ lần backup **trước** (full hoặc
incremental trước đó). Backup nhanh, tốn ít storage, nhưng restore phức tạp — phải apply full
rồi apply từng incremental theo thứ tự.

**Differential backup**: chỉ copy dữ liệu thay đổi kể từ **full backup gần nhất** (bất kể có
incremental ở giữa không). Backup chậm hơn incremental (ngày cuối tuần có thể bằng gần full),
nhưng restore đơn giản hơn: chỉ cần full + 1 differential gần nhất.

```
Full      Incr Mon  Incr Tue  Incr Wed  Diff Thu  Diff Fri  Full (new week)
[=====]   [+]       [+]       [+]       [====]    [=====]   [==========]
                                         ↑ Diff = thay đổi từ Full đầu tuần
```

| | Full | Incremental | Differential |
|-|------|-------------|--------------|
| Backup time | Dài nhất | Nhanh nhất | Trung bình |
| Storage | Nhiều nhất | Ít nhất | Trung bình |
| Restore time | Nhanh nhất | Chậm nhất (chain) | Trung bình (full + 1) |
| Complexity | Thấp | Cao | Trung bình |

**Chiến lược phổ biến**: full weekly (thứ 2) + incremental daily (thứ 3 đến CN). Restore cần
full + tối đa 6 incremental.

### Quy tắc 3-2-1

Nguyên tắc vàng của backup, ban đầu đề xuất bởi photographer Peter Krogh, sau được NIST và
cộng đồng IT áp dụng rộng rãi:

```
3 bản sao dữ liệu
  2 loại media/storage khác nhau
    1 bản offsite (khác vị trí địa lý)
```

**Ví dụ áp dụng cho production server**:
- **Bản 1**: production data trên SAN
- **Bản 2**: backup trên NAS trong cùng datacenter (khác storage)
- **Bản 3**: backup trên cloud storage hoặc tape ở datacenter khác (offsite)

Quy tắc 3-2-1 bảo vệ khỏi:
- Hardware failure (bản 2 trên NAS)
- Datacenter disaster — cháy, lũ (bản 3 offsite)
- Ransomware mã hóa cả backup local (bản 3 offsite, ideally air-gapped)

**Biến thể 3-2-1-1-0** (Veeam đề xuất cho môi trường hiện đại):
- **3**: 3 bản copy
- **2**: 2 loại media
- **1**: 1 offsite
- **1**: 1 bản immutable (không thể xóa/modify — chống ransomware)
- **0**: 0 lỗi khi verify restore (backup phải test restore, không phải assume là OK)

### RPO và RTO

**RPO (Recovery Point Objective)**: mất tối đa bao nhiêu dữ liệu (tính bằng thời gian).
"Tôi chấp nhận mất tối đa 1 tiếng dữ liệu" → backup mỗi 1 tiếng.

**RTO (Recovery Time Objective)**: cần phục hồi trong bao lâu. "Hệ thống phải online lại trong
4 tiếng" → backup/DR plan phải thực hiện được trong 4 tiếng.

Hai chỉ số này quyết định chiến lược backup và chi phí:

| RPO thấp (< 1h) | Continuous backup, log shipping, replication |
| RPO trung bình (1-24h) | Hourly hoặc daily backup |
| RPO cao (> 24h) | Daily/weekly full backup |

### Application-consistent vs crash-consistent backup

**Crash-consistent**: backup tại một thời điểm — giống như "pull plug" đột ngột. Khi restore,
OS có thể cần fsck, database cần crash recovery. Phần lớn VM snapshot (VMware/Veeam) là
crash-consistent theo mặc định.

**Application-consistent** (quiesced): báo hiệu cho application flush dữ liệu xuống disk trước
khi snapshot — database đang trong trạng thái consistent, không cần recovery khi restore.
VMware Tools + VSS (Windows) hoặc pre/post freeze script (Linux) đảm bảo điều này.

**Best practice**: backup database production phải application-consistent (dùng `xtrabackup` cho
MySQL, `pg_basebackup` cho PostgreSQL thay vì snapshot disk thô).

## 3. Cách nó hoạt động

### Backup VM trong vSphere (Veeam — output minh họa)

```
Veeam Backup Job
  1. Snapshot VM (quiesced nếu có VMware Tools)
  2. CBT (Changed Block Tracking): chỉ đọc block đã thay đổi kể từ lần backup trước
  3. Compress + deduplicate data
  4. Write đến backup repository (NAS/S3/tape)
  5. Delete snapshot
  6. Verify: mount backup để kiểm tra file system consistency
```

**CBT (Changed Block Tracking)** là mechanism của ESXi track block nào đã thay đổi — cho phép
incremental backup rất nhanh (chỉ đọc block changed, không scan toàn bộ disk).

### Backup database PostgreSQL (output minh họa)

```bash
# Physical backup với pg_basebackup
pg_basebackup -h localhost -U postgres -D /backup/pg-$(date +%Y%m%d) \
  --wal-method=stream --progress --checkpoint=fast

# Logical backup với pg_dump (single database)
pg_dump -h localhost -U postgres -F c myapp_db > /backup/myapp_$(date +%Y%m%d).pgdump

# Restore từ pg_dump
pg_restore -h localhost -U postgres -d myapp_db_restored /backup/myapp_20261007.pgdump
```

> **Output minh họa** — PostgreSQL không cài trên máy demo.

## 4. Thực hành

**Tính storage cho chiến lược backup full+incremental** (chạy thật):

```bash
python3 -c "
daily_backup_gb = 50
incremental_ratio = 0.05  # incremental = 5% of full

full_per_week = 1
incremental_per_week = 6
retention_weeks = 4

full_size = daily_backup_gb
incr_size = daily_backup_gb * incremental_ratio

total_full = full_per_week * retention_weeks * full_size
total_incr = incremental_per_week * retention_weeks * incr_size
total = total_full + total_incr

print(f'Strategy: 1 full/week + 6 incrementals/week, {retention_weeks}-week retention')
print(f'Full backup: {full_size:.0f} GB | Incremental: {incr_size:.1f} GB (5% of full)')
print(f'Total storage: {total:.0f} GB ({total/daily_backup_gb:.1f}x single full)')
print()
naive = daily_backup_gb * 7 * retention_weeks
print(f'Naive full-daily 4-week: {naive:.0f} GB')
print(f'Savings: {(1 - total/naive)*100:.0f}% less storage with full+incremental strategy')
"
```

Kết quả thực tế:

```
Strategy: 1 full/week + 6 incrementals/week, 4-week retention
Full backup: 50 GB | Incremental: 2.5 GB (5% of full)
Total storage: 260 GB (5.2x single full)

Naive full-daily 4-week: 1400 GB
Savings: 81% less storage with full+incremental strategy
```

**Kiểm tra backup files có thể đọc được** (chạy thật — test trên file backup mẫu):

```bash
ls -lh /backup/ 2>/dev/null || echo "No backup directory on demo machine"
```

Kết quả thực tế:

```
No backup directory on demo machine
```

**Test restore định kỳ**: không chỉ backup — phải restore thử vào môi trường test mỗi tháng:

```bash
# Test restore PostgreSQL dump (output minh họa)
createdb myapp_restore_test
pg_restore -d myapp_restore_test /backup/myapp_20261007.pgdump
psql -d myapp_restore_test -c "SELECT count(*) FROM users;"
# Nếu count khớp với production → backup valid
```

## 5. Lỗi thường gặp và cách chẩn đoán

**"Backup exists but restore fails"**: backup file bị corrupt hoặc incomplete. Nguyên nhân:
storage fail giữa chừng, backup job không verify. Phòng ngừa: **luôn enable backup verification**
(Veeam SureBackup, restic check, pg_restore --list), test restore mỗi tháng.

**Backup job chạy lâu hơn backup window (overlap với giờ cao điểm)**: full backup hàng ngày quá
lớn. Giải pháp: chuyển sang weekly full + daily incremental/CBT. Incremental thường chỉ 5-10%
thời gian full backup.

**Ransomware mã hóa cả backup local**: backup không có immutable storage. Giải pháp: bật object
lock (S3 Object Lock, Veeam hardened repository) hoặc air-gapped tape. Quy tắc 3-2-1 không đủ
nếu backup repo cùng bị mã hóa.

**Backup application-consistent fail (VSS error Windows)**: VSS writer của application bị lỗi,
snapshot không quiesce được. Kiểm tra: Event Viewer → Application → VSS errors. Fix: restart
VSS service, hoặc unregister/re-register VSS writer của app.

**RPO vi phạm do backup window quá dài**: backup mỗi 24h nhưng thực tế mất 26h do backup fail
và retry → RPO thực tế là >24h. Monitor backup completion time, set alert khi backup window
overlap.

## 6. Tình huống thực tế

**Tình huống**: Sáng thứ Hai, ransomware mã hóa tất cả file trên 3 file server production và
backup NAS trong cùng datacenter. Bạn nhận sự việc lúc 08:00, management yêu cầu ước tính thời
gian recovery.

**Đánh giá nhanh**:

1. **Xác nhận scope**: ransomware đã mã hóa đến đâu? Chỉ file server và NAS, hay cả VM disk?
   Cô lập ngay: disconnect network card của các server bị ảnh hưởng.

2. **Kiểm tra offsite backup**: theo quy tắc 3-2-1, bản thứ 3 ở offsite (cloud/tape) có còn
   không? Gọi ngay cho team storage/DR để xác nhận.
   ```
   Nếu có offsite backup: thực hiện DR plan
   Nếu không có: data loss — báo management ngay
   ```

3. **Xác định RPO**: offsite backup gần nhất là khi nào? Thứ 6 lúc 23:00 → mất data cuối tuần.

4. **Ước tính RTO**: restore 3 file server từ offsite backup:
   - Download data từ cloud: 2TB / 100Mbps = ~45 tiếng (đây là bottleneck)
   - Nếu có tape physical offsite: restore nhanh hơn

5. **Quyết định optimize**: thuê đường truyền dedicated/express, provision VM tạm để user làm
   việc trong khi restore, ưu tiên restore data quan trọng nhất trước.

**Bài học**: Quy tắc 3-2-1 cứu được tình huống này chỉ nếu bản offsite thực sự tồn tại và
**đã được test restore trước**. Không test = không biết backup có dùng được không.

## 7. Tự kiểm tra

**Câu 1**: Khác biệt giữa incremental và differential backup là gì?

a) Incremental backup lớn hơn differential  
b) Incremental copy dữ liệu thay đổi kể từ backup **trước** (bất kể full hay incremental); differential copy kể từ **full backup gần nhất** — differential restore đơn giản hơn (full + 1 differential), incremental restore phức tạp hơn (full + chain incrementals)  
c) Differential chỉ dùng được với Windows  
d) Incremental backup không thể restore nếu thiếu một mắt trong chain

**Đáp án: b** — Điều này ảnh hưởng trực tiếp đến restore complexity và storage. Incremental Monday = thay đổi từ Sunday incremental. Incremental Friday = thay đổi từ Thursday incremental (nhỏ). Differential Friday = thay đổi từ Monday full (lớn hơn). Khi restore: incremental cần full + Mon + Tue + Wed + Thu + Fri = 6 pieces; differential chỉ cần full + Fri differential = 2 pieces. Trong thực tế incremental chain bị hỏng một mắt → mất toàn bộ chain sau đó.

---

**Câu 2**: Quy tắc 3-2-1 yêu cầu gì?

a) Backup mỗi 3 giờ, 2 lần test restore mỗi năm, 1 người chịu trách nhiệm  
b) 3 bản copy dữ liệu, trên 2 loại media khác nhau, ít nhất 1 bản offsite  
c) 3 năm retention, 2 datacenter, 1 team backup  
d) 3 test restore, 2 loại tool backup, 1 schedule hàng ngày

**Đáp án: b** — 3 bản bảo vệ khỏi single point of failure; 2 loại media bảo vệ khỏi media-specific failure (ổ cứng thường cùng batch có thể fail cùng lúc); 1 offsite bảo vệ khỏi site-level disaster (cháy, lũ, ransomware mã hóa toàn bộ site). Thiếu bất kỳ điều kiện nào → không đạt 3-2-1.

---

**Câu 3**: Tại sao backup database production phải là "application-consistent" thay vì chỉ snapshot disk?

a) Application-consistent backup nhanh hơn  
b) Disk snapshot không lưu được schema database  
c) Snapshot disk trong khi database đang write có thể capture trạng thái không nhất quán — khi restore, database cần chạy crash recovery; application-consistent flush dirty pages xuống disk trước snapshot → restore sạch, không cần recovery  
d) Application-consistent backup tương thích nhiều tool hơn

**Đáp án: c** — Database liên tục write: buffer pool trong RAM, WAL/redo log, data file — 3 thứ này tại một thời điểm bất kỳ có thể không nhất quán với nhau. Crash-consistent snapshot giống như "rút điện" — khi restore, PostgreSQL/MySQL cần chạy recovery để bring WAL và data file đồng bộ. Application-consistent: pg_basebackup hoặc xtrabackup đảm bảo backup tại trạng thái consistent point, restore clean không cần recovery phức tạp.

---

**Câu 4**: Backup job pass hàng ngày nhưng restore thất bại khi cần. Nguyên nhân phổ biến nhất là gì?

a) Backup format không tương thích với version OS mới  
b) Backup file bị corrupt hoặc incomplete — backup "pass" nghĩa là job chạy xong, không phải data valid; không có periodic restore test → không phát hiện vấn đề  
c) Restore chỉ hoạt động trong 30 ngày sau khi backup  
d) Backup job chạy trong giờ cao điểm làm ảnh hưởng consistency

**Đáp án: b** — "Backup job green" không bằng "backup usable". Backup file có thể bị corrupt do storage issue, truncated do không gian hết, hay backup binary của version DB cũ không restore được trên version mới. Veeam SureBackup, restic check, hay đơn giản là monthly restore test vào environment test — đây là cách duy nhất biết backup thực sự hoạt động.

---

**Câu 5**: RPO là 4 giờ. Điều này có nghĩa là gì về chiến lược backup?

a) Phải restore xong trong 4 giờ  
b) Backup job phải chạy xong trong 4 giờ  
c) Chấp nhận mất tối đa 4 giờ dữ liệu → phải backup ít nhất mỗi 4 giờ  
d) Backup phải giữ tối thiểu 4 giờ dữ liệu lịch sử

**Đáp án: c** — RPO = Recovery Point Objective = điểm dữ liệu tối cũ nhất chấp nhận được sau disaster. RPO 4h: nếu system down lúc 16:00 và backup gần nhất là 12:00 → mất 4 tiếng data (chấp nhận được). Backup mỗi 4 tiếng đảm bảo RPO ≤ 4h. RTO (Recovery Time Objective) mới là "phải restore xong trong bao lâu" — hai khái niệm khác nhau, cùng quan trọng để thiết kế DR plan.

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module:**
- `virt-storage.backup-dr.planning` — Disaster recovery: RTO/RPO, DR plan chi tiết

**Bài liên quan ngoài module:**
- `virt-storage.san-nas.fundamentals` — storage type phù hợp cho backup (object storage)
- `virt-storage.vsphere.vm-lifecycle` — snapshot vSphere và cách Veeam dùng CBT
- `data.mysql-postgres.replication` — replication != backup (nhưng giảm RPO cho database)

**Nguồn tham khảo:**
- [Veeam — 3-2-1 Backup Rule](https://www.veeam.com/blog/321-backup-rule.html)
- [NIST SP 800-209 — Security Guidelines for Storage Infrastructure](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-209.pdf)
