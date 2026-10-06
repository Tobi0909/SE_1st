---
id: container-k8s.k8s-workload.statefulset-daemonset
title: "StatefulSet và DaemonSet: workload có trạng thái / chạy mọi node"
domain: container-k8s
module: container-k8s.k8s-workload
level: "vận hành"
prerequisites: ["container-k8s.k8s-workload.pods-deployments"]
applies_to:
  - "Kubernetes 1.28+ — StatefulSet, DaemonSet, PersistentVolumeClaim; headless Service; không phụ thuộc cloud provider"
status: draft
sources:
  - "https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/"
  - "https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/"
  - "https://kubernetes.io/docs/concepts/storage/persistent-volumes/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

Deployment tốt cho stateless app (web server, API) — mọi Pod interchangeable, scale in/out tự do.
Nhưng không phải workload nào cũng stateless: **database cần mỗi replica có storage riêng và stable
network identity**, **monitoring agent cần chạy trên MỌI node** để thu thập metric. Hai controller
này — StatefulSet và DaemonSet — được thiết kế cho chính xác hai nhu cầu đó.

## 2. Khái niệm cốt lõi

**StatefulSet** — cho workload CÓ TRẠNG THÁI:
- Pod có tên **cố định, có thứ tự**: `<name>-0`, `<name>-1`, `<name>-2` (không phải random suffix
  như Deployment). Tên này không đổi dù Pod bị recreate.
- Pod có **stable DNS hostname**: kết hợp với headless Service, mỗi Pod có DNS riêng:
  `<pod-name>.<service-name>.<namespace>.svc.cluster.local`. Ví dụ `mysql-0.mysql-headless.default.svc.cluster.local`.
- Mỗi Pod có **PersistentVolumeClaim riêng** (không share) — khi Pod bị recreate, nó tự bind lại
  vào cùng PVC cũ (đúng data cũ của nó).
- Pod được **tạo/xoá theo thứ tự** (0→1→2 khi scale up; 2→1→0 khi scale down) — trừ khi dùng
  `podManagementPolicy: Parallel`.

**DaemonSet** — chạy ĐÚNG MỘT Pod trên MỖI NODE:
- Khi node mới join cluster, DaemonSet controller tự schedule Pod vào node đó.
- Khi node bị remove, Pod trên node đó bị garbage collect.
- Không có `replicas` field — số Pod = số node (hoặc node match node selector).
- Dùng cho: log collector (Fluentd, Filebeat), metrics agent (Prometheus Node Exporter),
  network plugin (CNI), storage plugin (Ceph CSI), security agent.

**PersistentVolume (PV) và PersistentVolumeClaim (PVC)**: trừu tượng hoá storage trong K8s — PV là
storage thật (đĩa trên node, NFS, cloud disk...); PVC là "yêu cầu" storage của Pod (cần bao nhiêu
GB, access mode gì). StatefulSet dùng `volumeClaimTemplates` để tự động tạo PVC cho mỗi Pod —
không cần tạo PVC thủ công.

## 3. Cách nó hoạt động

**StatefulSet ordered deployment**: khi scale từ 0 lên 3 replica:
1. Tạo Pod `db-0`, đợi nó Running + Ready.
2. Tạo Pod `db-1`, đợi Running + Ready.
3. Tạo Pod `db-2`.

Ý nghĩa: với database cluster (MySQL/PostgreSQL/MongoDB), node đầu tiên (`db-0`) thường là primary
— cần khởi động xong trước để secondary (`db-1`, `db-2`) có thể join và replicate. StatefulSet bảo
đảm thứ tự này tự động.

**Stable network identity và cluster membership**: ứng dụng trong StatefulSet có thể hardcode tên
các Pod khác vì tên này không đổi. Ví dụ config của `db-1` luôn dùng `db-0.db-headless` làm
primary endpoint — không cần service discovery phức tạp vì DNS name là stable.

**DaemonSet và Node selector/taint**: có thể giới hạn DaemonSet chỉ chạy trên node có label nhất
định (ví dụ chỉ node có GPU) hoặc dùng toleration để chạy trên node taint (ví dụ control plane
node thường có taint `node-role.kubernetes.io/control-plane:NoSchedule` để ngăn workload thường
lên — DaemonSet hệ thống cần toleration này).

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

