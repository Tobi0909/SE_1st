---
id: container-k8s.k8s-storage.storageclass
title: "StorageClass và dynamic provisioning"
domain: container-k8s
module: container-k8s.k8s-storage
level: "chuyên sâu"
prerequisites: ["container-k8s.k8s-storage.pv-pvc"]
applies_to:
  - "Kubernetes 1.28+ — StorageClass API stable; dynamic provisioning cần provisioner tương ứng với storage backend; CSI (Container Storage Interface) là standard hiện đại thay thế in-tree plugin"
status: verified
sources:
  - "https://kubernetes.io/docs/concepts/storage/storage-classes/"
  - "https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/"
  - "https://kubernetes.io/docs/concepts/storage/volumes/#csi"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

Static provisioning (tạo PV thủ công — xem thêm `container-k8s.k8s-storage.pv-pvc`) không scale
được: với 50 developer mỗi người cần 3-4 PVC cho dev/staging/testing, admin phải tạo hàng trăm PV
thủ công. **Dynamic provisioning** giải quyết bài toán này: user tạo PVC, provisioner tự động tạo
PV từ storage backend và bind ngay. **StorageClass** là object khai báo "loại storage" này — tên,
provisioner, tham số (disk type, IOPS, replication...), và reclaim policy. Hiểu StorageClass là
prerequisite để vận hành K8s production có database hoặc stateful workload ở quy mô.

## 2. Khái niệm cốt lõi

**StorageClass**: object cluster-scoped định nghĩa:
- `provisioner`: plugin tạo storage thật (ví dụ `ebs.csi.aws.com`, `pd.csi.storage.gke.io`,
  `rancher.io/local-path`, `nfs.csi.k8s.io`)
- `parameters`: tham số riêng của provisioner (disk type, IOPS, encryption, zone...)
- `reclaimPolicy`: `Delete` (default, xoá PV khi PVC bị xoá) hoặc `Retain`
- `volumeBindingMode`:
  - `Immediate` (default): PV được tạo và bind ngay khi PVC được tạo
  - `WaitForFirstConsumer`: đợi đến khi Pod nào đó dùng PVC rồi mới tạo PV ở đúng zone/node
    của Pod — quan trọng với EBS (zone-specific) và local storage

**Default StorageClass**: cluster có thể có 1 StorageClass đánh dấu `default` (annotation
`storageclass.kubernetes.io/is-default-class: "true"`). PVC không khai báo `storageClassName`
sẽ tự động dùng StorageClass default. Nếu không có default, PVC bị `Pending` (không có
StorageClass gán vào). Nếu có nhiều hơn 1 default, PVC bị từ chối ngay tại admission (không tạo
được, khác với Pending).

**CSI (Container Storage Interface)**: chuẩn giao tiếp K8s ↔ storage plugin — cho phép vendor
viết driver riêng (EBS CSI, GCE PD CSI, Ceph CSI...) mà không cần sửa K8s core. Các in-tree
plugin cũ (ví dụ `kubernetes.io/aws-ebs` viết thẳng vào K8s source) đã deprecated; tất cả
storage hiện đại dùng CSI driver (`*.csi.*`). CSI driver cần cài riêng trong cluster.

**Local StorageClass**: dùng local disk của node (SSD) — IOPS cao nhất, latency thấp nhất.
Nhược điểm: Pod bị gắn chặt vào node có disk đó, không thể reschedule nếu node fail. Dùng cho
high-performance workload chịu được mất node (nhờ replication ở tầng app, ví dụ MongoDB replica set).

## 3. Cách nó hoạt động

**Dynamic provisioning flow**:
```
User tạo PVC (storageClassName: "fast-ssd")
  → K8s tìm StorageClass "fast-ssd"
  → gọi provisioner (ví dụ EBS CSI driver)
  → provisioner tạo EBS volume thật trên AWS
  → provisioner tạo PV object trong K8s
  → K8s bind PVC với PV vừa tạo
  → kubelet mount EBS volume vào node khi Pod schedule
  → bind mount vào container filesystem
```

**WaitForFirstConsumer**: quan trọng với storage có zone affinity (EBS, GCE PD — volume chỉ
attach được vào node trong cùng AZ). Nếu dùng `Immediate`, K8s tạo EBS volume ở AZ ngẫu nhiên;
Pod có thể schedule vào AZ khác → mount fail. `WaitForFirstConsumer` đợi scheduler chọn node
cho Pod trước, rồi provisioner tạo volume ở đúng AZ đó.

