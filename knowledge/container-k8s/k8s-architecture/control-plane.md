---
id: container-k8s.k8s-architecture.control-plane
title: "Kiến trúc Kubernetes: control plane, node, etcd"
domain: container-k8s
module: container-k8s.k8s-architecture
level: "nền tảng"
prerequisites: ["container-k8s.docker-internals.images"]
applies_to:
  - "Kubernetes 1.28+ — kiến trúc control plane và data plane; etcd v3; kubelet trên node; CRI (container runtime interface) — không phụ thuộc cloud provider cụ thể"
status: verified
sources:
  - "https://kubernetes.io/docs/concepts/overview/components/"
  - "https://kubernetes.io/docs/concepts/architecture/"
  - "https://etcd.io/docs/v3.5/learning/data_model/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes và kubectl không cài trên máy demo. Toàn bộ output trong bài là
> **output minh hoạ** theo Kubernetes documentation chính thức.

Docker Compose giải quyết tốt cho một host duy nhất. Kubernetes (K8s) ra đời để giải quyết ba
vấn đề không thể giải với Compose: chạy container trên NHIỀU HOST (scale out hardware), tự phục
hồi khi container/host fail (self-healing), và deploy phiên bản mới không có downtime (rolling
update). Hiểu kiến trúc K8s là điều kiện tiên quyết cho mọi tác vụ vận hành — một SE không biết
"component nào làm gì" sẽ debug sai tầng khi gặp sự cố (ví dụ: pod không schedule được thường là
vấn đề scheduler hoặc node condition, không phải kubelet hay container runtime).

## 2. Khái niệm cốt lõi

Kubernetes cluster chia thành 2 nhóm thành phần: **control plane** (não — ra quyết định) và
**worker node** (tay — thực thi). Trong production, control plane thường chạy trên 3+ node riêng
(High Availability), nhưng về mặt khái niệm là một tập thành phần logic.

**Control plane components:**

**`kube-apiserver`**: cổng duy nhất vào cluster — mọi thứ đều đi qua đây. Nhận request REST từ
`kubectl`, controller, scheduler, và chính các node. Validate request, cập nhật trạng thái vào
etcd, và notify các component khác. Stateless (không lưu state của cluster, đó là việc của etcd)
— có thể scale horizontal.

**`etcd`**: key-value store phân tán, lưu TẤT CẢ trạng thái cluster (spec của mọi object: Pod,
Deployment, Service...). Đây là nguồn sự thật duy nhất (single source of truth). Dùng thuật toán
Raft để đảm bảo consistency qua nhiều replica. Backup etcd = backup toàn bộ cluster. Nếu etcd
mất data, cluster không thể phục hồi object đang chạy — chỉ còn container thô không được quản lý.

**`kube-scheduler`**: theo dõi Pod mới tạo chưa có Node nào được gán (`spec.nodeName` rỗng), rồi
chọn Node phù hợp dựa trên: resource request của Pod (CPU/RAM), node affinity/taint/toleration,
và các ràng buộc khác. KHÔNG trực tiếp start container — chỉ cập nhật `spec.nodeName` của Pod,
rồi kubelet trên node đó tự lấy việc.

**`kube-controller-manager`**: chạy nhiều controller loop ("reconciliation loop") trong cùng một
process. Mỗi controller theo dõi một loại resource và đảm bảo trạng thái thực tế khớp với spec
mong muốn. Ví dụ: `ReplicaSet controller` — nếu Pod bị crash (3 replicas nhưng chỉ còn 2), nó
tạo Pod mới. Đây là cơ chế self-healing của K8s.

**Worker node components:**

**`kubelet`**: agent chạy trên MỌI node, liên tục nhận PodSpec từ apiserver và đảm bảo container
trong Pod đang chạy đúng spec. Kubelet gọi container runtime (qua CRI interface) để start/stop
container. Cũng báo cáo trạng thái node và Pod về apiserver.

