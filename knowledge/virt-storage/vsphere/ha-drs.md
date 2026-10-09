---
id: virt-storage.vsphere.ha-drs
title: "HA và DRS: tự động chịu lỗi và cân bằng tải cluster"
domain: virt-storage
module: virt-storage.vsphere
level: "chuyên sâu"
prerequisites: ["virt-storage.vsphere.vm-lifecycle"]
applies_to:
  - "VMware vSphere 7.x / 8.x"
  - "vSphere HA và DRS trong cluster có shared storage"
status: verified
sources:
  - "https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-availability/GUID-5432CA24-14F1-44E3-87FB-61D937831CF6.html"
  - "https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-resource-management/GUID-517C3B16-E87B-4BE3-A757-6CDDC1E15AEF.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Hai tính năng quan trọng nhất của vSphere cluster là **HA** (High Availability) và **DRS**
(Distributed Resource Scheduler). HA tự động restart VM khi host vật lý chết; DRS tự động
cân bằng tải VM giữa các host để tránh overload.

Nếu bạn không cấu hình đúng, HA có thể không hoạt động ("HA disabled" alert), hoặc DRS
không có đủ resource để migrate VM. Hiểu cơ chế giúp bạn thiết kế cluster đúng và debug
nhanh khi có incident.

## 2. Khái niệm cốt lõi

### vSphere HA — tự động restart VM khi host fail

**vSphere HA** monitor tất cả host trong cluster. Khi một host fail (mất điện, kernel panic,
network partition), HA tự động **restart VM trên host đó sang các host còn lại** — không cần
can thiệp thủ công.

**Yêu cầu cơ bản**:
- Shared storage (tất cả host đều thấy cùng datastore — VM file cần accessible từ host nhận)
- Ít nhất 2 host trong cluster
- vCenter để cấu hình (HA hoạt động độc lập khi vCenter down sau khi đã configured)

**HA Admission Control**: chính sách đảm bảo cluster luôn có đủ "failover capacity" — tài
nguyên dự phòng để restart VM nếu N host fail. Nếu admission control bật, cluster từ chối
power-on VM mới khi làm vậy sẽ vi phạm failover capacity.

Ví dụ: cluster 3 host, admission control "1 host failure tolerated" → cluster giữ lại ~33%
CPU/RAM làm dự phòng. Nếu tổng VMs đang chạy chiếm 80% cluster resource, HA sẽ không cho
power-on thêm VM.

### HA heartbeat và isolation detection

HA agent chạy trên mỗi ESXi host, gửi **heartbeat** mỗi giây:
1. **Network heartbeat**: agent gửi qua management network
2. **Datastore heartbeat**: agent ghi file trên shared datastore

Khi host A không thấy heartbeat từ host B **qua cả hai kênh**, HA xác nhận host B thật sự
down và restart VM.

Nếu chỉ mất network heartbeat nhưng datastore heartbeat còn (hoặc host B vẫn ping được qua
isolation IP), host B được xem là **isolated** chứ không phải failed — hành động khác nhau
(host isolated có thể tự shutdown VM để tránh split-brain).

> **Vì sao cần 2 uplink network**: nếu chỉ có 1 NIC cho management và NIC đó fail, HA có
> thể xem host là isolated và restart VM — trong khi host thực ra vẫn ổn, chỉ mất 1 NIC.
> Redundant management network tránh false positive.

### DRS — tự động cân bằng tải

**DRS** (Distributed Resource Scheduler) liên tục theo dõi CPU/RAM usage của từng host và VM.
Khi phát hiện imbalance, DRS gợi ý (hoặc tự động) migrate VM từ host overloaded sang host
nhẹ tải hơn qua vMotion.

**DRS automation level**:
- **Manual**: DRS chỉ hiển thị gợi ý, bạn tự quyết định migrate
- **Partially Automated**: DRS tự migrate khi power-on VM mới (initial placement), nhưng
  không tự migrate VM đang chạy
- **Fully Automated**: DRS tự migrate VM đang chạy khi imbalance vượt threshold

**DRS migration threshold**: từ 1 (conservative — chỉ migrate khi rất cần thiết) đến 5
(aggressive — migrate thường xuyên hơn). Default 3.

### HA + DRS phối hợp

