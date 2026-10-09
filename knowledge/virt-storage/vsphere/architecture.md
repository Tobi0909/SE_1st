---
id: virt-storage.vsphere.architecture
title: "Kiến trúc vSphere: ESXi, vCenter, cluster"
domain: virt-storage
module: virt-storage.vsphere
level: "nền tảng"
prerequisites: []
applies_to:
  - "VMware vSphere 7.x / 8.x (VCSA, ESXi)"
  - "Khái niệm đúng cho mọi phiên bản vSphere từ 6.5 trở lên"
status: verified
sources:
  - "https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-vcenter-esxi-management/GUID-65658D77-3138-47F0-BCA8-68D8CEC4B1A0.html"
  - "https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-resource-management/GUID-98BD5A8A-260A-494F-BAAE-74781F5C4B87.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Môi trường datacenter doanh nghiệp Việt Nam vẫn có tỉ lệ rất lớn chạy trên VMware vSphere —
từ các TCTD, telco đến enterprise. Khi một VM "không lên được", khi vMotion thất bại, khi cluster
báo "HA disabled", bạn cần hiểu **tại sao** mới biết gõ lệnh gì và xem log ở đâu.

Kiến trúc vSphere là nền tảng để hiểu mọi vấn đề vận hành: từ VM chậm, host overload, storage
latency cao, đến lỗi certificate vCenter. Không hiểu kiến trúc, bạn chỉ "mò" theo triệu chứng.

## 2. Khái niệm cốt lõi

### ESXi — bare-metal hypervisor

**ESXi** là Type 1 hypervisor: chạy **trực tiếp trên phần cứng**, không cần OS host bên dưới.
Khác với VirtualBox/VMware Workstation (Type 2 — chạy trên Windows/Linux).

```
Type 1 (ESXi):                   Type 2 (VirtualBox):
┌─────────────────────┐          ┌─────────────────────┐
│  VM │  VM │  VM     │          │  VM │  VM            │
├─────────────────────┤          ├─────────────────────┤
│      ESXi           │          │   VirtualBox        │
│  (VMkernel OS)      │          ├─────────────────────┤
├─────────────────────┤          │  Windows / Linux    │
│  Hardware           │          ├─────────────────────┤
└─────────────────────┘          │  Hardware           │
                                 └─────────────────────┘
```

ESXi chiếm rất ít tài nguyên (RAM ~4GB, storage ~1GB) — phần còn lại toàn bộ dành cho VM.

Mỗi ESXi là một **host** — máy chủ vật lý chạy nhiều VM. ESXi quản lý:
- Phân chia CPU vật lý (socket/core/thread) cho VM
- Phân chia RAM vật lý cho VM (balloon driver, swap to datastore)
- Kết nối VM với network (vSwitch) và storage (VMFS datastore, NFS, vSAN)

### vCenter Server — lớp quản lý tập trung

**vCenter Server** (VCSA — vCenter Server Appliance) là một VM appliance chạy trên ESXi, cung
cấp **giao diện quản lý tập trung** cho toàn bộ hạ tầng vSphere. Không có vCenter, bạn chỉ
quản lý được từng ESXi riêng lẻ — mất toàn bộ tính năng enterprise (cluster, HA, DRS, vMotion).

vCenter giữ database (PostgreSQL embedded) lưu:
- Inventory: tất cả host, VM, datastore, network
- Tasks và events: lịch sử mọi thao tác
- Performance metrics (14-day rolling window mặc định)
- Permission/role của mọi user

> **Điểm quan trọng**: vCenter chỉ là **management plane** — không nằm trong data path giữa VM
> và phần cứng. Nếu vCenter down, VM đang chạy **vẫn tiếp tục chạy** trên ESXi; chỉ mất khả
> năng quản lý (tạo VM mới, vMotion, HA action).

### Datacenter và Cluster

Trong vCenter, hệ thống phân cấp logic là:

```
vCenter
└── Datacenter (ranh giới logic, thường = 1 site vật lý)
    ├── Cluster (nhóm ESXi host, bật HA/DRS ở đây)
    │   ├── ESXi Host 1 (192.168.10.11)
    │   │   ├── VM: web01, db01, ...
    │   │   └── Local datastore
    │   └── ESXi Host 2 (192.168.10.12)
    │       └── VM: app01, ...
    ├── Standalone Host (ESXi ngoài cluster)
    └── Datastore (shared storage — SAN/NAS, VMFS/NFS)
```

