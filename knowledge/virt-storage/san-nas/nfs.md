---
id: virt-storage.san-nas.nfs
title: "NFS: export, mount, quyền và troubleshooting phổ biến"
domain: virt-storage
module: virt-storage.san-nas
level: "vận hành"
prerequisites: ["virt-storage.san-nas.fundamentals"]
applies_to:
  - "NFS v3 và NFSv4 trên Linux (Ubuntu 22.04, RHEL/Rocky 8+)"
  - "NFS làm datastore vSphere và file share cho application server"
status: draft
sources:
  - "https://linux.die.net/man/5/exports"
  - "https://man7.org/linux/man-pages/man5/nfs.5.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

NFS xuất hiện ở nhiều nơi hơn bạn nghĩ: vSphere NFS datastore, Kubernetes PersistentVolume
ReadWriteMany, home directory server, backup repository, CI/CD artifact storage. Vận hành NFS
đúng cách — đặc biệt là cấu hình quyền `/etc/exports` và mount options — là kỹ năng thực tế
mọi SE cần có.

Cấu hình sai phổ biến nhất: export `no_root_squash` không cần thiết (security risk), mount
không có `_netdev` (server reboot loop), dùng NFS 1GbE cho workload cần 500+ IOPS.

## 2. Khái niệm cốt lõi

### NFS architecture

NFS (Network File System) là giao thức chia sẻ file qua mạng. **Server** (NFS server) export
một directory; **client** mount directory đó vào filesystem cục bộ.

```
NFS Client                    NFS Server
/mnt/shared    ──── NFS ────  /exports/shared (actual dir)
               TCP/UDP 2049
```

NFS dùng **RPC (Remote Procedure Call)** để thực hiện file operations (read, write, stat, mkdir)
từ xa. Version hiện đại:
- **NFSv3**: stateless, UDP hoặc TCP, port 2049. Phổ biến nhất trong môi trường Linux truyền
  thống.
- **NFSv4**: stateful, TCP only, single port 2049 (thân thiện với firewall hơn), hỗ trợ ACL
  tốt hơn, Kerberos native. Được khuyến nghị cho môi trường mới.

### `/etc/exports` — cấu hình server

File `/etc/exports` định nghĩa **ai được phép mount cái gì với quyền gì**:

```
/exports/data    10.1.2.0/24(rw,sync,no_subtree_check)
/exports/backup  backup-server.internal(rw,sync,no_root_squash)
/exports/public  *(ro,sync,no_subtree_check)
```

Cú pháp: `<path>  <client>(<options>)`

**Options quan trọng**:

| Option | Mô tả |
|--------|-------|
| `rw` / `ro` | Read-write / read-only |
| `sync` | Server xác nhận sau khi ghi xuống disk (safe, chậm hơn) |
| `async` | Server xác nhận trước khi ghi xuống disk (nhanh hơn, có nguy cơ data loss khi crash) |
| `root_squash` | **Mặc định** — uid 0 từ client map thành anonymous user (nfsnobody). Bảo mật |
| `no_root_squash` | Root từ client = root trên server. **Chỉ dùng khi thực sự cần** |
| `no_subtree_check` | Không verify client access trong subtree — nên bật để tăng reliability |
| `all_squash` | Map tất cả uid/gid thành anonymous — cho public share |

### Mount options — cấu hình client

```bash
# Cơ bản
mount -t nfs nas-server:/exports/data /mnt/data

# Với options đầy đủ
mount -t nfs4 nas-server:/exports/data /mnt/data \
    -o rsize=1048576,wsize=1048576,hard,timeo=600,retrans=3,_netdev
```

**Mount options quan trọng**:

| Option | Mô tả |
|--------|-------|
| `hard` | Nếu server mất, client **treo** (hang) và retry mãi — safe hơn |
| `soft` | Nếu server mất, client trả lỗi I/O sau timeout — nguy hiểm cho database |
| `timeo=600` | Timeout 60 giây (600 × 0.1s) trước khi retry |
| `retrans=3` | Retry 3 lần trước khi báo lỗi (với soft) hoặc tiếp tục retry (với hard) |
| `rsize/wsize=1048576` | Read/write block size 1MB — tăng throughput cho sequential I/O |
| `_netdev` | Mount sau khi network up (quan trọng trong `/etc/fstab`) |
| `nofail` | Kết hợp với `_netdev`: không fail boot nếu NFS không available |