Sau khi HA restart VM lên host mới, cluster có thể bị mất cân bằng (nhiều VM dồn vào 2 host
còn lại). **DRS sẽ rebalance** khi host fail đã được sửa và thêm lại vào cluster — migrate
VM dần dần về host mới (nếu Fully Automated).

### vSphere FT (Fault Tolerance)

**FT** là mức cao hơn HA: thay vì *restart* VM (downtime vài phút), FT duy trì VM secondary
**chạy song song** với VM primary — khi primary fail, secondary tiếp tục ngay lập tức (zero
downtime, zero data loss).

Hạn chế: chỉ hỗ trợ VM tối đa 4 vCPU (giới hạn vSphere 7), overhead network cao (ghi log
cho secondary), không thể snapshot/vMotion storage. Chỉ dùng cho VM thực sự không thể có
downtime (financial trading system, v.v.).

## 3. Cách nó hoạt động

### HA failover timeline

```
t=0:00  host01 mất điện đột ngột
t=0:15  HA agent trên host02 và host03 phát hiện mất network heartbeat từ host01
t=0:30  Datastore heartbeat cũng mất → xác nhận host01 down (không phải isolation)
t=0:31  HA master (host02) bắt đầu restart VM từ host01
t=0:45  VM "web-prod-01" restart xong trên host02 (boot time + app startup)
t=1:30  Tất cả 8 VM đã được restart — cluster ổn định với 2 host
```

Tổng thời gian từ host fail đến VM available: ~1-5 phút tùy VM boot time. Đây là RTO của HA.

### DRS rebalance cycle

DRS chạy mỗi 5 phút (default), thu thập CPU/RAM usage từng host và tính "imbalance score":

```
Cluster 3 hosts:
  esxi-01: CPU 80%, RAM 82%  ← OVERLOADED
  esxi-02: CPU 31%, RAM 37%  ← underutilized
  esxi-03: CPU 38%, RAM 43%  ← OK

DRS: di chuyển VM "db-replica" (heavy CPU) từ esxi-01 sang esxi-02
     → giảm tải esxi-01, tăng tải esxi-02 đến mức cân bằng hơn
```

## 4. Thực hành

**Phân tích imbalance cluster và DRS recommendation** (chạy thật):

```bash
python3 -c "
hosts = [
    {'name': 'esxi-01', 'cpu_pct': 79.4, 'ram_pct': 82.0},
    {'name': 'esxi-02', 'cpu_pct': 31.5, 'ram_pct': 37.1},
    {'name': 'esxi-03', 'cpu_pct': 38.5, 'ram_pct': 43.0},
]

print(f'{\"Host\":<12} {\"CPU%\":>8} {\"RAM%\":>8}  Status')
print('-' * 40)
for h in hosts:
    s = 'OVERLOADED' if h['cpu_pct'] > 70 or h['ram_pct'] > 80 else 'OK'
    print(f'{h[\"name\"]:<12} {h[\"cpu_pct\"]:>7.1f}% {h[\"ram_pct\"]:>7.1f}%  {s}')

cpu_vals = [h['cpu_pct'] for h in hosts]
imbalance = max(cpu_vals) - min(cpu_vals)
print(f'CPU imbalance: {imbalance:.1f}% (DRS threshold ~10%)')
if imbalance > 10:
    print('Action: DRS should migrate VM from esxi-01')
"
```

Kết quả thực tế:

```
Host          CPU%     RAM%  Status
----------------------------------------
esxi-01       79.4%    82.0%  OVERLOADED
esxi-02       31.5%    37.1%  OK
esxi-03       38.5%    43.0%  OK
CPU imbalance: 47.9% (DRS threshold ~10%)
Action: DRS should migrate VM from esxi-01
```

**Kiểm tra HA status trên cluster** (output minh họa — vCenter API):

```powershell
# PowerCLI: kiểm tra HA config cluster
Get-Cluster "cluster-prod" | Select-Object Name, HAEnabled, HAAdmissionControlEnabled,
    HAFailoverLevel, DrsEnabled, DrsAutomationLevel

# Output:
# Name              : cluster-prod
# HAEnabled         : True
# HAAdmissionControlEnabled : True
# HAFailoverLevel   : 1          ← 1 host failure tolerated
# DrsEnabled        : True
# DrsAutomationLevel: FullyAutomated
```

> **Output minh họa** — cần PowerCLI và vCenter thật.

## 5. Lỗi thường gặp và cách chẩn đoán