**Cluster** là đơn vị để bật **HA** (tự restart VM trên host khác khi host chết) và **DRS**
(tự cân bằng tải VM giữa các host). Cluster cần **shared storage** — tất cả host trong cluster
phải thấy cùng datastore mới có thể vMotion/HA.

### Resource Pool

**Resource Pool** là đơn vị phân chia tài nguyên (CPU, RAM) trong cluster. Cho phép giới hạn
hoặc đảm bảo tài nguyên cho nhóm VM:

- `Reservation`: CPU/RAM tối thiểu được đảm bảo
- `Limit`: CPU/RAM tối đa được phép dùng
- `Shares`: ưu tiên tương đối khi tranh giành tài nguyên

Dùng để cô lập tài nguyên cho môi trường khác nhau (production/dev/test) trong cùng cluster.

### VM density và overcommit

ESXi cho phép **overcommit** tài nguyên — tổng tài nguyên cấp cho VM nhiều hơn tài nguyên
vật lý thực có. Nguyên nhân: VM thường không dùng hết 100% CPU/RAM cấp cho nó cùng lúc.

- **CPU overcommit**: tỉ lệ 4:1 là phổ biến (1 pCPU phục vụ 4 vCPU). Ảnh hưởng nếu nhiều VM
  cùng load cao đồng thời → CPU ready time tăng (VM phải chờ CPU vật lý).
- **RAM overcommit**: nguy hiểm hơn CPU — ESXi dùng balloon driver (thu hồi RAM ít dùng),
  compression, swap to datastore khi host hết RAM. Swap to disk → latency tăng đột ngột.

## 3. Cách nó hoạt động

### Quy trình boot ESXi host

1. Firmware (UEFI/BIOS) → boot từ ESXi installer (disk/USB)
2. VMkernel load — kernel riêng của ESXi, không phải Linux kernel đầy đủ
3. Các VM được configured "autostart" tự khởi động (theo thứ tự đã cấu hình)
4. ESXi kết nối lại với vCenter qua management network

### Luồng API quản lý

```
vSphere Client (browser)
         │ HTTPS
         ▼
   vCenter Server
         │ vSphere API
         ▼
   ESXi Host Agent (hostd)
         │
         ▼
   VMkernel (thực thi lệnh)
```

vCenter không thực thi lệnh trực tiếp — gửi qua API xuống `hostd` (host agent daemon) trên
từng ESXi. Đây là lý do khi vCenter down, ESXi vẫn nhận lệnh qua vSphere Client kết nối trực
tiếp đến IP ESXi.

## 4. Thực hành

**Tính VM density cho một ESXi host** (chạy thật):

```bash
python3 -c "
host_cpu_ghz = 2.4 * 16  # 16-core 2.4GHz = 38.4 GHz
host_ram_gb = 256
overcommit_cpu = 4        # tỉ lệ overcommit CPU phổ biến
overcommit_ram = 1.2      # RAM ít overcommit hơn CPU

vm_avg_cpu_ghz = 2.0      # mỗi VM dùng trung bình 2 GHz
vm_avg_ram_gb = 8         # mỗi VM dùng trung bình 8 GB

max_vm_by_cpu = int((host_cpu_ghz * overcommit_cpu) / vm_avg_cpu_ghz)
max_vm_by_ram = int((host_ram_gb * overcommit_ram) / vm_avg_ram_gb)

limiting_factor = 'CPU' if max_vm_by_cpu < max_vm_by_ram else 'RAM'
max_vm = min(max_vm_by_cpu, max_vm_by_ram)

print(f'Host: {host_cpu_ghz:.0f} GHz CPU, {host_ram_gb} GB RAM')
print(f'CPU overcommit {overcommit_cpu}:1 → max {max_vm_by_cpu} VMs')
print(f'RAM overcommit {overcommit_ram}:1 → max {max_vm_by_ram} VMs')
print(f'Limiting factor: {limiting_factor} → tối đa ~{max_vm} VMs/host')
"
```

Kết quả thực tế:

```
Host: 38 GHz CPU, 256 GB RAM
CPU overcommit 4:1 → max 76 VMs
RAM overcommit 1.2:1 → max 38 VMs
Limiting factor: RAM → tối đa ~38 VMs/host
```

RAM là bottleneck điển hình — CPU thường overcommit được thoải mái hơn, nhưng RAM overcommit
cao sẽ gây swap to disk và latency tăng vọt.

**Kiểm tra trạng thái host qua ESXi shell** (output minh họa — cần SSH vào ESXi):