**`kube-proxy`**: quản lý iptables/ipvs rule trên node để implement K8s Service networking — khi
một Pod gửi request tới ClusterIP của Service, kube-proxy (đã setup rule trước đó) route request
tới một trong các Pod backend. Không phải proxy trong nghĩa truyền thống (không phải proxy process
đứng giữa) — chỉ quản lý kernel networking rule.

**Container Runtime**: thực thi container thật — thường là `containerd` (default trong K8s hiện
đại, cũng là runtime của Docker) hoặc `CRI-O`. Kubelet giao tiếp với runtime qua CRI (Container
Runtime Interface) — đây là lý do K8s không phụ thuộc Docker cụ thể, chỉ cần runtime implement
CRI.

## 3. Cách nó hoạt động

**Reconciliation loop — cơ chế trung tâm của K8s**: mọi controller trong K8s làm 1 việc lặp lại:
`OBSERVE current state → COMPARE với desired state → ACT để giảm diff`. Ví dụ Deployment controller
khi bạn tạo `Deployment replicas: 3`:

1. Controller thấy spec `replicas: 3`, đếm Pod hiện tại: 0 → diff = 3.
2. Tạo ReplicaSet → ReplicaSet controller tạo 3 Pod với `spec.nodeName` rỗng.
3. Scheduler thấy 3 Pod chưa có node → chọn node cho từng Pod.
4. Kubelet trên node tương ứng thấy PodSpec mới → gọi container runtime start container.
5. Container running → Pod status `Running` → báo về apiserver → Deployment controller thấy diff
   = 0, dừng.

Khi một Pod crash: kubelet báo về apiserver → ReplicaSet controller thấy diff = 1 → tạo Pod mới
→ chu kỳ lặp lại. Đây là **self-healing**: không cần can thiệp thủ công.

**Luồng lưu trữ qua etcd**: khi `kubectl apply -f deployment.yaml` chạy:
1. kubectl gọi REST API của apiserver.
2. apiserver validate YAML, cập nhật object vào etcd.
3. Các controller đang watch event từ apiserver được notify.
4. Reconciliation diễn ra như trên.

**Watch mechanism (không phải polling)**: controller không định kỳ query apiserver "có gì mới không"
— thay vào đó dùng **long-lived HTTP watch connection** để nhận push event khi resource thay đổi.
Hiệu quả hơn polling nhiều, đặc biệt khi cluster có hàng nghìn object.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

Xem component của control plane bằng `kubectl`:

```
$ kubectl get pods -n kube-system
NAME                                       READY   STATUS    RESTARTS   AGE
coredns-5d78c9869d-j4kh2                   1/1     Running   0          2d
etcd-controlplane                          1/1     Running   0          2d
kube-apiserver-controlplane                1/1     Running   0          2d
kube-controller-manager-controlplane       1/1     Running   0          2d
kube-scheduler-controlplane               1/1     Running   0          2d
kube-proxy-abc12                           1/1     Running   0          2d
kube-proxy-def34                           1/1     Running   0          2d
```

Control plane components (etcd, apiserver, controller-manager, scheduler) chạy như static Pod trên
control plane node (suffix = tên node). kube-proxy chạy như DaemonSet — mỗi node có 1 instance.

Xem trạng thái node trong cluster:

```
$ kubectl get nodes
NAME           STATUS   ROLES           AGE   VERSION
controlplane   Ready    control-plane   2d    v1.28.3
worker-1       Ready    <none>          2d    v1.28.3
worker-2       Ready    <none>          2d    v1.28.3

$ kubectl describe node worker-1
Name:     worker-1
...
Conditions:
  Type                 Status  Reason
  ----                 ------  ------
  MemoryPressure       False   KubeletHasSufficientMemory
  DiskPressure         False   KubeletHasNoDiskPressure
  PIDPressure          False   KubeletHasSufficientPID
  Ready                True    KubeletReady
...
Capacity:
  cpu:                4
  memory:             8194Mi
  pods:               110
Allocatable:
  cpu:                3920m
  memory:             7780Mi
  pods:               110
```

