---
id: virt-storage.ceph.operations
title: "Vận hành Ceph cơ bản: health check, xử lý OSD down"
domain: virt-storage
module: virt-storage.ceph
level: chuyên sâu
prerequisites:
  - virt-storage.ceph.architecture
applies_to:
  - Ceph Reef (18.x) / Quincy (17.x)
  - On-premises storage clusters
status: verified
sources:
  - https://docs.ceph.com/en/reef/rados/operations/monitoring/
  - https://docs.ceph.com/en/reef/rados/operations/add-or-rm-osds/
last_verified: "2026-10-07"
author: tuank63uet@gmail.com
---

## 1. Vì sao cần biết

Hiểu kiến trúc Ceph là nền tảng, nhưng SE on-call cần biết cụ thể: khi cluster báo `HEALTH_WARN` hay `HEALTH_ERR` thì làm gì? OSD nào down, tại sao, cách recover? Bài này tập trung vào quy trình vận hành ngày-ngày và xử lý sự cố phổ biến.

## 2. Khái niệm cốt lõi

### Các trạng thái health của cluster

| Trạng thái | Ý nghĩa | Cần làm ngay? |
|-----------|---------|--------------|
| `HEALTH_OK` | Tất cả tốt | Không |
| `HEALTH_WARN` | Có vấn đề nhưng cluster vẫn hoạt động | Điều tra trong vài giờ |
| `HEALTH_ERR` | Vấn đề nghiêm trọng, có thể mất data hoặc IO bị block | Xử lý ngay |

### Trạng thái PG phổ biến

| PG State | Ý nghĩa |
|----------|---------|
| `active+clean` | Bình thường, đủ replica |
| `active+degraded` | Thiếu replica (OSD down), vẫn phục vụ IO |
| `active+recovering` | Đang copy data để đủ replica |
| `active+remapped` | PG đang được di chuyển sang OSD khác |
| `stale` | Primary OSD không phản hồi |
| `undersized` | Số replica thực tế < min_size (IO có thể bị block) |
| `incomplete` | Không tìm được đủ replica để peering — nguy hiểm |

### Monitoring thực tế

Ceph cluster cần monitor 3 metric cốt lõi:

1. **Cluster health status** — `HEALTH_OK/WARN/ERR`
2. **OSD count up/in** — `12 osds: 12 up, 12 in`
3. **PG state** — tất cả PG phải `active+clean`

Prometheus + ceph-exporter (hoặc `ceph mgr module enable prometheus`) export metrics này.

## 3. Cách nó hoạt động

### Luồng xử lý OSD down

```
OSD crash / network failure
  │
  ├── MON heartbeat timeout (~20s mặc định)
  │   → OSD marked "down"
  │
  ├── Cluster: HEALTH_WARN: "1 osds down"
  │   PG state: active+degraded (vẫn phục vụ IO)
  │
  ├── Sau 10 phút (mon_osd_down_out_interval mặc định):
  │   → OSD marked "out"
  │   → CRUSH loại OSD khỏi placement
  │   → Backfill bắt đầu: surviving OSDs copy data để đủ RF
  │   → PG: active+recovering
  │
  └── Sau khi backfill xong:
      → PG: active+clean (dù OSD.X vẫn down)
      → Cluster: HEALTH_WARN: "1 osds down" (vẫn cảnh báo vì OSD chưa quay lại)
```

### Quá trình thêm OSD mới

```
1. Cài disk mới hoặc thêm node mới
2. Chạy `ceph-volume lvm create --data /dev/sdX`
3. OSD được thêm vào CRUSH với weight theo disk size
4. CRUSH rebalance: di chuyển PG sang OSD mới
5. Cluster: HEALTH_WARN (rebalancing) → HEALTH_OK (xong)
```

## 4. Thực hành

Ceph không cài trên máy demo. Dưới đây là output minh họa theo tài liệu chính thức.

### Quy trình health check hàng ngày (output minh họa)

```bash
# 1. Tổng quan nhanh
ceph -s

# Output:
  cluster:
    id:     a7f8b3c2-4d5e-6f7a-8b9c-0d1e2f3a4b5c
    health: HEALTH_WARN
            1 osds down
            Degraded data redundancy: 42/180 objects degraded (23.3%)

  services:
    mon: 3 daemons, quorum mon01,mon02,mon03
    osd: 12 osds: 11 up, 12 in

  data:
    pgs: 7 active+degraded
         121 active+clean
```