```bash
# Xem summary tài nguyên host
esxcli hardware cpu global get
# CPU Packages: 2
# CPU Cores: 32
# CPU Threads: 64
# Memory Size: 274877906944  # bytes → 256 GB

# Xem tất cả VM đang chạy
esxcli vm process list
# vmx-pid, display-name, config-file, world-id...

# Xem datastore
esxcli storage filesystem list
# Mount Point, Volume Name, UUID, Type (VMFS/NFS)
```

> **Output minh họa** — cần môi trường ESXi thật.

## 5. Lỗi thường gặp và cách chẩn đoán

**"Cannot connect to vCenter"** — nhưng VM vẫn chạy bình thường: vCenter down không ảnh hưởng
VM đang chạy. Kiểm tra VCSA VM còn chạy không, xem log `/var/log/vmware/vpxd/vpxd.log` trên
VCSA. Nguyên nhân phổ biến: VCSA disk full (database Postgres), certificate hết hạn, NTP lệch.

**Host báo "Not Responding" trên vCenter**: vCenter mất kết nối management network đến ESXi.
VM trên host đó vẫn có thể đang chạy. Kiểm tra: ping đến management IP của ESXi, SSH vào ESXi
xem `hostd` còn chạy không (`ps -c | grep hostd`). Nếu hostd bị crash, restart:
`/etc/init.d/hostd restart`.

**HA "disabled" trên cluster**: thường do shared datastore không accessible (SAN/NFS down),
hoặc host mất redundant management network. HA cần ít nhất 2 management network paths để tránh
split-brain. Xem `Events` tab của cluster trong vCenter.

**CPU "Ready" cao (>5%)**: VM phải chờ CPU vật lý vì overcommit quá mức. Giải pháp: giảm
overcommit bằng cách tăng `Shares` cho VM quan trọng, hoặc migrate VM sang host ít bận hơn,
hoặc thêm host vào cluster.

**Balloon driver/swap đang hoạt động**: RAM overcommit quá mức, ESXi đang thu hồi RAM.
Triệu chứng: VM chậm đột ngột, latency disk tăng. Kiểm tra: trong vCenter, xem `Memory` tab
của host → `Balloon`, `Swap Rate`.

## 6. Tình huống thực tế

**Tình huống**: Một ESXi host (trong cluster 3 node) bị mất điện đột ngột lúc 02:00. vCenter
báo HA đã restart 8 VM sang 2 host còn lại. Buổi sáng bạn vào nhận bàn giao on-call.

**Quy trình xử lý**:

1. **Xác nhận host vật lý**: kiểm tra KVM/iDRAC xem host có POST lên không, hay vẫn tắt.

2. **Xem trạng thái HA events** (output minh họa):
   ```
   vCenter → Cluster → Monitor → Tasks and Events
   02:03:14 HA: Attempting to restart vm "db-replica01" on host esxi-02
   02:03:45 HA: Successfully restarted "db-replica01"
   02:04:12 HA: Successfully restarted "app-worker02"
   ```

3. **Kiểm tra 2 host còn lại có bị overload không**:
   ```
   vCenter → Host → Monitor → Performance → CPU/Memory
   esxi-02: CPU 72% (bình thường <50%), Memory Balloon: 4GB  ← cảnh báo
   esxi-03: CPU 68%, Memory Balloon: 2GB
   ```
   RAM Balloon đang hoạt động → 2 host đang bị RAM overcommit do nhận thêm VM.

4. **Hành động tạm**: tắt hoặc hibernate bớt VM không quan trọng (dev/test) để giải phóng RAM
   cho VM production. **Không tự ý rebalance** bằng DRS manual migrate khi host chưa fully
   recovered — có thể tạo thêm vMotion traffic lúc cluster đang stress.

5. **Boot lại host bị lỗi**, cho nó join cluster → DRS sẽ tự migrate VM về host đó.

## 7. Tự kiểm tra

**Câu 1**: Điều gì xảy ra với các VM đang chạy nếu vCenter Server bị tắt?

a) Tất cả VM dừng ngay lập tức  
b) VM tiếp tục chạy bình thường trên ESXi — chỉ mất khả năng quản lý qua vCenter (tạo VM mới, vMotion, HA action)  
c) VM chạy tiếp nhưng không thể nhận network packet  
d) VM tự suspend để chờ vCenter khởi động lại

**Đáp án: b** — vCenter là management plane, không nằm trong data path giữa VM và phần cứng. ESXi host tiếp tục phục vụ VM hoàn toàn độc lập với vCenter. Khi vCenter down, bạn vẫn SSH vào VM được, ứng dụng trong VM vẫn chạy — chỉ là bạn không quản lý được qua vCenter UI, không có HA action, không có vMotion.

---

