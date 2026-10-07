---
id: virt-storage.proxmox-kvm.fundamentals
title: "KVM/QEMU cơ bản: ảo hóa dựa trên Linux kernel"
domain: virt-storage
module: virt-storage.proxmox-kvm
level: "nền tảng"
prerequisites: []
applies_to:
  - "KVM (Kernel-based Virtual Machine) trên Linux kernel 5.x+"
  - "QEMU 6.x+, libvirt 8.x+, Proxmox VE 7.x/8.x"
status: draft
sources:
  - "https://www.linux-kvm.org/page/Main_Page"
  - "https://qemu.readthedocs.io/en/latest/system/introduction.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

KVM là hypervisor mặc định của Linux — có mặt trong kernel từ 2007, dùng bởi AWS EC2, Google
Compute Engine, OpenStack, Proxmox, và hầu hết cloud provider. Nếu bạn vận hành server Linux
hoặc private cloud, rất có khả năng VM đang chạy trên KVM.

Khác với VMware vSphere (proprietary), KVM là open source, không cần license, và được quản
lý qua libvirt API với nhiều tool: `virsh`, `virt-manager`, Proxmox VE. Hiểu stack KVM/QEMU
giúp bạn debug VM không boot, tối ưu performance, và hiểu tại sao VM trên cloud hành xử khác
VM trên laptop.

## 2. Khái niệm cốt lõi

### KVM là gì — Type 1 hypervisor trong Linux kernel

**KVM (Kernel-based Virtual Machine)** là module của Linux kernel (`kvm.ko` + `kvm_intel.ko`
hoặc `kvm_amd.ko`) biến Linux thành **Type 1 hypervisor**. KVM khai thác extension phần cứng
của CPU (Intel VT-x hoặc AMD-V) để chạy VM với hiệu năng gần native.

```
Type 1 hypervisor trong Linux:
┌──────────────────────────────────┐
│  Guest VM          Guest VM      │
│  (QEMU process)    (QEMU process)│
├──────────────────────────────────┤
│  KVM module  (/dev/kvm)          │
│  ↕ khai thác Intel VT-x/AMD-V   │
├──────────────────────────────────┤
│  Linux kernel (host OS)          │
├──────────────────────────────────┤
│  Hardware (CPU/RAM/disk)         │
└──────────────────────────────────┘
```

KVM **không chạy VM bởi mình** — chỉ cung cấp virtualization infrastructure qua `/dev/kvm`.
Phần emulate hardware (disk, NIC, USB) là công việc của **QEMU**.

### QEMU — device emulation

**QEMU** (Quick Emulator) là process userspace chạy một VM. Nó:
- Emulate hardware của VM (VirtIO disk, VirtIO NIC, BIOS/UEFI, PCI bus)
- Dùng `/dev/kvm` để execute VM CPU code trực tiếp trên hardware (với Intel VT-x/AMD-V)
- Một VM = một process QEMU trên host Linux

```bash
# Process QEMU cho một VM (minh họa cách nó trông ra sao)
ps aux | grep qemu
# qemu  12345  ...  /usr/bin/qemu-system-x86_64 -name vm1 -m 4096
#   -cpu host -smp 4 -drive file=/var/lib/vms/vm1.qcow2,format=qcow2
#   -netdev bridge,id=net0,br=br0 -device virtio-net-pci,netdev=net0
```

### libvirt — management API

**libvirt** là API/daemon (`libvirtd`) cung cấp lớp abstraction trên KVM/QEMU — giống như
vCenter trên vSphere nhưng open source. Tool `virsh` là CLI của libvirt.

```
virt-manager (GUI) ─┐
virsh (CLI)        ─┤─→ libvirtd (daemon) ─→ QEMU/KVM
Proxmox VE (Web UI)─┘                       (thực thi)
```

Libvirt lưu VM definition dưới dạng XML (`/etc/libvirt/qemu/<vm-name>.xml`).

### VirtIO — paravirtualized drivers (hiệu năng tốt hơn)

**VirtIO** là standard cho paravirtualized device: VM guest biết mình đang ảo hóa và dùng
driver đặc biệt thay vì emulate hardware thật. Kết quả: throughput cao hơn, CPU overhead
thấp hơn so với full hardware emulation.

| Device | Emulated (chậm) | VirtIO (nhanh) |
|--------|----------------|----------------|
| Disk | IDE/SATA (`qemu-disk`) | `virtio-blk`, `virtio-scsi` |
| Network | e1000, rtl8139 | `virtio-net` |
| Balloon | N/A | `virtio-balloon` (RAM reclaim) |

