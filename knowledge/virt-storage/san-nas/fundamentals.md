---
id: virt-storage.san-nas.fundamentals
title: "Khái niệm storage: block vs file vs object"
domain: virt-storage
module: virt-storage.san-nas
level: "nền tảng"
prerequisites: []
applies_to:
  - "SAN (FC/iSCSI), NAS (NFS/SMB), Object storage (S3-compatible)"
  - "Applicable cho môi trường datacenter on-premises và hybrid cloud"
status: verified
sources:
  - "https://www.snia.org/education/storage_networking_primer/san/what_is_a_san"
  - "https://nvmexpress.org/education/nvme-over-fabrics-nvme-of/"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Một database production chạy chậm — nguyên nhân có thể là storage I/O latency. Nhưng storage
trong datacenter không phải chỉ có "ổ cứng": có SAN (Storage Area Network), NAS (Network
Attached Storage), object storage — mỗi loại có kiến trúc, protocol và trường hợp sử dụng hoàn
toàn khác nhau. Dùng sai loại storage cho đúng workload gây ra:

- Database OLTP trên NFS 1GbE → latency quá cao → query timeout
- Backup dùng block storage đắt tiền thay vì object storage rẻ → lãng phí chi phí
- File share dùng SAN block → phức tạp không cần thiết

Hiểu phân loại storage giúp chọn đúng technology cho từng workload và debug vấn đề performance.

## 2. Khái niệm cốt lõi

### Ba mô hình storage

**Block storage**: ứng dụng/OS nhìn thấy thiết bị như một disk vật lý (`/dev/sdb`). Filesystem
(ext4, NTFS, VMFS) được tạo *trên* block device. Ứng dụng toàn quyền kiểm soát cách tổ chức
dữ liệu.

```
Application → Filesystem → Block device (LUN/volume)
```

Dùng cho: OS disk, database (PostgreSQL, MySQL), VM disk (VMFS datastore), bất cứ thứ gì cần
filesystem tùy chỉnh hoặc raw device access.

**File storage (NAS)**: ứng dụng/OS mount một *filesystem đã có sẵn* từ server khác qua network.
Không tạo filesystem — server NAS đã có sẵn, client chỉ mount và dùng.

```
Application → NFS/SMB mount point → NAS server → Disk
```

Dùng cho: home directory, shared file server, datastore VM (NFS), backup target, log centralization.

**Object storage**: không có filesystem, không có directory tree — lưu object theo `key → value`
(key là path/name, value là binary data + metadata). Truy cập qua HTTP API (S3-compatible).

```
Application → HTTP PUT/GET → Object storage endpoint → Disk
```

Dùng cho: backup/archive, static asset (image, video), log storage, AI/ML dataset, bất cứ thứ gì
"write-once, read-many".

### So sánh ba mô hình

| | **Block** | **File (NAS)** | **Object** |
|-|-----------|----------------|------------|
| Giao thức | FC, iSCSI, NVMe-oF | NFS, SMB/CIFS | HTTP (S3 API) |
| Đơn vị | Block (512B-4KB) | File trong directory | Object (key + data) |
| Filesystem | Client tạo | Server quản lý | Không có |
| Latency | Thấp nhất | Trung bình | Cao (HTTP overhead) |
| Scalability | Khó scale out | Trung bình | Scale out dễ (billions objects) |
| Chi phí | Đắt nhất | Trung bình | Rẻ nhất |
| Update file | Update tại chỗ | Update tại chỗ | Replace toàn object |

### SAN — Storage Area Network

**SAN** là mạng network riêng (tách khỏi Ethernet LAN thông thường) dùng để kết nối server với
storage array, cung cấp **block storage** với latency thấp.

Hai protocol phổ biến:

**Fibre Channel (FC)**:
- Dùng cáp quang, switch FC riêng (SAN fabric)
- Latency thấp nhất (~0.1ms), throughput 16/32/64 Gbps
- Chi phí cao (HBA, FC switch đắt hơn Ethernet)
- Standard trong enterprise banking, telco

**iSCSI**:
- Block storage qua TCP/IP Ethernet — dùng cơ sở hạ tầng mạng có sẵn
- Latency cao hơn FC một chút, throughput 10/25 GbE
- Chi phí thấp hơn FC
- Phổ biến hơn ở SMB và cloud-adjacent environment