**Volume expansion**: StorageClass có thể bật `allowVolumeExpansion: true` — cho phép resize PVC
sau khi tạo (tăng dung lượng, không giảm được). Sau khi tăng PVC, một số backend cần restart Pod
để filesystem resize; một số (EBS với ext4/xfs) có thể resize online.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

Xem StorageClass có sẵn trong cluster:

```
$ kubectl get storageclass
NAME                 PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION
standard (default)   rancher.io/local-path   Delete          WaitForFirstConsumer   false
fast-ssd             ebs.csi.aws.com         Delete          WaitForFirstConsumer   true
retain-disk          ebs.csi.aws.com         Retain          WaitForFirstConsumer   true
```

Tạo StorageClass mới (EBS gp3 với IOPS cao):

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
  annotations:
    storageclass.kubernetes.io/is-default-class: "false"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "4000"             # giá trị tuyệt đối (default gp3: 3000, max: 16000); khác iopsPerGB của in-tree plugin
  throughput: "125"        # MiB/s (default gp3: 125, max: 1000)
  encrypted: "true"
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

PVC dùng StorageClass — dynamic provisioning:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
  namespace: production
spec:
  accessModes:
  - ReadWriteOnce
  storageClassName: fast-ssd    # chỉ định StorageClass
  resources:
    requests:
      storage: 20Gi
```

```
$ kubectl apply -f pvc.yaml
persistentvolumeclaim/postgres-data created

$ kubectl get pvc postgres-data -n production
NAME            STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE
postgres-data   Pending                                      fast-ssd       5s
# Pending vì WaitForFirstConsumer — đợi Pod dùng PVC rồi mới tạo PV

$ kubectl apply -f postgres-pod.yaml    # Pod dùng PVC này

$ kubectl get pvc postgres-data -n production
NAME            STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
postgres-data   Bound    pvc-a1b2c3d4-e5f6-7890-abcd-ef1234567890   20Gi       RWO            fast-ssd       30s
# PV được tạo tự động với tên UUID bởi provisioner
```

Volume expansion — tăng PVC từ 20Gi lên 50Gi:

```yaml
# Edit PVC spec (hoặc kubectl patch)
spec:
  resources:
    requests:
      storage: 50Gi    # tăng từ 20Gi
```

```
$ kubectl patch pvc postgres-data -n production \
    -p '{"spec":{"resources":{"requests":{"storage":"50Gi"}}}}'
persistentvolumeclaim/postgres-data patched

$ kubectl get pvc postgres-data -n production
NAME            STATUS   CAPACITY   CONDITIONS
postgres-data   Bound    50Gi       FileSystemResizePending   ← resize đang xử lý

# Sau khi kubelet resize filesystem (có thể cần restart Pod với một số driver):
$ kubectl get pvc postgres-data -n production
NAME            STATUS   CAPACITY
postgres-data   Bound    50Gi      ← hoàn thành
```

Local StorageClass cho high-performance workload:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-ssd
provisioner: kubernetes.io/no-provisioner    # không có dynamic provisioner
volumeBindingMode: WaitForFirstConsumer      # cần thiết thực tế: Immediate bind PVC vào node sai
```

Local StorageClass dùng `provisioner: kubernetes.io/no-provisioner` — admin tạo PV local thủ công,
StorageClass chỉ giúp `WaitForFirstConsumer` scheduling. PVC dùng local StorageClass không dynamic
provision được; cần PV manual.

## 5. Lỗi thường gặp và cách chẩn đoán

**PVC dùng default StorageClass nhưng mãi `Pending`**
- Nguyên nhân phổ biến: (1) không có StorageClass nào được đánh dấu default; (2) có nhiều hơn 1
  default StorageClass — trường hợp này PVC bị từ chối ngay tại admission (admission error, không
  phải Pending). K8s 1.25+ bật DefaultStorageClass admission controller mặc định; K8s 1.26+ thêm
  warning event ở cluster level khi phát hiện nhiều default.
- Cách chẩn đoán: `kubectl get storageclass` — cột `(default)` ở StorageClass nào? Có đúng 1 cái
  không?

**PVC `Bound` nhưng Pod báo lỗi mount volume**
- Nguyên nhân với zone-specific storage (EBS): PV được tạo ở AZ khác với node Pod schedule vào
  — thường xảy ra khi StorageClass dùng `Immediate` binding mode thay vì `WaitForFirstConsumer`.
- Cách chẩn đoán: `kubectl describe pod <name>` → Events: "AttachVolume.Attach failed... is not
  in the same AZ". `kubectl get pv <name> -o yaml` xem `nodeAffinity` field — PV có affinity với
  AZ nào.
- Cách xử lý: đổi StorageClass sang `WaitForFirstConsumer` (cần tạo StorageClass mới, PVC mới —
  không thể thay đổi StorageClass của PVC đã bound).

