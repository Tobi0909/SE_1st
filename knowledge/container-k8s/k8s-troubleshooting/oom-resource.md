---
id: container-k8s.k8s-troubleshooting.oom-resource
title: "OOMKilled và vấn đề resource request/limit sai"
domain: container-k8s
module: container-k8s.k8s-troubleshooting
level: "chuyên sâu"
prerequisites: ["container-k8s.k8s-workload.hpa-scaling"]
applies_to:
  - "Kubernetes 1.28+ — cgroup v2, OOM killer, resource management; áp dụng cho mọi cloud provider"
status: verified
sources:
  - "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/"
  - "https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/"
  - "https://kubernetes.io/docs/tasks/configure-pod-container/assign-cpu-resource/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

OOMKilled không báo trước — container đang chạy bình thường, đột ngột bị kill. Không biết cách
đọc OOM event, không biết tại sao `requests` và `limits` cần chính xác, và không biết cách sizing
đúng = cluster production có OOMKill thường xuyên mà không xử lý được. Bài này giải thích cơ chế
kernel OOM killer trong K8s context, cách phân biệt OOMKilled do limit thấp vs do memory leak,
và nguyên tắc sizing requests/limits để tránh cả OOMKilled lẫn resource waste.

## 2. Khái niệm cốt lõi

**`resources.requests` vs `resources.limits`** (recap nhanh từ bài prerequisites):
- `requests`: lượng tài nguyên scheduler dùng để chọn node — node phải có `allocatable` ≥ sum
  of all `requests` trên node. Container có thể dùng NHIỀU hơn `requests` nếu node còn tài nguyên.
- `limits`: ngưỡng trên kernel enforce — vượt `limits.memory` → OOMKill; vượt `limits.cpu` →
  CPU throttle (không kill).

**OOMKill mechanism**: khi container vượt `limits.memory`, kernel OOM killer gửi `SIGKILL` (không
phải SIGTERM — không có graceful shutdown) đến process. K8s ghi nhận `Reason: OOMKilled` trong
container status. Pod restart (nếu `restartPolicy: Always`).

**QoS classes** — K8s phân loại Pod theo requests/limits:
- `Guaranteed`: `requests == limits` cho CPU và memory, mọi container — được ưu tiên giữ lại khi
  node thiếu resource; ít bị evict nhất.
- `Burstable`: không phải Guaranteed — ít nhất 1 container có requests < limits, hoặc chỉ khai
  báo requests mà không có limits (hoặc ngược lại). Lưu ý: nếu Pod CHỈ khai báo limits (không
  khai báo requests), K8s tự set requests = limits → thực ra là Guaranteed, không phải Burstable.
- `BestEffort`: không khai báo requests lẫn limits — bị evict đầu tiên khi node bị memory pressure.

**CPU throttle vs OOMKill**: hai cơ chế khác nhau:
- CPU: không bao giờ kill process. Khi process muốn dùng nhiều hơn `limits.cpu`, kernel CFS
  throttle — process chạy chậm hơn, latency tăng, nhưng không crash.
- Memory: kernel kill ngay khi vượt ngưỡng. Không có "chậm dần" như CPU — đột ngột bị kill.

**Node pressure eviction**: khi node sắp hết memory (không phải container vượt limit), kubelet
tự evict Pod theo thứ tự QoS (BestEffort trước, Burstable sau, Guaranteed cuối) để giải phóng
tài nguyên.

## 3. Cách nó hoạt động

**Hai loại OOMKill cần phân biệt**:

1. **Container OOMKill** (limit): container vượt `limits.memory` của chính nó → kernel OOM killer
   kill process. Đây là "expected OOMKill" — limit đặt quá thấp cho workload, hoặc app có memory
   leak tăng dần.

2. **Node OOMKill** (node pressure): node gần hết tất cả memory (sum of all container usage
   vượt node `allocatable`) → OOM killer ở tầng node chọn process nào đó để kill dựa trên
   `oom_score`. Đây là "unexpected OOMKill" — thường bị khi có quá nhiều `BestEffort` Pod hoặc
   khi `requests` khai báo thấp hơn actual usage.

