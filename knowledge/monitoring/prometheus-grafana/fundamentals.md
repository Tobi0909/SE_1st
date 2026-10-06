---
id: monitoring.prometheus-grafana.fundamentals
title: "Prometheus: pull model, loại metric, PromQL cơ bản"
domain: monitoring
module: monitoring.prometheus-grafana
level: "nền tảng"
prerequisites: []
applies_to:
  - "Prometheus 2.x — pull model, TSDB, PromQL; các tính năng mô tả đây ổn định từ Prometheus 2.0 (2017)"
status: draft
sources:
  - "https://prometheus.io/docs/introduction/overview/"
  - "https://prometheus.io/docs/concepts/metric_types/"
  - "https://prometheus.io/docs/prometheus/latest/querying/basics/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Prometheus không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Prometheus documentation chính thức.

Prometheus là hệ thống monitoring tiêu chuẩn de facto cho cloud-native stack — được tích hợp
sẵn trong Kubernetes (metrics-server, kube-state-metrics), hầu hết service mesh (Istio, Linkerd),
và hàng trăm exporter cho database, OS, hardware. Không hiểu Prometheus = không thể đọc alert
rule, không thể viết query để debug incident trên Grafana, không thể cài Prometheus stack mới.
Bài này đặt nền tảng: pull model khác gì push, 4 loại metric nghĩa là gì, và cách viết PromQL
query đủ dùng cho daily ops.

## 2. Khái niệm cốt lõi

**Pull model**: Prometheus tự động gọi đến target (app/exporter) qua HTTP để scrape metric,
theo interval cấu hình (mặc định 15s, thường set 30s-60s cho production). Target expose HTTP
endpoint `/metrics` trả về text format. Khác với push model (Zabbix agent gửi data) — Prometheus
biết chính xác khi nào scrape thành công hay thất bại, tránh data giả khi target down.

**Time series**: mỗi metric trong Prometheus là một **time series** — chuỗi cặp (timestamp,
value). Được định danh bởi **metric name** + **labels** (key-value pairs). Ví dụ:
`http_requests_total{method="GET",status="200",handler="/api"}` là 1 time series khác với
`http_requests_total{method="POST",status="500",handler="/api"}`.

**4 loại metric** (Prometheus metric types):

| Type | Ý nghĩa | Ví dụ |
|---|---|---|
| **Counter** | Giá trị chỉ tăng (reset khi restart) | số request, số lỗi, bytes gửi |
| **Gauge** | Giá trị có thể tăng/giảm tùy thời điểm | RAM đang dùng, nhiệt độ CPU, goroutine |
| **Histogram** | Phân phối giá trị theo bucket; tự có `_count` và `_sum` | request latency, response size |
| **Summary** | Tương tự histogram nhưng tính quantile phía client; ít linh hoạt hơn | request latency (pre-computed quantile) |

**Counter vs Gauge**: lỗi phổ biến nhất là dùng gauge cho counter metric. Counter phải dùng
`rate()` hoặc `increase()` để có ý nghĩa — giá trị raw của counter ít hữu ích (chỉ là tổng
cộng từ khi start). Gauge lấy value trực tiếp (`memory_bytes_used`).

**Labels**: chiều thêm (dimension) cho metric. Label tốt: `method`, `status`, `handler`,
`instance`, `job`. Label nguy hiểm: user_id, session_id, email — **cardinality cao** (hàng
triệu unique values) làm TSDB phình to và query chậm. Rule: label không nên có cardinality
> vài nghìn unique values.

**Exporter**: service trung gian expose metric của app/system không native support Prometheus
— `node_exporter` (Linux OS metrics), `mysqld_exporter` (MySQL), `blackbox_exporter` (HTTP/TCP
health check), `snmp_exporter` (SNMP)...

## 3. Cách nó hoạt động

**Scrape config** trong `prometheus.yml`:

```yaml
global:
  scrape_interval: 30s       # scrape mỗi 30s
  evaluation_interval: 30s   # evaluate rule mỗi 30s

scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['192.168.1.10:9100', '192.168.1.11:9100']  # node_exporter port

  - job_name: 'app'
    metrics_path: '/metrics'   # mặc định, có thể override
    static_configs:
      - targets: ['app:8080']

  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:     # Service Discovery từ K8s API
      - role: pod
    relabel_configs: ...       # filter + rename label từ K8s annotations
```

