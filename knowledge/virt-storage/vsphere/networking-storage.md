---
id: virt-storage.vsphere.networking-storage
title: "Networking (vSwitch/port group) và storage (datastore) cho VM"
domain: virt-storage
module: virt-storage.vsphere
level: "vận hành"
prerequisites: ["virt-storage.vsphere.vm-lifecycle"]
applies_to:
  - "VMware vSphere 7.x / 8.x"
  - "Standard vSwitch (vSS) và Distributed vSwitch (vDS)"
status: draft
sources:
  - "https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-networking/GUID-D5960C77-0D19-4669-A00C-B05D58A422F8.html"
  - "https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-storage/GUID-5EE84941-366D-4D37-8B7B-767D08928888.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Hai thứ bất kỳ VM nào cũng cần: **network** (để nói chuyện với thế giới) và **storage** (để
lưu dữ liệu). Cấu hình sai networking vSphere có thể làm vMotion cạnh tranh bandwidth với VM
production, hoặc iSCSI traffic đi nhầm NIC. Cấu hình sai datastore có thể làm VM hết dung
lượng đột ngột mà không có cảnh báo kịp.

Bài này giải thích vSwitch, port group, VMkernel adapter, và cách datastore (VMFS/NFS) kết
nối với ESXi để VM có storage.

## 2. Khái niệm cốt lõi

### vSwitch và port group

**vSwitch (Virtual Switch)** là switch ảo bên trong ESXi — kết nối VM với physical NIC (uplink)
và với nhau. Không có vSwitch, VM không thể nói chuyện ra ngoài.

```
Physical NIC (uplink)
      │
  vSwitch
  ├── Port Group "VM-PROD" (VLAN 100) ← VM production gắn vào đây
  ├── Port Group "VM-DMZ"  (VLAN 101) ← VM DMZ gắn vào đây
  └── Port Group "VMkernel-mgmt"      ← ESXi management IP (không phải VM)
```

Hai loại vSwitch:

**Standard vSwitch (vSS)**: cấu hình riêng trên từng ESXi host. Đơn giản, không cần vCenter.
Nhược điểm: thay đổi phải làm trên từng host — không scalable với cluster lớn.

**Distributed vSwitch (vDS)**: cấu hình tập trung qua vCenter, push xuống tất cả host trong
cluster. Best practice cho cluster từ 3 host trở lên. Cần Enterprise Plus license.

### Port group

**Port group** là "cổng ảo" trên vSwitch — định nghĩa VLAN, security policy (promiscuous mode,
MAC change, forged transmit), và traffic shaping cho nhóm VM kết nối vào đó.

Khi tạo VM, bạn chọn port group nào VM đó gắn NIC vào — port group quyết định VM đó ở VLAN nào.

### VMkernel adapter (vmk)

**VMkernel adapter** là network interface của **ESXi kernel** (không phải VM). Dùng cho:

| Traffic | VMkernel port tag |
|---------|------------------|
| vSphere Management (SSH, vCenter) | Management |
| vMotion | vMotion |
| iSCSI / NFS storage | (gắn với iSCSI adapter hoặc NFS mount) |
| vSAN | vSAN |

Mỗi loại traffic nên dùng **VMkernel adapter riêng trên NIC riêng** — tránh vMotion cạnh
tranh bandwidth với VM production khi đang di chuyển VM lớn.

### Datastore — nơi VM files được lưu

**Datastore** là storage container mà ESXi dùng để lưu VM files (.vmdk, .vmx). Hai loại chính:

**VMFS (VMware File System)**: filesystem cluster-aware tạo trên **block device** (LUN từ
SAN iSCSI hoặc Fibre Channel). Nhiều host có thể mount cùng VMFS volume → shared datastore
cho vMotion/HA.

**NFS datastore**: ESXi mount NFS share từ NAS. Đơn giản hơn (không cần LUN provisioning),
nhưng phụ thuộc NAS performance. NFS datastore cũng shared — nhiều host cùng mount.

**Local datastore**: disk cắm trực tiếp vào ESXi host. Không shared → không vMotion/HA. Chỉ
dùng cho host không trong cluster, hoặc ESXi boot disk.

### Thin vs Thick provisioning

Khi tạo VM disk (VMDK) trên datastore:

- **Thin provision**: chỉ chiếm dung lượng thực tế đang dùng, tăng dần đến max size. Tiết kiệm
  storage nhưng có nguy cơ **datastore overcommit** — tổng thin disks > dung lượng thực.