```bash
# 2. Xem chi tiết warning
ceph health detail

# HEALTH_WARN 1 osds down; Degraded data redundancy
# OSD_DOWN 1 osds down
#     osd.7 (root=default,host=ceph-02) is down
# PG_DEGRADED Degraded data redundancy: 42/180 objects degraded (23.3%)
#     pg 2.1f is active+degraded, acting [3,7,11] -> [3,11]
```

```bash
# 3. Kiểm tra OSD cụ thể
ceph osd find 7
# {"osd":7,"ip":"192.168.1.12:6800","crush_location":{"host":"ceph-02","root":"default"}}

# SSH vào host và kiểm tra
ssh ceph-02 "systemctl status ceph-osd@7"
# ● ceph-osd@7.service - ...
#    Loaded: loaded
#    Active: failed (Result: exit-code)

ssh ceph-02 "journalctl -u ceph-osd@7 -n 50"
# Xem log để biết nguyên nhân crash
```

### Restart OSD sau khi fix (output minh họa)

```bash
# Trên host chứa OSD
ssh ceph-02 "systemctl start ceph-osd@7"

# Theo dõi recovery
watch ceph -s
# Dần dần: active+recovering → active+clean
# HEALTH_WARN → HEALTH_OK
```

### Tạm thời dừng recovery khi cần (output minh họa)

Khi cần maintenance hoặc recovery đang gây quá tải I/O:

```bash
# Dừng rebalancing
ceph osd set noout    # OSD down sẽ không bị mark "out"
ceph osd set norecover  # Không tự recover PG

# Sau khi maintenance xong
ceph osd unset noout
ceph osd unset norecover
```

**Cảnh báo**: `noout` chỉ dùng trong maintenance window ngắn. Để lâu → cluster không recover khi OSD thật sự chết.

### Kiểm tra disk usage OSD (output minh họa)

```bash
ceph osd df

# ID  CLASS  WEIGHT   REWEIGHT  SIZE    RAW USE  %USE  VAR  PGS  STATUS
#  0    hdd  0.97TiB   1.00000  994GiB  451GiB  45.4  1.0  128  up
#  1    hdd  0.97TiB   1.00000  994GiB  448GiB  45.1  1.0  127  up
#  7    hdd  0.97TiB   1.00000  994GiB  855GiB  86.0  1.9  130  down  ← high usage!
```

OSD.7 có disk usage 86% — gần ngưỡng `osd_backfill_full_ratio` (mặc định 90%). Cần dọn hoặc reweight.

## 5. Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|-----|-------------|-----------|
| `HEALTH_ERR: 1 mon(s) down, quorum loss` | Mất đa số MON | Khôi phục MON ngay — đây là outage nghiêm trọng |
| PG stuck `active+undersized` lâu | OSD `out` nhưng không đủ OSD alive để đạt `min_size` | Kiểm tra còn đủ OSD alive không; có thể cần điều chỉnh `min_size` tạm thời trong khẩn cấp |
| `slow ops detected` | OSD bị quá tải hoặc disk latency cao | `ceph osd perf` xem latency; có thể disk đang failing |
| Rebalancing quá chậm | Default recovery speed thấp | Tăng `osd_recovery_max_active` tạm thời (cẩn thận: ảnh hưởng client IO) |
| `full osds` | Một OSD đầy >95% | `ceph osd reweight` để shift data, hoặc xoá data không cần |

## 6. Tình huống thực tế

**Tình huống**: 3 giờ sáng, cảnh báo Prometheus: `ceph_health_status > 1` (tức là không HEALTH_OK). PagerDuty gọi on-call.

**Quy trình triage**:

```bash
# Bước 1: Xem tổng quan
ceph -s
# health: HEALTH_ERR
#         2 osds down
#         Degraded data redundancy (low): 180/540 objects degraded (33.3%)
#         pg 3.2a is incomplete   ← NGUY HIỂM
```

PG `incomplete` nghĩa là Ceph không tìm được đủ replica để peering — nếu kéo dài, không thể IO đến data trên PG đó.