**`requests` thấp hơn actual usage = vấn đề ẩn**: scheduler thấy node "có đủ chỗ" dựa trên
`requests`, nhưng thực tế container dùng nhiều hơn. Nhiều container như vậy trên 1 node → node
overcommit → node OOM pressure → eviction/OOMKill không thể dự đoán. Đây là lý do `requests`
phải phản ánh actual typical usage, không phải "đặt thấp cho scheduler dễ schedule".

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

Xác nhận OOMKill:

```
$ kubectl get pods
NAME                        READY   STATUS             RESTARTS   AGE
app-7b9c-xp4r2              0/1     CrashLoopBackOff   3          12m

$ kubectl describe pod app-7b9c-xp4r2
Containers:
  app:
    Last State:  Terminated
      Reason:    OOMKilled
      Exit Code: 137
      Started:   Mon, 06 Oct 2026 10:05:00 +0700
      Finished:  Mon, 06 Oct 2026 10:05:42 +0700
    Limits:
      memory: 128Mi
    Requests:
      memory: 64Mi
Events:
  Warning  OOMKilling  1m  kernel  Memory cgroup out of memory: Killed process 42 (java)
```

Thông tin cần đọc: `Reason: OOMKilled`, `Exit Code: 137`, `Limits.memory: 128Mi` — app dùng hơn
128Mi trước khi bị kill.

Xem resource usage thực tế (cần metrics-server):

```
$ kubectl top pod app-7b9c-xp4r2
NAME               CPU(cores)   MEMORY(bytes)
app-7b9c-xp4r2     45m          121Mi

# Pod đang ở 121Mi / limit 128Mi → sẽ sớm bị OOMKill tiếp
```

Kiểm tra QoS class của Pod:

```
$ kubectl get pod app-7b9c-xp4r2 -o jsonpath='{.status.qosClass}'
Burstable
```

`Burstable` vì `requests` (64Mi) ≠ `limits` (128Mi). Đây là hợp lý cho app có burst nhưng cần
biết QoS ảnh hưởng eviction order.

Sizing pattern cho Java app:

```yaml
resources:
  requests:
    memory: "512Mi"    # heap mặc định JVM + overhead OS; đặt theo P50 actual usage
    cpu: "250m"        # startup thường cần nhiều hơn steady state — đặt theo P50
  limits:
    memory: "768Mi"    # đặt theo P99 + buffer 20-30% để tránh OOMKill ở peak
    cpu: "1000m"       # CPU limit: throttle (không kill), đặt cao hơn
```

**Quy tắc sizing thực tế**:
- `requests.memory`: đặt theo P50 actual memory usage (xem `kubectl top` hoặc Prometheus metric
  `container_memory_working_set_bytes`). Đây là gì node thấy khi scheduling.
- `limits.memory`: đặt theo P99 + 20-30% buffer. Quá thấp → OOMKill thường xuyên. Quá cao →
  node overcommit, tăng nguy cơ node OOM.
- `requests.cpu`: đặt theo average (P50) CPU usage. CPU throttle không crash app, nhưng latency
  tăng nếu limit quá thấp.
- `limits.cpu`: tùy app. Latency-sensitive app: set cao hoặc không set (unbounded). Batch job:
  set thấp hơn để scheduling fair.

Phân biệt OOMKill do limit thấp vs memory leak:

```
# Scenario A: limit thấp — memory tăng nhanh từ đầu và ổn định
# kubectl top pod --watch → memory tăng đến ~limit rồi bị kill
# → fix: tăng limits.memory

# Scenario B: memory leak — memory tăng chậm dần theo thời gian
# kubectl top pod --watch → memory tăng đều không ngừng qua nhiều giờ/ngày
# Pod restart, memory lại từ đầu, rồi tăng tiếp
# → fix: tìm leak trong code, tăng limits chỉ là tình thế
```