`Conditions` cho biết tình trạng node — `Ready=True` nghĩa kubelet báo cáo OK; `MemoryPressure=True`
nghĩa scheduler sẽ tránh schedule Pod mới lên node này; nếu `Ready=False` hoặc `Unknown` (kubelet
không contact được apiserver), controller sẽ bắt đầu evict Pod sau timeout.

`Capacity` = tổng tài nguyên node; `Allocatable` = phần dành cho Pod (trừ đi reserve cho OS +
kubelet). Scheduler quyết định dựa trên `Allocatable`, không phải `Capacity`.

Trực quan hoá luồng tạo Deployment:

```
$ kubectl get events --field-selector involvedObject.name=my-deployment --sort-by=.lastTimestamp
LAST SEEN   TYPE     REASON              OBJECT                    MESSAGE
0s          Normal   ScalingReplicaSet   Deployment/my-deployment  Scaled up replica set to 3
0s          Normal   SuccessfulCreate    ReplicaSet/my-dep-abc12   Created pod: my-dep-abc12-p1
0s          Normal   Scheduled           Pod/my-dep-abc12-p1       Assigned worker-1
5s          Normal   Pulled              Pod/my-dep-abc12-p1       Image already present on node
5s          Normal   Created             Pod/my-dep-abc12-p1       Created container api
6s          Normal   Started             Pod/my-dep-abc12-p1       Started container api
```

Đọc từ trên xuống: Deployment controller tạo ReplicaSet → ReplicaSet controller tạo Pod →
Scheduler gán node → Kubelet pull image (nếu cần) → start container. Mỗi bước là một event.

## 5. Lỗi thường gặp và cách chẩn đoán

**Pod ở trạng thái `Pending` mãi không chuyển sang `Running`**
- Nguyên nhân phổ biến: (1) không có node nào đủ tài nguyên (CPU/RAM request của Pod vượt
  Allocatable còn lại của mọi node); (2) node có taint nhưng Pod không có toleration phù hợp;
  (3) scheduler chưa nhận được PodSpec (apiserver/etcd vấn đề).
