---
id: container-k8s.k8s-architecture.api-objects
title: "API object và kubectl cơ bản: Pod, apply, get, describe"
domain: container-k8s
module: container-k8s.k8s-architecture
level: "nền tảng"
prerequisites: ["container-k8s.k8s-architecture.control-plane"]
applies_to:
  - "Kubernetes 1.28+ — kubectl v1.28, YAML manifest format, REST API conventions; không phụ thuộc cloud provider"
status: draft
sources:
  - "https://kubernetes.io/docs/reference/kubectl/"
  - "https://kubernetes.io/docs/concepts/workloads/pods/"
  - "https://kubernetes.io/docs/concepts/overview/working-with-objects/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes và kubectl không cài trên máy demo. Toàn bộ output trong bài là
> **output minh hoạ** theo Kubernetes documentation chính thức.

Mọi thao tác với K8s đều thông qua API object và `kubectl`. Hiểu cách object được khai báo
(YAML manifest), áp dụng (`kubectl apply`), và đọc trạng thái (`kubectl get`/`describe`) là kỹ
năng cơ bản nhất — giống như biết `git add/commit/status` trước khi làm bất kỳ thứ gì với Git.
Phần lớn thao tác vận hành K8s hàng ngày chỉ cần 5-6 lệnh kubectl; bài này dạy đúng những lệnh
đó và giải thích cơ chế phía sau để debug khi cần.

## 2. Khái niệm cốt lõi

**API object**: mọi thứ trong K8s được biểu diễn như object — Pod, Deployment, Service, ConfigMap,
Namespace, Node... Mỗi object có cùng cấu trúc cơ bản (4 trường bắt buộc):

```yaml
apiVersion: apps/v1          # API group + version (kubectl dùng để route đúng API endpoint)
kind: Deployment             # loại object
metadata:
  name: my-app               # tên (unique trong namespace)
  namespace: default         # namespace (môi trường cách ly logic)
  labels:                    # key-value tự do — dùng để select/filter
    app: my-app
    version: "1.0"
spec:                        # TRẠNG THÁI MONG MUỐN (desired state) — bạn viết
  ...
```

K8s cũng tự thêm `status:` (trạng thái HIỆN TẠI — do system cập nhật) — không bao giờ tự
sửa `status:` trong manifest, nó bị overwrite.

**Pod**: đơn vị nhỏ nhất trong K8s — một hoặc nhiều container CHẠY CÙNG NHAU trên cùng node,
share cùng network namespace (cùng IP, cùng `localhost`) và có thể share volume. Thường không
tạo Pod trực tiếp trong production — thay vào đó dùng Deployment/StatefulSet để quản lý Pod lifecycle.
Pod là EPHEMERAL — khi Pod bị xoá, tạo lại từ Deployment sẽ có tên, IP MỚI.

**Namespace**: phân vùng cách ly logic — mỗi namespace có resource quota, RBAC, NetworkPolicy
riêng. Không phải Linux namespace (xem thêm `container-k8s.docker-internals.namespaces-cgroups`)
— K8s namespace là cách phân tách team/môi trường trong cùng cluster. Mặc định K8s có: `default`, `kube-system`, `kube-public`,
`kube-node-lease`.

**Label và selector**: label là key-value gắn vào object (ví dụ `app: api`, `env: prod`). Selector
dùng để tìm object theo label — đây là cách Service biết Pod nào để route traffic vào, cách
ReplicaSet biết Pod nào do nó quản lý, cách `kubectl get pods -l app=api` filter.

## 3. Cách nó hoạt động

**`kubectl apply` vs `kubectl create`**: `apply` là idempotent — nếu object chưa có, tạo mới; nếu
đã có, so sánh và patch sự khác biệt (giống `git commit --amend` nhưng an toàn hơn). `create` là
tạo mới, fail nếu đã tồn tại. Trong workflow hiện đại, gần như luôn dùng `apply` — cho phép lưu
manifest trong git và apply nhiều lần.

**Server-side apply**: `kubectl apply` mặc định là client-side apply — kubectl tính diff và gửi
patch. Kubernetes 1.16+ (beta), GA từ 1.22 có server-side apply (`kubectl apply --server-side`)
— apiserver tính diff, tốt hơn khi nhiều người/tool cùng quản lý một object.

**`kubectl get` và output format**: mặc định in bảng tóm tắt; `-o yaml` in full YAML (bao gồm
cả `status:` do K8s cập nhật); `-o json` in JSON; `-o jsonpath={...}` extract trường cụ thể;
`-w`/`--watch` stream thay đổi realtime (không cần refresh thủ công).

