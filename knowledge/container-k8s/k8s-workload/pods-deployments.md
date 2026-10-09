---
id: container-k8s.k8s-workload.pods-deployments
title: "Pod, ReplicaSet, Deployment: quản lý workload stateless"
domain: container-k8s
module: container-k8s.k8s-workload
level: "vận hành"
prerequisites: ["container-k8s.k8s-architecture.api-objects"]
applies_to:
  - "Kubernetes 1.28+ — Deployment/ReplicaSet/Pod API stable; rolling update strategy, revision history, rollback; không phụ thuộc cloud provider"
status: verified
sources:
  - "https://kubernetes.io/docs/concepts/workloads/pods/"
  - "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/"
  - "https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

Pod đơn giản nhất trong K8s là một container đang chạy — nhưng không ai vận hành production bằng
cách tạo Pod thủ công. Khi Pod crash, nó không tự tạo lại. Khi muốn deploy phiên bản mới, phải
xoá Pod cũ và tạo Pod mới thủ công — có downtime. **Deployment** giải quyết cả hai: đảm bảo số
lượng replica chạy đúng lúc mọi lúc (self-healing) và thực hiện rolling update không downtime khi
cập nhật image. Gần như mọi stateless workload production trên K8s chạy qua Deployment.

## 2. Khái niệm cốt lõi

**ReplicaSet**: controller đảm bảo luôn có ĐÚNG N Pod đang chạy theo PodTemplate được khai báo.
Nếu Pod crash → tạo Pod mới. Nếu tạo thêm Pod ngoài → xoá bớt. ReplicaSet nhận diện Pod của nó
bằng **label selector** — không phải bằng cách tạo ra chúng. Thông thường không tạo ReplicaSet
trực tiếp; Deployment tự tạo và quản lý ReplicaSet.

**Deployment**: bọc quanh ReplicaSet, thêm khả năng:
- **Rolling update**: thay thế Pod cũ bằng Pod mới theo từng batch, không có thời điểm nào tất cả
  Pod cũ bị xoá cùng lúc — đảm bảo service liên tục.
- **Revision history**: mỗi lần update Deployment tạo một ReplicaSet mới (ReplicaSet cũ scale về
  0 nhưng không xoá), cho phép rollback về phiên bản trước.
- **Pause/resume**: tạm dừng rollout giữa chừng để kiểm tra.

**Rolling update strategy** (mặc định):
- `maxUnavailable`: số Pod tối đa có thể không available trong quá trình update (default `25%`).
- `maxSurge`: số Pod tối đa có thể tạo thêm trên số replicas (default `25%`). Với 4 replicas:
  tối đa 1 Pod unavailable và tối đa 5 Pod cùng tồn tại trong quá trình update.

**`Recreate` strategy**: xoá toàn bộ Pod cũ TRƯỚC, sau đó tạo Pod mới — có downtime nhưng đơn
giản. Dùng khi ứng dụng không thể chạy cả phiên bản cũ lẫn mới cùng lúc (ví dụ database
migration phá vỡ backward compatibility).

## 3. Cách nó hoạt động

**Deployment → ReplicaSet → Pod hierarchy**: khi tạo Deployment, Deployment controller tạo một
ReplicaSet với PodTemplate giống hệt. ReplicaSet controller tạo Pod. Ba tầng này tạo thành chuỗi
ownership — xoá Deployment → xoá ReplicaSet → xoá Pod (cascading deletion).

**Rolling update mechanics**: khi thay đổi PodTemplate (ví dụ update image), Deployment controller:
1. Tạo ReplicaSet MỚI (rs-v2) với template mới, scale từ 0 lên.
2. Scale ReplicaSet CŨ (rs-v1) xuống.
3. Thực hiện xen kẽ (scale up new + scale down old) theo `maxUnavailable`/`maxSurge` cho đến khi
   rs-v2 đạt replicas target và rs-v1 = 0.
4. rs-v1 giữ ở 0 replicas (không xoá) để phục vụ rollback.

**Readiness probe và rollout**: nếu Pod mới không pass readiness probe (ứng dụng chưa ready nhận
traffic), Deployment KHÔNG tiếp tục scale up Pod mới — rollout bị "stuck". Đây là cơ chế an toàn:
không tự động deploy broken version cho 100% traffic.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