## 5. Lỗi thường gặp và cách chẩn đoán

**OOMKill liên tục dù đã tăng limits**
- Nguyên nhân: memory leak — app dùng memory tăng không giới hạn. Tăng limit chỉ kéo dài thời
  gian trước khi crash, không fix gốc.
- Cách chẩn đoán: `kubectl top pod` theo thời gian (hoặc Prometheus graph) — nếu memory tăng
  đều liên tục giữa các restart, đó là leak.
- Cách xử lý: profile app (heap dump cho JVM, pprof cho Go...). `kubectl exec <pod> -- <profiling-cmd>`
  trong lần "còn sống" để lấy snapshot.

**Nhiều Pod bị evict không rõ lý do trên cùng 1 node**
- Nguyên nhân: node memory pressure — sum of actual usage của các container vượt node memory.
  Thường do `requests` khai báo thấp hơn actual usage (scheduler overcommit node).
- Cách chẩn đoán: `kubectl describe node <name>` → `Conditions: MemoryPressure = True`; xem
  `kubectl get events --field-selector reason=Evicted`.
- Cách xử lý: tăng `requests` để phản ánh actual usage chính xác → scheduler phân bổ Pod đều
  hơn, giảm overcommit.

**CPU throttle cao nhưng app không crash**
- Nguyên nhân: `limits.cpu` quá thấp so với peak CPU usage — latency tăng nhưng không OOMKill.
- Cách chẩn đoán: Prometheus metric `container_cpu_cfs_throttled_seconds_total` — nếu cao,
  container bị throttle nhiều.
- Cách xử lý: tăng `limits.cpu` hoặc tách Pod sang node có nhiều CPU hơn.

## 6. Tình huống thực tế

Điều tra và fix OOMKill cho Java microservice trên K8s:

1. **Xác nhận**: `kubectl get pods` thấy `CrashLoopBackOff`, `RESTARTS: 5+`, `kubectl describe`
   thấy `Reason: OOMKilled` với `limits.memory: 256Mi`.

2. **Đo actual usage**: `kubectl top pod -l app=payment-service` trong 1 giờ bình thường →
   peak usage ~ 210Mi, average ~ 150Mi.

3. **Quyết định sizing**:
   - Peak 210Mi + 30% buffer = 273Mi → set `limits.memory: 300Mi`
   - Average 150Mi → set `requests.memory: 150Mi`

4. **Update Deployment** (sửa manifest, apply — không patch Pod trực tiếp):
   ```yaml
   resources:
     requests:
       memory: "150Mi"
       cpu: "200m"
     limits:
       memory: "300Mi"
       cpu: "500m"
   ```

5. **Verify**: sau khi rolling update, `kubectl top pod` xác nhận memory ổn định dưới limit,
   không còn OOMKill.

6. **Monitor tiếp**: theo dõi 24-48h để phát hiện memory leak (nếu memory vẫn tăng dần dù đã
   tăng limit).

## 7. Tự kiểm tra

**Câu 1**: Tại sao `limits.cpu` thấp không gây crash nhưng `limits.memory` thấp gây OOMKill?

a) Vì CPU limit chỉ là gợi ý không bắt buộc, còn memory limit là ràng buộc cứng bắt buộc
   kernel enforce
b) Vì cả hai đều throttle giống nhau, chỉ khác tên hiển thị trong kubectl describe
c) Vì memory limit chỉ áp dụng cho container chạy trên cloud, không áp dụng khi chạy
   on-premise
d) CPU và memory dùng cơ chế kernel khác nhau. CPU được quản lý bởi CFS scheduler

