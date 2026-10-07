---
id: virt-storage.proxmox-kvm.cluster
title: "Proxmox VE: quản lý cluster, VM và container (LXC)"
domain: virt-storage
module: virt-storage.proxmox-kvm
level: "vận hành"
prerequisites:
  - "virt-storage.proxmox-kvm.fundamentals"
applies_to:
  - "Proxmox VE 7.x/8.x"
  - "pvecm, qm, pct CLI tools"
status: draft
sources:
  - "https://pve.proxmox.com/wiki/Cluster_Manager"
  - "https://pve.proxmox.com/wiki/Linux_Container"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Proxmox VE là platform ảo hóa open source phổ biến nhất cho private cloud quy mô nhỏ và vừa
— miễn phí, chạy được trên hardware thông thường, quản lý cả VM (KVM) lẫn container (LXC)
từ một giao diện Web duy nhất. Nhiều team nội bộ, lab, và SME dùng Proxmox thay vì VMware vSphere
vì không tốn license và cộng đồng lớn.

Khác với `virt-storage.proxmox-kvm.fundamentals` (tập trung vào KVM/QEMU cơ chế), bài này tập
trung vào **vận hành thực tế**: tạo cluster nhiều node, tạo và quản lý VM/container bằng CLI,
hiểu storage và networking của Proxmox, và xử lý các tình huống thường gặp như mất quorum hay
VM không boot.

## 2. Khái niệm cốt lõi

### Proxmox VE stack

Proxmox VE là Debian Linux + các thành phần sau:

```
┌─────────────────────────────────────────────────────┐
│  Web UI (port 8006)  │  CLI: pvecm/qm/pct/pvesm     │
├──────────────────────┴──────────────────────────────┤
│  Proxmox cluster layer (pmxcfs, corosync)           │
├─────────────────────────────────────────────────────┤
│  KVM/QEMU (Virtual Machines)  │  LXC (Containers)   │
├─────────────────────────────────────────────────────┤
│  Debian Linux kernel (host OS)                      │
└─────────────────────────────────────────────────────┘
```

Config VM/container lưu trong **pmxcfs** (Proxmox Cluster File System) — filesystem phân tán
đồng bộ qua corosync giữa tất cả node, nên config thay đổi trên một node tự động visible từ
node khác.

### VM (KVM/QEMU) vs LXC container — khi nào dùng cái nào

| Tiêu chí | VM (KVM) | LXC container |
|---|---|---|
| Kernel | Kernel riêng trong VM | Dùng chung kernel host |
| Overhead | ~5-15% CPU/RAM | ~1-3% (gần như native) |
| Boot time | 30-60 giây | 1-5 giây |
| Isolation | Mạnh — hypervisor boundary | Yếu hơn — chỉ namespace |
| OS | Bất kỳ (Windows, BSD...) | Linux only |
| Live migration | vMotion-equivalent (`qm migrate`) | Hỗ trợ hạn chế |

**Nguyên tắc thực tế:**
- Dùng LXC cho workload Linux thuần (web server, database) cần density cao — tiết kiệm 80-90%
  RAM overhead so với VM.
- Dùng VM cho: workload cần Windows/BSD, cần isolation mạnh (multi-tenant), hoặc app có
  kernel-specific requirements.

### Cluster và quorum

Proxmox cluster dùng **Corosync** để đồng bộ state giữa các node (UDP port 5405-5412). Cluster
cần **quorum** để hoạt động — phải có đa số node online mới được phép thay đổi config:

- 2 node: quorum = 2/2 (một node down → mất quorum → read-only mode)
- **3 node: quorum = 2/3** (một node down vẫn hoạt động bình thường — đây là minimum thực tế)
- 5 node: quorum = 3/5

Công thức: `quorum = floor(total_nodes / 2) + 1`.

Nếu chỉ có 2 node, dùng **QDevice** (một node nhỏ thứ 3 chỉ có vote, không chạy VM) để đảm
bảo 2/3 thay vì 2/2.

### Storage trong Proxmox

| Type | Tên trong UI | Dùng cho | Snapshot |
|---|---|---|---|
| `dir` | Directory (`local`) | ISO, template, backup | Không |
| `lvmthin` | LVM-Thin (`local-lvm`) | VM/CT disk mặc định | Có |
| `nfs` | NFS Share | Shared storage | Không |
| `rbd` | Ceph RBD | VM disk (distributed) | Có |
| `zfspool` | ZFS Pool | VM/CT disk | Có |
| `iscsi` | iSCSI | Block storage từ SAN | Không |