- **Thick provision eager zeroed**: cấp phát và zero toàn bộ ngay lập tức. Hiệu năng tốt nhất,
  không có overcommit surprise. Chậm khi tạo VM (phải ghi 0 toàn bộ disk).
- **Thick provision lazy zeroed**: cấp phát ngay nhưng zero dần khi ghi. Tạo VM nhanh hơn eager,
  hiệu năng gần bằng.

Best practice database production: **thick eager zeroed** — không muốn datastore đầy bất ngờ,
và hiệu năng ghi tốt nhất khi không phải zero on-demand.

## 3. Cách nó hoạt động

### Thiết kế network ESXi — phân tách traffic

```
Physical Host: 4 NIC × 10GbE

NIC1 + NIC2 (active/standby)
  └── vSwitch0
      ├── Port Group "VM-PROD"    (VLAN 100)
      ├── Port Group "VM-DMZ"     (VLAN 101)
      └── VMkernel vmk0: Management (192.168.100.x)

NIC3 + NIC4 (active/standby)
  └── vSwitch1
      ├── VMkernel vmk1: vMotion  (192.168.101.x)
      └── VMkernel vmk2: iSCSI    (192.168.102.x)
```

Phân tách NIC group: VM traffic + management trên NIC1/2, vMotion + storage trên NIC3/4.
Khi migrate VM lớn (vMotion), không ảnh hưởng đến VM production traffic.

### Kết nối datastore iSCSI (output minh họa)

```
vCenter → Storage → Storage Adapters → iSCSI Software Adapter (vmhba65)
  → Dynamic Discovery: thêm iSCSI target IP (192.168.102.10)
  → Rescan: ESXi discover LUN → hiện ra dưới dạng thiết bị

vCenter → Storage → New Datastore
  → VMFS → chọn LUN → Format VMFS6 → đặt tên "ds-ssd-01"
```

> **Output minh họa** — cần ESXi thật.

### Kiểm tra port group và vSwitch trên ESXi shell (output minh họa)

```bash
# Xem tất cả vSwitch
esxcli network vswitch standard list
# vSwitch0
#   Uplinks: vmnic0, vmnic1
#   Portgroups: VM Network, Management Network

# Xem VMkernel adapters
esxcli network ip interface list
# vmk0  Management  192.168.100.11/24  1500

# Xem NFS mounts
esxcli storage nfs list
# ds-nfs-01  nas.internal  /exports/vsphere  Mounted
```

> **Output minh họa** — cần ESXi thật.

## 4. Thực hành

**Thiết kế port group cho ESXi cluster** (chạy thật):

```bash
python3 -c "
traffic_types = [
    ('VM Production',     '10.1.0.0/24',    'VLAN 100', 'VM NIC'),
    ('VM DMZ',            '10.1.1.0/24',    'VLAN 101', 'VM NIC'),
    ('vSphere Mgmt',      '192.168.100.0/24','VLAN 200', 'VMkernel vmk0'),
    ('vMotion',           '192.168.101.0/24','VLAN 201', 'VMkernel vmk1 - dedicated NIC'),
    ('iSCSI/NFS Storage', '192.168.102.0/24','VLAN 202', 'VMkernel vmk2 - dedicated NIC'),
]

print(f'{\"Port Group\":<22} {\"Network\":<20} {\"VLAN\":<10} {\"Adapter\"}')
print('-' * 75)
for pg, net, vlan, adapter in traffic_types:
    print(f'{pg:<22} {net:<20} {vlan:<10} {adapter}')
print()
print('Rule: vMotion + iSCSI on dedicated NICs, separate from VM traffic')
"
```

Kết quả thực tế:

```
Port Group             Network              VLAN       Adapter
---------------------------------------------------------------------------
VM Production          10.1.0.0/24          VLAN 100   VM NIC
VM DMZ                 10.1.1.0/24          VLAN 101   VM NIC
vSphere Mgmt           192.168.100.0/24     VLAN 200   VMkernel vmk0
vMotion                192.168.101.0/24     VLAN 201   VMkernel vmk1 - dedicated NIC
iSCSI/NFS Storage      192.168.102.0/24     VLAN 202   VMkernel vmk2 - dedicated NIC
```

**Kiểm tra datastore trống trên hệ thống thật** (chạy thật):

```bash
df -h 2>/dev/null | grep -v tmpfs | head -5
```

Kết quả thực tế:

```
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda3        95G   28G   63G  31% /
```

