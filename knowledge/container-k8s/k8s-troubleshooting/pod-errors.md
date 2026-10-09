---
id: container-k8s.k8s-troubleshooting.pod-errors
title: "Chẩn đoán Pod lỗi: CrashLoopBackOff, Pending, ImagePullBackOff"
domain: container-k8s
module: container-k8s.k8s-troubleshooting
level: "vận hành"
prerequisites: ["container-k8s.k8s-workload.pods-deployments"]
applies_to:
  - "Kubernetes 1.28+ — kubectl debug, Pod lifecycle, Events API; áp dụng cho mọi cloud provider và bare metal"
status: verified
sources:
  - "https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/"
  - "https://kubernetes.io/docs/tasks/debug/debug-application/determine-reason-pod-failure/"
  - "https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

`CrashLoopBackOff`, `Pending`, `ImagePullBackOff` — đây là 3 trạng thái lỗi mà mọi SE vận hành
K8s gặp hàng ngày. Không biết đọc nhanh từ `kubectl get pods` sang nguyên nhân gốc rễ = mất nhiều
phút loay hoay với cluster production đang có issue. Bài này xây dựng mental model: mỗi trạng thái
lỗi của Pod tương ứng với một phase trong lifecycle, và mỗi phase có tập tool/command debug riêng.
Nắm được flow này giúp triage vấn đề trong vài phút, không phải vài giờ.

## 2. Khái niệm cốt lõi

**Pod lifecycle phases**:
- `Pending`: Pod được K8s chấp nhận nhưng chưa chạy — scheduler chưa gán node, hoặc container
  chưa pull image xong.
- `Running`: ít nhất 1 container đang chạy (không đảm bảo container đang healthy).
- `Succeeded`: tất cả container đã exit với code 0.
- `Failed`: ít nhất 1 container exit với code khác 0.
- `Unknown`: apiserver mất liên lạc với node.

**Container states** (trong Pod):
- `Waiting`: container chưa chạy — đang pull image, đang khởi động init container, hoặc bị
  CrashLoopBackOff.
- `Running`: container đang chạy.
- `Terminated`: container đã exit (dù thành công hay thất bại).

**Trạng thái hay gặp khi lỗi**:
- `CrashLoopBackOff`: container exit (crash) liên tục → K8s restart nhưng thêm backoff delay
  (30s, 1m, 2m, 4m... tối đa 5 phút) để tránh thrashing. Nguyên nhân: app crash, lỗi config,
  OOMKilled, liveness probe fail.
- `Pending` kéo dài: không schedule được — resource không đủ, node không thỏa mãn toleration/
  affinity, PVC không bound.
- `ImagePullBackOff` / `ErrImagePull`: không pull được image — sai tên/tag, registry không tồn
  tại, thiếu credential cho private registry.
- `OOMKilled`: container vượt `resources.limits.memory` → kernel kill process → exit code 137.
  Xem thêm `container-k8s.k8s-troubleshooting.oom-resource` cho phân tích chi tiết.
- `ContainerCreating` kéo dài: kubelet đang chuẩn bị container — thường do volume mount chậm
  (đang attach PVC) hoặc `init container` chưa hoàn thành.

**Ba công cụ debug chính**:
1. `kubectl get pods` — snapshot trạng thái, `RESTARTS` cho biết số lần crash.
2. `kubectl describe pod <name>` — chi tiết đầy đủ: Node, IP, volume, container state, **Events**.
3. `kubectl logs <name>` — log của container, `--previous` cho container đã crash.

## 3. Cách nó hoạt động

**Quy trình triage Pod lỗi** (3 bước):

```
1. kubectl get pods → xem STATUS, RESTARTS, AGE
2. kubectl describe pod <name> → xem Events section (cuối output)
3. kubectl logs <name> [--previous] → xem log app
```

**Events là manh mối đầu tiên**: `kubectl describe pod` in Events ở cuối output — đây là chuỗi
sự kiện hệ thống ghi nhận (scheduler quyết định, kubelet pull image, OOMKill...). Trong phần lớn
trường hợp, Events giải thích nguyên nhân trực tiếp mà không cần đọc log.

**Backoff mechanism của CrashLoopBackOff**: K8s không restart container ngay lập tức. Sau crash 1:
restart ngay. Crash 2: đợi 10s. Crash 3: đợi 20s. Tiếp tục exponential cho đến tối đa 5 phút.
Pod ở trạng thái `CrashLoopBackOff` có nghĩa container đang trong giai đoạn "đợi" của backoff —
không phải container đang crash liên tục mà là đang đợi restart tiếp theo.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

**Scenario 1: CrashLoopBackOff**