StatefulSet cho MySQL single-primary (3 replica):

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mysql-headless    # headless Service (clusterIP: None) — không có ClusterIP,
spec:                     # DNS trỏ thẳng vào Pod IP thay vì virtual IP
  clusterIP: None
  selector:
    app: mysql
  ports:
  - port: 3306
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql-headless    # liên kết với headless Service
  replicas: 3
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
      - name: mysql
        image: mysql:8.0
        env:
        - name: MYSQL_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mysql-secret
              key: root-password
        volumeMounts:
        - name: data
          mountPath: /var/lib/mysql
  volumeClaimTemplates:          # tự động tạo PVC cho mỗi Pod
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 10Gi
```

Xem Pod và PVC được tạo:

```
$ kubectl get pods -l app=mysql
NAME      READY   STATUS    RESTARTS   AGE
mysql-0   1/1     Running   0          5m    ← tên có thứ tự
mysql-1   1/1     Running   0          4m
mysql-2   1/1     Running   0          3m

$ kubectl get pvc -l app=mysql
NAME           STATUS   VOLUME       CAPACITY   ACCESS MODES   AGE
data-mysql-0   Bound    pvc-a1b2c3   10Gi       RWO            5m
data-mysql-1   Bound    pvc-d4e5f6   10Gi       RWO            4m
data-mysql-2   Bound    pvc-g7h8i9   10Gi       RWO            3m
```

PVC có format `<volumeClaimTemplate-name>-<pod-name>` — khi Pod bị recreate, PVC KHÔNG bị xoá,
Pod mới tự tìm đúng PVC của nó.

Verify DNS của từng Pod (từ bên trong cluster):

```
$ kubectl exec mysql-1 -- nslookup mysql-0.mysql-headless
Server: 10.96.0.10
Address: 10.96.0.10#53

Name: mysql-0.mysql-headless.default.svc.cluster.local
Address: 10.244.1.5    ← IP trực tiếp của Pod mysql-0, không qua virtual ClusterIP
```

DaemonSet cho Prometheus Node Exporter (metrics của từng node):

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      hostNetwork: true      # dùng network của host để scrape host metrics
      hostPID: true
      tolerations:
      - key: node-role.kubernetes.io/control-plane
        operator: Exists
        effect: NoSchedule   # cũng chạy trên control plane node
      containers:
      - name: node-exporter
        image: prom/node-exporter:v1.7.0
        ports:
        - containerPort: 9100
          hostPort: 9100     # dư thừa khi đã dùng hostNetwork: true (container đã share network host)
```

Sau khi apply DaemonSet, số Pod = số node:

```
$ kubectl get pods -n monitoring -l app=node-exporter -o wide
NAME                    READY   STATUS    NODE
node-exporter-abc12     1/1     Running   worker-1
node-exporter-def34     1/1     Running   worker-2
node-exporter-ghi56     1/1     Running   controlplane   ← chạy được nhờ toleration
```

## 5. Lỗi thường gặp và cách chẩn đoán

**StatefulSet Pod stuck ở `Pending` vì không có PV available**
- Nguyên nhân: PVC không thể bind vào PV nào — không có PV free đủ dung lượng, hoặc StorageClass
  không có provisioner tự động cấp PV.
- Cách chẩn đoán: `kubectl get pvc` thấy PVC ở `Pending`; `kubectl describe pvc <name>` → Events:
  "no persistent volumes available for this claim".
- Cách xử lý: tạo PV thủ công, hoặc đảm bảo cluster có StorageClass với dynamic provisioner
  (cloud provider thường cấp tự động; bare metal cần cài thêm như Longhorn/Rook-Ceph).

**DaemonSet Pod không chạy trên control plane node**
- Nguyên nhân: control plane node thường có taint `node-role.kubernetes.io/control-plane:NoSchedule`
  — Pod không có toleration phù hợp bị "rejected" bởi scheduler.