**`hard` vs `soft`**: database và application production phải dùng `hard` — nếu NFS server
fail giữa chừng write, `soft` trả I/O error → data corruption. `hard` treo ứng dụng nhưng
giữ integrity, dễ recover hơn corrupt data.

## 3. Cách nó hoạt động

### Setup NFS server (chạy thật — Ubuntu 22.04)

Máy demo không có NFS server cài, nhưng lệnh setup chuẩn:

```bash
# Cài NFS server
apt install -y nfs-kernel-server

# Tạo directory export
mkdir -p /exports/data
chown nobody:nogroup /exports/data
chmod 755 /exports/data

# Cấu hình /etc/exports
cat >> /etc/exports << 'EOF'
/exports/data  10.1.2.0/24(rw,sync,no_subtree_check)
EOF

# Apply config
exportfs -ra

# Kiểm tra exports hiện tại
exportfs -v
# /exports/data  10.1.2.0/24(sync,wdelay,hide,no_subtree_check,sec=sys,rw,secure,root_squash,no_all_squash)
```

> **Output minh họa** — NFS server không cài trên máy demo.

### Mount với `/etc/fstab` (persistent)

```bash
# /etc/fstab — thêm dòng này để mount khi boot
nas-server.internal:/exports/data  /mnt/data  nfs4  \
    rsize=1048576,wsize=1048576,hard,timeo=600,retrans=3,_netdev,nofail  0  0

# Test mount (không cần reboot)
mount /mnt/data
df -h /mnt/data
```

> **Output minh họa** — cần NFS server thật.

### Verify NFS mounts trên hệ thống hiện tại (chạy thật)

```bash
mount | grep nfs
```

Kết quả thực tế trên máy demo:

```
(no NFS mounts on demo machine)
```

Kiểm tra NFS stats (nếu có mount):

```bash
nfsstat -c 2>/dev/null || echo "No NFS mounts active"
```

Kết quả:

```
No NFS mounts active
```

## 4. Thực hành

**Tính băng thông NFS cần thiết** (chạy thật):

```bash
python3 -c "
servers = 5
peak_per_server_mbps = 100
total_mbps = servers * peak_per_server_mbps

total_gbps_data = total_mbps * 8 / 1000
nfs_overhead = 0.20
required_gbps = total_gbps_data / (1 - nfs_overhead)

print(f'{servers} servers x {peak_per_server_mbps} MB/s = {total_mbps} MB/s aggregate')
print(f'= {total_gbps_data:.1f} Gbps raw data')
print(f'With {nfs_overhead*100:.0f}% NFS overhead: need {required_gbps:.1f} Gbps link')
print()
if required_gbps <= 1:
    print('Network: 1GbE sufficient')
elif required_gbps <= 10:
    print('Network: 10GbE required (1GbE insufficient)')
else:
    print('Network: 25/40GbE or link aggregation required')
"
```

Kết quả thực tế:

```
5 servers x 100 MB/s = 500 MB/s aggregate
= 4.0 Gbps raw data
With 20% NFS overhead: need 5.0 Gbps link
Network: 10GbE required (1GbE insufficient)
```

## 5. Lỗi thường gặp và cách chẩn đoán

**"Permission denied" khi mount, dù IP đúng**: kiểm tra `/etc/exports` có match đúng subnet
không. `exportfs -v` trên server để xem current exports. Đặc biệt: NFS match theo hostname —
nếu exports dùng hostname nhưng client resolve khác → không match. Dùng IP/subnet thay hostname
cho đơn giản.

**"Stale file handle"**: server NFS reboot hoặc export bị unmount/remount phía server. Client
giữ file handle cũ không còn valid. Fix: `umount -l /mnt/data && mount /mnt/data`. Thêm
monitoring restart NFS server để alert nhanh hơn.

