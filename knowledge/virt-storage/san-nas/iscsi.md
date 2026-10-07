---
id: virt-storage.san-nas.iscsi
title: "iSCSI: target/initiator, LUN, kết nối SAN qua IP"
domain: virt-storage
module: virt-storage.san-nas
level: "vận hành"
prerequisites: ["virt-storage.san-nas.fundamentals"]
applies_to:
  - "iSCSI trên Linux (open-iscsi) và vSphere ESXi"
  - "iSCSI target: TrueNAS, Linux targetcli, EMC/NetApp"
status: draft
sources:
  - "https://linux.die.net/man/8/iscsiadm"
  - "https://www.open-iscsi.com/"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

iSCSI cho phép block storage (SAN) qua mạng TCP/IP thông thường — không cần Fibre Channel đắt
tiền. Được dùng rộng rãi trong VMware vSphere (iSCSI datastore), Kubernetes (iSCSI PV), và
server cần shared block storage. Cấu hình sai iSCSI có thể gây:

- Multipath loop → I/O error không rõ nguyên nhân
- MTU mismatch → throughput chỉ đạt 10% so với lý thuyết
- iSCSI session drop → VM datastore inaccessible, I/O error

## 2. Khái niệm cốt lõi

### iSCSI architecture: target và initiator

**iSCSI target**: phía server — cung cấp block storage. Có thể là NAS (TrueNAS), storage array
(EMC, NetApp), hoặc Linux với `targetcli`. Mỗi target có một **IQN** (iSCSI Qualified Name)
định danh duy nhất.

**iSCSI initiator**: phía client — "kéo" storage về như local block device. Là software driver
trên Linux (`open-iscsi`) hoặc hardware HBA (Host Bus Adapter). Initiator cũng có IQN riêng.

```
Server (initiator)                Storage (target)
  iscsid daemon                   targetd / TrueNAS
  ├── /dev/sdb ←─── iSCSI session ──→ LUN 0 (10GB)
  └── /dev/sdc ←─── iSCSI session ──→ LUN 1 (50GB)
         ↑
    appears as local block device
```

**IQN format**: `iqn.YYYY-MM.reverse-domain:unique-name`
- Ví dụ target: `iqn.2024-01.com.storage-array:san01-lun0`
- Ví dụ initiator: `iqn.2024-01.com.mycompany:server01`

### LUN (Logical Unit Number)

**LUN** là đơn vị storage mà target trình bày cho initiator — giống "virtual disk". Mỗi target
có thể có nhiều LUN. Initiator thấy mỗi LUN như một block device (`/dev/sdb`, `/dev/sdc`...).

**LUN masking**: chỉ cho phép initiator cụ thể (theo IQN) thấy LUN cụ thể. Bảo mật: nếu không
mask, mọi server kết nối vào target đều thấy mọi LUN.

### iSCSI session và multipath

**iSCSI session**: kết nối TCP giữa initiator và target. Một session = một path.

**Multipath I/O (MPIO)**: dùng nhiều session qua nhiều NIC/network để:
- Redundancy: nếu một path down, I/O chuyển sang path khác
- Load balancing: phân tải I/O giữa nhiều path

```
Server NIC1 ──── switch1 ──── Storage port1 ─┐
                                              ├── same LUN (multipath)
Server NIC2 ──── switch2 ──── Storage port2 ─┘
```

Linux dùng `dm-multipath` để quản lý multipath iSCSI.

### Jumbo frames (MTU 9000)

iSCSI transfer block storage data lớn — dùng **Jumbo frames** (MTU 9000) thay vì MTU 1500
mặc định để giảm số packet và CPU overhead. Cần configure trên:
- NIC initiator: `ip link set eth1 mtu 9000`
- Network switch: tất cả port trên đường iSCSI phải enable jumbo frame
- NIC target (storage server)

> **Quan trọng**: nếu chỉ một switch port không có jumbo frame, packet > 1500 byte bị drop
> silently → throughput thấp khó debug. Phải cấu hình đồng nhất toàn path.

## 3. Cách nó hoạt động