Khi tạo VM production, luôn chọn VirtIO disk và VirtIO NIC thay vì emulated.

### qcow2 — disk image format của QEMU

**qcow2 (QEMU Copy-On-Write v2)** là format disk image phổ biến nhất cho KVM:
- Chỉ chiếm dung lượng thực tế đang dùng (thin provisioning by default)
- Hỗ trợ snapshot (internal snapshot trong file qcow2)
- Hỗ trợ encryption (LUKS)
- Hỗ trợ backing file (chaining — dùng cho template clone nhanh)

```bash
# Tạo disk image qcow2 10GB (thin)
qemu-img create -f qcow2 vm1.qcow2 10G
# Formatting 'vm1.qcow2': virtual size=10G, disk size=196K (chỉ tốn 196KB thực)

# Tạo image từ backing file (clone nhanh, không copy toàn bộ)
qemu-img create -f qcow2 -b base-ubuntu.qcow2 -F qcow2 vm-clone.qcow2
# vm-clone.qcow2 chỉ lưu phần khác biệt so với base
```

## 3. Cách nó hoạt động

### CPU virtualization — VT-x/AMD-V

Không có Intel VT-x/AMD-V, QEMU phải emulate toàn bộ CPU instruction-by-instruction → chậm
10-100x. Với VT-x, CPU có mode đặc biệt (VMX root/non-root) cho phép guest code chạy
**trực tiếp** trên CPU — hypervisor chỉ can thiệp khi guest cố làm operation đặc quyền
(I/O, interrupt, change CR3). Overhead giảm xuống còn 1-5%.

### Luồng I/O của VM disk (VirtIO path)

```
VM guest app writes data
  → virtio-blk driver (in guest kernel)
  → QEMU virtio backend (userspace, host)
  → host kernel I/O (ext4/XFS/raw block)
  → physical disk
```

Mỗi hop thêm latency. Để tối ưu:
- Dùng raw disk (không qcow2 overhead) cho database production
- Dùng `cache=none,aio=native` để bypass host page cache
- Dùng `io_uring` (Linux 5.1+) cho async I/O tốt hơn

## 4. Thực hành

**Kiểm tra KVM module và hardware support** (chạy thật):

```bash
lsmod | grep kvm
```

Kết quả thực tế:

```
kvm_intel             491520  0
kvm                  1409024  1 kvm_intel
irqbypass              12288  1 kvm
```

`kvm_intel` load = CPU này là Intel với VT-x, KVM sẵn sàng.

```bash
# Kiểm tra virtualization flags trong CPU
grep -m1 -oE '(vmx|svm)' /proc/cpuinfo
```

Kết quả thực tế:

```
vmx
```

`vmx` = Intel VT-x. `svm` = AMD-V. Thiếu cả hai → KVM không hoạt động (cần bật trong BIOS).

**Tạo và inspect disk image** (chạy thật):

```bash
qemu-img create -f qcow2 /tmp/demo-vm.qcow2 20G
qemu-img info /tmp/demo-vm.qcow2
```

Kết quả thực tế:

```
Formatting '/tmp/demo-vm.qcow2', fmt=qcow2 cluster_size=65536 ...
image: /tmp/demo-vm.qcow2
file format: qcow2
virtual size: 20 GiB (21474836480 bytes)
disk size: 196 KiB
cluster_size: 65536
Format specific information:
    compat: 1.1
    compression type: zlib
```

`virtual size: 20 GiB` nhưng `disk size: 196 KiB` — thin provisioning, chỉ tốn 196KB thực.

```bash
rm /tmp/demo-vm.qcow2
```

**Quản lý VM với virsh** (output minh họa — libvirt không cài trên máy demo):

```bash
# Liệt kê VM đang chạy
virsh list
#  Id   Name        State
# ────────────────────────
#   1   ubuntu22-01  running
#   2   db-server    running

# Chi tiết config VM
virsh dominfo ubuntu22-01
# State: running | vCPUs: 4 | Max memory: 8388608 KiB

# Tắt VM gracefully
virsh shutdown ubuntu22-01

# Tắt ngay lập tức (như rút điện)
virsh destroy ubuntu22-01

# Xem console VM
virsh console ubuntu22-01
```

> **Output minh họa** — libvirt/virsh không cài trên máy demo.