**"vSphere HA is disabled" hoặc "HA configuration issues"**: HA bị disable khi shared
datastore không accessible (tất cả host phải cùng thấy datastore), hoặc HA agent không cài
đúng. Kiểm tra: `vCenter → Cluster → Summary → vSphere HA Status`. Events tab thường có
chi tiết lý do.

**HA admission control chặn power-on VM**: cluster không đủ failover capacity. Giải pháp:
thêm host vào cluster, hoặc điều chỉnh admission control policy (giảm số host failure
tolerated nếu acceptable cho business). Không nên disable admission control hoàn toàn —
risk là HA không có resource để restart.

**DRS không migrate VM dù imbalance cao**: kiểm tra DRS automation level (Manual thì không
tự migrate), và kiểm tra có anti-affinity rule nào chặn migration không (`vCenter → Cluster
→ Configure → VM/Host Rules`).

**HA restart VM nhưng VM không up**: application trong VM bị crash loop sau restart, hoặc
HA restart VM nhưng VM guest OS cần time để boot + application start. Monitor: `vCenter →
Cluster → Monitor → vSphere HA`. Nếu VM liên tục restart → HA sẽ stop sau N lần (restart
limit).

**Split brain sau network partition** (hiếm nhưng nguy hiểm): network partition chia cluster
thành 2 phần, mỗi phần cố tự promote làm master. HA dùng datastore heartbeat + isolation
address để phán quyết. Nếu cả 2 phần đều thấy datastore → cần isolation response policy đúng
(`Power off and restart VMs` với 1 partition).

## 6. Tình huống thực tế

**Tình huống**: 03:45 AM, power supply của esxi-01 trong cluster 3 host bị hỏng. esxi-01
off hoàn toàn. 8 VM đang chạy trên đó (bao gồm 2 VM production database).

**Timeline thực tế**:

1. **03:45:00** — esxi-01 mất điện, ngừng heartbeat
2. **03:45:30** — HA xác nhận esxi-01 down (30 giây timeout)
3. **03:45:31** — HA bắt đầu restart VM theo thứ tự priority:
   - Priority 1: `db-primary`, `app-server` (VM critical)
   - Priority 2-3: các VM còn lại
4. **03:47:00** — 8 VM đã restart trên esxi-02 và esxi-03
5. **03:47:00** — esxi-02 và esxi-03 hiện CPU ~65%, RAM ~70% (nhận thêm VM)
6. **06:00:00** — on-call phát hiện alert qua PagerDuty, bắt đầu xử lý

**Đánh giá**:
- HA làm đúng nhiệm vụ: VM đã up lại trong <2 phút
- Database application: restart VM không bằng hot standby — cần verify data consistency
  (kiểm tra PostgreSQL recovery log)
- esxi-02/03 hơi tải nhưng OK (RAM chưa balloon)
- Cần sửa esxi-01 và trả VM về (DRS sẽ rebalance sau khi esxi-01 join lại cluster)

**Hành động sau incident**:
1. Sửa power supply, boot lại esxi-01
2. `Cluster → Enter Maintenance Mode` → thoát → DRS migrate VM về esxi-01
3. Viết postmortem: power supply đơn là SPOF — đề xuất redundant PSU cho tất cả host

## 7. Tự kiểm tra

**Câu 1**: vSphere HA cần gì để tự động restart VM khi host fail?

a) vMotion license và storage vSAN  
b) Shared storage (tất cả host cùng thấy datastore) và ít nhất 2 host trong cluster; vCenter cần thiết để cấu hình nhưng HA tiếp tục hoạt động khi vCenter down  
c) Host phải có redundant power supply  
d) FT (Fault Tolerance) phải được bật trước khi HA hoạt động

**Đáp án: b** — HA restart VM bằng cách boot VM từ file trên shared datastore trên host mới. Nếu không có shared storage, host nhận không thể access file VM → restart thất bại. vCenter chỉ cần để cấu hình ban đầu — sau khi HA configured, HA agent chạy trên từng ESXi host và hoạt động độc lập. Redundant PSU là best practice nhưng không phải yêu cầu kỹ thuật của HA.

---

**Câu 2**: HA sử dụng "datastore heartbeat" để làm gì?