**Đáp án: d** — CPU dùng CFS scheduler throttle (process chậm lại, không bị kill); memory
không có cơ chế throttle, OOM killer phải kill ngay. CPU limit cũng là ràng buộc THẬT (kernel
có enforce qua CFS), không phải chỉ gợi ý — sự khác biệt nằm ở CƠ CHẾ enforce (throttle vs
kill), không phải mức độ bắt buộc (loại a); hai cơ chế này KHÁC NHAU rõ rệt (throttle vs
OOMKill), không giống nhau chỉ khác tên (loại b); memory limit áp dụng nhất quán trên mọi hạ
tầng chạy Linux cgroup, không giới hạn chỉ cloud (loại c).

---

**Câu 2**: QoS class `BestEffort` vs `Guaranteed` ảnh hưởng gì đến eviction?

a) BestEffort (không có requests/limits) bị evict đầu tiên khi node memory pressure. Guaranteed
b) Guaranteed bị evict đầu tiên vì chiếm nhiều tài nguyên nhất; BestEffort được giữ lại lâu
   nhất
c) QoS class không ảnh hưởng gì tới thứ tự eviction, kubelet evict ngẫu nhiên khi memory
   pressure
d) BestEffort và Guaranteed có cùng độ ưu tiên eviction, chỉ Burstable mới bị evict trước

**Đáp án: a** — `BestEffort` evict đầu tiên; `Guaranteed` evict cuối cùng; `Burstable` ở giữa.
Dùng `Guaranteed` cho service quan trọng để tránh evict bất ngờ. Thứ tự bị đảo ngược hoàn toàn
trong lựa chọn b (loại b); QoS class CHÍNH LÀ tiêu chí kubelet dùng để quyết định thứ tự evict,
không phải ngẫu nhiên (loại c); ba QoS class có mức độ ưu tiên khác nhau rõ rệt
(BestEffort < Burstable < Guaranteed), không phải BestEffort/Guaranteed bằng nhau (loại d).

---

**Câu 3**: `requests.memory` của container khai báo 64Mi nhưng thực tế dùng 200Mi. Điều gì
xảy ra?

a) Container bị OOMKill ngay lập tức vì vượt quá requests.memory đã khai báo
b) Container KHÔNG bị OOMKill bởi requests — requests chỉ ảnh hưởng scheduling
c) Container bị giới hạn cứng ở 64Mi, mọi request vượt quá bị kernel từ chối cấp thêm memory
d) Scheduler sẽ tự động cập nhật requests.memory lên 200Mi ngay khi phát hiện usage thực tế
   cao hơn

**Đáp án: b** — Container KHÔNG bị OOMKill bởi requests — chỉ ảnh hưởng scheduling. Dùng được
200Mi nếu không vượt limits và node còn memory, nhưng gây overcommit nguy hiểm. `requests`
không phải ngưỡng kernel enforce — chỉ `limits` mới bị kernel chặn, requests chỉ dùng cho
scheduler (loại a); kernel không "từ chối cấp thêm memory" ở ngưỡng `requests` — container vẫn
dùng được memory vượt quá requests (loại c); `requests` là giá trị TĨNH do admin khai báo,
scheduler không tự động cập nhật theo usage thực tế (loại d).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-troubleshooting.pod-errors` — CrashLoopBackOff với exit code 137 là
  OOMKilled; bài đó giới thiệu workflow triage chung.
- `container-k8s.k8s-troubleshooting.logs-events` — đọc Events chi tiết hơn khi debug node
  pressure eviction.

**Bài liên quan ngoài module (xem thêm):**
- `container-k8s.k8s-workload.hpa-scaling` — requests là baseline HPA dùng để tính utilization;
  requests không chính xác = HPA không scale đúng lúc.
- `linux.performance.memory-swap` — cơ chế OOM killer và oom_score ở tầng Linux kernel.

**Nguồn tham khảo:**
- [Manage Resources for Containers — kubernetes.io](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
  — requests/limits, QoS, resource units.
- [Assign Memory Resources to Pods — kubernetes.io](https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/)
  — demo OOMKilled, limits, node pressure.
- [Assign CPU Resources to Pods — kubernetes.io](https://kubernetes.io/docs/tasks/configure-pod-container/assign-cpu-resource/)
  — throttling, CPU units (millicores), limits.