## 5. Lỗi thường gặp và cách chẩn đoán

**"KVM is not available" khi tạo VM**: KVM module chưa load hoặc CPU không có VT-x/AMD-V,
hoặc VT-x bị disable trong BIOS. Kiểm tra: `lsmod | grep kvm`, `grep -E 'vmx|svm' /proc/cpuinfo`.
Nếu nested virtualization (VM trong VM), cần bật: `modprobe kvm_intel nested=1`.

**VM boot chậm, I/O thấp so với bare metal**: đang dùng emulated disk (IDE/SATA) thay vì
VirtIO, hoặc cache mode không tối ưu. Kiểm tra `/etc/libvirt/qemu/<vm>.xml`: `<disk type='...'>`
nên có `<driver name='qemu' type='qcow2' cache='none'/>` và device `virtio`.

**qcow2 file không giải phóng space sau khi xóa file trong VM**: qcow2 thin provision không
tự shrink khi xóa. Guest OS cần gửi TRIM/discard command. Trong guest: `fstrim -v /` (SSD/thin).
Trên host: `qemu-img convert -O qcow2 old.qcow2 new.qcow2` để nén file.

**VM "not responding" nhưng process QEMU còn chạy**: VM kernel panic hoặc hang. Xem console:
`virsh console <vm>`. Xem log: `/var/log/libvirt/qemu/<vm>.log`. Có thể cần `virsh reset <vm>`
(tương đương reset button vật lý).

**Backing file chain hỏng (qcow2 base bị xóa)**: VM dùng backing file không tìm thấy base →
không boot. Kiểm tra: `qemu-img info --backing-chain vm.qcow2`. Fix: `qemu-img rebase` hoặc
`qemu-img convert` để merge thành standalone file.

## 6. Tình huống thực tế

**Tình huống**: Một VM production (`db-server`) trên KVM host bị I/O rất chậm. `top` trong
VM cho thấy `%wa` (I/O wait) thường xuyên 60-80%. Host Linux chạy bình thường.

**Phân tích từng tầng**:

1. **Kiểm tra disk type trong VM** (output minh họa):
   ```bash
   # Trong guest VM
   lsblk -o NAME,MODEL,ROTA
   # vda   0  ← VirtIO disk, non-rotating (SSD virtual)
   # Nếu thấy sda với MODEL "QEMU HARDDISK" → đang dùng emulated IDE
   ```

2. **Kiểm tra cache mode** (output minh họa):
   ```xml
   <!-- /etc/libvirt/qemu/db-server.xml trên host -->
   <driver name='qemu' type='qcow2' cache='writeback'/>
   <!--                                    ↑ writeback = tốt hơn writethrough nhưng chưa optimal -->
   ```

3. **Kiểm tra I/O trên host** (chạy thật từ VM):
   ```bash
   iostat -x 1 3 2>/dev/null | head -15
   ```
   (không có disk thật để demo, nhưng trên host có VM sẽ thấy đây là lệnh hữu ích)

4. **Fix**:
   - Đổi cache mode: `cache='none'` (bypass host page cache, dùng cho database)
   - Đổi aio: `aio='native'` (hoặc `io_uring` nếu kernel ≥ 5.1)
   - Nếu disk là qcow2 trên HDD → migrate sang SSD hoặc raw disk

5. **Sau fix**: `%wa` giảm từ 60% xuống còn <5%.

## 7. Tự kiểm tra

**Câu 1**: Khác biệt giữa KVM và QEMU là gì?

a) KVM và QEMU là cùng một phần mềm  
b) KVM là hypervisor thương mại, QEMU là open source  
c) KVM là module Linux kernel cung cấp CPU virtualization (khai thác Intel VT-x/AMD-V); QEMU là process userspace thực hiện device emulation (disk, NIC, BIOS) và dùng KVM để execute VM CPU code — cả hai cùng làm việc cho một VM  
d) QEMU chỉ dùng để emulate ARM trên x86, không liên quan đến KVM

**Đáp án: c** — KVM một mình không thể chạy VM (chỉ là kernel module). QEMU một mình emulate toàn bộ bằng software (chậm). Kết hợp: QEMU dùng `/dev/kvm` để CPU code chạy native, chỉ dùng software emulation cho device I/O. Đây là lý do đúng khi nói "KVM/QEMU" như một cặp.

---

**Câu 2**: Tại sao VirtIO disk nhanh hơn emulated SATA/IDE trong KVM?