**LUN (Logical Unit Number)**: đơn vị storage mà SAN trình bày cho server — giống như "virtual
disk". Server thấy LUN như thiết bị block `/dev/sdb`.

### NAS — Network Attached Storage

**NAS** là thiết bị lưu trữ kết nối qua Ethernet, cung cấp **file storage** qua NFS (Linux/Unix)
hoặc SMB/CIFS (Windows). Server không cần tạo filesystem — mount thẳng path từ NAS.

```bash
# Mount NFS share (linux)
mount -t nfs nas-server.internal:/exports/data /mnt/data

# Mount SMB share (Linux)
mount -t cifs //nas-server/share /mnt/win-share -o username=admin
```

NAS đơn giản hơn SAN để quản lý (không cần SAN fabric, zone, LUN masking) nhưng latency cao hơn
và không phù hợp cho workload I/O-intensive như database OLTP.

## 3. Cách nó hoạt động

### Latency theo loại storage

```
Storage type             Latency      IOPS (4K random)
─────────────────────────────────────────────────────
RAM                     ~0.1 ms      ~10,000,000
NVMe SSD (local)        ~0.1 ms      ~10,000
SATA SSD (local)        ~0.5 ms      ~2,000
iSCSI over 10GbE        ~0.5 ms      ~2,000
NFS over 1GbE           ~2.0 ms      ~500
SAS HDD 7.2k (local)    ~5.0 ms      ~200
```

Đây là lý do database production cần SSD + block storage (iSCSI/FC), không dùng NFS 1GbE.

### Path dữ liệu iSCSI

```
Server (initiator)              Storage array (target)
  Application
      │
  Linux SCSI stack
      │
  iSCSI initiator driver (iscsid)
      │
  NIC (TCP/IP, 10GbE)  ──────── switch ──── NIC ──── iSCSI target
                                                      │
                                                  LUN (virtual disk)
                                                      │
                                                  Physical disk array
```

Bên server: cài `open-iscsi`, discover target, login → LUN hiện ra như `/dev/sdb`.

### VMFS và NFS làm datastore vSphere

vSphere hỗ trợ cả block (VMFS) và file (NFS) làm datastore:

- **VMFS** (VMware File System): filesystem cluster-aware tạo trên LUN iSCSI/FC. Nhiều ESXi host
  cùng mount một VMFS volume → shared datastore cho vMotion/HA. VMFS lock mechanism cho phép
  nhiều host read/write an toàn.
- **NFS datastore**: ESXi mount NFS share từ NAS làm datastore. Đơn giản hơn VMFS (không cần
  LUN provisioning), nhưng NFS server phải đảm bảo performance đủ.

## 4. Thực hành

**Tính toán latency và IOPS theo loại storage** (chạy thật):

```bash
python3 -c "
storage_types = [
    ('NVMe SSD (local)', 0.1),
    ('SATA SSD (local)', 0.5),
    ('iSCSI over 10GbE', 0.5),
    ('NFS over 1GbE', 2.0),
    ('SAS HDD 7.2k', 5.0),
]

print(f'{\"Type\":<25} {\"Latency (ms)\":>12}  {\"Max IOPS (4K)\":>14}')
print('-' * 56)
for name, latency_ms in storage_types:
    iops = int(1000 / latency_ms)
    print(f'{name:<25} {latency_ms:>12.1f}  {iops:>14,}')
"
```

Kết quả thực tế:

```
Type                      Latency (ms)  Max IOPS (4K)
--------------------------------------------------------
NVMe SSD (local)                   0.1         10,000
SATA SSD (local)                   0.5          2,000
iSCSI over 10GbE                   0.5          2,000
NFS over 1GbE                      2.0            500
SAS HDD 7.2k                       5.0            200
```

**Kiểm tra storage hiện tại trên Linux** (chạy thật):

```bash
lsblk -o NAME,SIZE,TYPE,MOUNTPOINTS
```

Kết quả thực tế trên máy demo:

```
NAME   SIZE TYPE MOUNTPOINTS
sda    100G disk
├─sda1   1G part /boot/efi
├─sda2   2G part /boot
└─sda3  97G part /
sr0   1024M rom
```

**Đo latency storage bằng fio** (output minh họa — cần cài `fio`):

