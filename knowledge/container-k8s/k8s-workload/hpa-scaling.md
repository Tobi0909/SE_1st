---
id: container-k8s.k8s-workload.hpa-scaling
title: "Horizontal Pod Autoscaler và resource request/limit"
domain: container-k8s
module: container-k8s.k8s-workload
level: "chuyên sâu"
prerequisites: ["container-k8s.k8s-workload.pods-deployments"]
applies_to:
  - "Kubernetes 1.28+ — HPA v2 API (autoscaling/v2, stable từ K8s 1.23); metrics-server cần được cài riêng; VPA là add-on không có sẵn"
status: draft
sources:
  - "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/"
  - "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/"
  - "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

Scale thủ công (`kubectl scale deployment`) hoạt động ổn — nhưng không đủ cho production khi
traffic thay đổi đột ngột. Scale quá ít: service chậm, user chờ. Scale quá nhiều: lãng phí tài
nguyên, tốn tiền cloud. **Horizontal Pod Autoscaler (HPA)** tự động scale số replica của Deployment
(hoặc StatefulSet) dựa trên metric thật — CPU, memory, hoặc custom metric — để luôn đủ capacity
mà không lãng phí. Bài này giải thích cơ chế HPA và quan trọng hơn: giải thích vì sao `resources.
requests` PHẢI được khai báo chính xác để HPA và scheduler hoạt động đúng.

## 2. Khái niệm cốt lõi

**HPA (HorizontalPodAutoscaler)**: controller K8s định kỳ (mặc định 15s) đọc metric hiện tại,
so với target, tính toán số replica cần thiết và điều chỉnh `spec.replicas` của target workload.

**Thuật toán tính replica**:
```
desiredReplicas = ceil(currentReplicas × (currentMetricValue / desiredMetricValue))
```
Ví dụ: 3 replica, CPU hiện tại = 80%, target = 50%:
```
desiredReplicas = ceil(3 × (80/50)) = ceil(4.8) = 5
```

**Stabilization window** — tránh flapping:
- **Scale up**: mặc định KHÔNG có stabilization window (`stabilizationWindowSeconds: 0`) — HPA
  có thể scale up ngay ở chu kỳ đánh giá tiếp theo (cách 15s) sau khi metric vượt ngưỡng. Rate
  limit mặc định: mỗi 15s tối đa thêm `max(4 pods, 100% số replica hiện tại)` — ngăn burst đột
  ngột toàn bộ cluster.
- **Scale down**: stabilization window mặc định 5 phút (`stabilizationWindowSeconds: 300`) — HPA
  giữ số replica cao nhất trong 5 phút trước khi thực sự giảm, tránh thrashing khi spike
  qua đi rồi lại đến.
Không có stabilization window cho scale down, HPA sẽ liên tục scale down/up theo từng spike ngắn.

**`resources.requests` — tại sao quan trọng với HPA**:
HPA tính % CPU dựa trên `currentCPU / requests.cpu`:
- Pod dùng 200m CPU, `requests.cpu = 500m` → utilization = 40%.
- Pod dùng 200m CPU, `requests.cpu` KHÔNG khai báo → HPA không thể tính % → **HPA không hoạt
  động cho CPU metric**.

Đây là lý do **không khai báo `resources.requests` = HPA bị broken một cách thầm lặng**. Không
có error, HPA chỉ không scale khi cần.

**Vertical Pod Autoscaler (VPA)**: thay vì thêm Pod (horizontal), VPA tự động điều chỉnh
`requests`/`limits` của container trong Pod đang chạy (vertical). HPA và VPA không nên dùng cùng
nhau trên cùng metric (CPU) vì xung đột — VPA thay đổi `requests`, HPA dùng `requests` làm
baseline để tính.

## 3. Cách nó hoạt động