### Kết nối iSCSI trên Linux (output minh họa)

```bash
# Cài open-iscsi
apt install -y open-iscsi

# Discover target trên storage server
iscsiadm -m discovery -t sendtargets -p 192.168.102.10
# 192.168.102.10:3260,1 iqn.2024-01.com.storage:san01

# Login vào target (tạo session)
iscsiadm -m node -T iqn.2024-01.com.storage:san01 -p 192.168.102.10 --login

# Kiểm tra session
iscsiadm -m session -P 3
# Target: iqn.2024-01.com.storage:san01
#   Current Portal: 192.168.102.10:3260
#   Attached scsi disk sdb  State: running

# LUN xuất hiện như block device
lsblk | grep sdb
# sdb  8:16  0  50G  0 disk
```

> **Output minh họa** — cần iSCSI target thật.

### Cấu hình multipath (output minh họa)

```bash
# Cài multipath-tools
apt install -y multipath-tools

# Cấu hình /etc/multipath.conf
cat >> /etc/multipath.conf << 'EOF'
defaults {
    user_friendly_names yes
    find_multipaths yes
}
EOF

systemctl restart multipathd

# Kiểm tra multipath devices
multipath -ll
# mpatha (360000000000000001) dm-0
#   size: 50G, features: '0', hwhandler: '0'
# ├─ 7:0:0:0 sdb 8:16 active ready running
# └─ 8:0:0:0 sdc 8:32 active ready running
# → 2 paths đến cùng LUN, cả hai active
```

> **Output minh họa** — cần iSCSI multipath setup thật.

## 4. Thực hành

**Tính throughput và IOPS lý thuyết của iSCSI 10GbE** (chạy thật):

```bash
python3 -c "
link_gbps = 10
efficiency = 0.85  # TCP overhead ~15%
effective_mbps = link_gbps * efficiency * 1000 / 8

rtt_ms = 0.3  # typical iSCSI LAN latency
iops_qd1 = int(1000 / rtt_ms)

print(f'iSCSI over 10GbE:')
print(f'  Effective throughput: {effective_mbps:.0f} MB/s')
print(f'  Latency: ~{rtt_ms} ms')
print(f'  Max IOPS (QD=1): ~{iops_qd1:,}')
print()
print('Note: actual IOPS limited by storage array backend (SSD vs HDD)')
print('SSD array: 10k-100k IOPS | HDD array: 200-500 IOPS per spindle')
"
```

Kết quả thực tế:

```
iSCSI over 10GbE:
  Effective throughput: 1062 MB/s
  Latency: ~0.3 ms
  Max IOPS (QD=1): ~3,333

Note: actual IOPS limited by storage array backend (SSD vs HDD)
SSD array: 10k-100k IOPS | HDD array: 200-500 IOPS per spindle
```

**Kiểm tra block devices trên hệ thống thật** (chạy thật):

```bash
lsblk -o NAME,SIZE,TYPE,TRAN
```

Kết quả thực tế:

```
NAME   SIZE TYPE TRAN
sda    100G disk sata
├─sda1   1G part
├─sda2   2G part
└─sda3  97G part
sr0   1024M rom  sata
```

Không có iSCSI device trên máy demo (`TRAN` sẽ hiện `iscsi` nếu có).

**Test MTU jumbo frames** (output minh họa):

```bash
# Test ping với large packet (sau khi set MTU 9000)
ping -M do -s 8972 192.168.102.10  # 8972 + 28 header = 9000 bytes
# PING 192.168.102.10: 8972 data bytes
# 8980 bytes from 192.168.102.10: icmp_seq=1 ttl=64 time=0.234 ms
# Nếu thấy "Message too long" → switch chưa cấu hình jumbo frame
```

> **Output minh họa** — cần network setup thật.

## 5. Lỗi thường gặp và cách chẩn đoán

**iSCSI throughput thấp bất thường (<100 MB/s trên 10GbE)**: MTU mismatch. Packet > 1500 byte
bị fragmentation hoặc drop. Test: `ping -M do -s 8972 <target-ip>`. Nếu fail → switch chưa
enable jumbo frame. Fix: cấu hình jumbo frame trên switch port, NIC host, NIC target.