**`kubectl describe`**: tổng hợp human-readable cho một object cụ thể — đặc biệt hữu ích vì phần
`Events` ở cuối output ghi lại lịch sử thao tác gần nhất của hệ thống lên object đó (scheduler
chọn node, kubelet start container, controller tạo/xoá replica...).

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

Manifest Pod đơn giản nhất:

```yaml
# pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: hello-pod
  labels:
    app: hello
spec:
  containers:
  - name: hello
    image: nginx:1.25-alpine
    ports:
    - containerPort: 80
    resources:
      requests:
        memory: "64Mi"
        cpu: "100m"     # 100 millicores = 0.1 vCPU
      limits:
        memory: "128Mi"
        cpu: "200m"
```

Apply và kiểm tra:

```
$ kubectl apply -f pod.yaml
pod/hello-pod created

$ kubectl get pods
NAME        READY   STATUS    RESTARTS   AGE
hello-pod   1/1     Running   0          15s

$ kubectl get pod hello-pod -o yaml | grep -A 5 "status:"
status:
  conditions:
  - lastTransitionTime: "2026-10-06T08:00:00Z"
    status: "True"
    type: Ready
  phase: Running
  podIP: 10.244.1.5
```

`READY 1/1` = 1 container trong Pod đang ready trên tổng 1 container. `podIP` là IP cluster-internal
(không route được từ ngoài cluster).

Mô tả Pod để xem toàn bộ thông tin và sự kiện:

```
$ kubectl describe pod hello-pod
Name:         hello-pod
Namespace:    default
Node:         worker-1/192.168.1.11
Start Time:   Mon, 06 Oct 2026 08:00:00 +0700
Labels:       app=hello
Status:       Running
IP:           10.244.1.5
Containers:
  hello:
    Image:     nginx:1.25-alpine
    Port:      80/TCP
    Limits:
      cpu:     200m
      memory:  128Mi
    Requests:
      cpu:     100m
      memory:  64Mi
    State:     Running
      Started: Mon, 06 Oct 2026 08:00:05 +0700
Events:
  Type    Reason     Age   From               Message
  ----    ------     ----  ----               -------
  Normal  Scheduled  20s   default-scheduler  Successfully assigned default/hello-pod to worker-1
  Normal  Pulling    19s   kubelet            Pulling image "nginx:1.25-alpine"
  Normal  Pulled     16s   kubelet            Pulled image in 2.8s
  Normal  Created    16s   kubelet            Created container hello
  Normal  Started    15s   kubelet            Started container hello
```

Phần `Events` cho thấy toàn bộ lifecycle: scheduler chọn `worker-1` → kubelet pull image →
start container. Đây là nơi đầu tiên cần nhìn khi troubleshoot.

Chạy lệnh trong container đang running:

```
$ kubectl exec hello-pod -- nginx -v
nginx version: nginx/1.25.3

$ kubectl exec -it hello-pod -- sh     # interactive shell
/ #
```

Port-forward để test service từ máy local (không cần expose ra ngoài):

```
$ kubectl port-forward pod/hello-pod 8080:80
Forwarding from 127.0.0.1:8080 -> 80

# Trong terminal khác:
$ curl localhost:8080
<!DOCTYPE html>...  (Nginx default page)
```

`port-forward` tạo tunnel qua apiserver → kubelet, không phải expose service thật — chỉ dùng để
debug/test, không dùng cho production traffic.

Xem log container:

```
$ kubectl logs hello-pod
10.244.0.1 - - [06/Oct/2026:08:01:00 +0000] "GET / HTTP/1.1" 200 612 "-" "curl/7.88.1"

$ kubectl logs hello-pod -f           # follow (streaming)
$ kubectl logs hello-pod --previous   # log của container đã crash trước đó
$ kubectl logs hello-pod -c hello     # chỉ định container khi Pod có nhiều container
```

Xoá object:

```
$ kubectl delete pod hello-pod
pod "hello-pod" deleted

$ kubectl delete -f pod.yaml          # xoá bằng manifest — tìm object theo name+namespace trong file
```

## 5. Lỗi thường gặp và cách chẩn đoán

**`ImagePullBackOff` hoặc `ErrImagePull`**
- Nguyên nhân: image không tồn tại trong registry; sai tag; kubelet không authenticate được với
  private registry (thiếu `imagePullSecrets`).
- Cách chẩn đoán: `kubectl describe pod <name>` → Events: "Failed to pull image ... 404 Not Found"
  hoặc "unauthorized: authentication required". Kiểm tra tên image và tag trong manifest.
