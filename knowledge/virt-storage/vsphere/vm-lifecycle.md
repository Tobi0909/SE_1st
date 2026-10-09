---
id: virt-storage.vsphere.vm-lifecycle
title: "Quản lý VM: tạo, clone, snapshot, migrate (vMotion)"
domain: virt-storage
module: virt-storage.vsphere
level: "vận hành"
prerequisites: ["virt-storage.vsphere.architecture"]
applies_to:
  - "VMware vSphere 7.x / 8.x"
  - "vCenter Server quản lý ESXi cluster"
status: verified
sources:
  - "https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-vm-administration/GUID-E1D541EE-B253-4D65-9785-6F97E8E44C0B.html"
  - "https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-vmotion-resource-management/GUID-A15DC2C0-3C13-420D-B00B-0BE01D19FF1D.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Vận hành hằng ngày với vSphere xoay quanh 4 thao tác: **tạo VM** (provision mới), **clone** (nhân
bản nhanh từ template), **snapshot** (điểm khôi phục trước khi patching/update), và **vMotion**
(di chuyển VM giữa host không downtime). Ai cũng dùng được, nhưng dùng sai có thể gây:

- Snapshot bị quên → datastore đầy lúc không ngờ → *toàn bộ VM trên datastore* đó dừng ghi
- Clone không có sysprep → 2 VM cùng hostname/IP/SID → xung đột mạng
- vMotion giờ cao điểm → bandwidth hết → latency tăng vọt cho tất cả VM

Hiểu đúng cơ chế giúp bạn làm đúng và debug nhanh khi sai.

## 2. Khái niệm cốt lõi

### VM là gì trên disk?

Một VM trong vSphere là tập hợp file trên datastore (thường thư mục `/vmfs/volumes/<datastore>/<vmname>/`):

| File | Mô tả |
|------|-------|
| `<vm>.vmx` | Config file — số CPU, RAM, thiết bị |
| `<vm>.vmdk` | Disk header (nhỏ, chứa metadata) |
| `<vm>-flat.vmdk` | Disk data thực sự (lớn, bằng provisioned size) |
| `<vm>.nvram` | BIOS/UEFI state |
| `<vm>.vmsd` | Snapshot database (danh sách snapshot) |
| `<vm>-Snapshot*.vmdk` | Delta disk của mỗi snapshot |

Hiểu cấu trúc này giúp bạn restore thủ công, debug "orphaned VM", hoặc tính storage usage chính xác.

### Clone vs Template

**Clone**: copy 1:1 từ VM nguồn đang tắt hoặc đang chạy. Nếu không dùng **Guest Customization**
(sysprep cho Windows / Cloud-init cho Linux), VM clone có cùng hostname, IP (DHCP sẽ lấy IP mới,
static thì y hệt), và với Windows còn cùng **SID** (Security Identifier) — gây xung đột domain.

**Template**: VM được chuyển thành template (không chạy được), dùng làm nguồn để deploy VM mới
nhanh với Guest Customization tự động đổi hostname/IP/SID. Best practice: mọi VM production nên
deploy từ template, không clone từ VM đang chạy.

### Snapshot — không phải backup

**Snapshot** tạo một *delta disk* — từ thời điểm snapshot, mọi write vào VM đi vào file delta,
disk gốc giữ nguyên. Có thể rollback về trạng thái snapshot.

```
Trước snapshot:           Sau tạo snapshot:
base.vmdk (80GB)   →     base.vmdk (80GB, frozen)
                          └─ delta-snap1.vmdk (0→..GB, nhận write mới)
```

**Misconception nguy hiểm**: snapshot **không phải backup**. Lý do:
1. Delta disk nằm trên cùng datastore với base — datastore chết = mất cả base lẫn delta
2. Delta không quản lý độc lập — xóa snapshot = commit delta vào base (delete commit nếu rollback)
3. VM với nhiều snapshot chạy chậm hơn vì I/O phải qua chain

**Rule of thumb**: snapshot chỉ dùng làm điểm rollback ngắn hạn (trước patching, upgrade).
Xóa trong 72 giờ. Production không nên có snapshot tồn tại liên tục.

### vMotion — live migration không downtime