**Metrics pipeline**: HPA cần đọc metric từ **metrics-server** (CPU/memory — phải cài riêng, không
có sẵn trong K8s), **custom metrics API** (ví dụ Prometheus Adapter, nếu muốn scale theo số request
per second, queue depth...), hoặc **external metrics API** (metric từ ngoài cluster).

**Scale down stability**: K8s có "stabilization window" cho scale down (default 5 phút) — HPA giữ
số replica cao nhất trong window, không giảm ngay khi spike qua đi. Tránh trường hợp scale down
→ load tăng → scale up → scale down trong vòng lặp ngắn (thrashing).

**`behavior` field** (HPA v2): kiểm soát chi tiết tốc độ scale up/down:

```yaml
behavior:
  scaleUp:
    stabilizationWindowSeconds: 60
    policies:
    - type: Percent
      value: 100         # scale up tối đa 100% replica hiện tại mỗi 60 giây
      periodSeconds: 60
    - type: Pods
      value: 4           # hoặc tối đa 4 Pod
      periodSeconds: 60
    selectPolicy: Max    # chọn policy cho phép scale nhiều nhất
  scaleDown:
    stabilizationWindowSeconds: 300
    policies:
    - type: Percent
      value: 25          # scale down tối đa 25% mỗi 60 giây
      periodSeconds: 60
```

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

Deployment với `resources.requests` đúng cách (bắt buộc để HPA hoạt động):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: api
        image: my-api:v1.0
        resources:
          requests:
            cpu: "250m"      # baseline HPA dùng để tính % utilization
            memory: "128Mi"  # scheduler dùng để chọn node
          limits:
            cpu: "500m"      # kernel throttle khi vượt
            memory: "256Mi"  # kernel OOMKill khi vượt
```

HPA scale theo CPU (target 50%):

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 2        # không scale xuống dưới 2
  maxReplicas: 10       # không scale lên trên 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50   # target 50% CPU requests
```

Xem trạng thái HPA:

```
$ kubectl get hpa api-server-hpa
NAME             REFERENCE               TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
api-server-hpa   Deployment/api-server   23%/50%   2         10        2          5m

# Khi load tăng lên:
$ kubectl get hpa api-server-hpa
NAME             REFERENCE               TARGETS    MINPODS   MAXPODS   REPLICAS   AGE
api-server-hpa   Deployment/api-server   78%/50%    2         10        3          7m

$ kubectl describe hpa api-server-hpa
...
Events:
  Type    Reason             Age   Message
  ----    ------             ----  -------
  Normal  SuccessfulRescale  2m    New size: 3; reason: cpu resource utilization (percentage of request) above target
```

HPA scale theo custom metric (số request/s qua Prometheus Adapter):

```yaml
  metrics:
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"    # target 1000 req/s per Pod
```

Xem resource usage thực tế (cần metrics-server):

```
$ kubectl top pods -l app=api-server
NAME                          CPU(cores)   MEMORY(bytes)
api-server-5d8b9c7f6-abc12   235m         112Mi
api-server-5d8b9c7f6-def34   198m         108Mi
api-server-5d8b9c7f6-ghi56   212m         115Mi
```

## 5. Lỗi thường gặp và cách chẩn đoán

**`kubectl get hpa` thấy `<unknown>/50%` ở cột TARGETS**
- Nguyên nhân: metrics-server không cài hoặc không hoạt động; Pod không có `resources.requests`
  khai báo; `kubectl top pods` cũng fail.
- Cách chẩn đoán: `kubectl top pods -l app=<name>` xem có error không; `kubectl get
  --raw "/apis/metrics.k8s.io/v1beta1/pods"` xem metrics API có respond không.
- Cách xử lý: cài metrics-server; đảm bảo mọi container trong Pod có `resources.requests.cpu`.

**HPA không scale down sau khi traffic giảm**
- Nguyên nhân: normal — scale down stabilization window mặc định là 5 phút. HPA đang chờ để
  đảm bảo traffic không tăng trở lại.