(ESXi datastore không có trên máy demo — lệnh trên chỉ cho thấy local filesystem Linux.)

## 5. Lỗi thường gặp và cách chẩn đoán

**vMotion chậm bất thường, VM production cũng chậm cùng lúc**: vMotion và VM traffic chia sẻ
cùng uplink NIC. Giải pháp: tách vMotion VMkernel sang vSwitch riêng với uplink riêng. Verify:
`esxcli network vswitch standard list` để xem uplink nào gắn vào vSwitch nào.

**iSCSI disconnect ngắt quãng**: iSCSI VMkernel trên NIC chung với VM traffic — spike bandwidth
làm iSCSI timeout. Hoặc switch không có jumbo frame (iSCSI cần MTU 9000). Kiểm tra:
`esxcli network ip interface list` và compare với vSwitch uplinks.

**Datastore đầy bất ngờ dù VM thin provisioned nhỏ**: thin provision overcommit. Nhiều VM
thin provisioned "fit" về lý thuyết nhưng khi tất cả write nhiều cùng lúc → thực tế vượt
dung lượng. Fix: bật vSphere Storage DRS báo alert khi threshold (80%), hoặc chuyển critical
VM sang thick provisioning.

**VM không thấy network sau khi migrate sang host mới (vMotion)**: port group tên giống nhau
nhưng config khác nhau giữa 2 host (vSS). Với vDS, cấu hình đồng nhất — đây là lý do nên
dùng vDS cho cluster. Kiểm tra: so sánh port group config trên 2 host.

**NFS datastore hiện "Inaccessible" sau khi NAS reboot**: ESXi mất NFS session, chưa tự
reconnect. Fix: `vCenter → Storage → [datastore] → Unmount → Remount`. Hoặc trên ESXi:
`esxcli storage nfs remove` rồi `add` lại.

## 6. Tình huống thực tế

**Tình huống**: Đội network vừa thay switch lõi trong datacenter. Sau maintenance, một số VM
trên cluster báo network intermittent. vCenter thấy nhiều VM trên host1 và host2 bị "Lost
Network Connectivity" alert.

**Phân tích**:

1. **Phân biệt VM bị ảnh hưởng**: tất cả VM trên cùng port group bị ảnh hưởng, hay random?
   → Nếu cùng port group → vấn đề vSwitch/uplink; nếu random → vấn đề VM-specific.

2. **Kiểm tra uplink trên host** (output minh họa):
   ```bash
   esxcli network nic list
   # vmnic0  10000  Full   Up     ← connected
   # vmnic1  10000  Full   Down   ← link down sau maintenance
   ```
   vmnic1 down sau khi switch thay — ESXi đang chạy single uplink.

3. **Xem active/standby policy** (output minh họa):
   ```bash
   esxcli network vswitch standard policy failover get -v vSwitch0
   # Active Adapters: vmnic0, vmnic1
   # Standby Adapters: (none)
   # Failover: detect link status
   ```

4. **Nguyên nhân**: switch mới chưa cấu hình đúng trunk VLAN cho port kết nối vmnic1. VM
   traffic đang dồn qua vmnic0 single uplink → intermittent khi load cao.

5. **Fix**: đội network cấu hình lại trunk VLAN trên switch port của vmnic1 → link up → ESXi
   tự cân bằng lại active/standby.

**Lesson**: sau bất kỳ thay đổi switch/network nào, verify ESXi uplinks còn `Up` và VLAN
trunk đúng trước khi kết thúc maintenance window.

## 7. Tự kiểm tra

**Câu 1**: Sự khác biệt giữa Standard vSwitch (vSS) và Distributed vSwitch (vDS) là gì?

a) vDS chỉ hỗ trợ VMFS, vSS hỗ trợ NFS  
b) vSS cấu hình riêng trên từng host, vDS cấu hình tập trung qua vCenter và đồng bộ xuống toàn bộ host trong cluster — vDS đảm bảo consistency và dễ quản lý hơn ở scale  
c) vDS nhanh hơn vSS về mặt throughput  
d) vSS không hỗ trợ VLAN

**Đáp án: b** — Với vSS trên cluster 10 host, mỗi thay đổi port group phải làm 10 lần thủ công (hoặc automation). vDS quản lý một lần từ vCenter, push xuống tất cả — giảm config drift (2 host có port group tên giống nhau nhưng config khác nhau). vDS cần Enterprise Plus license, vì vậy vSS vẫn phổ biến ở môi trường nhỏ.

---