Default sau khi cài Proxmox: `local` (dir) + `local-lvm` (LVM-Thin). File cấu hình storage:
`/etc/pve/storage.cfg`.

### Network — Linux bridge model

Proxmox dùng mô hình Linux bridge. Mỗi node có bridge `vmbr0` gắn vào NIC vật lý. VM/container
kết nối vào bridge qua veth pair (giống Docker bridge, xem `container-k8s.docker-internals.networking`):

```
Physical NIC (eth0)
    ↕
Linux bridge (vmbr0) ←→ VM1 tap/veth ←→ VM guest eth0
                    ←→ VM2 tap/veth ←→ VM guest eth0
                    ←→ CT100 veth   ←→ Container eth0
```

VLAN: gán `vlan tag` trong config VM/CT — vmbr0 sẽ tag frame 802.1Q khi gửi ra NIC vật lý.

## 3. Cách nó hoạt động

### Quorum math thực tế (chạy thật)

```python
import math

def quorum(n):
    return math.floor(n / 2) + 1

for n in [1, 2, 3, 4, 5, 6, 7]:
    q = quorum(n)
    survive = n - q  # số node có thể down mà vẫn giữ quorum
    print(f"{n} nodes: quorum={q}, có thể down tối đa {survive} node")
```

Kết quả thực tế:

```
1 nodes: quorum=1, có thể down tối đa 0 node
2 nodes: quorum=2, có thể down tối đa 0 node
3 nodes: quorum=2, có thể down tối đa 1 node
4 nodes: quorum=3, có thể down tối đa 1 node
5 nodes: quorum=3, có thể down tối đa 2 node
6 nodes: quorum=4, có thể down tối đa 2 node
7 nodes: quorum=4, có thể down tối đa 3 node
```

3-node là điểm tối thiểu thực tế: chịu được 1 node failure. 5-node: chịu được 2 node failure.

## 4. Thực hành

> **Output minh họa** — Proxmox VE không cài trên máy demo. Cú pháp lấy từ tài liệu chính
> thức tại pve.proxmox.com/wiki.

### Tạo cluster và thêm node

```bash
# Trên node đầu tiên: tạo cluster
pvecm create my-cluster

# Kiểm tra trạng thái cluster
pvecm status
# Quorum information
# ~~~~~~~~~~~~~~~~~~
# Date:             Wed Oct  7 10:00:00 2026
# Quorum provider:  corosync_votequorum
# Nodes:            3
# Quorum:           2
# Quorate:          Yes   ← cluster có quorum, đang hoạt động bình thường

# Liệt kê các node trong cluster
pvecm nodes
# Membership information
# ~~~~~~~~~~~~~~~~~~~~~~
#    Nodeid  Votes Name
#         1      1 pve1 (local)
#         2      1 pve2
#         3      1 pve3
```

```bash
# Trên node 2 (pve2): join cluster
# Cần SSH access tới node 1 trong quá trình join (nhập password root một lần)
pvecm add 192.168.1.101    # IP của pve1
```

### Quản lý VM với `qm`

```bash
# Tạo VM: ID=100, 2 vCPU, 2GB RAM, 20GB disk trên local-lvm
qm create 100 \
  --name web-server \
  --memory 2048 \
  --cores 2 \
  --net0 virtio,bridge=vmbr0 \
  --scsi0 local-lvm:20 \
  --cdrom local:iso/ubuntu-22.04.3-live-server-amd64.iso \
  --boot order=cdrom

# Bật/tắt VM
qm start 100
qm shutdown 100    # graceful (gửi ACPI signal)
qm stop 100        # force (tương đương rút điện)

# Xem config hiện tại
qm config 100
# cores: 2
# memory: 2048
# net0: virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0
# scsi0: local-lvm:vm-100-disk-0,size=20G

# Liệt kê tất cả VM
qm list
#      VMID NAME       STATUS     MEM(MB)    BOOTDISK(GB) PID
#       100 web-server stopped    2048       20.000       0
#       101 db-server  running    4096       40.000       12345

# Snapshot
qm snapshot 100 before-upgrade
qm rollback 100 before-upgrade
```

Config VM lưu tại `/etc/pve/qemu-server/<vmid>.conf` — file text, có thể đọc/edit trực tiếp.

### Quản lý LXC container với `pct`