**Volume expansion không có tác dụng**
- Nguyên nhân: StorageClass không bật `allowVolumeExpansion: true`, hoặc storage backend không
  hỗ trợ resize.
- Cách chẩn đoán: `kubectl describe storageclass <name>` → `AllowVolumeExpansion: false`.
  `kubectl describe pvc <name>` → Events: "volume plugin does not support expansion".

## 6. Tình huống thực tế

Thiết kế storage strategy cho K8s cluster production trên AWS:

| Workload | StorageClass | reclaimPolicy | volumeBindingMode | Lý do |
|---|---|---|---|---|
| Postgres (primary DB) | `gp3-retain` | Retain | WaitForFirstConsumer | Data quan trọng, không tự xoá; zone-aware |
| Redis (cache) | `gp3-delete` | Delete | WaitForFirstConsumer | Cache có thể recreate; tiết kiệm cost |
| Kafka logs | `local-ssd` | Retain | WaitForFirstConsumer | IOPS cao, replication ở Kafka level |
| Dev/staging PVC | `standard` (default) | Delete | WaitForFirstConsumer | Dev không cần Retain |

Quyết định quan trọng:
- Production database: luôn dùng `Retain` — ngay cả khi xoá nhầm PVC, EBS volume vẫn còn, admin
  tái tạo PV và bind lại được.
- `WaitForFirstConsumer` trên mọi StorageClass zone-specific — tránh AZ mismatch.
- Tạo riêng StorageClass cho `Retain` và `Delete` thay vì dùng cùng một cái — policy tường minh.

## 7. Tự kiểm tra

1. Tại sao `WaitForFirstConsumer` quan trọng với EBS (hoặc GCE Persistent Disk)?
   <details><summary>Đáp án</summary>EBS volume là zone-specific — một volume chỉ attach được vào
   EC2 instance trong cùng Availability Zone. Nếu dùng `Immediate`, K8s tạo EBS volume ngay khi
   PVC được tạo, chọn zone theo default hoặc ngẫu nhiên; Pod có thể schedule vào AZ khác →
   mount fail. `WaitForFirstConsumer` đợi scheduler quyết định node/AZ cho Pod trước, rồi
   provisioner tạo EBS ở đúng AZ đó — đảm bảo Pod và volume luôn cùng AZ.</details>

2. Có thể đổi `storageClassName` của PVC sau khi đã bound không?
   <details><summary>Đáp án</summary>Không — storageClassName của PVC là immutable sau khi bound.
   Cũng không thể resize xuống (chỉ tăng). Để đổi StorageClass: phải backup data, xoá PVC/PV,
   tạo PVC mới với StorageClass mới, restore data — đây là thao tác có downtime nếu không có
   snapshot mechanism.</details>

3. Sự khác biệt giữa `reclaimPolicy: Retain` ở StorageClass và ở PV là gì?
   <details><summary>Đáp án</summary>PV tạo bởi dynamic provisioning kế thừa `reclaimPolicy` từ
   StorageClass — nếu StorageClass có `Retain`, PV được tạo ra sẽ có `Retain`. PV tạo thủ công
   (static) có `reclaimPolicy` khai báo trực tiếp trong spec, không liên quan đến StorageClass.
   Với dynamic provisioning, StorageClass là nguồn sự thật cho `reclaimPolicy` — đổi policy ở
   StorageClass chỉ ảnh hưởng PV MỚI tạo ra sau đó, không ảnh hưởng PV đã tồn tại.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-storage.pv-pvc` — PV/PVC cơ bản và static provisioning là nền tảng để
  hiểu StorageClass hoạt động ở tầng trên.

**Bài liên quan ngoài module (xem thêm):**
- `container-k8s.k8s-workload.statefulset-daemonset` — `volumeClaimTemplates` trong StatefulSet
  dùng StorageClass để tự tạo PVC per Pod, áp dụng trực tiếp kiến thức bài này.

**Nguồn tham khảo:**
- [Storage Classes — kubernetes.io](https://kubernetes.io/docs/concepts/storage/storage-classes/)
  — spec đầy đủ, danh sách provisioner, parameters cho từng cloud provider.
- [Dynamic Volume Provisioning — kubernetes.io](https://kubernetes.io/docs/concepts/storage/dynamic-provisioning/)
  — giới thiệu dynamic provisioning, ví dụ end-to-end.
- [CSI Volumes — kubernetes.io](https://kubernetes.io/docs/concepts/storage/volumes/#csi) —
  CSI interface, so sánh với in-tree plugin, danh sách CSI driver.