**Câu 2**: Tại sao vMotion và VM production traffic nên ở trên NIC riêng biệt?

a) Vì vMotion chỉ hỗ trợ IPv6, VM traffic hỗ trợ IPv4  
b) vMotion copy toàn bộ RAM của VM qua network — một VM 32GB RAM migrate = 32GB+ bandwidth; nếu chia sẻ NIC với VM traffic, vMotion làm chậm toàn bộ ứng dụng trên host  
c) Vì VMkernel không thể share NIC với VM traffic  
d) Vì switch không hỗ trợ cả hai loại traffic trên cùng port

**Đáp án: b** — vMotion là bandwidth-intensive operation (copy toàn bộ memory state). Trên 10GbE, vMotion một VM 32GB RAM mất ~26 giây với full 10Gbps — trong thời gian đó nếu NIC chung với VM traffic, user experience sẽ bị ảnh hưởng. Dedicated NIC cho vMotion giải quyết hoàn toàn vấn đề này.

---

**Câu 3**: Thin provisioning trên VMFS datastore có rủi ro gì so với thick provisioning?

a) Thin provisioning không thể snapshot  
b) Thin provisioning không hỗ trợ vMotion  
c) Thin provisioning cho phép overcommit — tổng provisioned size của tất cả VM vượt dung lượng thực của datastore; khi nhiều VM write nhiều cùng lúc, datastore có thể đầy đột ngột, làm tất cả VM trên đó dừng ghi  
d) Thin provisioning chậm hơn thick do phải phân bổ block lúc runtime

**Đáp án: c** — Với thick provisioning, bạn biết chính xác bao nhiêu GB datastore còn trống. Với thin, có thể provision tổng 1TB VM trên datastore 500GB — OK nếu thực tế chỉ dùng 400GB. Nhưng nếu tất cả grow lên 600GB → datastore đầy → VM suspend (không thể ghi). Cần monitor "datastore free space" cẩn thận hơn khi dùng thin provision.

---

**Câu 4**: VMkernel adapter dùng để làm gì?

a) Để VM kết nối ra internet  
b) Để cấu hình VLAN cho port group  
c) Network interface của ESXi kernel (không phải VM) — dùng cho management, vMotion, iSCSI, vSAN traffic; VM dùng port group, không phải VMkernel  
d) Để giám sát bandwidth của từng VM

**Đáp án: c** — VMkernel adapter (vmkN) là IP interface của ESXi OS. `vmk0` thường là management IP mà bạn SSH vào ESXi. `vmk1` có thể là vMotion IP. VM không dùng VMkernel — VM dùng virtual NIC kết nối vào port group. Hiểu rõ phân biệt này quan trọng khi debug "tại sao ESXi management không ping được" (kiểm tra vmk0) vs "tại sao VM không có network" (kiểm tra port group).

---

**Câu 5**: Khi nào nên dùng thick eager zeroed provisioning thay vì thin provisioning?

a) Luôn luôn — thick luôn tốt hơn  
b) Khi datastore dùng SSD (SSD không hỗ trợ thin)  
c) Chỉ khi VM dùng Windows  
d) Cho VM production database hoặc bất kỳ workload cần hiệu năng I/O ổn định và không muốn bị surprise khi datastore đầy đột ngột do overcommit

**Đáp án: d** — Thick eager zeroed đã zero toàn bộ block trước — mọi write sau này đều vào block đã sẵn sàng, không có overhead zero-on-first-write. Với database OLTP cần latency ổn định, đây là lựa chọn đúng. Chi phí: tốn dung lượng ngay lập tức và tạo VM chậm hơn. Đánh đổi: predictability > tiết kiệm storage.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước trong module:**
- `virt-storage.vsphere.vm-lifecycle` — tạo VM, snapshot, vMotion

**Bài tiếp theo trong module:**
- `virt-storage.vsphere.ha-drs` — HA tự restart VM, DRS cân bằng tải

**Bài liên quan ngoài module:**
- `virt-storage.san-nas.fundamentals` — block vs NFS storage cho datastore
- `virt-storage.san-nas.nfs` — NFS export cho ESXi NFS datastore
- `networking.switching.vlans` — VLAN trunking cho vSwitch port groups

**Nguồn tham khảo:**
- [VMware vSphere 8.0 — Networking](https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-networking/GUID-D5960C77-0D19-4669-A00C-B05D58A422F8.html)
- [VMware vSphere 8.0 — Storage](https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-storage/GUID-5EE84941-366D-4D37-8B7B-767D08928888.html)