```
$ kubectl get pods
NAME                          READY   STATUS             RESTARTS   AGE
api-server-7d9f8b-xk2p9       0/1     CrashLoopBackOff   4          8m

$ kubectl describe pod api-server-7d9f8b-xk2p9
...
Containers:
  api:
    State:          Waiting
      Reason:       CrashLoopBackOff
    Last State:     Terminated
      Reason:       Error
      Exit Code:    1
      Finished:     10s ago
...
Events:
  Warning  BackOff  2m   kubelet  Back-off restarting failed container api in pod api-server-7d9f8b-xk2p9
```

Exit code 1 = app exit bình thường nhưng trả lỗi (không phải OOMKill hay signal). Xem log:

```
$ kubectl logs api-server-7d9f8b-xk2p9 --previous
Error: DATABASE_URL environment variable is not set
```

Nguyên nhân: thiếu env var. Fix: thêm `DATABASE_URL` vào env hoặc ConfigMap/Secret.

**Scenario 2: Pending**

```
$ kubectl get pods
NAME                         READY   STATUS    RESTARTS   AGE
db-0                         0/1     Pending   0          5m

$ kubectl describe pod db-0
...
Events:
  Warning  FailedScheduling  5m  default-scheduler
    0/3 nodes are available: 3 Insufficient memory.
    preemption: 0/3 nodes are eligible for preemption: 3 No preemption victims found for incoming pod
```

Nguyên nhân: cluster không có node nào đủ memory theo `resources.requests.memory`. Options:
1. Thêm node vào cluster.
2. Giảm `requests.memory` nếu khai báo quá cao.
3. Xem node nào đang consume memory: `kubectl top nodes`.

**Scenario 3: ImagePullBackOff**

```
$ kubectl get pods
NAME                         READY   STATUS             RESTARTS   AGE
web-7b8c9d-p4q5r             0/1     ImagePullBackOff   0          2m

$ kubectl describe pod web-7b8c9d-p4q5r
...
Events:
  Warning  Failed   1m  kubelet  Failed to pull image "my-registry.example.com/web:v2.1.0":
    rpc error: code = Unknown desc = failed to pull and unpack image
    "my-registry.example.com/web:v2.1.0": failed to resolve reference
    "my-registry.example.com/web:v2.1.0": unexpected status code 401 Unauthorized
  Warning  BackOff  30s kubelet  Back-off pulling image "my-registry.example.com/web:v2.1.0"
```

Status 401 Unauthorized = kubelet không có credential cho private registry. Fix: tạo Secret
chứa registry credential và khai báo `imagePullSecrets` trong PodSpec.

**Scenario 4: ContainerCreating kéo dài**

```
$ kubectl describe pod postgres-0
Events:
  Warning  FailedMount  3m  kubelet
    MountVolume.WaitForAttach failed for volume "pvc-xxx": attachment timeout for volume "vol-yyy"
```

Nguyên nhân: EBS volume đang attach vào node — có thể chậm (30-60s bình thường) hoặc lỗi
(volume stuck ở node khác, cần detach thủ công).

**Ephemeral debug container** (K8s 1.23+, stable 1.25):

```
# Thêm debug container vào Pod đang chạy — không restart Pod
$ kubectl debug -it api-server-7d9f8b-xk2p9 --image=busybox --target=api
Targeting container "api". If you don't see executions of your container, try specifying the container name explicitly.

Defaulting debug container name to debugger-8xm5x.
If you don't see a command prompt, try pressing enter.
/ # wget -O- http://localhost:8080/health   # test connectivity từ trong Pod
```

Hữu ích khi container chính không có shell (distroless image). `--target=api` share process
namespace với container `api` — có thể xem `/proc` của app đang chạy.

## 5. Lỗi thường gặp và cách chẩn đoán

**Pod `Running` nhưng app không nhận request — READY 0/1**
- Nguyên nhân: readiness probe fail — Pod `Running` (process chạy) nhưng chưa/không còn ready
  theo tiêu chí của probe.
- Cách chẩn đoán: `kubectl describe pod` → `Readiness probe failed: ...` trong Events; xem
  `Conditions: Ready = False`.
- Điểm quan trọng: Service chỉ route traffic đến Pod có `READY 1/1`. Pod `Running` mà
  `READY 0/1` = không nhận traffic từ Service dù process đang chạy.

**CrashLoopBackOff nhưng `kubectl logs` không có gì**
- Nguyên nhân: container crash rất nhanh trước khi ghi bất kỳ log nào, hoặc crash trong
  entrypoint script trước khi app khởi động.
- Cách chẩn đoán: dùng `--previous` để xem log của lần chạy trước; kiểm tra `Exit Code` trong
  `kubectl describe` (code 127 = command not found trong entrypoint, code 126 = permission denied).