- Đây là hành vi đúng, không phải bug. Nếu cần scale down nhanh hơn: cấu hình `behavior.
  scaleDown.stabilizationWindowSeconds` thấp hơn, với trade-off là risk thrashing cao hơn.

## 6. Tình huống thực tế

E-commerce API có traffic tăng đột biến vào giờ cao điểm (lúc 12h trưa và 7h tối):

1. Khai báo `resources.requests.cpu: "250m"` cho mỗi Pod (baseline cho HPA).
2. HPA với `minReplicas: 3`, `maxReplicas: 20`, target CPU 60%.
3. Lúc bình thường: 3 replica, CPU ~30% — chi phí tối thiểu.
4. Lúc 12h: traffic tăng → CPU lên 90% → HPA tính: `ceil(3 × 90/60) = 5` replica → scale up.
5. Sau scale up 5 replica: CPU về 55% (gần target 60%) — ổn định.
6. Sau 12h30: traffic giảm → CPU xuống 20% → sau 5 phút stabilization window → scale down về 3.
7. Kết quả: tự động xử lý peak load mà không cần on-call manual scale.

Câu hỏi thiết kế thực tế: **minReplicas nên set bao nhiêu?** — không nên set 1 (không có
redundancy, node fail = service down). Thường tối thiểu 2 để tolerate 1 node fail; tối thiểu 3
cho high traffic service (zone distribution).

## 7. Tự kiểm tra

1. Deployment có 4 Pod, mỗi Pod dùng 60% CPU, HPA target 50%. Tính số replica mới?
   <details><summary>Đáp án</summary><code>desiredReplicas = ceil(4 × 60/50) = ceil(4.8) = 5</code>.
   HPA scale lên 5 replica. Sau khi scale: nếu tổng load không đổi, mỗi Pod xử lý khoảng 60%×4/5
   = 48% → dưới target 50% → ổn định.</details>

2. Tại sao không nên set `resources.limits.cpu` quá thấp so với `requests.cpu`?
   <details><summary>Đáp án</summary>Khi CPU usage tăng đến <code>limits.cpu</code>, kernel
   throttle container (không kill, nhưng cho ít CPU hơn). Nếu <code>limits</code> gần bằng
   <code>requests</code>, container dễ bị throttle ngay cả ở load bình thường, làm app bị chậm
   khó giải thích. Thực tế: để <code>limits.cpu</code> cao hơn <code>requests.cpu</code> đủ
   để app burst khi cần (ví dụ requests=250m, limits=500m).</details>

3. HPA và VPA có thể cùng quản lý một Deployment không?
   <details><summary>Đáp án</summary>Không nên dùng cả hai trên cùng metric (CPU). VPA thay đổi
   <code>requests.cpu</code> → làm thay đổi baseline mà HPA dùng để tính utilization → HPA
   scale lên/xuống dựa trên baseline mới → VPA lại thay đổi requests → vòng lặp không ổn định.
   Nếu muốn dùng cả hai: VPA chỉ manage memory (không xung đột với HPA CPU), hoặc VPA ở mode
   "Off" (chỉ recommend, không tự áp dụng) để không can thiệp vào HPA.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-workload.pods-deployments` — HPA điều chỉnh `spec.replicas` của Deployment;
  `resources.requests` khai báo trong PodTemplate.

**Bài liên quan ngoài module:**
- `container-k8s.k8s-architecture.control-plane` — HPA là controller chạy trong
  kube-controller-manager; metrics-server là add-on riêng không thuộc core control plane.

**Nguồn tham khảo:**
- [Horizontal Pod Autoscaling — kubernetes.io](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
  — thuật toán tính replica, metrics types, behavior field chi tiết.
- [HPA walkthrough — kubernetes.io](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/)
  — ví dụ thực hành end-to-end với load generator.
- [Resource management — kubernetes.io](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
  — requests vs limits, QoS class, scheduler behavior.