**vMotion** di chuyển VM đang chạy từ ESXi host này sang host khác trong cluster, không cần tắt VM.
Yêu cầu: shared storage (cả 2 host thấy cùng datastore) và vMotion network (tốc độ cao, dedicated).

**Quy trình vMotion**:
1. vCenter kiểm tra host đích đủ tài nguyên (CPU/RAM)
2. Copy trạng thái bộ nhớ VM từ host nguồn sang host đích qua vMotion network (có thể mất vài giây cho VM dùng nhiều RAM)
3. VM tạm "quiesced" (dừng vài millisecond) để sync final memory state
4. VM tiếp tục chạy trên host đích — host nguồn giải phóng tài nguyên

Người dùng cuối thường không cảm nhận được downtime (< 1 giây).

**Storage vMotion**: migrate cả VM disk từ datastore này sang datastore khác, không cần shared
storage — VM vẫn chạy trong khi disk được copy background.

## 3. Cách nó hoạt động

### Tạo VM từ template (output minh họa)

```
vCenter UI → New Virtual Machine → Deploy from template
1. Chọn template (ví dụ: ubuntu22-template)
2. Đặt tên VM: app-server-03
3. Chọn compute resource: cluster-prod → ESXi host (DRS tự chọn nếu enabled)
4. Chọn storage: datastore-ssd-01
5. Customize guest OS:
   - Hostname: app-server-03
   - Network: IP 10.1.2.53/24, GW 10.1.2.1, DNS 10.1.1.1
6. Power on after deploy: ✓
```

> **Output minh họa** — cần vCenter thật.

### Snapshot và rollback (output minh họa)

```bash
# Tạo snapshot trước khi patching
VM → Snapshots → Take Snapshot
Name: "before-kernel-update-20261007"
Description: "kernel 6.8 → 6.11, apt upgrade"
# Memory: Snapshot VM memory state → hữu ích nhưng tốn thêm RAM_size GB storage
# Quiesce: ✓ (flush disk writes trước khi snapshot — cần VMware Tools)

# Sau khi test xong, nếu OK → xóa snapshot (commit delta vào base)
VM → Snapshots → Delete "before-kernel-update-20261007"
# Quá trình này tốn thời gian tỉ lệ với delta size

# Nếu cần rollback
VM → Snapshots → Revert to "before-kernel-update-20261007"
# VM sẽ restart về trạng thái lúc snapshot
```

> **Output minh họa** — cần vCenter thật.

### vMotion qua PowerCLI (output minh họa)

```powershell
# Kết nối vCenter
Connect-VIServer -Server vcenter.internal.company.com

# Di chuyển VM từ host01 sang host02
Move-VM -VM "app-server-03" -Destination (Get-VMHost "esxi-02.internal")

# Storage vMotion — migrate disk sang datastore khác
Move-VM -VM "app-server-03" -Datastore (Get-Datastore "datastore-ssd-02")
```

> **Output minh họa** — cần PowerCLI và vCenter thật.

## 4. Thực hành

**Tính snapshot storage overhead** (chạy thật):

```bash
python3 -c "
base_vmdk_gb = 80
snapshots = [
    ('snap-1 (before patch)', 2),
    ('snap-2 (after patch test)', 5),
    ('snap-3 (before major update)', 8),
]

total_snap_gb = sum(s[1] for s in snapshots)
total_storage = base_vmdk_gb + total_snap_gb
overhead_pct = (total_snap_gb / base_vmdk_gb) * 100

print(f'Base VMDK: {base_vmdk_gb} GB')
for name, size in snapshots:
    print(f'  Delta ({name}): {size} GB')
print(f'Total snapshot overhead: {total_snap_gb} GB ({overhead_pct:.0f}% of base)')
print(f'Total storage used: {total_storage} GB')
print()
print('Recommendation: delete snapshots older than 72h in production')
print(f'Risk if kept: delta files grow unbounded until datastore full')
"
```

Kết quả thực tế:

```
Base VMDK: 80 GB
  Delta (snap-1 (before patch)): 2 GB
  Delta (snap-2 (after patch test)): 5 GB
  Delta (snap-3 (before major update)): 8 GB
Total snapshot overhead: 15 GB (19% of base)
Total storage used: 95 GB

Recommendation: delete snapshots older than 72h in production
Risk if kept: delta files grow unbounded until datastore full
```