```bash
# Download template trước (một lần)
pveam update
pveam available | grep ubuntu
# system  ubuntu-22.04-standard_22.04-1_amd64.tar.zst
pveam download local ubuntu-22.04-standard_22.04-1_amd64.tar.zst

# Tạo container: ID=200, 512MB RAM, 8GB disk, unprivileged (default)
pct create 200 local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst \
  --hostname app-container \
  --memory 512 \
  --cores 2 \
  --rootfs local-lvm:8 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --unprivileged 1

# Bật/tắt container
pct start 200
pct stop 200
pct shutdown 200

# Mở shell trong container
pct enter 200
# root@app-container:~#

# Chạy lệnh trong container mà không cần interactive shell
pct exec 200 -- systemctl status nginx

# Liệt kê container
pct list
# VMID  Status  Lock  Name
# 200   running       app-container
# 201   stopped       cache-redis
```

Config container lưu tại `/etc/pve/lxc/<ctid>.conf`.

## 5. Lỗi thường gặp và cách chẩn đoán

**Cluster ở trạng thái "read-only", không tạo được VM**: quorum bị mất (>= một nửa số node
down). Kiểm tra: `pvecm status` — nếu `Quorate: No`, cluster đang read-only. Giải pháp: khôi
phục node down, hoặc trong trường hợp khẩn cấp (biết chắc các node còn lại đủ để tiếp tục):
`pvecm expected 1` để reset expected votes — **chỉ dùng khi chắc chắn không có split-brain**.

**VM bị kẹt ở "Locked"**: VM đang trong trạng thái migration/backup/snapshot bị gián đoạn.
Xem: `qm status <vmid>`, nếu `lock=backup` hoặc `lock=migrate` kẹt quá lâu: `qm unlock <vmid>`.

**Container không start: "cgroup v2 not fully supported"**: host kernel quá cũ (< 5.2) hoặc
container template cũ dùng cgroup v1. Cập nhật Proxmox lên 7.x+ (kernel 5.15+) hoặc dùng
template mới hơn của distribution.

**VM không nhận được IP sau khi clone**: địa chỉ MAC bị duplicate nếu clone không reset MAC.
Khi clone bằng `qm clone`, thêm `--full` để tạo MAC mới, hoặc sau khi clone: edit `/etc/pve/qemu-server/<vmid>.conf` và sửa MAC trong dòng `net0`.

**Node join cluster thất bại: "Failed to join"**: thường do DNS không resolve hostname của
node đã có trong cluster, hoặc firewall chặn UDP 5405-5412. Kiểm tra: `ping` và `nc -uzv
<cluster-node-ip> 5405`.

## 6. Tình huống thực tế

**Tình huống**: Team có 3 Proxmox node (pve1/pve2/pve3), mỗi node chạy 4-5 VM. pve2 đột ngột
mất kết nối mạng. Cần đánh giá tác động và xử lý.

**Phân tích và hành động**:

1. **Kiểm tra quorum** (chạy trên pve1 hoặc pve3):
   ```bash
   pvecm status
   # Nodes: 3, Quorum: 2, Quorate: Yes  ← 2/3 node online, cluster vẫn hoạt động
   ```
   Với 3-node cluster, mất 1 node vẫn đủ quorum — đây là lý do cần tối thiểu 3 node.

2. **Kiểm tra VM trên pve2**:
   ```bash
   # VM trên pve2 vẫn đang chạy (chưa bị HA failover vì không có HA config)
   # Nếu có cấu hình HA, cluster sẽ tự động fence pve2 rồi restart VM trên node khác
   ```

3. **Migrate VM sang node khác** (nếu pve2 hoàn toàn không tiếp cận được và cần khôi phục
   VM):
   ```bash
   # Offline migration (VM phải stop trước)
   qm stop 201          # nếu vẫn reach được pve2
   qm migrate 201 pve3  # migrate disk + config sang pve3
   qm start 201
   ```

4. **Sau khi pve2 online trở lại**: cluster tự re-sync config qua corosync. Kiểm tra:
   ```bash
   pvecm status   # Nodes: 3, Quorate: Yes
   pvecm nodes    # pve2 xuất hiện lại trong danh sách
   ```

**Bài học**: 3-node cluster cho phép maintenance hoặc failure của 1 node mà không ảnh hưởng
toàn cluster. Với 2-node, bất kỳ downtime nào của 1 node đều làm cluster read-only.

## 7. Tự kiểm tra

**Câu 1**: Tại sao Proxmox VE khuyến nghị tối thiểu 3 node cho cluster production?

a) 3 node nhanh hơn 2 node vì parallel processing  
b) 2 node không hỗ trợ LXC container  
c) Với 3 node, quorum = 2/3, cluster vẫn hoạt động bình thường khi 1 node down; với 2 node, quorum = 2/2, mất 1 node là mất quorum và cluster chuyển sang read-only mode  
d) Proxmox license yêu cầu tối thiểu 3 node

