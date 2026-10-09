---
id: container-k8s.k8s-storage.pv-pvc
title: "PersistentVolume và PersistentVolumeClaim"
domain: container-k8s
module: container-k8s.k8s-storage
level: "vận hành"
prerequisites: ["container-k8s.k8s-workload.statefulset-daemonset"]
applies_to:
  - "Kubernetes 1.28+ — PV/PVC API stable; không phụ thuộc cloud provider cho khái niệm cốt lõi; cần StorageClass và provisioner cho dynamic provisioning"
status: verified
sources:
  - "https://kubernetes.io/docs/concepts/storage/persistent-volumes/"
  - "https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

Container là ephemeral — khi Pod bị restart, mọi dữ liệu trong filesystem của container biến mất.
Với database (Postgres, MySQL, MongoDB), message queue (Kafka), hoặc bất kỳ workload cần lưu trữ
lâu dài, cần cơ chế tách biệt lifecycle của dữ liệu khỏi lifecycle của Pod. **PersistentVolume
(PV)** là đơn vị storage trong K8s độc lập với Pod; **PersistentVolumeClaim (PVC)** là cách Pod
yêu cầu storage đó. Hiểu mô hình PV/PVC là nền tảng để vận hành database và stateful workload
trên K8s đúng cách.

## 2. Khái niệm cốt lõi

**PersistentVolume (PV)**: tài nguyên storage trong cluster — do admin tạo thủ công hoặc provisioner
tạo tự động. PV tồn tại độc lập với Pod: khi Pod bị xoá, PV vẫn còn. PV có các thuộc tính:
- `capacity`: dung lượng (ví dụ `storage: 10Gi`)
- `accessModes`: cách Pod truy cập:
  - `ReadWriteOnce` (RWO): 1 node mount read-write — phổ biến nhất cho database
  - `ReadOnlyMany` (ROX): nhiều node mount read-only
  - `ReadWriteMany` (RWX): nhiều node mount read-write — cần storage backend hỗ trợ (NFS, CephFS)
  - `ReadWriteOncePod` (RWOP, beta K8s 1.27, GA K8s 1.29): 1 Pod duy nhất mount read-write (mạnh hơn RWO)
- `persistentVolumeReclaimPolicy`: chuyện gì xảy ra khi PVC bị xoá:
  - `Retain`: PV còn, data còn — admin phải tự xử lý (default khi tạo thủ công)
  - `Delete`: PV bị xoá, data bị xoá — thường dùng với dynamic provisioning
  - `Recycle`: deprecated, không dùng

**PersistentVolumeClaim (PVC)**: yêu cầu storage của Pod/user — khai báo "tôi cần X GiB với access
mode Y". K8s tự tìm PV phù hợp và bind. PVC thuộc namespace (PV thì không). Một PVC bind với
đúng 1 PV; 1 PV chỉ bind với 1 PVC tại một thời điểm.

**Binding lifecycle**: PVC ở trạng thái `Pending` cho đến khi tìm được PV phù hợp → `Bound`. PV
cũng chuyển sang `Bound`. Nếu không có PV nào phù hợp, PVC bị stuck ở `Pending` — Pod không
schedule được.

**Volume Phases**:
- PV: `Available` → `Bound` → `Released` (PVC bị xoá) → `Failed` hoặc `Available` (sau reclaim)
- PVC: `Pending` → `Bound`

## 3. Cách nó hoạt động

**Matching PV với PVC**: K8s controller tìm PV phù hợp theo:
1. `accessModes`: PV phải hỗ trợ ít nhất các mode PVC yêu cầu
2. `capacity`: PV phải có capacity >= PVC request
3. `storageClassName`: phải khớp (hoặc cả hai để trống — classic binding không dùng StorageClass)
4. `selector` (nếu có): PVC có thể dùng label selector để chọn PV cụ thể

K8s chọn PV NHỎ NHẤT đủ điều kiện — tránh lãng phí PV lớn cho PVC nhỏ.

**Static provisioning vs dynamic provisioning**:
- **Static**: admin tạo PV trước, user tạo PVC, K8s bind — kiểm soát tốt nhưng tốn công vận hành.
- **Dynamic**: user tạo PVC với `storageClassName`, provisioner tự tạo PV từ storage backend (AWS
  EBS, GCP PD, NFS, Ceph...) và bind ngay. Xem thêm bài `container-k8s.k8s-storage.storageclass`.

