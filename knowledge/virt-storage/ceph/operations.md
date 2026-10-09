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

**1. Cluster Ceph báo `HEALTH_WARN: 1 osds down`. Điều đầu tiên cần làm là gì?**

Chạy `ceph health detail` để biết OSD nào down và nguyên nhân (nếu có trong health detail). Sau đó SSH vào host chứa OSD đó và kiểm tra `systemctl status ceph-osd@<id>` cùng `journalctl -u ceph-osd@<id>` để xem log. Phân loại nguyên nhân: tiến trình crash (restart được), disk lỗi (cần replace), hay network issue.

**2. PG ở trạng thái `active+degraded` khác `active+undersized` thế nào? Cái nào nguy hiểm hơn?**

`active+degraded`: PG đang hoạt động, nhưng số replica thực tế < `size` (ví dụ 2/3). Vẫn phục vụ IO, đang hoặc sắp recover. `active+undersized`: số replica < `min_size` — đây là ngưỡng nguy hiểm. Ceph có thể từ chối IO để bảo vệ data integrity. `undersized` nguy hiểm hơn vì IO có thể bị block.

**3. Lệnh `ceph osd set noout` dùng khi nào? Rủi ro nếu để lâu là gì?**

Dùng trong maintenance window: khi cần restart OSD hay host để update/patch, tránh cluster tự động mark OSD "out" và trigger unnecessary rebalancing. Rủi ro nếu để lâu: nếu OSD thật sự chết vĩnh viễn, cluster không recover → dữ liệu mãi ở trạng thái degraded, rủi ro mất data nếu thêm OSD khác fail.

**4. Ceph OSD thường có bao nhiêu % disk là "an toàn" trước khi gặp vấn đề?**

<!-- TODO-VERIFY: ngưỡng mặc định có thể thay đổi theo version -->
Ceph có 3 ngưỡng mặc định: `nearfull_ratio` (~85%) cảnh báo, `backfill_full_ratio` (~90%) ngừng backfill, `full_ratio` (~95%) từ chối write. Thực tế nên alert từ 75-80% để có thời gian phản ứng. OSD full gây OSD crash như tình huống thực tế ở trên.

**5. Khi nào nên dùng `ceph osd reweight` so với `ceph osd crush reweight`?**

`osd reweight` (giá trị 0-1) là điều chỉnh tạm thời, không thay đổi CRUSH map — dùng khi một OSD quá tải so với OSD khác và cần shift traffic ngay. `crush reweight` thay đổi weight trong CRUSH map theo disk size thực tế — dùng khi thêm disk lớn hơn vào cluster và muốn CRUSH tự động phân bổ nhiều PG hơn cho OSD đó.

## 8. Bài liên quan và nguồn

**Đã học ở:**
- [virt-storage.ceph.architecture](./architecture.md) — Kiến trúc Ceph, OSD, MON, CRUSH, PG

**Xem thêm:**
- [monitoring.prometheus-grafana.alertmanager](../../monitoring/prometheus-grafana/alertmanager.md) — cấu hình alert cho ceph_health_status
- [sre.capacity-planning.basics](../../sre/capacity-planning/basics.md) — theo dõi disk usage OSD và dự báo đầy

**Nguồn:**
- Ceph monitoring: https://docs.ceph.com/en/reef/rados/operations/monitoring/
- Add/remove OSD: https://docs.ceph.com/en/reef/rados/operations/add-or-rm-osds/