**NFS client "hang" không phản hồi** với `hard` mount khi server down: đây là behavior đúng —
`hard` mount treo để tránh data loss. Nếu server down lâu và cần unblock: `umount -l /mnt/data`
(lazy unmount — detach filesystem nhưng không force close process). Lý tưởng: fix NFS server,
mount tự recover.

**Server reboot loop khi có NFS mount trong `/etc/fstab` mà NFS server không available**: thiếu
`_netdev` option. Systemd cố mount NFS trước khi network up → fail → systemd emergency mode.
Fix: thêm `_netdev,nofail` vào fstab options.

**Throughput thấp hơn mong đợi**: `rsize/wsize` mặc định (thường 8KB hoặc 32KB) quá nhỏ cho
network hiện đại. Tăng lên `rsize=1048576,wsize=1048576` (1MB), đặc biệt quan trọng khi NFS
làm vSphere datastore. Verify: `nfsstat -c` xem average RPC payload size.

**uid/gid mismatch giữa client và server**: user `app` trên client có uid 1001, nhưng trên
server uid 1001 là user khác → permission error. Giải pháp: đồng bộ uid/gid qua LDAP/AD, hoặc
dùng `all_squash,anonuid=1001,anongid=1001` cho application share không cần user identity thật.

## 6. Tình huống thực tế

**Tình huống**: vSphere cluster dùng NAS NFS làm datastore. Sau khi upgrade firmware NAS, VM
trên datastore đó báo "VM is disconnected" trên vCenter, nhưng VM trong guest OS vẫn chạy
(ping được).

**Phân tích**:

1. **Firmware upgrade có thể gây NFS session reset** — NAS briefly unmount/remount exports.
   ESXi giữ NFS session; nếu session bị reset, ESXi mất kết nối đến datastore.

2. **Kiểm tra trên ESXi** (output minh họa):
   ```bash
   esxcli storage nfs list
   # Volume Name  Host             Share              Accessible  Mounted
   # ds-nfs-01    nas.internal     /exports/vsphere   false       true
   ```
   `Accessible: false` → ESXi không đọc được datastore. `Mounted: true` → vẫn mount trong kernel.

3. **Remount NFS datastore**:
   ```
   vCenter → Storage → ds-nfs-01 → Unmount → Remount
   ```
   Hoặc trên ESXi:
   ```bash
   esxcli storage nfs remove -v ds-nfs-01
   esxcli storage nfs add -H nas.internal -s /exports/vsphere -v ds-nfs-01
   ```

4. **Verify**: VM reconnect vào vCenter tự động sau khi datastore accessible.

**Phòng ngừa**: khi upgrade NFS server, schedule maintenance window và migration VM sang
datastore khác trước (nếu có). Sau upgrade, verify exports trước khi migrating VM về.

## 7. Tự kiểm tra

**Câu 1**: Tại sao NFS export không nên dùng `no_root_squash` trừ khi thực sự cần?

a) Vì `no_root_squash` làm NFS chậm hơn  
b) Vì `no_root_squash` cho phép root trên client (uid 0) hành động như root trên server — nếu bất kỳ client nào bị compromise, attacker có root access lên NFS server và tất cả dữ liệu trên share  
c) Vì `no_root_squash` không tương thích với NFSv4  
d) Vì `no_root_squash` chỉ hoạt động với UDP, không TCP

**Đáp án: b** — `root_squash` (mặc định) map uid 0 từ client thành nfsnobody (~uid 65534) trên server — ngay cả root trên client cũng không có quyền đặc biệt trên NFS server. `no_root_squash` phá vỡ isolation này. Chỉ dùng khi deployment thực sự cần (ví dụ: NFS share cho root-level operation như backup với rsync chạy root) và chỉ cho server trusted.

---

**Câu 2**: Trong `/etc/fstab`, tại sao NFS mount phải có option `_netdev`?

a) Để NFS mount nhanh hơn lúc boot  
b) Để NFS mount chờ đến khi network interface up — nếu không, systemd cố mount NFS trước khi mạng sẵn sàng, fail, và có thể rơi vào emergency mode  
c) `_netdev` là tên filesystem type cho NFS  
d) Để cho phép mount không cần quyền root