```bash
# 4K random read, queue depth 1 (latency test)
fio --name=latency-test --filename=/dev/sdb --rw=randread \
    --bs=4k --iodepth=1 --numjobs=1 --runtime=30 --time_based \
    --output-format=normal
# lat (usec): min=85, max=2340, avg=112.5, stdev=45.2
```

> **Output minh họa** — cần thiết bị thật và quyền root.

## 5. Lỗi thường gặp và cách chẩn đoán

**Database query chậm bất thường, CPU idle**: storage I/O wait. Kiểm tra:
```bash
iostat -x 1 5   # %util, await (ms), svctm
# %util > 80% hoặc await > 10ms trên disk của database → storage bottleneck
```
Giải pháp: upgrade lên SSD, hoặc chuyển sang iSCSI/FC SAN với SSD array.

**NFS mount bị "stale file handle"**: NAS server reboot hoặc export bị unmount phía server.
Fix: `umount -l /mnt/data && mount -t nfs nas-server:/exports/data /mnt/data`. Thêm `_netdev`
vào `/etc/fstab` để mount sau khi network up.

**iSCSI session ngắt kết nối**: network switch drop packet, NIC chuyển port. Dấu hiệu:
`dmesg | grep -i iscsi` thấy "session loss", I/O error trên disk. Kiểm tra: `iscsiadm -m session -P 3` xem session state. Fix network trước khi rescan.

**LUN không thấy sau khi thêm vào storage array**: cần rescan host bus. Trên Linux:
```bash
echo "- - -" > /sys/class/scsi_host/host0/scan   # rescan SCSI bus
# hoặc với multipath:
multipathd reconfigure
```

**Object storage "object not found" sau PUT thành công**: eventual consistency trong một số S3
implementations — PUT trên node A chưa replicate sang node B khi GET. Strong consistency không đảm
bảo với mọi S3 provider. Giải pháp: dùng provider hỗ trợ strong read-after-write consistency
(AWS S3 đã có strong consistency từ 2020, Ceph RadosGW cần cấu hình).

## 6. Tình huống thực tế

**Tình huống**: Team muốn thiết kế storage cho một vSphere cluster mới gồm 3 ESXi host:
- 5 VM production database (PostgreSQL) — I/O intensive, latency-sensitive
- 20 VM application server — moderate I/O
- Backup storage cho tất cả VM
- File share cho team developer

**Đề xuất phân lớp storage**:

| Workload | Storage type | Protocol | Lý do |
|---------|-------------|---------|-------|
| DB VM disk | All-Flash SAN | iSCSI 10GbE | Latency thấp, IOPS cao cho OLTP |
| App VM disk | Hybrid SAN (SSD+HDD) | iSCSI 10GbE | Balance cost/performance |
| VM backup | NAS | NFS | Không cần latency thấp, cost thấp |
| File share | NAS | SMB | Standard for file sharing |
| Log archive | Object storage | S3 API | Scale out, rẻ, API-accessible |

**Tính chi phí lưu ý**: all-flash SAN đắt nhất → chỉ cho workload thực sự cần. Object storage
cho archive/backup giảm chi phí 60-80% so với block storage trên cùng capacity.

**Sau khi triển khai — monitoring**:
- iSCSI latency: `iostat -x` trên host, `avg_wait < 1ms` cho SSD
- NFS latency: `nfsstat -c` hoặc `mountstats`
- Capacity alert: 80% full → bắt đầu mở rộng

## 7. Tự kiểm tra

**Câu 1**: Tại sao không nên dùng NFS (NAS) làm storage cho database OLTP production?

a) NFS không hỗ trợ filesystem EXT4  
b) NFS qua 1GbE có latency ~2ms và IOPS thấp (~500) — OLTP cần sub-millisecond latency và hàng nghìn IOPS; dùng NFS sẽ gây query timeout và performance degradation  
c) NFS không tương thích với PostgreSQL và MySQL  
d) NAS không hỗ trợ backup

**Đáp án: b** — Database OLTP (Online Transaction Processing) có đặc điểm nhiều random I/O nhỏ (4-8KB), latency-sensitive (user chờ response). NFS 1GbE latency ~2ms, IOPS ~500 — so với NVMe SSD ~0.1ms, 10,000+ IOPS. Một database với 500 TPS × 10 I/O per transaction = 5,000 IOPS — đã vượt khả năng NFS 1GbE. iSCSI/FC với SSD array mới phù hợp.