**Storage**: Prometheus lưu data dạng TSDB (Time Series Database) trên local disk (mặc định
`/prometheus` hoặc `--storage.tsdb.path`). Mặc định giữ 15 ngày (`--storage.tsdb.retention.time`).
Không có built-in replication — high availability qua Thanos hoặc VictoriaMetrics ở tầng ngoài.

**PromQL — query language**:
- `metric_name{label="value"}` — filter time series theo label
- `rate(counter[5m])` — rate per-second của counter trong 5 phút
- `increase(counter[1h])` — total increase trong 1 giờ
- `sum(metric) by (label)` — aggregate theo label
- `histogram_quantile(0.95, rate(histogram_bucket[5m]))` — P95 latency

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Prometheus documentation.

**`/metrics` endpoint của node_exporter**:

```
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} 1.23456789e+06
node_cpu_seconds_total{cpu="0",mode="user"} 12345.67
node_cpu_seconds_total{cpu="1",mode="idle"} 1.23412345e+06

# HELP node_memory_MemAvailable_bytes Memory information field MemAvailable.
# TYPE node_memory_MemAvailable_bytes gauge
node_memory_MemAvailable_bytes 2.147483648e+09

# HELP http_request_duration_seconds HTTP request latencies in seconds.
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.005"} 24054
http_request_duration_seconds_bucket{le="0.01"} 33444
http_request_duration_seconds_bucket{le="0.025"} 100392
http_request_duration_seconds_bucket{le="+Inf"} 144320
http_request_duration_seconds_sum 53423.147
http_request_duration_seconds_count 144320
```

`# HELP` và `# TYPE` là metadata — Prometheus không lưu, chỉ dùng để validate type.

**PromQL queries thường dùng**:

```promql
# CPU usage % (không phải idle) trên tất cả CPU, trung bình 5 phút
100 - avg by (instance) (
  rate(node_cpu_seconds_total{mode="idle"}[5m])
) * 100

# RAM available % theo host
node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100

# HTTP request rate (request/s) theo status code
sum by (status) (
  rate(http_requests_total[5m])
)

# P95 request latency
histogram_quantile(0.95,
  sum by (le) (
    rate(http_request_duration_seconds_bucket[5m])
  )
)

# Error rate % (5xx / all requests)
sum(rate(http_requests_total{status=~"5.."}[5m])) /
sum(rate(http_requests_total[5m])) * 100

# Disk sắp đầy trên mount point /
(node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_avail_bytes{mountpoint="/"}) /
node_filesystem_size_bytes{mountpoint="/"} * 100
```

**Kiểm tra target status** — Prometheus UI:

```
http://prometheus:9090/targets
→ Danh sách tất cả target với trạng thái (UP/DOWN) và thời gian scrape cuối
→ Error message nếu target không reach được (connection refused, timeout...)
```

**Recording rules** — pre-compute query phức tạp để dùng lại:

```yaml
# prometheus-rules.yaml
groups:
  - name: cpu.rules
    interval: 60s
    rules:
      - record: job:node_cpu_usage:avg5m
        expr: |
          100 - avg by (instance, job) (
            rate(node_cpu_seconds_total{mode="idle"}[5m])
          ) * 100
```

Query `job:node_cpu_usage:avg5m` thay vì viết lại expression dài — nhanh hơn và nhất quán.

## 5. Lỗi thường gặp và cách chẩn đoán

**Counter metric giảm đột ngột về 0 rồi tăng lại**
- Nguyên nhân: counter reset khi app restart. Đây là behavior đúng — counter chỉ reset khi
  process restart. `rate()` và `increase()` tự xử lý reset (`rate()` phát hiện decrease và
  giả định reset xảy ra ở 0, không trả về giá trị âm).
- Cách phân biệt: nếu value drop về 0 = restart; nếu rate/increase suddenly drops to 0 =
  app đang không nhận request, không phải restart.

**`rate()` trả về `no data` hoặc empty result**
- Nguyên nhân phổ biến: (1) metric không phải Counter (gauge không dùng `rate()`); (2) time
  range quá ngắn (cần ít nhất 2 data point trong range — `rate(metric[1m])` cần 2 scrape trong
  1 phút); (3) target đang DOWN.
- Rule of thumb: time range cho `rate()` nên ít nhất 4× scrape interval (scrape 30s → range ≥ 2m).