**Mount qua Pod**: Pod khai báo PVC trong `volumes:` và mount vào container qua `volumeMounts:`.
Sau khi PVC bound với PV, kubelet mount storage thật (ví dụ AWS EBS, NFS share) vào node rồi bind
mount vào container filesystem.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

Static provisioning — admin tạo PV trước:

```yaml
# pv.yaml — admin tạo (cluster-scoped, không có namespace)
apiVersion: v1
kind: PersistentVolume
metadata:
  name: postgres-pv
  labels:
    type: local
spec:
  capacity:
    storage: 10Gi
  accessModes:
  - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""              # không dùng StorageClass, classic binding
  hostPath:
    path: /mnt/data/postgres        # ví dụ trên single-node cluster/dev
```

User tạo PVC:

```yaml
# pvc.yaml — user tạo (namespace-scoped)
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: production
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi                  # yêu cầu 5GiB — PV 10GiB vẫn match (>= 5GiB)
  storageClassName: ""
```

Kiểm tra binding:

```
$ kubectl apply -f pv.yaml
persistentvolume/postgres-pv created

$ kubectl apply -f pvc.yaml
persistentvolumeclaim/postgres-pvc created

$ kubectl get pv postgres-pv
NAME          CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS   CLAIM                     STORAGECLASS
postgres-pv   10Gi       RWO            Retain           Bound    production/postgres-pvc

$ kubectl get pvc -n production
NAME           STATUS   VOLUME        CAPACITY   ACCESS MODES   STORAGECLASS   AGE
postgres-pvc   Bound    postgres-pv   10Gi       RWO                           30s
```

`STATUS: Bound` ở cả PV và PVC — binding thành công. Lưu ý `CAPACITY` của PVC hiển thị capacity
thật của PV đã bind (10Gi), không phải request (5Gi).

Dùng PVC trong Pod (Postgres):

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: postgres
  namespace: production
spec:
  containers:
  - name: postgres
    image: postgres:16
    env:
    - name: POSTGRES_PASSWORD
      value: "example"
    volumeMounts:
    - mountPath: /var/lib/postgresql/data
      name: postgres-storage
  volumes:
  - name: postgres-storage
    persistentVolumeClaim:
      claimName: postgres-pvc        # tên PVC trong cùng namespace
```

Xoá Pod và tạo lại — data vẫn còn:

```
$ kubectl delete pod postgres
pod "postgres" deleted

$ kubectl apply -f postgres-pod.yaml
pod/postgres created

# Data trong PV vẫn nguyên vẹn — PVC chưa bị xoá, PV chưa bị reclaim
```

Xoá PVC (khi không cần nữa):

```
$ kubectl delete pvc postgres-pvc -n production
persistentvolumeclaim "postgres-pvc" deleted