a) VirtIO dùng phần cứng đặc biệt, không cần software  
b) VirtIO disk driver trong guest biết mình đang ảo hóa — giao tiếp trực tiếp với QEMU backend qua interface tối ưu thay vì phải emulate toàn bộ SATA/IDE controller với tất cả register và interrupt phức tạp của nó  
c) VirtIO chỉ hoạt động với SSD  
d) VirtIO tắt tất cả cache để tăng tốc

**Đáp án: b** — Emulated SATA/IDE: guest driver nghĩ đang nói chuyện với phần cứng thật → gửi command theo SATA protocol đầy đủ → QEMU phải intercept mọi I/O port access và register read/write → overhead rất lớn. VirtIO: driver biết mình ảo hóa, dùng shared memory ring buffer đặc biệt để batch I/O request → overhead gần bằng 0. Throughput VirtIO thường gấp 2-5x emulated.

---

**Câu 3**: `qemu-img create -f qcow2 vm.qcow2 50G` tạo file bao nhiêu GB trên disk?

a) 50 GB ngay lập tức  
b) ~196 KB — qcow2 thin provision, chỉ lưu overhead metadata; thực tế disk usage tăng khi VM ghi data  
c) 25 GB (nửa kích thước khai báo)  
d) Phụ thuộc vào filesystem của host

**Đáp án: b** — qcow2 thin provision: file bắt đầu gần như rỗng (chỉ header metadata ~196KB), grow khi VM ghi. Virtual size là 50GB nhưng disk usage thực tế ~196KB cho đến khi dữ liệu được ghi. Lợi ích: có thể provision 100 VM × 50GB = 5TB virtual trong khi chỉ có 1TB storage thực, miễn là tổng thực dùng ≤ 1TB.

---

**Câu 4**: Intel VT-x flag (`vmx` trong `/proc/cpuinfo`) cần thiết để làm gì?

a) Để chạy 64-bit OS trong VM  
b) Để kết nối VM vào mạng  
c) Để bật nested virtualization  
d) Để KVM execute VM CPU code trực tiếp trên phần cứng mà không cần software emulation toàn bộ — thiếu VT-x thì KVM không hoạt động, chỉ QEMU software emulation (chậm 10-100x)

**Đáp án: d** — Intel VT-x (VMX = Virtual Machine Extensions) là tập lệnh mở rộng cho phép CPU chạy "guest mode" — guest code chạy trực tiếp trên CPU nhưng trong sandbox, hypervisor chỉ can thiệp khi cần. Thiếu VT-x (hoặc bị disabled trong BIOS), KVM module không thể activate, `/dev/kvm` không tồn tại. QEMU vẫn chạy được nhưng pure software emulation — vài lần chậm hơn.

---

**Câu 5**: Backing file trong qcow2 dùng để làm gì?

a) Để link file qcow2 vào một "base image" — VM chỉ lưu phần khác biệt so với base, cho phép clone nhanh nhiều VM từ cùng template mà không copy toàn bộ base image  
b) Để backup VM tự động  
c) Để replicate VM sang host khác  
d) Để tăng tốc độ đọc bằng cách cache trên backing device

**Đáp án: a** — Ví dụ: `ubuntu22-base.qcow2` là template 10GB. Tạo 10 VM từ template: mỗi VM có qcow2 nhỏ chỉ lưu phần khác biệt (config, installed packages riêng). Tổng storage: 10GB base + 10 × vài GB khác biệt — thay vì 10 × 10GB = 100GB nếu copy đầy đủ. Proxmox dùng mechanism này cho linked clone. Rủi ro: base bị xóa = tất cả VM con hỏng.

## 8. Bài liên quan và nguồn tham khảo

**Bài tiếp theo trong module:**
- `virt-storage.proxmox-kvm.cluster` — Proxmox VE: quản lý cluster, VM và LXC

**Bài liên quan ngoài module:**
- `virt-storage.vsphere.architecture` — so sánh KVM với VMware ESXi
- `container-k8s.docker-internals.namespaces-cgroups` — container dùng namespace/cgroup thay vì full hypervisor
- `linux.boot-systemd.boot-process` — VM guest cũng trải qua full Linux boot process

**Nguồn tham khảo:**
- [KVM official site](https://www.linux-kvm.org/page/Main_Page)
- [QEMU documentation](https://qemu.readthedocs.io/en/latest/system/introduction.html)