- Cách xử lý: sửa image name/tag; tạo Secret chứa registry credential và khai báo `imagePullSecrets`
  trong PodSpec nếu registry private.

**`OOMKilled` (exit code 137)**
- Nguyên nhân: container vượt `resources.limits.memory` — kernel kill process để giải phóng bộ nhớ.
- Cách chẩn đoán: `kubectl describe pod` → `Last State: Terminated, Reason: OOMKilled`.
- Cách xử lý: tăng `limits.memory` hoặc profile app để tìm memory leak.

## 6. Tình huống thực tế

Một SE mới onboard cần xem nhanh trạng thái cluster và tìm Pod đang có vấn đề:

```bash
# 1. Xem tổng quan: tất cả Pod trong mọi namespace
kubectl get pods --all-namespaces

# 2. Filter Pod không ở trạng thái Running
kubectl get pods --all-namespaces --field-selector=status.phase!=Running

# 3. Xem Pod có vấn đề
kubectl describe pod <pod-name> -n <namespace>    # xem Events để hiểu chuyện gì xảy ra

# 4. Xem log của Pod gặp sự cố
kubectl logs <pod-name> -n <namespace> --previous  # nếu Pod đã restart

# 5. Nếu cần debug interactive
kubectl exec -it <pod-name> -n <namespace> -- sh

# 6. Xem tài nguyên sử dụng thực tế (cần metrics-server)
kubectl top pods --all-namespaces
```

`--field-selector` lọc theo field value của object (không phải label) — ít dùng hơn `-l` (label
selector) nhưng hữu ích để tìm object theo trạng thái.

## 7. Tự kiểm tra

1. Sự khác biệt giữa `resources.requests` và `resources.limits` trong PodSpec là gì? Component
   nào của K8s dùng `requests`?
   <details><summary>Đáp án</summary><code>requests</code> là lượng tài nguyên SCHEDULER dùng để
   quyết định có đủ chỗ để đặt Pod trên node không — nếu node có CPU <code>allocatable</code> còn
   lại ít hơn <code>requests.cpu</code>, scheduler không đặt Pod đó lên đó. <code>limits</code>
   là ngưỡng trên kernel sẽ enforce: vượt <code>limits.memory</code> → OOMKill; vượt
   <code>limits.cpu</code> → CPU throttle (không kill). Scheduler dùng <code>requests</code>,
   kernel enforce <code>limits</code>.</details>

2. Tại sao không nên tạo Pod trực tiếp trong production mà nên dùng Deployment?
   <details><summary>Đáp án</summary>Pod là ephemeral — khi bị xoá (node fail, eviction, tay sai)
   không tự tạo lại. Deployment tạo ReplicaSet để đảm bảo số lượng replica; khi Pod die, controller
   tự tạo Pod thay thế (self-healing). Deployment còn quản lý rolling update (deploy phiên bản
   mới không downtime) và rollback. Pod thủ công không có bất kỳ tính năng nào trong số này.</details>

3. `kubectl apply -f deployment.yaml` lần 2 với file không thay đổi — chuyện gì xảy ra?
   <details><summary>Đáp án</summary>kubectl so sánh manifest với state hiện tại của object trong
   cluster (client-side apply dùng annotation <code>kubectl.kubernetes.io/last-applied-configuration</code>
   lưu lần apply trước). Nếu không có diff, kubectl không gửi patch và in <code>deployment.apps/my-app
   unchanged</code>. Đây là lý do <code>apply</code> là idempotent và an toàn để chạy nhiều lần
   (ví dụ trong CI/CD pipeline mỗi deploy).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-architecture.control-plane` — apiserver là điểm tiếp nhận mọi lệnh kubectl;
  scheduler quyết định node cho Pod; kubelet thực thi PodSpec trên node.

**Bài liên quan ngoài module (sẽ học tiếp):**
- `container-k8s.k8s-workload.pods-deployments` — Deployment, ReplicaSet, và lifecycle Pod đầy
  đủ; rolling update và rollback.
- `container-k8s.k8s-workload.configmap-secret` — tách configuration khỏi image bằng ConfigMap
  và Secret, inject vào Pod qua env var hoặc volume.

**Nguồn tham khảo:**
- [kubectl reference — kubernetes.io](https://kubernetes.io/docs/reference/kubectl/) — tất cả
  lệnh và flag, ví dụ dùng thực tế.
- [Pods — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/pods/) — lifecycle Pod,
  init container, sidecar, ephemeral container.
- [Working with objects — kubernetes.io](https://kubernetes.io/docs/concepts/overview/working-with-objects/)
  — object name, namespace, label, annotation, field selector — nền tảng của mọi thao tác kubectl.