- Cách xử lý: thêm toleration trong DaemonSet spec như ví dụ trên. Nếu chỉ muốn chạy trên
  worker node (không muốn trên control plane), KHÔNG thêm toleration — đây là mặc định an toàn.

## 6. Tình huống thực tế

Một team muốn migrate database từ bare metal lên Kubernetes. Điểm quyết định:

1. **Dùng StatefulSet, không phải Deployment** — database cần: stable hostname (primary/secondary
   phải tìm được nhau qua tên cố định), storage riêng cho mỗi replica (data phân tách), thứ tự
   khởi động (primary trước, secondary join sau).
2. **Headless Service bắt buộc** — `clusterIP: None` để DNS trỏ thẳng vào Pod IP; dùng
   `<pod-name>.<service>.<ns>.svc.cluster.local` trong config replication (MySQL `CHANGE MASTER TO
   MASTER_HOST='mysql-0.mysql-headless'`).
3. **PVC lifecycle**: xoá StatefulSet KHÔNG xoá PVC (bảo vệ data); để xoá hẳn cần xoá PVC riêng.
   Trong thực tế: scale StatefulSet về 0 khi migrate (xoá Pod, giữ data trong PVC), backup PVC
   data trước khi làm bất kỳ thứ gì phá huỷ.
4. **Backup**: PVC là persistent disk trên cloud hoặc bare metal — backup bằng snapshot mechanism
   của storage provider (không phải backup qua K8s), thường là VolumeSnapshot K8s API hoặc tool
   như Velero.

## 7. Tự kiểm tra

1. Pod `db-1` của StatefulSet bị crash và K8s recreate. Sau khi recreate, data của `db-1` còn hay
   mất?
   <details><summary>Đáp án</summary>CÒN. PVC <code>data-mysql-1</code> không bị xoá khi Pod
   crash/recreate. Pod mới tên <code>mysql-1</code> tự bind lại vào PVC <code>data-mysql-1</code>
   (vì tên Pod là stable, tên PVC derived từ tên Pod, và K8s tự tìm đúng PVC theo tên). Data trên
   PVC là persistent storage — không bị ảnh hưởng bởi Pod lifecycle.</details>

2. Cluster có 3 worker node. DaemonSet đang chạy 3 Pod. Thêm 2 node mới vào cluster — mấy Pod
   sẽ được tạo thêm?
   <details><summary>Đáp án</summary>2 Pod mới, tự động, không cần can thiệp thủ công. DaemonSet
   controller watch node events — khi node mới join, nó tự schedule Pod lên node đó. Số Pod luôn
   = số node match selector/toleration của DaemonSet.</details>

3. Sự khác biệt cốt lõi giữa headless Service (`clusterIP: None`) và Service thông thường là gì?
   <details><summary>Đáp án</summary>Service thông thường tạo virtual ClusterIP — khi Pod query
   DNS tên Service, nhận được ClusterIP (rồi kube-proxy DNAT route đến 1 trong các Pod backend).
   Headless Service KHÔNG có ClusterIP — DNS trả về trực tiếp list IP của các Pod đang match
   selector. Với StatefulSet, mỗi Pod có hostname riêng nên DNS resolve thẳng vào đúng Pod IP,
   cho phép ứng dụng address từng replica bằng tên.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-workload.pods-deployments` — hiểu Deployment trước để thấy StatefulSet
  khác gì và khi nào cần chuyển.
- `container-k8s.k8s-workload.configmap-secret` — inject config database vào StatefulSet Pod
  mà không hardcode trong image.

**Bài liên quan ngoài module:**
- `container-k8s.k8s-networking.service` — headless Service là loại Service đặc biệt; xem thêm
  về Service thông thường và ClusterIP ở bài đó.
- `container-k8s.k8s-storage` — PersistentVolume, PVC, StorageClass và dynamic provisioning chi
  tiết hơn.

**Nguồn tham khảo:**
- [StatefulSets — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
  — ordered deploy, stable identity, volume claim templates, update strategies.
- [DaemonSets — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/)
  — node selector, toleration, update strategy.
- [PersistentVolumes — kubernetes.io](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
  — PV/PVC lifecycle, access modes, storage class, dynamic provisioning.