```bash
# Bước 2: Xác định OSD down và lý do
ceph health detail | grep "osd.*down"
# osd.3 (host=ceph-01) is down
# osd.7 (host=ceph-02) is down

# Bước 3: Kiểm tra trên từng host
ssh ceph-01 "systemctl status ceph-osd@3"
# Active: failed — "bluestore: OSD hit hard limit"

ssh ceph-02 "systemctl status ceph-osd@7"
# Active: failed — "disk I/O error detected"
```

**Xử lý**:
1. `osd.3` disk full → dọn RBD snapshot cũ, restart OSD
2. `osd.7` disk hardware error → dự phòng: `ceph osd out 7` rồi replace disk, `ceph-volume lvm create` disk mới
3. Theo dõi PG `incomplete` chuyển sang `active+recovering`
4. Postmortem: tại sao alert không bắn sớm hơn? Ngưỡng OSD usage 85% chưa được set.

## 7. Tự kiểm tra

**Câu 1**: Cluster Ceph báo `HEALTH_WARN: 1 osds down`. Điều đầu tiên cần làm là gì?

a) Restart toàn bộ cluster Ceph ngay để buộc OSD down tự phục hồi
b) Chạy `ceph health detail` để biết OSD nào down và nguyên nhân (nếu có trong health detail)
c) Chạy `ceph osd out <id>` ngay lập tức mà không cần xác định nguyên nhân trước
d) Xoá OSD đó khỏi CRUSH map ngay để tránh ảnh hưởng tới các OSD khác

**Đáp án: b** — Chạy `ceph health detail` để biết OSD nào down và nguyên nhân, rồi SSH vào
host kiểm tra `systemctl status`/`journalctl` để phân loại nguyên nhân trước khi hành động.
Restart toàn bộ cluster là hành động quá mạnh tay, ảnh hưởng mọi OSD khác đang hoạt động bình
thường, không cần thiết cho 1 OSD down (loại a); mark `out` ngay mà chưa biết nguyên nhân có
thể trigger rebalancing không cần thiết nếu OSD chỉ cần restart đơn giản (loại c); xoá khỏi
CRUSH map là hành động vĩnh viễn, không nên thực hiện trước khi chẩn đoán nguyên nhân (loại d).

---

**Câu 2**: PG ở trạng thái `active+degraded` khác `active+undersized` thế nào? Cái nào nguy
hiểm hơn?

a) active+undersized chỉ là cảnh báo hiển thị, không ảnh hưởng gì tới việc phục vụ IO thực tế
b) active+degraded nguy hiểm hơn vì luôn đi kèm mất dữ liệu vĩnh viễn, còn undersized chỉ là
   tạm thời
c) `active+degraded`: PG đang hoạt động, nhưng số replica thực tế < `size` (ví dụ 2/3)
d) Hai trạng thái này giống nhau hoàn toàn, chỉ khác tên gọi theo phiên bản Ceph

**Đáp án: c** — `active+degraded` vẫn phục vụ IO với replica < `size`; `active+undersized` là
khi replica < `min_size`, Ceph có thể từ chối IO để bảo vệ data integrity — nguy hiểm hơn vì có
thể block IO. `undersized` ảnh hưởng thật tới khả năng phục vụ IO, không chỉ là cảnh báo hiển
thị (loại a); `degraded` không "luôn đi kèm mất dữ liệu vĩnh viễn" — nó vẫn phục vụ IO và có
thể tự recover (loại b); hai trạng thái này có ngưỡng và mức độ nguy hiểm khác nhau rõ rệt,
không phải cùng một thứ đổi tên (loại d).

---

**Câu 3**: Lệnh `ceph osd set noout` dùng khi nào? Rủi ro nếu để lâu là gì?

a) Dùng để tăng hiệu năng đọc/ghi tạm thời, không liên quan tới maintenance; không có rủi ro
   nào nếu để lâu
b) Dùng khi muốn xoá vĩnh viễn một OSD khỏi cluster ngay lập tức; rủi ro là mất dữ liệu ngay
   khi chạy lệnh
c) Dùng để buộc cluster ngừng hoàn toàn mọi hoạt động IO trong lúc backup; rủi ro là mất kết
   nối client