**iSCSI session drop ngắt quãng**: network instability, hoặc iSCSI NIC đang share với VM traffic
(bandwidth spike). Kiểm tra: `dmesg | grep -i iscsi`, `iscsiadm -m session -P 3` (xem state).
Fix: dedicated NIC + VLAN cho iSCSI traffic, tăng `node.session.timeo.replacement_timeout`.

**LUN không thấy sau khi target admin thêm mới**: cần rescan. `iscsiadm -m session --rescan` hoặc
`echo "- - -" > /sys/class/scsi_host/host*/scan`. Với multipath: `multipathd reconfigure`.

**"/dev/sdb" thay đổi sau reboot (sdb → sdc)**: device naming không stable. Dùng by-path:
`/dev/disk/by-path/ip-192.168.102.10:3260-iscsi-...` hoặc multipath alias (`/dev/mapper/mpatha`).
Không bao giờ hardcode `/dev/sdb` trong fstab cho iSCSI.

**Multipath "faulty" path không recover**: kết nối vật lý đã được restore nhưng daemon không
detect lại. `multipathd reconfigure` hoặc `multipathd -k 'reconfigure'` để trigger re-check.

## 6. Tình huống thực tế

**Tình huống**: vSphere cluster dùng iSCSI datastore. Sau khi nâng cấp switch, tất cả ESXi
host báo `Lost connection to iSCSI` và datastore `Inaccessible`. 12 VM trên đó bị suspend.

**Phân tích**:

1. **Switch mới chưa cấu hình jumbo frame**: iSCSI vSphere dùng MTU 9000. Switch mới mặc định
   MTU 1500 → tất cả iSCSI packet lớn bị drop.

2. **Verify trên ESXi** (output minh họa):
   ```bash
   vmkping -d -s 8972 192.168.102.10  # test jumbo ping từ ESXi VMkernel
   # Error: sendto() failed (Message too long)  ← MTU mismatch confirm
   ```

3. **Fix trên switch**: enable jumbo frame (MTU 9000) trên tất cả port trong VLAN iSCSI.

4. **Re-verify**:
   ```bash
   vmkping -d -s 8972 192.168.102.10
   # 8980 bytes from 192.168.102.10: icmp_seq=0 ttl=64 time=0.245 ms  ← OK
   ```

5. **iSCSI session tự recover** sau vài phút, hoặc restart `iscsid` trên ESXi:
   ```bash
   esxcli iscsi adapter rescan -A vmhba65
   ```

6. **Datastore accessible**, VM tự resume.

**Lesson**: khi thay switch trên đường iSCSI, **phải test jumbo frame ngay** trước khi kết
thúc maintenance window. Template checklist: ping -M do -s 8972 <storage-ip>.

## 7. Tự kiểm tra

**Câu 1**: Sự khác biệt giữa iSCSI target và iSCSI initiator là gì?

a) Target là phần mềm, initiator là phần cứng  
b) Target là phía **cung cấp** storage (storage array, NAS), initiator là phía **sử dụng** storage (server) — initiator kết nối đến target để lấy block storage  
c) Target và initiator là cùng một thứ nhưng ở hai phía của kết nối  
d) Initiator chỉ tồn tại trên Windows

**Đáp án: b** — Tương tự NFS: NAS server = target, Linux client mount = initiator. Khác là iSCSI là block storage (initiator thấy `/dev/sdb`), không phải file storage. Một target có thể phục vụ nhiều initiator (mỗi initiator thấy LUN được mask cho nó).

---

**Câu 2**: Tại sao iSCSI cần MTU 9000 (jumbo frames) thay vì MTU 1500 mặc định?

