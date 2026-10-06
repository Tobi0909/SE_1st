---
id: container-k8s.k8s-troubleshooting.logs-events
title: "Đọc log và event hiệu quả: kubectl logs, describe, events"
domain: container-k8s
module: container-k8s.k8s-troubleshooting
level: "vận hành"
prerequisites: ["container-k8s.k8s-troubleshooting.pod-errors"]
applies_to:
  - "Kubernetes 1.28+ — kubectl logs, Events API, kubectl describe; áp dụng cho mọi cloud provider"
status: draft
sources:
  - "https://kubernetes.io/docs/concepts/cluster-administration/logging/"
  - "https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/"
  - "https://kubernetes.io/docs/reference/kubectl/generated/kubectl_get/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

Khi incident xảy ra, thời gian từ "có alert" đến "biết nguyên nhân" quyết định MTTR (Mean Time
To Recovery). `kubectl logs` và `kubectl get events` là 2 nguồn thông tin đầu tiên — nhưng nhiều
người dùng chưa hiệu quả: không biết lọc theo time range, không biết tổng hợp log từ nhiều Pod,
không biết đọc event lifecycle đúng cách. Bài này tập trung vào **kỹ thuật** đọc log và event —
không phải giới thiệu lệnh, mà là dùng chúng hiệu quả trong điều kiện pressure.

## 2. Khái niệm cốt lõi

**K8s logging architecture**: K8s không có centralized logging tích hợp sẵn. `kubectl logs` đọc
stdout/stderr của container từ container runtime (containerd/CRI-O), lưu trên node tại
`/var/log/pods/`. Khi Pod bị xoá, log cũng mất. Log retention trên node mặc định 10MB per
container, 5 file rotation — log cũ hơn bị xoá tự động. Production cluster cần centralized
logging (EFK/ELK stack, Loki, Cloud Logging) — `kubectl logs` chỉ cho debugging cục bộ.

**K8s Events**: mỗi thao tác quan trọng của hệ thống tạo Event object — scheduler chọn node,
kubelet pull image, controller tạo Pod... Events có TTL mặc định 1 giờ (configurable qua
`--event-ttl`) — sau đó tự xoá. Đây là nguồn thông tin cực kỳ quan trọng cho debugging nhưng
hết hạn nhanh. Events được lưu trong etcd, tốn IO — không nên increase TTL quá nhiều.

**Two types of Events**: `Normal` (thông tin, lifecycle bình thường) và `Warning` (anomaly,
failure, degraded condition). Debug focus vào `Warning` events.

**Structured logging**: app tốt emit log theo format JSON (`{"level":"error","msg":"...","ts":...}`)
hoặc logfmt. Easier to grep và parse. Unstructured log (plain text) cần `grep` kỹ hơn.

## 3. Cách nó hoạt động

**`kubectl logs` mechanics**: kubectl gọi API `GET /api/v1/namespaces/{ns}/pods/{name}/log`,
apiserver forward đến kubelet trên node của Pod, kubelet đọc từ `/var/log/pods/...`, stream về
kubectl. Do đó: (1) cần Pod đang chạy hoặc mới chết (log chưa bị xoá), (2) chỉ stdout/stderr —
app phải log ra stdout, không ghi file riêng.

**Events vs describe**: `kubectl describe <object>` tổng hợp spec + status + Events của đúng 1
object. `kubectl get events` liệt kê tất cả Events trong namespace, có thể filter. Khi debug,
thường bắt đầu bằng `describe` (có context object cụ thể), sau đó `get events` nếu cần scope
rộng hơn.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

**`kubectl logs` — các flag quan trọng**:

```bash
# Log của container cụ thể (Pod có nhiều container)
kubectl logs <pod> -c <container-name> -n <namespace>

# Follow (stream realtime)
kubectl logs <pod> -f -n <namespace>

# Lần restart trước (khi đang CrashLoopBackOff)
kubectl logs <pod> --previous -n <namespace>

# Giới hạn dòng cuối (không đọc cả file)
kubectl logs <pod> --tail=100 -n <namespace>

# Lọc theo thời gian (từ 1 giờ gần đây)
kubectl logs <pod> --since=1h -n <namespace>

# Kết hợp: 50 dòng log trước khi crash trong giờ qua
kubectl logs <pod> --previous --tail=50 -n <namespace>
```

**Log từ tất cả Pod cùng 1 Deployment** — dùng label selector:

```bash
kubectl logs -l app=api-server -n production --tail=50 --prefix=true
```

`--prefix=true` thêm `[pod/api-server-abc-xyz]` trước mỗi dòng — dễ phân biệt log từ Pod nào.
Khi có 5 replica, đây là cách xem log gộp từ tất cả cùng lúc.