d) Dùng trong maintenance window: khi cần restart OSD hay host để update/patch, tránh cluster tự động mark OSD "out" và trigger unnecessary rebalancing

**Đáp án: d** — Dùng trong maintenance window để tránh cluster tự động mark OSD "out" và
trigger rebalancing không cần thiết. Rủi ro nếu để lâu: nếu OSD chết vĩnh viễn, cluster không
recover, dữ liệu mãi degraded. Lệnh này không liên quan tới tăng hiệu năng, và CÓ rủi ro thật
nếu để lâu — không phải "không có rủi ro" (loại a); lệnh này KHÔNG xoá OSD khỏi cluster, nó
chỉ ngăn việc tự động mark out (loại b); lệnh không chặn toàn bộ IO của cluster, nó chỉ ảnh
hưởng tới hành vi mark out/rebalancing (loại c).

---

**Câu 4**: Ceph OSD thường có bao nhiêu % disk là "an toàn" trước khi gặp vấn đề?

a) Ceph có 3 ngưỡng mặc định: `nearfull_ratio` (~85%) cảnh báo, `backfill_full_ratio`
b) Chỉ có 1 ngưỡng duy nhất full_ratio 100%, Ceph không cảnh báo sớm hơn mức đó
c) Ceph tự động mở rộng dung lượng ảo khi gần đầy, nên không có ngưỡng cần quan tâm
d) Ngưỡng an toàn luôn cố định là 50% bất kể version, không thay đổi được

**Đáp án: a** — Ceph có 3 ngưỡng mặc định: `nearfull_ratio` (~85%), `backfill_full_ratio`
(~90%), `full_ratio` (~95%); thực tế nên alert từ 75-80% để có thời gian phản ứng.
<!-- TODO-VERIFY: ngưỡng mặc định có thể thay đổi theo version --> Ceph CÓ nhiều ngưỡng cảnh
báo sớm trước 100%, không chỉ 1 ngưỡng duy nhất ở mức đầy hoàn toàn (loại b); Ceph không tự
"mở rộng dung lượng ảo" khi gần đầy — disk vật lý vẫn là giới hạn thật (loại c); các ngưỡng
này có thể CẤU HÌNH LẠI theo nhu cầu vận hành, không cố định cứng 50% (loại d).

---

**Câu 5**: Khi nào nên dùng `ceph osd reweight` so với `ceph osd crush reweight`?

a) osd reweight thay đổi CRUSH map vĩnh viễn; crush reweight chỉ tạm thời cho tới khi restart
   OSD
b) `osd reweight` (giá trị 0-1) là điều chỉnh tạm thời, không thay đổi CRUSH map
c) Cả hai lệnh hoàn toàn tương đương, chỉ khác cú pháp gõ lệnh
d) osd reweight dùng khi thêm disk mới; crush reweight dùng khi một OSD quá tải tạm thời

**Đáp án: b** — `osd reweight` là điều chỉnh tạm thời, không thay đổi CRUSH map, dùng khi một
OSD quá tải cần shift traffic ngay. `crush reweight` thay đổi CRUSH map theo disk size thực
tế, dùng khi thêm disk lớn hơn. Vai trò bị đảo ngược hoàn toàn trong lựa chọn a (`osd reweight`
mới là tạm thời, không phải `crush reweight`); hai lệnh có mục đích và cơ chế khác biệt rõ
rệt, không tương đương (loại c); use case bị đảo ngược trong lựa chọn d (loại d).

## 8. Bài liên quan và nguồn

**Đã học ở:**
- [virt-storage.ceph.architecture](./architecture.md) — Kiến trúc Ceph, OSD, MON, CRUSH, PG

**Xem thêm:**
- [monitoring.prometheus-grafana.alertmanager](../../monitoring/prometheus-grafana/alertmanager.md) — cấu hình alert cho ceph_health_status
- [sre.capacity-planning.basics](../../sre/capacity-planning/basics.md) — theo dõi disk usage OSD và dự báo đầy

**Nguồn:**
- Ceph monitoring: https://docs.ceph.com/en/reef/rados/operations/monitoring/
- Add/remove OSD: https://docs.ceph.com/en/reef/rados/operations/add-or-rm-osds/