**Câu 2**: Vì sao RAM overcommit nguy hiểm hơn CPU overcommit trong vSphere?

a) Vì ESXi không hỗ trợ overcommit RAM  
b) Vì CPU overcommit chỉ gây chậm (VM phải chờ), còn RAM overcommit dẫn đến swap to datastore — latency tăng đột ngột từ nanosecond lên millisecond  
c) Vì RAM overcommit làm tăng chi phí license  
d) Vì CPU có thể được chia sẻ nhưng RAM thì không

**Đáp án: b** — Khi ESXi thiếu RAM vật lý, nó dùng balloon driver (thu hồi RAM từ guest OS ít dùng) rồi memory compression, cuối cùng là swap to datastore. Disk I/O có latency hàng trăm microsecond đến millisecond — gấp hàng nghìn lần so với RAM (nanosecond). Một VM đang chạy database mà bị swap to disk sẽ ngay lập tức ảnh hưởng rõ rệt đến user.

---

**Câu 3**: Điều kiện cần để vMotion (live migration VM) hoạt động được giữa 2 ESXi host trong cùng cluster?

a) Cả hai host phải cùng thương hiệu CPU (Intel hoặc AMD)  
b) VM phải đang ở trạng thái suspended  
c) Cả hai host phải cùng thấy shared datastore chứa file VM đó (VMFS/NFS/vSAN), và có kết nối vMotion network giữa hai host  
d) vCenter phải có ít nhất 2 IP

**Đáp án: c** — vMotion copy trạng thái bộ nhớ VM từ host nguồn sang host đích qua vMotion network, đồng thời VM vẫn chạy. Khi xong, VM "switch" sang host đích. Để làm điều này, host đích phải **truy cập được file VM** (vmdk, nvram) trên shared storage. Không có shared storage → không vMotion được. CPU khác brand có thể vMotion được nếu bật EVC (Enhanced vMotion Compatibility).

---

**Câu 4**: Resource Pool trong vSphere dùng để làm gì?

a) Tăng tốc độ đọc ghi disk cho VM  
b) Thay thế cho cluster HA  
c) Chỉ dùng để nhóm VM cho dễ quản lý, không ảnh hưởng tài nguyên  
d) Phân chia CPU/RAM tài nguyên cho nhóm VM với ưu tiên khác nhau — production được đảm bảo tài nguyên, dev bị giới hạn

**Đáp án: d** — Resource Pool là cơ chế phân chia tài nguyên (CPU shares/reservation/limit và RAM shares/reservation/limit). Ứng dụng: cô lập môi trường production (reservation cao, đảm bảo tài nguyên dù host đang bận) khỏi dev/test (limit thấp, không tranh giành với production). Đây là cách nhiều team dùng chung cluster vật lý mà vẫn đảm bảo SLA cho production.

---

**Câu 5**: Khi một ESXi host trong cluster 3 node mất liên lạc với vCenter, HA sẽ làm gì?

a) Ngay lập tức restart tất cả VM trên host đó sang 2 host còn lại  
b) Không làm gì — chỉ gửi alert  
c) Disable HA trên toàn cluster  
d) Chờ một khoảng thời gian, xác nhận host thực sự down (qua datastore heartbeat), rồi restart VM trên 2 host còn lại

**Đáp án: d** — HA không hành động ngay lập tức để tránh restart VM không cần thiết khi chỉ là network blip ngắn. HA dùng **datastore heartbeat** (host ghi/đọc file trên shared datastore) để phân biệt "host thực sự down" khỏi "chỉ mất management network". Sau khi xác nhận host down (không còn heartbeat cả trên network lẫn datastore), HA mới restart VM. Thời gian này thường 30-60 giây tổng cộng.

## 8. Bài liên quan và nguồn tham khảo

**Bài tiếp theo trong module:**
- `virt-storage.vsphere.vm-lifecycle` — tạo VM, clone, snapshot, vMotion thực tế

**Bài liên quan ngoài module:**
- `virt-storage.san-nas.fundamentals` — shared storage là điều kiện cần cho cluster HA/DRS
- `networking.switching.vlans` — VLAN cho vSwitch và port group trong vSphere
- `sre.incident-response.process` — HA restart VM là incident, cần xử lý đúng quy trình

**Nguồn tham khảo:**
- [VMware vSphere 8.0 — vCenter Server Management](https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-vcenter-esxi-management/GUID-65658D77-3138-47F0-BCA8-68D8CEC4B1A0.html)
- [VMware vSphere 8.0 — Resource Management](https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-resource-management/GUID-98BD5A8A-260A-494F-BAAE-74781F5C4B87.html)