a) Vì iSCSI chỉ hoạt động được với MTU 9000  
b) Vì storage array yêu cầu packet size cố định  
c) MTU 1500 vẫn hoạt động nhưng mỗi I/O request lớn phải phân mảnh thành nhiều packet → CPU overhead tăng, throughput giảm; MTU 9000 giảm số packet cho cùng lượng data — thực tế tăng throughput và giảm CPU 20-40%  
d) Vì switch iSCSI không hỗ trợ MTU < 9000

**Đáp án: c** — Với block I/O thường 64KB-1MB, MTU 1500 phải chia thành 40-700 packet. MTU 9000 giảm xuống còn 7-110 packet. Ít packet = ít interrupt CPU = throughput cao hơn và CPU usage thấp hơn. MTU 1500 vẫn "works" nhưng suboptimal — nhiều môi trường thực tế cài iSCSI rồi không set jumbo frame và không biết mình đang bỏ phí 30-40% throughput.

---

**Câu 3**: LUN masking trong iSCSI dùng để làm gì?

a) Giới hạn chỉ initiator được phép (theo IQN) mới thấy được LUN cụ thể — bảo mật: server A không thể access storage của server B  
b) Tăng tốc độ đọc bằng cách mask unused LUN  
c) Giảm latency bằng cách filter packet  
d) Tạo snapshot cho từng LUN riêng biệt

**Đáp án: a** — Không có LUN masking, mọi server kết nối vào storage network đều thấy mọi LUN → có thể format nhầm LUN của server khác. Masking theo IQN đảm bảo server web chỉ thấy LUN của nó, không thấy LUN database. Trong vSphere, masking đặc biệt quan trọng: các ESXi host cùng cluster cần thấy cùng datastore LUN, nhưng không cần thấy LUN của storage khác.

---

**Câu 4**: Multipath I/O (MPIO) cho iSCSI mang lại lợi ích gì?

a) Tăng dung lượng storage gấp đôi  
b) Redundancy (failover khi một path down) và load balancing (phân tải I/O giữa nhiều NIC/switch) — mất một NIC không làm mất storage  
c) Giảm latency 50% mà không cần thêm hardware  
d) Cho phép dùng iSCSI mà không cần jumbo frame

**Đáp án: b** — Với single path: NIC fail = storage mất → VM crash. Với MPIO: 2 path qua 2 NIC/switch riêng biệt → một path down, I/O tự chuyển sang path kia (failover) trong vài giây. Với active/active MPIO: I/O phân tải trên cả 2 path → throughput tăng. Đây là lý do datacenter production luôn deploy iSCSI multipath.

---

**Câu 5**: Tại sao không nên dùng `/dev/sdb` hardcode trong cấu hình cho iSCSI disk?

a) Vì iSCSI disk không hỗ trợ standard device naming  
b) Vì `/dev/sdb` chỉ hoạt động trên RHEL  
c) Vì `/dev/sdb` có thể thay đổi sau reboot (thứ tự discover SCSI device không deterministc) — nên dùng `/dev/disk/by-path/` (stable path) hoặc multipath alias `/dev/mapper/mpatha`  
d) Vì `/dev/sdb` bị reserved cho CD-ROM trong iSCSI

**Đáp án: c** — SCSI device naming phụ thuộc vào thứ tự kernel discover thiết bị khi boot. Nếu thêm một disk mới hoặc đổi thứ tự boot, `sdb` có thể trở thành `sdc`. Với iSCSI, sau reboot hoặc session reconnect, thứ tự có thể khác. `/dev/disk/by-path/ip-<target-ip>:3260-iscsi-<iqn>-lun-<n>` là stable identifier. Dùng hardcoded `sdb` trong `/etc/fstab` có thể mount nhầm disk sau reboot.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước trong module:**
- `virt-storage.san-nas.fundamentals` — block vs file vs object, SAN vs NAS

**Bài liên quan ngoài module:**
- `virt-storage.vsphere.networking-storage` — iSCSI VMkernel trong vSphere
- `virt-storage.san-nas.nfs` — NFS so sánh với iSCSI

**Nguồn tham khảo:**
- [iscsiadm(8) man page](https://linux.die.net/man/8/iscsiadm)
- [Open-iSCSI project](https://www.open-iscsi.com/)