Manifest Deployment đầy đủ với readiness probe:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  labels:
    app: api-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server         # ReplicaSet dùng label này để tìm Pod của nó
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  template:                   # PodTemplate — mọi Pod tạo từ đây
    metadata:
      labels:
        app: api-server       # PHẢI khớp với selector.matchLabels
    spec:
      containers:
      - name: api
        image: my-registry/api-server:v1.2.0
        ports:
        - containerPort: 8080
        resources:
          requests:
            memory: "128Mi"
            cpu: "250m"
          limits:
            memory: "256Mi"
            cpu: "500m"
        readinessProbe:       # K8s chỉ route traffic vào Pod này khi probe pass
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:        # K8s restart container nếu probe fail liên tục
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 20
```

Apply và theo dõi rollout:

```
$ kubectl apply -f deployment.yaml
deployment.apps/api-server created

$ kubectl rollout status deployment/api-server
Waiting for deployment "api-server" rollout to finish: 0 of 3 updated replicas are available...
Waiting for deployment "api-server" rollout to finish: 1 of 3 updated replicas are available...
Waiting for deployment "api-server" rollout to finish: 2 of 3 updated replicas are available...
deployment "api-server" successfully rolled out

$ kubectl get pods -l app=api-server
NAME                          READY   STATUS    RESTARTS   AGE
api-server-5d8b9c7f6-abc12    1/1     Running   0          2m
api-server-5d8b9c7f6-def34    1/1     Running   0          2m
api-server-5d8b9c7f6-ghi56    1/1     Running   0          2m
```

Update image — trigger rolling update:

```
$ kubectl set image deployment/api-server api=my-registry/api-server:v1.3.0
deployment.apps/api-server image updated

$ kubectl rollout status deployment/api-server
Waiting for deployment "api-server" rollout to finish: 1 out of 3 new replicas have been updated...
Waiting for deployment "api-server" rollout to finish: 2 out of 3 new replicas have been updated...
Waiting for deployment "api-server" rollout to finish: 1 old replicas are pending termination...
deployment "api-server" successfully rolled out
```

Xem lịch sử revision và rollback:

```
$ kubectl rollout history deployment/api-server
REVISION  CHANGE-CAUSE
1         kubectl apply --filename=deployment.yaml
2         kubectl set image deployment/api-server api=my-registry/api-server:v1.3.0

$ kubectl rollout history deployment/api-server --revision=2
Pod Template:
  Containers:
   api:
    Image: my-registry/api-server:v1.3.0

# Rollback về revision trước
$ kubectl rollout undo deployment/api-server
deployment.apps/api-server rolled back

# Rollback về revision cụ thể
$ kubectl rollout undo deployment/api-server --to-revision=1
```

Xem ReplicaSet được tạo bởi Deployment (rs-v1 scale=0 sau khi update, rs-v2 scale=3):

```
$ kubectl get replicasets -l app=api-server
NAME                      DESIRED   CURRENT   READY   AGE
api-server-5d8b9c7f6      3         3         3       5m    ← rs-v2 (v1.3.0), hiện active
api-server-7b4c8d9e2      0         0         0       10m   ← rs-v1 (v1.2.0), giữ lại cho rollback
```

Scale thủ công:

```
$ kubectl scale deployment/api-server --replicas=5
deployment.apps/api-server scaled
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Rollout bị stuck ở trạng thái "N of M new replicas have been updated"**
- Nguyên nhân: Pod mới start nhưng readiness probe fail liên tục — ứng dụng chưa sẵn sàng nhận
  traffic (lỗi khi khởi động, database chưa connect được, config sai...).
- Cách chẩn đoán: `kubectl get pods -l app=<name>` thấy Pod mới ở `Running` nhưng `READY 0/1`;
  `kubectl describe pod <new-pod>` → section Events và Conditions: "Readiness probe failed:
  HTTP probe failed with statuscode: 500".
- Cách xử lý: `kubectl logs <new-pod>` xem lỗi app; `kubectl rollout undo` rollback nếu cần.

**`selector` trong Deployment không khớp với `labels` trong PodTemplate**
- Nguyên nhân: viết nhầm label value hoặc key trong một trong hai section.
- Kết quả: Deployment bị rejected với error "selector does not match template labels" khi apply.
- Cách xử lý: đảm bảo `spec.selector.matchLabels` là SUBSET của `spec.template.metadata.labels`
  — thường cả hai nên khớp hoàn toàn.