Ví dụ output với `--prefix`:

```
[pod/api-server-7d9f-p2m1] 2026-10-06T10:01:05Z INFO  Request received GET /api/users
[pod/api-server-7d9f-k4n8] 2026-10-06T10:01:05Z INFO  Request received GET /api/orders
[pod/api-server-7d9f-p2m1] 2026-10-06T10:01:06Z ERROR DB connection failed: connection timeout
[pod/api-server-7d9f-xp4r] 2026-10-06T10:01:06Z INFO  Request received POST /api/orders
```

Thấy ngay chỉ 1 Pod (p2m1) có DB error — giúp khoanh vùng nhanh.

**`kubectl get events` — đọc hiệu quả**:

```bash
# Tất cả events trong namespace (mới nhất trên cùng)
kubectl get events -n production --sort-by='.lastTimestamp'

# Chỉ Warning events
kubectl get events -n production --field-selector type=Warning

# Events của 1 object cụ thể (Pod, Deployment, Node...)
kubectl get events -n production --field-selector involvedObject.name=api-server-7d9f-p2m1

# Events liên quan đến Pod cụ thể (kết hợp namespace)
kubectl get events -n production \
  --field-selector involvedObject.kind=Pod,involvedObject.name=api-server-7d9f-p2m1
```

Ví dụ output events của 1 Pod:

```
LAST SEEN   TYPE      REASON      OBJECT                          MESSAGE
5m          Normal    Scheduled   pod/api-server-7d9f-p2m1        Successfully assigned production/api-server-7d9f-p2m1 to worker-2
5m          Normal    Pulling     pod/api-server-7d9f-p2m1        Pulling image "my-registry/api:v1.5.0"
4m          Normal    Pulled      pod/api-server-7d9f-p2m1        Successfully pulled image in 45.3s
4m          Normal    Created     pod/api-server-7d9f-p2m1        Created container api
4m          Normal    Started     pod/api-server-7d9f-p2m1        Started container api
2m          Warning   BackOff     pod/api-server-7d9f-p2m1        Back-off restarting failed container
```

`LAST SEEN` và thứ tự events kể câu chuyện lifecycle: schedule → pull → start → crash → backoff.

**Events cho Node** — xem khi nghi node có vấn đề:

```bash
kubectl get events --field-selector involvedObject.kind=Node,involvedObject.name=worker-2
```

Phát hiện: node bị MemoryPressure, DiskPressure, hoặc kubelet version mismatch.

**`kubectl describe` — đọc nhanh phần quan trọng**:

Khi output dài, 2 phần cần đọc trước:
1. `Conditions:` — trạng thái hiện tại (Ready, PodScheduled, ContainersReady...)
2. `Events:` — lịch sử sự kiện (luôn ở cuối output)

```bash
# Pipe qua tail để thấy Events ngay
kubectl describe pod api-server-7d9f-p2m1 -n production | tail -30

# Hoặc grep trực tiếp
kubectl describe pod api-server-7d9f-p2m1 -n production | grep -A 20 "^Events:"
```

**Triage nhanh toàn namespace** — xem trạng thái tất cả Pod + events:

```bash
# Xem Pod không ở Running
kubectl get pods -n production --field-selector=status.phase!=Running

# Events Warning trong 30 phút gần đây
kubectl get events -n production --field-selector type=Warning \
  --sort-by='.lastTimestamp' | tail -20

# Pods với RESTARTS cao
kubectl get pods -n production --sort-by='.status.containerStatuses[0].restartCount'
```

## 5. Lỗi thường gặp và cách chẩn đoán

**`kubectl logs` trả về rỗng hoặc "unable to retrieve container logs"**
- Nguyên nhân phổ biến: (1) container chưa start; (2) Pod ở trạng thái `Pending` (chưa có
  container nào chạy); (3) log đã bị rotate hoặc Pod bị xoá quá lâu.
- Cách xác nhận: `kubectl get pod <name>` xem STATUS; nếu `Pending`, dùng `kubectl describe`
  để xem lý do Pending, không phải `logs`.
- Với crash cũ (Pod đã restart nhiều lần): `--previous` chỉ lấy được lần crash NGAY TRƯỚC, không
  phải các lần cũ hơn.

**Không thấy event nào dù có vấn đề**
- Nguyên nhân: event đã hết TTL (mặc định 1 giờ) và bị xoá khỏi etcd.
- Cách phòng tránh production: cài centralized event logging (Sentry, event-exporter + Prometheus,
  hoặc đơn giản là ship K8s events sang EFK/Loki).
- Khi đã mất: xem log của controller-manager và kubelet ở tầng node (nếu có quyền SSH vào node).

