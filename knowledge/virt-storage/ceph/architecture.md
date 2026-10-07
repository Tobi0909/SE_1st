---
id: virt-storage.ceph.architecture
title: "Kiến trúc Ceph: OSD, Monitor, CRUSH map, pool"
domain: virt-storage
module: virt-storage.ceph
level: chuyên sâu
prerequisites:
  - virt-storage.san-nas.fundamentals
applies_to:
  - Ceph Reef (18.x) / Quincy (17.x)
  - On-premises storage clusters
status: draft
sources:
  - https://docs.ceph.com/en/reef/architecture/
  - https://docs.ceph.com/en/reef/rados/operations/crush-map/
last_verified: "2026-10-07"
author: tuank63uet@gmail.com
---

## 1. Vì sao cần biết

Ceph là distributed storage system open source được dùng rộng rãi trong môi trường on-premises: làm storage backend cho OpenStack, Proxmox, hoặc Kubernetes (qua Rook). Khác với SAN/NAS truyền thống (đã học ở `virt-storage.san-nas.fundamentals`), Ceph:

- **Không có single point of failure**: mọi thành phần đều redundant
- **Scale out**: thêm node = thêm capacity và throughput tuyến tính
- **Multi-protocol**: cùng một cluster phục vụ block (RBD), file (CephFS), và object (RGW/S3)

SE vận hành hạ tầng virtualization hay container cần hiểu kiến trúc Ceph để debug khi cluster unhealthy và tránh các lỗi cấu hình phổ biến.

## 2. Khái niệm cốt lõi

### Các thành phần chính

| Component | Vai trò | Số lượng tối thiểu |
|-----------|---------|-------------------|
| **OSD** (Object Storage Daemon) | Lưu trữ data, replication, recovery | ≥3 |
| **Monitor (MON)** | Giữ cluster map, quorum | ≥3 (số lẻ) |
| **Manager (MGR)** | Metrics, dashboard, modules | ≥2 (HA) |
| **MDS** (Metadata Server) | Metadata cho CephFS | ≥1 (chỉ cần cho CephFS) |
| **RGW** (RADOS Gateway) | S3-compatible object storage API | ≥1 (chỉ cần khi dùng S3) |

### CRUSH Map — "intelligent" data placement

CRUSH (Controlled Replication Under Scalable Hashing) là thuật toán phân phối data trong Ceph. Thay vì bảng lookup trung tâm, CRUSH tính toán **deterministically** vị trí của object:

```
Input: pool_id + object_name → hash → CRUSH algorithm + cluster topology
Output: danh sách OSD nên lưu object này
```

CRUSH hierarchy (ví dụ điển hình):

```
root
├── datacenter-1
│   ├── rack-01
│   │   ├── host-01 → osd.0, osd.1, osd.2
│   │   └── host-02 → osd.3, osd.4, osd.5
│   └── rack-02
│       ├── host-03 → osd.6, osd.7, osd.8
│       └── host-04 → osd.9, osd.10, osd.11
└── datacenter-2
    └── ...
```

CRUSH rule có thể yêu cầu: "mỗi replica phải trên rack khác nhau" — đảm bảo failure domain.

### Pool và Placement Group (PG)

**Pool** là logical namespace cho data — tương tự volume group trong LVM. Mỗi pool có:
- `replication_factor` (mặc định 3): số bản sao mỗi object
- `pg_num`: số Placement Group — đơn vị rebalancing

**Placement Group (PG)**: layer trung gian giữa object và OSD.

```
Object → hash → PG (pool_id.pg_number) → CRUSH → OSD list
```

PG là đơn vị recovery: khi OSD down, Ceph recover theo PG, không phải object riêng lẻ. `pg_num` nên tính theo: `(OSDs × 100) / replication_factor` — ví dụ 12 OSD, RF=3: 12×100/3 = 400 PG.

### Quorum và cluster map

Monitor duy trì **cluster map** gồm:
- OSDMap: trạng thái từng OSD (up/down/in/out)
- CRUSHMap: topology của cluster
- PGMap: trạng thái từng PG
- MONMap: danh sách Monitor

Monitor cần **quorum** (đa số) để hoạt động: 3 MON cần ≥2; 5 MON cần ≥3. Mất quorum → cluster read-only.