a) Để backup VM tự động  
b) Để đo performance storage  
c) Để phân biệt "host thực sự down" khỏi "host chỉ mất management network" — nếu network heartbeat mất nhưng datastore heartbeat còn thì host được xem là isolated, không phải failed  
d) Để đồng bộ VM config giữa các host

**Đáp án: c** — Nếu HA chỉ dùng network heartbeat, một NIC fail sẽ khiến HA tưởng host down và restart VM không cần thiết. Datastore heartbeat (agent ghi file nhỏ trên shared datastore) là kênh thứ hai độc lập với network. Host thực sự down = mất cả hai kênh. Host chỉ mất management NIC = còn datastore heartbeat → HA xử lý khác (isolation response, không phải restart toàn bộ VM).

---

**Câu 3**: DRS "Fully Automated" khác với "Manual" như thế nào?

a) Fully Automated backup VM tự động, Manual thì không  
b) Không có sự khác biệt về tính năng, chỉ khác về giao diện  
c) Manual chỉ hiển thị gợi ý migration — bạn phải manually approve; Fully Automated tự thực hiện vMotion khi imbalance vượt ngưỡng, không cần approval  
d) Manual chạy nhanh hơn vì không phải tính toán

**Đáp án: c** — Với Manual, DRS vẫn tính toán imbalance và gợi ý "di chuyển VM X từ host A sang host B" — nhưng bạn phải click "Apply Recommendation". Fully Automated thực hiện ngay khi DRS score đủ cao. Cho production cluster với SLA cao, Fully Automated tốt hơn vì rebalance xảy ra ngay trong đêm không cần người thức dậy approve.

---

**Câu 4**: HA Admission Control làm gì khi bật?

a) Đảm bảo cluster giữ đủ resource dự phòng để restart VM nếu N host fail — từ chối power-on VM mới nếu làm vậy vi phạm failover capacity  
b) Block tất cả snapshot  
c) Ngăn không cho bật HA  
d) Giới hạn số VM tối đa trong cluster

**Đáp án: a** — Admission Control là cơ chế "đừng để cluster quá đầy đến mức không còn chỗ failover". Ví dụ "tolerate 1 host failure" → cluster reserve ~33% resource (cluster 3 host). Nếu 80% resource đang dùng và bạn cố power-on VM cần 25% thêm → admission control từ chối (tổng 105% > 100%, không còn failover capacity). Có thể điều chỉnh hoặc tắt nhưng tắt = risk HA không có resource restart.

---

**Câu 5**: Vì sao vSphere FT (Fault Tolerance) ít được dùng hơn HA dù cung cấp zero downtime?

a) FT đắt hơn HA về license  
b) FT cần hardware đặc biệt (IBM/HP certified)  
c) FT chỉ hoạt động với Windows VM  
d) FT có hạn chế nghiêm trọng: tối đa 4 vCPU per VM, overhead network cao (replicate toàn bộ CPU execution state), không thể snapshot hay storage vMotion — chỉ phù hợp cho rất ít workload thực sự cần zero downtime

**Đáp án: d** — HA restart VM trong 1-3 phút — acceptable cho phần lớn workload. FT duy trì secondary VM song song liên tục, không bao giờ có downtime, nhưng với overhead cực cao: network phải replicate toàn bộ CPU execution state realtime. Với VM 4 vCPU, FT gần như double network bandwidth cần thiết. Snapshot, storage vMotion đều không được với FT. Hầu hết team dùng HA + application-level HA (database cluster, load balancer) thay vì FT.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước trong module:**
- `virt-storage.vsphere.vm-lifecycle` — tạo VM, snapshot, vMotion
- `virt-storage.vsphere.networking-storage` — vSwitch, VMkernel, datastore

**Bài liên quan ngoài module:**
- `virt-storage.san-nas.fundamentals` — shared storage là điều kiện cần của HA
- `sre.incident-response.process` — HA restart VM = incident P1, cần xử lý đúng quy trình
- `sre.postmortem.writing` — sau HA event phải có postmortem

**Nguồn tham khảo:**
- [VMware vSphere 8.0 — vSphere Availability (HA)](https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-availability/GUID-5432CA24-14F1-44E3-87FB-61D937831CF6.html)
- [VMware vSphere 8.0 — DRS](https://docs.vmware.com/en/VMware-vSphere/8.0/vsphere-resource-management/GUID-517C3B16-E87B-4BE3-A757-6CDDC1E15AEF.html)