---

**Câu 2**: Sự khác biệt cốt lõi giữa block storage và file storage (NAS) là gì?

a) Block storage chỉ dùng cho Windows, file storage cho Linux  
b) Block storage cung cấp raw device — client tạo filesystem; NAS cung cấp filesystem đã có sẵn — client chỉ mount và dùng  
c) Block storage không hỗ trợ encryption  
d) NAS nhanh hơn block storage vì dùng cache

**Đáp án: b** — Với block storage (SAN), server nhận LUN như `/dev/sdb` — phải `mkfs.ext4 /dev/sdb` rồi mount. Với NAS, server mount `/exports/data` từ NAS — filesystem (thường ZFS, XFS) được NAS quản lý, client không cần (và không thể) format lại. Đây là ranh giới kiến trúc quan trọng: ai quản lý filesystem.

---

**Câu 3**: Object storage phù hợp nhất cho workload nào?

a) Database OLTP với nhiều random write nhỏ  
b) OS boot disk của VM  
c) Backup, log archive, static asset (image/video) — workload write-once, read-many, không cần update tại chỗ  
d) Real-time log streaming cần latency sub-millisecond

**Đáp án: c** — Object storage có latency cao (HTTP overhead), không hỗ trợ update partial (phải replace toàn object), nhưng scale out cực tốt (billions objects), chi phí thấp, và API HTTP đơn giản. Backup (write job xong rồi thôi), archive, static asset như image/video của web app — đây là use case tối ưu. Không bao giờ dùng object storage cho OS disk hoặc database.

---

**Câu 4**: iSCSI và Fibre Channel đều là protocol SAN block storage — iSCSI có ưu điểm gì so với FC?

a) iSCSI có latency thấp hơn FC  
b) iSCSI dùng TCP/IP Ethernet thông thường — tận dụng network infrastructure có sẵn, chi phí thấp hơn (không cần HBA FC, FC switch), dễ triển khai hơn  
c) FC chỉ dùng được trên Windows  
d) iSCSI hỗ trợ nhiều LUN hơn FC

**Đáp án: b** — FC cần phần cứng chuyên dụng (FC HBA, FC switch) đắt tiền và knowledge riêng. iSCSI chạy trên TCP/IP Ethernet thông thường — nếu datacenter đã có 10GbE switch, iSCSI chỉ cần cấu hình thêm, không mua thêm fabric. Latency iSCSI 10GbE xấp xỉ FC cho SSD workload, thấp hơn FC chỉ khi FC dùng flash array cao cấp.

---

**Câu 5**: Khi thêm LUN mới từ storage array vào Linux server, tại sao LUN không tự hiện ra ngay?

a) Cần reboot server  
b) Cần restart NFS service  
c) LUN chỉ hiện sau 10 phút theo timer tự động của kernel  
d) Linux SCSI subsystem không tự poll phát hiện thiết bị mới — cần trigger rescan SCSI bus thủ công (`echo "- - -" > /sys/class/scsi_host/host0/scan`) hoặc dùng tool như `rescan-scsi-bus.sh`

**Đáp án: d** — Linux SCSI stack không liên tục poll storage để phát hiện thiết bị mới (sẽ tốn CPU và tạo I/O). Khi SAN admin gán LUN mới cho server, server phải chủ động rescan để kernel discover thiết bị. Với multipath (dm-multipath), cần `multipathd reconfigure` thêm. Không cần reboot — rescan là operation online an toàn.

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module:**
- `virt-storage.san-nas.iscsi` — cấu hình iSCSI target/initiator chi tiết
- `virt-storage.san-nas.nfs` — NFS export, mount, quyền và troubleshooting

**Bài liên quan ngoài module:**
- `virt-storage.vsphere.architecture` — vSphere dùng SAN (VMFS) và NAS (NFS) làm datastore
- `virt-storage.backup-dr.strategies` — object storage cho backup/archive
- `data.mysql-postgres.fundamentals` — database cần block storage với latency thấp

**Nguồn tham khảo:**
- [SNIA — What is a SAN?](https://www.snia.org/education/storage_networking_primer/san/what_is_a_san)
- [NVMe Express — NVMe over Fabrics](https://nvmexpress.org/education/nvme-over-fabrics-nvme-of/)