**Kiểm tra snapshot tồn tại lâu** (output minh họa — qua PowerCLI):

```powershell
# Tìm tất cả snapshot cũ hơn 3 ngày trong toàn bộ datacenter
Get-VM | Get-Snapshot | Where-Object { $_.Created -lt (Get-Date).AddDays(-3) } |
    Select-Object VM, Name, Created, SizeGB |
    Sort-Object Created
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Datastore đầy đột ngột, không rõ nguyên nhân**: kiểm tra snapshot. Delta disk tăng liên tục khi
VM đang chạy — một VM 80GB base với snapshot 2 tuần tuổi có thể có delta 30-50GB hoặc hơn.
Xem: `vCenter → VM → Snapshots → Manage Snapshots` để thấy tuổi và size.

**vMotion thất bại với "insufficient resources"**: host đích không đủ RAM hoặc CPU. Kiểm tra
`vCenter → Host → Summary → Resource`. Nếu DRS enabled, DRS có thể đã chọn host tốt nhất rồi —
nếu vMotion manual vẫn fail, cluster thực sự đang thiếu tài nguyên.

**VM sau clone cùng IP với VM gốc (Windows, static IP)**: Guest Customization không được chạy
hoặc VMware Tools không cài trong guest. Fix: đổi IP thủ công trong guest OS, hoặc deploy lại từ
template với Customization đúng.

**"Consolidation needed"**: sau khi xóa snapshot, delta không được merge (commit) tự động — thường
do VM busy hoặc disk I/O không có quiesce window. Dấu hiệu: vCenter báo "VM requires consolidation".
Fix: `VM → Snapshots → Consolidate` (chạy lúc VM ít tải).

**vMotion mất lâu bất thường (>30 phút)**: VM dùng quá nhiều RAM (vd: database 128GB) hoặc
vMotion network bị shared với VM traffic khác → copy chậm. Giải pháp: dedicated VLAN cho vMotion,
hoặc schedule vMotion ngoài giờ cao điểm.

## 6. Tình huống thực tế

**Tình huống**: Sắp maintenance ESXi host01 (thay RAM), cần di chuyển tất cả VM sang host02 và
host03 mà không downtime. Cluster có DRS enabled nhưng ở chế độ "Manual" (DRS gợi ý, không tự động).

**Quy trình chuẩn**:

1. **Kiểm tra host đích đủ tài nguyên**: tổng RAM của VM trên host01 + slack margin ≤ RAM available
   trên host02 + host03. Nếu không đủ: cần tắt VM dev/test tạm trước.

2. **Bật Maintenance Mode trên host01** (output minh họa):
   ```
   vCenter → host01 → Enter Maintenance Mode
   → vSphere DRS: migrate powered-on VMs to other hosts
   → ✓ (DRS sẽ gợi ý/tự migrate tuỳ setting)
   ```
   Khi host ở Maintenance Mode, HA sẽ không cố restart VM lên host đó, và không thể power-on
   VM mới trên nó.

3. **Xác nhận DRS migration hoàn tất**: tất cả VM rời khỏi host01. Lúc này host01 hiện
   `Maintenance` và 0 VM.

4. **Tiến hành maintenance vật lý**.

5. **Thoát Maintenance Mode**: host01 tự động available trở lại, DRS sẽ rebalance dần dần.

**Lưu ý quan trọng**: Maintenance Mode không tự đổi DNS/load balancer. Nếu có application
monitoring theo IP host, cần cập nhật trước khi maintenance để không nhận false alarm.

## 7. Tự kiểm tra

**Câu 1**: Tại sao snapshot vSphere không phải là giải pháp backup?

a) Vì snapshot không lưu được trạng thái RAM của VM  
b) Vì delta disk của snapshot nằm trên cùng datastore với base disk — datastore hỏng sẽ mất cả base lẫn delta  
c) Vì snapshot chỉ lưu được VM đang tắt  
d) Vì VMware tính phí thêm cho snapshot backup

**Đáp án: b** — Backup thực sự phải lưu trên *media khác* (3-2-1 rule: 3 bản, 2 loại media, 1 offsite). Snapshot delta trên cùng datastore: nếu datastore chết (SAN failure, disk array lỗi), bạn mất cả base VMDK lẫn tất cả delta. Ngoài ra, snapshot không bảo vệ khỏi logical error (xóa nhầm file trong guest OS trước khi tạo snapshot).

---

**Câu 2**: Khi deploy VM từ template, tại sao cần bật Guest Customization?

a) Để VM khởi động nhanh hơn  
b) Vì không có Customization, VM clone có cùng hostname/IP (static)/Windows SID với template — gây xung đột mạng và domain  
c) Để VMware Tools tự cập nhật  
d) Để snapshot được tạo tự động sau khi deploy

**Đáp án: b** — Template thường đã cài sẵn OS, nhưng hostname/IP/SID là từ lúc tạo template. Guest Customization chạy một script trong guest OS (sysprep cho Windows, cloud-init cho Linux) để generate SID mới, đặt hostname mới, cấu hình IP theo spec. Thiếu bước này: 2 VM trong domain cùng SID → authentication issues; cùng hostname → DNS conflict; cùng IP static → network conflict.

---

**Câu 3**: Điều gì xảy ra với I/O performance của VM khi có nhiều snapshot đang active?

a) Performance không thay đổi vì snapshot là read-only  
b) Snapshot chỉ ảnh hưởng khi deleting, không ảnh hưởng khi VM đang chạy  
c) Chỉ read performance giảm, write không ảnh hưởng  
d) Mỗi write I/O phải đi qua chain delta disk từ newest đến oldest → latency tăng theo số lượng snapshot, đặc biệt với disk nhiều I/O

**Đáp án: d** — Với snapshot chain dài (3-4 snapshot), mỗi read phải traverse từ newest delta ngược về base để tìm block. Mỗi write phải copy-on-write vào newest delta. Đặc biệt với database hoặc ứng dụng nhiều random I/O, snapshot chain 3-4 cấp có thể giảm throughput 20-40%. Best practice: không để snapshot tồn tại liên tục trong production.

---

**Câu 4**: vMotion cần gì để thành công?

a) VM phải được tắt (powered off) trước khi migrate  
b) Chỉ cần 2 host ở cùng cluster — không cần điều kiện khác  
c) Shared storage (cả 2 host thấy cùng datastore) và vMotion network đủ bandwidth  
d) Host đích phải cùng thế hệ CPU với host nguồn

**Đáp án: c** — vMotion copy memory state qua vMotion network và VM file (vmx, vmdk) phải accessible từ host đích — điều này yêu cầu shared storage. Khác CPU generation có thể xử lý bằng EVC. VM không cần tắt — đó là điểm khác biệt của vMotion so với cold migration.

---

**Câu 5**: Trong vSphere, "Maintenance Mode" của ESXi host có ý nghĩa gì với HA cluster?

a) HA sẽ không restart VM mới lên host đó, và host không nhận VM power-on mới — host được cô lập khỏi cluster workload trong khi bảo trì  
b) Host sẽ bị tắt điện tự động sau 10 phút  
c) Tất cả VM trên host đó bị tắt ngay lập tức  
d) Host sẽ tự xóa khỏi inventory vCenter

**Đáp án: a** — Maintenance Mode không tắt VM (trừ khi bạn chọn vậy) — nó migrate VM đi (qua vMotion/DRS), rồi đánh dấu host là "không nhận workload mới". HA sẽ không bao giờ chọn host này để restart VM khi host khác down. Sau khi bảo trì xong, Exit Maintenance Mode để host trở lại bình thường. Đây là quy trình chuẩn để patching, upgrade firmware, thay phần cứng mà không downtime.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước trong module:**
- `virt-storage.vsphere.architecture` — ESXi, vCenter, cluster architecture

**Bài liên quan ngoài module:**
- `virt-storage.san-nas.fundamentals` — shared storage là điều kiện cần của vMotion/HA
- `virt-storage.backup-dr.strategies` — backup VM đúng cách (không phải snapshot)
- `sre.change-management.process` — maintenance window, rollback plan trước khi patching

**Nguồn tham khảo:**
- [VMware vSphere 8.0 — VM Administration](https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-vm-administration/GUID-E1D541EE-B253-4D65-9785-6F97E8E44C0B.html)
- [VMware vSphere 8.0 — vMotion Requirements](https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-vmotion-resource-management/GUID-A15DC2C0-3C13-420D-B00B-0BE01D19FF1D.html)