- Cách chẩn đoán: `kubectl describe pod <pod-name>` → xem section `Events` ở dưới cùng: scheduler
  thường để lại message rõ lý do ("0/3 nodes are available: 3 Insufficient memory" hoặc "node(s)
  had taint...").
- Cách xử lý: `kubectl get nodes` xem Allocatable còn bao nhiêu; `kubectl describe node <node>`
  xem tài nguyên đã cấp phát cho Pod đang chạy (section "Allocated resources").

**Node ở trạng thái `NotReady`**
- Nguyên nhân: kubelet trên node đó không contact được apiserver (network issue, kubelet crash,
  node hết tài nguyên, node bị power off...).
- Controller-manager sẽ đánh dấu `NodeCondition.Ready = Unknown` sau 40 giây không nhận heartbeat,
  rồi bắt đầu evict Pod sau 5 phút (kiểm soát qua default toleration
  `node.kubernetes.io/not-ready:NoExecute tolerationSeconds=300` được admission controller tự
  thêm vào Pod — flag `--pod-eviction-timeout` đã bị loại bỏ từ K8s 1.24).
- Cách chẩn đoán: SSH vào node kiểm tra `systemctl status kubelet`; kiểm tra log kubelet bằng
  `journalctl -u kubelet -n 50`; kiểm tra node có đủ disk (`df -h`) và memory (`free -h`).

## 6. Tình huống thực tế

Một Pod trong cluster bị CrashLoopBackOff, cần xác định nguyên nhân:

1. `kubectl get pods` xem Pod nào đang `CrashLoopBackOff`, số lần `RESTARTS`.
2. `kubectl describe pod <pod-name>` — xem section `Last State: Terminated`, `Reason`, và
   `Exit Code`. Exit code 1 = lỗi application; exit code 137 = bị SIGKILL (thường do OOM kill
   bởi kernel, container vượt memory limit).
3. `kubectl logs <pod-name>` (log của lần restart hiện tại) và `kubectl logs <pod-name> --previous`
   (log của lần crash trước) — tìm stack trace hoặc error message ngay trước khi crash.
4. Nếu nguyên nhân là OOM: `kubectl describe pod` → section `Containers` → `Limits` và `Last
   State: Terminated, OOMKilled: true`. Giải pháp: tăng `resources.limits.memory` hoặc tối ưu
   app.
5. Nếu nguyên nhân là lỗi application: fix code, build image mới, update Deployment tag → rolling
   update tự động diễn ra.

## 7. Tự kiểm tra

1. Kube-scheduler đã chọn node cho Pod và cập nhật `spec.nodeName`. Bước tiếp theo AI sẽ làm gì,
   do component nào thực hiện?
   <details><summary>Đáp án</summary>Kubelet trên node đó đang watch apiserver — nó nhận được event
   "có PodSpec mới với nodeName = node này". Kubelet đọc PodSpec và gọi container runtime (qua CRI)
   để pull image nếu cần và start container. Kubelet liên tục báo cáo trạng thái Pod về
   apiserver.</details>

2. etcd bị mất toàn bộ data nhưng container vẫn đang chạy trên các worker node. Chuyện gì xảy ra?
   <details><summary>Đáp án</summary>Container đang chạy không bị dừng ngay (process còn sống trên
   node). Nhưng toàn bộ object (Pod, Deployment, Service...) trong cluster bị mất — apiserver không
   còn biết gì về chúng. Nếu container crash, kubelet sẽ không restart theo spec (không có spec nào
   còn tồn tại). Không thể schedule Pod mới, không có Service networking. Cluster về cơ bản là
   "dead" dù process còn chạy — phải restore từ etcd backup.</details>

3. Sự khác biệt giữa `kubectl get nodes` thấy `Ready=False` và `Ready=Unknown` là gì?
   <details><summary>Đáp án</summary><code>Ready=False</code>: kubelet đang contact được apiserver
   và CHỦ ĐỘNG báo cáo node không healthy (ví dụ thiếu tài nguyên, lỗi cấu hình). <code>Ready=
   Unknown</code>: apiserver không nhận được heartbeat từ kubelet trong 40 giây — không biết node
   đang ở trạng thái gì (có thể mất mạng, node bị tắt nguồn, kubelet crash...). Unknown thường
   nghiêm trọng hơn vì không có thông tin gì để debug từ phía node.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-architecture.api-objects` — kubectl commands và object model (Pod, apply,
  get, describe) — thực hành trực tiếp với apiserver.

**Bài liên quan ngoài module:**
- `container-k8s.docker-internals.namespaces-cgroups` — kubelet dùng cgroup để enforce resource
  limit của Pod; container runtime tạo namespace mới cho mỗi container (xem thêm bài này để
  hiểu chi tiết cơ chế kernel).
- `container-k8s.k8s-workload.pods-deployments` — Deployment/ReplicaSet controller là ứng dụng
  thực tế của reconciliation loop; Pod là đơn vị workload cơ bản.

**Nguồn tham khảo:**
- [Kubernetes components — kubernetes.io](https://kubernetes.io/docs/concepts/overview/components/)
  — mô tả chính thức từng component, vai trò trong cluster.
- [Cluster architecture — kubernetes.io](https://kubernetes.io/docs/concepts/architecture/) —
  kiến trúc chi tiết, giao tiếp giữa component, node heartbeat, lease objects.
- [etcd data model — etcd.io](https://etcd.io/docs/v3.5/learning/data_model/) — cách etcd lưu
  key-value và đảm bảo consistency; hiểu để đánh giá rủi ro khi etcd có vấn đề.