**Đáp án: b** — Systemd xử lý mount theo dependency. Không có `_netdev`, systemd có thể chạy NFS mount unit trước `network-online.target` — NFS server chưa reachable → mount fail → systemd emergency mode. Với `_netdev`, mount unit sẽ có dependency ngầm vào `network-online.target`, đảm bảo mount chỉ chạy khi network đã up.

---

**Câu 3**: Khi NFS server đột ngột down, ứng dụng trên client đang ghi file sẽ bị gì với `hard` mount vs `soft` mount?

a) Cả `hard` và `soft` đều trả lỗi I/O ngay lập tức  
b) Không có sự khác biệt  
c) `hard` mount: I/O operation **treo** (hang), retry liên tục chờ server trở lại — application block nhưng không bị lỗi; `soft` mount: sau timeout trả I/O error — application nhận lỗi nhưng có thể corrupt data  
d) `hard` mount restart application tự động

**Đáp án: c** — `hard` mount đảm bảo "at least once" delivery: I/O không được xác nhận sẽ được retry mãi. Điều này bảo toàn data integrity nhưng làm application block. `soft` mount trả lỗi sau timeout — application biết có lỗi nhưng có thể không xử lý được, đặc biệt nếu write chưa được xác nhận bởi server. Database dùng `soft` mount có thể bị data corruption khi NFS server fail.

---

**Câu 4**: Một VM trên NFS datastore vSphere chạy database bị I/O latency cao. Thứ tự kiểm tra nên là gì?

a) Kiểm tra NFS server latency (`nfsstat`) → kiểm tra network (packet loss, bandwidth) → kiểm tra NAS storage performance → xem xét tăng `rsize/wsize` hoặc upgrade lên iSCSI  
b) Restart VM trước, sau đó kiểm tra  
c) Tăng RAM cho VM  
d) Đổi NFS mount sang SMB

**Đáp án: a** — I/O latency cao có thể có nhiều nguyên nhân theo tầng: NFS RPC overhead (xem `nfsstat` average RPC time), network congestion (ping, traceroute, `iperf`), NAS disk overloaded (NAS admin panel). Sau khi loại trừ từng tầng, `rsize/wsize=1048576` tăng throughput đáng kể cho sequential I/O. Nếu workload thực sự cần latency thấp (database OLTP), upgrade lên iSCSI/FC SAN là giải pháp đúng.

---

**Câu 5**: `sync` vs `async` option trong `/etc/exports` — nên chọn cái nào cho production?

a) `async` vì nhanh hơn  
b) Không quan trọng — NFS client cache mọi thứ  
c) `sync`: server xác nhận write sau khi ghi xuống disk — đảm bảo data không mất nếu server crash; `async` nhanh hơn nhưng có thể mất data. Production luôn dùng `sync`, `async` chỉ chấp nhận được cho non-critical backup/archive  
d) Dùng `async` cho database, `sync` cho file share

**Đáp án: c** — `async` cho phép NFS server trả lời client "write OK" trước khi thực sự ghi xuống disk — nếu server crash tại thời điểm này, data đã "confirmed" với client nhưng thực sự mất. Với `sync`, server chỉ xác nhận sau khi data ở stable storage. Đây là tương tự `synchronous_commit` trong PostgreSQL. `async` tăng throughput 2-3x nhưng không phù hợp khi data integrity quan trọng.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước trong module:**
- `virt-storage.san-nas.fundamentals` — block vs file vs object storage concepts

**Bài liên quan trong module:**
- `virt-storage.san-nas.iscsi` — block storage qua IP, so sánh với NFS

**Bài liên quan ngoài module:**
- `virt-storage.vsphere.architecture` — NFS làm datastore vSphere
- `linux.boot-systemd.service-mgmt` — `systemctl status nfs-kernel-server` và `_netdev` trong fstab

**Nguồn tham khảo:**
- [Linux exports(5) man page](https://linux.die.net/man/5/exports)
- [Linux nfs(5) man page — mount options](https://man7.org/linux/man-pages/man5/nfs.5.html)