$ kubectl get pv postgres-pv
NAME          CAPACITY   ACCESS MODES   RECLAIM POLICY   STATUS     CLAIM
postgres-pv   10Gi       RWO            Retain           Released   production/postgres-pvc
```

`STATUS: Released` — PVC đã bị xoá nhưng PV còn (vì `Retain`). Data vẫn còn trên storage. Admin
phải tự quyết định: xoá PV và data, hoặc clean spec và tạo PV mới để bind PVC khác.

## 5. Lỗi thường gặp và cách chẩn đoán

**PVC mãi ở `Pending`**
- Nguyên nhân phổ biến: (1) không có PV nào phù hợp (sai accessMode, capacity không đủ, sai
  storageClassName); (2) với dynamic provisioning: provisioner chưa cài hoặc StorageClass không
  tồn tại.
- Cách chẩn đoán: `kubectl describe pvc <name> -n <namespace>` → xem Events: thường có message
  "no persistent volumes available for this claim and no storage class is set" hoặc tương tự.
  `kubectl get pv` xem có PV Available không, capacity và accessModes có khớp không.
- Điểm hay nhầm: PVC yêu cầu `ReadWriteMany` nhưng PV chỉ hỗ trợ `ReadWriteOnce` — không thể
  bind dù capacity đủ.

**Pod bị `Pending` với lý do liên quan đến volume**
- Nguyên nhân: PVC của Pod chưa bound (stuck ở `Pending`). Pod không schedule được khi volume
  chưa sẵn sàng.
- Cách chẩn đoán: `kubectl describe pod <name>` → Events: "persistentvolumeclaim "X" not found"
  hoặc "waiting for a volume to be created". Check PVC status.

**Data biến mất sau khi xoá PVC rồi tạo lại**
- Nguyên nhân: PV có `reclaimPolicy: Delete` (thường là default với dynamic provisioning) — khi
  PVC bị xoá, PV và storage backing bị xoá theo.
- Cách phòng tránh: với data quan trọng, dùng `reclaimPolicy: Retain`; backup trước khi xoá PVC;
  với StatefulSet, đừng xoá StatefulSet bằng `--cascade=foreground` trừ khi chủ đích xoá data.

## 6. Tình huống thực tế

Triển khai Postgres StatefulSet với PVC — đảm bảo data không mất khi Pod restart/reschedule:

1. Dùng `volumeClaimTemplates` trong StatefulSet (xem thêm
   `container-k8s.k8s-workload.statefulset-daemonset`) — mỗi replica tự động có PVC riêng theo
   pattern `<template-name>-<pod-name>`.
2. Khi Pod `postgres-0` bị evict và tái tạo trên node khác: K8s tìm PVC `data-postgres-0` (đã
   tồn tại), bind lại với PV cũ, mount đúng data — database tiếp tục từ đúng chỗ dừng.
3. Scale xuống 0 replica rồi lên lại: PVC vẫn còn, Pod mới pick up đúng PVC của mình.
4. Lưu ý: delete StatefulSet KHÔNG tự xoá PVC — phải `kubectl delete pvc` thủ công nếu muốn
   dọn data (phòng ngừa xoá nhầm data production).

## 7. Tự kiểm tra

1. Sự khác biệt giữa PV và PVC là gì về lifecycle và scope?
   <details><summary>Đáp án</summary>PV là cluster-scoped resource (admin-level), tồn tại độc lập
   với namespace và Pod — lifecycle của PV không gắn với Pod. PVC là namespace-scoped (user-level),
   binding 1-1 với PV. Khi Pod bị xoá, PVC không bị xoá tự động. Khi PVC bị xoá, PV chuyển sang
   Released nhưng data còn hay mất tuỳ `reclaimPolicy`. PVC tách biệt "tôi cần storage" (user)
   khỏi "storage đó là gì" (admin/provisioner).</details>

2. PVC request 5Gi, có 2 PV: một 5Gi và một 20Gi, cùng accessMode và storageClass. K8s bind PVC
   vào PV nào?
   <details><summary>Đáp án</summary>PV 5Gi — K8s chọn PV nhỏ nhất đủ điều kiện để tránh lãng phí
   PV lớn. Nếu PV 5Gi đang `Bound` hoặc không tồn tại, K8s sẽ dùng PV 20Gi. Đây là best-fit
   binding strategy của K8s controller.</details>

3. PVC bị xoá, PV có `reclaimPolicy: Retain`. Có tạo PVC mới bind lại vào PV đó không?
   <details><summary>Đáp án</summary>Không trực tiếp — PV ở trạng thái `Released` có field
   `claimRef` vẫn trỏ vào PVC cũ; K8s không tự bind PVC mới vào PV Released. Để tái dùng PV:
   admin phải xoá field `claimRef` trong spec của PV (`kubectl edit pv`) để PV trở về
   `Available`, sau đó PVC mới mới bind được.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-storage.storageclass` — StorageClass và dynamic provisioning: tự động tạo
  PV thay vì admin tạo thủ công.

**Bài liên quan ngoài module (xem thêm):**
- `container-k8s.k8s-workload.statefulset-daemonset` — StatefulSet dùng `volumeClaimTemplates`
  để tự động tạo PVC per Pod; giải thích cơ chế ở bài đó.

**Nguồn tham khảo:**
- [Persistent Volumes — kubernetes.io](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
  — spec đầy đủ, access modes, reclaim policy, volume phases, selector.
- [Configure Pod Storage with PersistentVolumeClaim — kubernetes.io](https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/)
  — walkthrough với hostPath example, cách debug.