## 6. Tình huống thực tế

Deploy phiên bản mới với zero-downtime và có khả năng rollback:

1. Cập nhật image tag trong `deployment.yaml`: `image: my-registry/api-server:v1.4.0`.
   (Flag `--record` để ghi change-cause đã deprecated từ K8s 1.22 và bị xoá ở 1.30 — thay vào
   đó dùng annotation thủ công: `kubectl annotate deployment/api-server
   kubernetes.io/change-cause="upgrade to v1.4.0"`)
2. `kubectl apply -f deployment.yaml` → Deployment controller bắt đầu rolling update.
3. `kubectl rollout status deployment/api-server` theo dõi tiến độ; nếu bị stuck sau vài phút,
   pod mới có vấn đề.
4. Trong khi rollout đang diễn ra: `kubectl get pods -l app=api-server -w` thấy Pod mới
   start và Pod cũ terminate xen kẽ (tối đa `maxUnavailable` Pod không available tại bất kỳ
   thời điểm nào).
5. Nếu rollout hoàn thành thành công: `kubectl rollout history deployment/api-server` thấy
   revision mới.
6. Nếu phiên bản mới có vấn đề sau rollout: `kubectl rollout undo deployment/api-server` —
   rollback về revision trước tức thì (cũng là rolling update, chỉ theo chiều ngược lại).

## 7. Tự kiểm tra

1. Deployment có `replicas: 3`, `maxUnavailable: 1`, `maxSurge: 1`. Trong quá trình rolling
   update, bao nhiêu Pod có thể cùng tồn tại tại thời điểm bất kỳ?
   <details><summary>Đáp án</summary>Tối đa 4 Pod (3 + maxSurge 1). Tối thiểu 2 Pod available
   (3 - maxUnavailable 1). Trong giai đoạn giữa: có thể có 2 Pod cũ + 2 Pod mới = 4 Pod cùng
   tồn tại, với 2 Pod ready phục vụ traffic.</details>

2. Khi nào `Recreate` strategy phù hợp hơn `RollingUpdate`?
   <details><summary>Đáp án</summary>Khi ứng dụng KHÔNG thể chạy cả phiên bản cũ lẫn mới cùng lúc:
   database schema migration phá vỡ backward compatibility (v2 đổi schema theo cách v1 không
   đọc được), hoặc ứng dụng dùng lock/singleton không hỗ trợ chạy nhiều instance cùng lúc.
   Recreate có downtime nhưng đơn giản và tránh vấn đề split-brain.</details>

3. ReplicaSet cũ (rs-v1) bị scale về 0 sau khi rolling update hoàn tất — tại sao K8s không xoá
   nó luôn?
   <details><summary>Đáp án</summary>Để phục vụ rollback. Deployment giữ lại N revision cũ (mặc
   định <code>revisionHistoryLimit: 10</code>) dưới dạng ReplicaSet với 0 replica. Khi
   <code>kubectl rollout undo</code> được gọi, Deployment chỉ cần scale rs-v1 từ 0 lên và scale
   rs-v2 về 0 — nhanh hơn tạo lại từ đầu.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-workload.statefulset-daemonset` — khi nào KHÔNG dùng Deployment: StatefulSet
  cho workload có state (database), DaemonSet cho agent chạy trên mọi node.
- `container-k8s.k8s-workload.configmap-secret` — inject config và secret vào Pod trong Deployment
  mà không cần rebuild image.
- `container-k8s.k8s-workload.hpa-scaling` — tự động scale replicas của Deployment theo load.

**Bài liên quan ngoài module:**
- `container-k8s.k8s-networking.service` — Service expose traffic vào tập Pod được quản lý bởi
  Deployment; label selector kết nối Service với Pod.

**Nguồn tham khảo:**
- [Deployments — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
  — strategy, revision history, rollback, pause/resume.
- [ReplicaSet — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)
  — selector ownership, Pod adoption.
- [Pods — kubernetes.io](https://kubernetes.io/docs/concepts/workloads/pods/) — lifecycle, probe
  types (readiness/liveness/startup), ephemeral container.