- Cách xử lý: thêm `command: ["sh", "-c", "sleep 3600"]` tạm vào container để "giữ" container
  chạy, rồi `kubectl exec` vào debug entrypoint thật.

**Pending với lý do `node(s) had taint that the pod didn't tolerate`**
- Nguyên nhân: tất cả node có taint (ví dụ `node-role.kubernetes.io/control-plane:NoSchedule`)
  mà Pod không có toleration tương ứng. Thường gặp trong cluster 1-node (control plane cũng là
  worker) chưa untaint.
- Cách xử lý: thêm toleration vào Pod hoặc untaint node (`kubectl taint nodes <name> <key>-`).

## 6. Tình huống thực tế

Triage production incident: Deployment có 3 replica, 1 Pod `CrashLoopBackOff`, 2 Pod `Running`.

```bash
# Bước 1: xác nhận vấn đề và scope
kubectl get pods -l app=api-server -n production

# Bước 2: focus vào Pod lỗi
kubectl describe pod <crashing-pod> -n production
# → đọc Events, Exit Code, Last State

# Bước 3: xem log của lần crash cuối
kubectl logs <crashing-pod> -n production --previous --tail=100

# Bước 4 (nếu cần debug sâu hơn): ephemeral container
kubectl debug -it <crashing-pod> -n production --image=nicolaka/netshoot --target=api

# Bước 5: so sánh với Pod đang chạy bình thường
kubectl describe pod <healthy-pod> -n production
# → xem có gì khác (env var, volume mount, node khác nhau...)
```

Sau khi xác định nguyên nhân (ví dụ: thiếu Secret `db-credentials` trong namespace mới), fix
ở Deployment spec chứ không phải patch Pod — Deployment tự tạo lại Pod theo spec đã fix.

## 7. Tự kiểm tra

1. Khác biệt giữa `kubectl logs` và `kubectl logs --previous`?
   <details><summary>Đáp án</summary>`kubectl logs` lấy log của container ĐANG CHẠY (hoặc lần
   chạy gần nhất nếu đang ở CrashLoopBackOff trong giai đoạn backoff-wait). `kubectl logs
   --previous` lấy log của container ĐÃ EXIT trước đó — quan trọng khi container crash và
   restart lại vì log của lần crash có thể bị overwrite bởi lần start mới. Khi debug
   CrashLoopBackOff, luôn dùng `--previous` để thấy lý do crash thật.</details>

2. Pod ở trạng thái `Running` với `READY 0/1`. Service có route traffic vào Pod này không?
   <details><summary>Đáp án</summary>Không — Service chỉ route traffic đến Pod trong Endpoints.
   K8s Endpoints controller chỉ thêm Pod vào Endpoints khi Pod pass readiness probe
   (`READY 1/1`). Pod `Running` `READY 0/1` = readiness probe fail = Pod không có trong
   Endpoints = không nhận traffic từ Service. Pod vẫn chạy (process alive) nhưng bị cô lập
   khỏi traffic cho đến khi probe pass lại.</details>

3. `CrashLoopBackOff` với exit code 137 — nguyên nhân gì?
   <details><summary>Đáp án</summary>OOMKilled — exit code 137 là tín hiệu SIGKILL (128 + 9)
   do kernel gửi khi container vượt `resources.limits.memory`. Xác nhận bằng `kubectl describe
   pod` → `Last State: Terminated, Reason: OOMKilled`. Cách xử lý: tăng `limits.memory` hoặc
   profile app để tìm memory leak. Xem thêm `container-k8s.k8s-troubleshooting.oom-resource`
   cho phân tích chi tiết resource sizing.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-troubleshooting.oom-resource` — phân tích sâu OOMKilled và resource
  request/limit sizing.
- `container-k8s.k8s-troubleshooting.logs-events` — kỹ thuật đọc log và event hiệu quả hơn.

**Bài liên quan ngoài module (xem thêm):**
- `container-k8s.k8s-workload.pods-deployments` — Deployment rolling update và readiness probe:
  hiểu cách Pod được tạo và điều kiện để route traffic.
- `container-k8s.k8s-networking.service` — Endpoints/EndpointSlice: tại sao READY 0/1 không
  nhận traffic từ Service.

**Nguồn tham khảo:**
- [Debug Pods — kubernetes.io](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/)
  — debug running vs CrashLoopBackOff, Init container debug.
- [Determine Reason Pod Failed — kubernetes.io](https://kubernetes.io/docs/tasks/debug/debug-application/determine-reason-pod-failure/)
  — exit code, termination message, OOMKilled.
- [Pod Lifecycle — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
  — phases, container states, conditions, readiness/liveness probe effect.