**High cardinality — Prometheus chậm, memory tăng không kiểm soát**
- Nguyên nhân: label có cardinality cao (user_id, URL path với dynamic segment `/api/users/123`).
- Cách phát hiện: `prometheus_tsdb_head_series` metric — số time series đang active. > 1M
  series = bắt đầu có vấn đề.
- Cách xử lý: bỏ label cardinality cao khỏi metric, hoặc dùng relabeling để drop label trước
  khi lưu vào TSDB.

## 6. Tình huống thực tế

Tìm root cause của incident: latency tăng đột biến lúc 14:30.

```promql
-- 1. Tổng request rate (có tăng không?)
sum(rate(http_requests_total[5m]))

-- 2. Error rate (có nhiều 5xx không?)
sum(rate(http_requests_total{status=~"5.."}[5m])) /
sum(rate(http_requests_total[5m]))

-- 3. P95 latency theo endpoint (endpoint nào chậm?)
histogram_quantile(0.95,
  sum by (le, handler) (rate(http_request_duration_seconds_bucket[5m]))
)

-- 4. CPU/RAM của app instance lúc đó
avg by (instance) (
  rate(node_cpu_seconds_total{mode!="idle"}[5m])
) * 100

-- 5. DB connection pool exhausted?
pg_stat_activity_count{state="active"} / pg_settings_max_connections
```

Quy trình: xem error rate → xem P95 latency theo endpoint → xem resource usage → xem DB metrics
→ khoanh vùng nguyên nhân.

## 7. Tự kiểm tra

1. Metric `http_requests_total` là Counter hay Gauge? Tại sao cần `rate()` thay vì dùng
   value trực tiếp?
   <details><summary>Đáp án</summary>Counter — tên `_total` suffix là convention đánh dấu
   counter. Value trực tiếp là tổng cộng từ khi app start (có thể là 5 triệu request) — số
   này ít hữu ích. `rate(http_requests_total[5m])` trả về số request/giây trong 5 phút gần
   nhất — con số có ý nghĩa cho monitoring và alert. `rate()` cũng tự xử lý counter reset
   (khi app restart, counter về 0 nhưng rate không trả về âm).</details>

2. Tại sao label `user_id` nguy hiểm trong Prometheus, còn label `status` (HTTP 200/400/500)
   thì ổn?
   <details><summary>Đáp án</summary>Mỗi unique combination của labels tạo 1 time series riêng
   trong TSDB. `user_id` có thể có hàng triệu unique values → hàng triệu time series → TSDB
   phình to, query chậm, memory tăng vô hạn (high cardinality problem). `status` HTTP chỉ có
   ~5-10 unique values (200, 201, 400, 404, 500, 503...) → ~10 time series — không vấn đề.
   Nguyên tắc: label nên có cardinality thấp và bounded.</details>

3. Viết PromQL query tính tỷ lệ request lỗi (status 5xx) trong 5 phút gần nhất, theo
   từng service (`service` label)?
   <details><summary>Đáp án</summary>
   ```promql
   sum by (service) (
     rate(http_requests_total{status=~"5.."}[5m])
   ) /
   sum by (service) (
     rate(http_requests_total[5m])
   ) * 100
   ```
   `status=~"5.."` dùng regex match (5 + 2 ký tự bất kỳ). `sum by (service)` aggregate theo
   label service. Chia for cùng dimension `by (service)` để tính ratio đúng theo từng service.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `monitoring.prometheus-grafana.grafana-dashboards` — visualize PromQL query thành dashboard.
- `monitoring.prometheus-grafana.alertmanager` — Alertmanager nhận alert từ Prometheus rules.

**Bài liên quan ngoài module (xem thêm):**
- `monitoring.alerting-design.principles` — alert design: PromQL alert rule là implementation
  của nguyên tắc actionable alert.

**Nguồn tham khảo:**
- [Prometheus Overview — prometheus.io](https://prometheus.io/docs/introduction/overview/)
  — pull model, architecture, scrape, TSDB.
- [Metric Types — prometheus.io](https://prometheus.io/docs/concepts/metric_types/)
  — Counter, Gauge, Histogram, Summary với ví dụ.
- [Querying Basics — prometheus.io](https://prometheus.io/docs/prometheus/latest/querying/basics/)
  — PromQL syntax, selectors, functions, operators.