## 3. Cách nó hoạt động

### Write flow (replicated pool)

```
Client
  │
  ├── 1. Hash object name → PGid (ví dụ: 2.5f)
  │
  ├── 2. Lookup PGid trong OSDMap → Primary OSD (osd.3)
  │
  ├── 3. Gửi write đến Primary OSD
  │
  └── Primary OSD (osd.3)
        ├── 4. Ghi local
        ├── 5. Forward đến Replica OSD (osd.7, osd.11)
        ├── 6. Chờ ACK từ tất cả replica
        └── 7. Trả ACK cho client
```

Strong consistency: write chỉ thành công khi tất cả replica confirm.

### Recovery khi OSD down

```
OSD down được phát hiện (MON heartbeat timeout)
  │
  ├── OSD marked "down" → "out" (sau 10 phút mặc định)
  │   (in = data có trên OSD đó; out = không tính vào placement nữa)
  │
  ├── PG bị ảnh hưởng → state "degraded" → "recovering"
  │
  └── Remaining OSDs tự copy data để đủ replication factor
       (backfill từ surviving replicas)
```

Recovery tốn tài nguyên mạng và I/O — nên có CRUSH rule giới hạn network.

## 4. Thực hành

Ceph không cài trên máy demo. Các lệnh dưới đây là output minh họa theo tài liệu chính thức.

### Xem cluster status (output minh họa)

```bash
ceph status
```

```
  cluster:
    id:     a7f8b3c2-...
    health: HEALTH_OK

  services:
    mon: 3 daemons, quorum mon01,mon02,mon03 (age 2h)
    mgr: mgr01(active, since 2h), standby: mgr02
    osd: 12 osds: 12 up, 12 in

  data:
    pools:   4 pools, 128 pgs
    objects: 45.2k objects, 180 GiB
    usage:   543 GiB used, 5.3 TiB / 5.8 TiB avail
    pgs:     128 active+clean
```

### Xem OSD tree (output minh họa)

```bash
ceph osd tree
```

```
ID  CLASS  WEIGHT   TYPE NAME          STATUS  REWEIGHT
-1         5.82TiB  root default
-3         2.91TiB      host ceph-01
 0    hdd  0.97TiB          osd.0          up   1.00000
 1    hdd  0.97TiB          osd.1          up   1.00000
 2    hdd  0.97TiB          osd.2          up   1.00000
-5         2.91TiB      host ceph-02
 3    hdd  0.97TiB          osd.3          up   1.00000
 4    hdd  0.97TiB          osd.4          up   1.00000
 5    hdd  0.97TiB          osd.5          up   1.00000
```

### Tính pg_num phù hợp (chạy thật)

```bash
python3 -c "
import math
# Rule of thumb: (OSDs * 100) / replication_factor, round to power of 2
osds = 12
rf = 3
target = osds * 100 / rf
# Round to nearest power of 2
pg_num = 2 ** round(math.log2(target))
print(f'OSDs={osds}, RF={rf}')
print(f'Calculated target: {target:.0f}')
print(f'pg_num (power of 2): {pg_num}')
print(f'PG per OSD: {pg_num * rf / osds:.0f} (target: 100-200)')
"
```

```
OSDs=12, RF=3
Calculated target: 400
pg_num (power of 2): 512
PG per OSD: 128 (target: 100-200)
```

## 5. Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|-----|-------------|-----------|
| `HEALTH_WARN clock skew detected` | Đồng hồ giữa MON lệch >0.05s | Đồng bộ NTP trên tất cả MON node |
| PG stuck `active+degraded` mãi | OSD bị đánh dấu out nhưng còn data chưa được recover | `ceph health detail` → tìm PG, kiểm tra `ceph pg <pgid> query` |
| Cluster HEALTH_WARN: `too many PGs per OSD` | pg_num quá lớn so với số OSD | Giảm pg_num hoặc thêm OSD |
| `HEALTH_ERR` do mất quorum | ≥2 trong 3 MON down | Khôi phục MON ngay — cluster đã read-only |
| OSD fill up unevenly | CRUSH weight không đồng đều | Reweight OSD: `ceph osd reweight <id> <weight>` |

## 6. Tình huống thực tế