**Đáp án: c** — Quorum = `floor(n/2) + 1`. Với 2 node: quorum=2, không chịu được bất kỳ node failure nào. Với 3 node: quorum=2, chịu được 1 node failure. Đây là lý do 3 node là minimum thực tế để cluster có khả năng chịu lỗi.

---

**Câu 2**: Khi nào nên dùng LXC container thay vì VM trong Proxmox?

a) Khi cần chạy Windows Server  
b) Khi workload là Linux và cần mật độ cao (nhiều instance trên cùng phần cứng) với overhead thấp nhất — LXC dùng chung kernel host, overhead ~1-3% so với VM ~5-15%  
c) Khi cần isolation mạnh nhất giữa các tenant  
d) Khi cần live migration đầy đủ

**Đáp án: b** — LXC dùng chung kernel host, không tốn RAM cho kernel riêng — tiết kiệm được 100-200MB RAM/instance so với VM. 50 LXC container 512MB RAM = 25GB tổng; 50 VM 512MB = 25GB + kernel overhead mỗi VM ≈ 30-35GB thực tế. Nhược điểm: chỉ chạy được Linux (cùng kernel arch với host), isolation yếu hơn.

---

**Câu 3**: `qm shutdown 100` và `qm stop 100` khác nhau thế nào?

a) Hoàn toàn giống nhau  
b) `shutdown` cần password, `stop` không  
c) `shutdown` gửi ACPI power button signal để OS guest gracefully shutdown (tắt đúng cách, flush disk, chạy shutdown hooks); `stop` ngắt nguồn ngay lập tức như rút điện — có thể gây filesystem corruption nếu OS không được tắt đúng cách  
d) `shutdown` chỉ dùng được khi VM đang paused

**Đáp án: c** — Luôn dùng `qm shutdown` cho VM production. `qm stop` dùng khi VM bị hang và không phản hồi ACPI signal.

---

**Câu 4**: VM trên Proxmox bị kẹt ở trạng thái "locked". Nguyên nhân phổ biến nhất và cách xử lý là gì?

a) VM đang bị tấn công, cần reboot ngay lập tức  
b) Disk của VM đầy  
c) Một tác vụ nền (backup/migration/snapshot) bị gián đoạn giữa chừng, lock chưa được giải phóng — xử lý: `qm unlock <vmid>` sau khi xác nhận không còn tác vụ nào thật sự đang chạy  
d) VM đang trong quá trình live migration bình thường

**Đáp án: c** — Proxmox đặt lock khi chạy backup/snapshot/migrate để ngăn xung đột. Nếu tác vụ bị gián đoạn (mất điện, network drop), lock còn lại. `qm unlock` chỉ nên dùng sau khi chắc chắn không có tác vụ thật đang chạy — giải phóng lock của tác vụ đang chạy có thể gây data corruption.

---

**Câu 5**: Trong Proxmox, storage type nào hỗ trợ snapshot VM disk và phù hợp làm default storage?

a) `dir` (Directory) — luôn hỗ trợ snapshot và đơn giản nhất  
b) `nfs` — NFS share hỗ trợ snapshot natively  
c) `lvmthin` (LVM-Thin) — hỗ trợ snapshot VM disk bằng LVM thin provisioning; là default `local-lvm` sau khi cài Proxmox  
d) `iscsi` — iSCSI target hỗ trợ snapshot theo chuẩn SCSI T10

**Đáp án: c** — `dir` (local) không hỗ trợ snapshot cho VM disk dùng qcow2 qua Proxmox API (chỉ hỗ trợ qua qemu internal snapshot, không tích hợp với Proxmox backup). `lvmthin` hỗ trợ snapshot native qua LVM và được dùng làm `local-lvm` default — phù hợp nhất cho VM disk trên local storage.

## 8. Bài liên quan và nguồn tham khảo

**Bài trong module:**
- `virt-storage.proxmox-kvm.fundamentals` — KVM/QEMU cơ chế bên dưới

**Bài liên quan ngoài module:**
- `virt-storage.vsphere.ha-drs` — so sánh Proxmox HA với VMware DRS/HA
- `virt-storage.san-nas.nfs` — NFS storage cho Proxmox cluster (xem thêm)
- `container-k8s.docker-internals.namespaces-cgroups` — LXC và Docker cùng dùng namespace/cgroup

**Nguồn tham khảo:**
- [Proxmox Cluster Manager](https://pve.proxmox.com/wiki/Cluster_Manager)
- [Proxmox Linux Container guide](https://pve.proxmox.com/wiki/Linux_Container)