**Log từ `-l` selector chỉ hiện log của 1 Pod**
- Nguyên nhân: mặc định `kubectl logs -l` giới hạn tối đa 5 Pod. Với Deployment nhiều replica,
  chỉ thấy 5 Pod đầu.
- Fix: thêm `--max-log-requests=<số>` để tăng giới hạn: `kubectl logs -l app=api -n prod --max-log-requests=20`

## 6. Tình huống thực tế

Điều tra incident: request latency tăng đột biến lúc 10:05 sáng, 1 số request trả 500.

```bash
# 1. Tổng quan trạng thái Pod
kubectl get pods -n production -l app=api-server

# 2. Events Warning trong giờ qua
kubectl get events -n production --field-selector type=Warning \
  --sort-by='.lastTimestamp' | grep api-server

# 3. Log từ tất cả replica trong 15 phút gần nhất
kubectl logs -n production -l app=api-server \
  --since=15m --prefix=true --tail=200 2>&1 | grep -i "error\|warn\|fail"

# 4. Focus Pod nào có error nhiều nhất
kubectl logs -n production -l app=api-server \
  --since=15m --prefix=true 2>&1 | grep "ERROR" | awk '{print $1}' | sort | uniq -c | sort -rn
# → thấy [pod/api-server-7d9f-p2m1] có 87 lần ERROR, các Pod khác < 5

# 5. Xem chi tiết Pod lỗi
kubectl describe pod api-server-7d9f-p2m1 -n production | grep -A 20 "^Events:"
# → thấy Warning FailedMount: "secret db-credentials not found"

# 6. Kết luận: Pod trên worker-3 không mount được Secret → trả 500
# Secret bị xoá/đổi tên, hoặc RBAC không đủ quyền mount Secret đó
```

Từ "latency tăng" đến "Secret missing trên 1 node cụ thể" trong 5 bước, dưới 5 phút.

## 7. Tự kiểm tra

1. `kubectl logs` chỉ lấy được log từ đâu? Có lấy được log của container đã bị xoá không?
   <details><summary>Đáp án</summary>`kubectl logs` đọc stdout/stderr của container từ file trên
   node (`/var/log/pods/...`). Khi Pod bị xoá, kubelet dọn log file đó — không còn lấy được.
   Chỉ lấy được log của: (1) container đang chạy; (2) container vừa crash/restart (lần crash ngay
   trước với `--previous`). Để xem log của Pod đã bị xoá hoàn toàn, cần centralized logging
   (Loki, Elasticsearch, Cloud Logging) đã ship log ra ngoài trước khi Pod bị xoá.</details>

2. Có 10 Pod trong Deployment. `kubectl logs -l app=myapp` chỉ hiện log của 5 Pod. Tại sao và
   cách lấy tất cả 10?
   <details><summary>Đáp án</summary>Mặc định `kubectl logs` với label selector giới hạn tối đa
   5 container (safety limit để tránh apiserver overload). Để lấy log từ tất cả 10 Pod: thêm
   `--max-log-requests=10` (hoặc số lớn hơn). Hoặc dùng centralized logging để aggregation
   không qua kubectl.</details>

3. Event TTL mặc định của K8s là bao lâu? Tại sao không nên set TTL quá dài?
   <details><summary>Đáp án</summary>Mặc định 1 giờ (`--event-ttl=1h` ở kube-apiserver). Không
   nên set quá dài vì Events được lưu trong etcd — etcd là single-point-of-truth của cả cluster,
   có giới hạn storage và performance. Nhiều Events tồn tại lâu = etcd lớn hơn = slower watch
   và backup. Production cần ghi Events ra ngoài (event-exporter, Loki) trước khi hết TTL, rồi
   giữ TTL ngắn để etcd nhẹ.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-troubleshooting.pod-errors` — workflow triage cơ bản dùng `describe` và
  `logs`; bài này đi sâu hơn vào kỹ thuật đọc.
- `container-k8s.k8s-troubleshooting.oom-resource` — OOMKill: kết hợp Events + logs + `kubectl
  top` để phân tích.

**Bài liên quan ngoài module (xem thêm):**
- `container-k8s.k8s-architecture.control-plane` — controller-manager và kubelet tạo Events;
  hiểu ai tạo event nào giúp đọc Events đúng nghĩa.

**Nguồn tham khảo:**
- [Logging Architecture — kubernetes.io](https://kubernetes.io/docs/concepts/cluster-administration/logging/)
  — node-level logging, cluster-level logging, streaming sidecar.
- [kubectl logs reference — kubernetes.io](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_logs/)
  — tất cả flag `logs` với mô tả chính xác.
- [kubectl get reference — kubernetes.io](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_get/)
  — `--sort-by`, `--field-selector`, output format.