**Tình huống**: Sáng thứ Hai, cluster Ceph báo `HEALTH_WARN` với thông báo `1 osds down`. VM trên Proxmox dùng RBD volume bắt đầu có I/O latency cao.

```bash
# Kiểm tra nhanh (output minh họa)
ceph osd tree | grep down
# 7    hdd  0.97TiB          osd.7         down   1.00000

ceph osd df | grep "osd.7"
# osd.7   hdd   0.97TiB  825 GiB  85% 15234 1024  ...
```

OSD.7 down, disk 85% full khi down. Kiểm tra log:

```bash
journalctl -u ceph-osd@7 --since "1 hour ago" | tail -20
# "bluestore allocator: allocation failed, out of space"
```

OSD crash vì disk đầy. Giải pháp:
1. Dọn snapshots RBD cũ: `rbd snap ls <pool>/<image>` và xoá bớt
2. Restart OSD sau khi có space: `systemctl start ceph-osd@7`
3. Monitor `ceph -w` đến khi PG về `active+clean`
4. Phòng ngừa: alert khi OSD usage >70% để không bao giờ đến 85%

## 7. Tự kiểm tra

**1. Ceph CRUSH map là gì? Tại sao nó quan trọng cho failure domain?**

CRUSH Map mô tả topology vật lý của cluster (host, rack, datacenter) và CRUSH rules xác định cách phân phối data. Ví dụ: rule "mỗi replica trên một rack khác nhau" đảm bảo nếu một rack mất điện, cluster vẫn còn đủ replica để phục vụ — đây là failure domain isolation. Không có CRUSH topology đúng, tất cả replica có thể cùng trên 1 host và mất hết khi host đó down.

**2. Tại sao Monitor cluster cần số lượng lẻ (3, 5, 7)? Điều gì xảy ra khi mất quorum?**

Quorum yêu cầu đa số (majority = floor(n/2)+1). Số lẻ tối ưu vì: 3 MON chịu được mất 1 (2/3 = quorum); 4 MON cũng chỉ chịu được mất 1 (3/4 = quorum) nhưng tốn thêm node. Khi mất quorum, cluster không thể cập nhật OSDMap → trở thành read-only — client không thể write.

**3. Placement Group (PG) là gì? Tại sao không map trực tiếp object → OSD?**

PG là layer trung gian aggregating nhiều object. Khi thêm/bớt OSD, Ceph chỉ cần remap PG → OSD (hàng trăm) thay vì remap object → OSD (hàng triệu). Điều này giảm overhead rebalancing và recovery granularity nhỏ hơn: recover theo PG, không phải từng object.

**4. Sự khác biệt giữa OSD "down" và OSD "out" trong Ceph?**

`down` = OSD không phản hồi heartbeat (tiến trình crash hoặc máy mất kết nối). `out` = OSD không còn được tính vào data placement (CRUSH bỏ qua nó). Mặc định: OSD down 10 phút sẽ tự động được mark `out`, triggering recovery. OSD có thể `down` nhưng chưa `out` — cluster `degraded` nhưng chưa bắt đầu copy data (chờ OSD có thể quay lại).

**5. Công thức tính pg_num phù hợp cho pool mới là gì?**

`pg_num ≈ (total_OSDs × 100) / replication_factor`, round đến lũy thừa 2 gần nhất. Ví dụ: 12 OSD, RF=3 → 12×100/3=400 → làm tròn lên 512. Mục tiêu: 100-200 PG per OSD. Quá ít PG: rebalancing không đều; quá nhiều: overhead MON/OSD.

## 8. Bài liên quan và nguồn

**Đã học ở:**
- [virt-storage.san-nas.fundamentals](../san-nas/fundamentals.md) — block vs file vs object storage, SAN/NAS concepts

**Xem thêm:**
- [virt-storage.ceph.operations](./operations.md) — vận hành thực tế: health check, xử lý OSD down
- [virt-storage.proxmox-kvm.cluster](../proxmox-kvm/cluster.md) — Proxmox dùng Ceph RBD làm storage backend

**Nguồn:**
- Ceph Architecture: https://docs.ceph.com/en/reef/architecture/
- CRUSH Map: https://docs.ceph.com/en/reef/rados/operations/crush-map/
