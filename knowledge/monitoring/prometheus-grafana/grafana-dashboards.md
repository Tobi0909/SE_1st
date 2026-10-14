---
id: monitoring.prometheus-grafana.grafana-dashboards
title: "Grafana: nguồn dữ liệu, dashboard, panel"
domain: monitoring
module: monitoring.prometheus-grafana
level: "vận hành"
prerequisites: ["monitoring.prometheus-grafana.fundamentals"]
applies_to:
  - "Grafana 10.x/11.x — panel types, data source, dashboard JSON; phần lớn khái niệm tương thích ngược về Grafana 8+"
status: verified
sources:
  - "https://grafana.com/docs/grafana/latest/datasources/"
  - "https://grafana.com/docs/grafana/latest/panels-visualizations/"
  - "https://grafana.com/docs/grafana/latest/dashboards/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Grafana không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Grafana documentation chính thức.

Prometheus lưu data — Grafana hiển thị. Trong thực tế, mọi engineer vận hành đều phải đọc
dashboard Grafana khi có incident, và thường xuyên cần tạo panel mới hoặc sửa query. Biết cách
cấu hình data source, viết PromQL query cho đúng panel type, dùng variable để dashboard có thể
lọc theo instance/service — là kỹ năng ops thiết yếu. Dashboard chia sẻ qua JSON — biết đọc
và edit JSON giúp import/export dashboard nhanh.

## 2. Khái niệm cốt lõi

**Data Source**: kết nối Grafana với nguồn dữ liệu — Prometheus, Loki, Elasticsearch, InfluxDB,
MySQL, PostgreSQL... Mỗi data source cần URL + auth config. Một Grafana có thể có nhiều data
source cùng lúc; dashboard có thể mix nhiều data source.

**Dashboard**: tập hợp panel hiển thị cùng lúc. Dashboard có:
- **Time range selector**: chọn khoảng thời gian để xem (last 1h, last 24h, custom range)
- **Variables**: dropdown filter cho dashboard (chọn instance, environment, service...)
- **Rows**: nhóm panel theo chức năng/service

**Panel**: đơn vị hiển thị dữ liệu. Các loại panel phổ biến:
- **Time series**: đường biểu diễn metric theo thời gian (phổ biến nhất)
- **Stat**: 1 số duy nhất với thresholded color (CPU %, error count...)
- **Gauge**: tương tự Stat nhưng dạng gauge meter
- **Bar chart**: so sánh giữa nhóm (request count theo region)
- **Table**: dữ liệu dạng bảng (danh sách host với metric của từng host)
- **Heatmap**: phân phối theo thời gian (latency percentile heatmap)
- **Logs**: hiển thị log line (từ Loki hoặc Elasticsearch)

**Variables** trong dashboard: tham số động thay thế trong query. Ví dụ variable `$instance`
cho phép dropdown chọn instance — query `rate(node_cpu_seconds_total{instance="$instance"}[5m])`
tự filter theo selection. Loại variable:
- `Query`: lấy giá trị từ Prometheus/data source (ví dụ: `label_values(up, instance)` = list
  tất cả instance có metric `up`)
- `Custom`: list cố định do user nhập
- `Constant`: giá trị không đổi (environment name, base URL)
- `Text box`: nhập thủ công

**Dashboard JSON**: mỗi dashboard có thể export/import dưới dạng JSON. Grafana cũng có
"Grafana.com dashboards" marketplace — thousands of community dashboards có thể import bằng
dashboard ID (`Import → ID → Load`).

## 3. Cách nó hoạt động

**Query flow**: Grafana gọi API Prometheus (`/api/v1/query_range`) với PromQL query + time range.
Prometheus trả về time series data. Grafana render thành chart theo panel type.

**Thresholding**: panel có thể đổi màu dựa trên ngưỡng:
- `Stat` / `Gauge`: xanh (OK) → vàng (Warning) → đỏ (Critical) theo threshold
- `Time series`: background color hoặc thresholds line overlay

**Alert trong Grafana** (Grafana Alerting): tách biệt với Prometheus AlertManager. Grafana có
rule engine riêng, notify qua notification channel. Trong stack Prometheus, thường dùng
AlertManager của Prometheus cho alert, Grafana chỉ để visualize — nhưng Grafana Alert cũng
valid cho stack đơn giản hơn.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Grafana documentation.

**Thêm Prometheus data source**:

```
Grafana UI → Configuration (gear icon) → Data Sources → Add data source
→ Chọn "Prometheus"
→ URL: http://prometheus:9090
→ Scrape interval: 30s   (phải khớp với Prometheus scrape_interval)
→ Save & Test → "Data source is working"
```

**Tạo Time Series panel**:

```
Dashboard → Add panel → Visualization: Time series

Query (PromQL):
  100 - avg by (instance) (
    rate(node_cpu_seconds_total{mode="idle",instance="$instance"}[5m])
  ) * 100

Legend: {{instance}}        → tên series = label value instance
Unit: percent (0-100)
Min: 0, Max: 100

Thresholds:
  Base: Green
  80: Yellow (Warning)
  90: Red (Critical)
```

**Tạo Stat panel** — hiển thị 1 số:

```
Query: avg(node_memory_MemAvailable_bytes{instance="$instance"}) / 
       avg(node_memory_MemTotal_bytes{instance="$instance"}) * 100

Calculation: Last (giá trị mới nhất)
Unit: percent (0-100)
Color mode: Background

Thresholds: 20 = Red, 30 = Yellow, > 30 = Green
(Cảnh báo khi RAM < 20%)
```

**Variable cho dashboard** — dropdown chọn instance:

```
Dashboard Settings → Variables → New variable
Name: instance
Type: Query
Data source: Prometheus
Query: label_values(up{job="node"}, instance)
  → Lấy tất cả unique value của label "instance" từ metric "up" job "node"

Multi-value: ON    → chọn nhiều instance cùng lúc
Include All option: ON   → chọn "All" để xem tất cả
```

Khi dùng `$instance` trong query với Multi-value, Grafana tự wrap thành regex:
`instance=~"host1|host2|host3"` — cú pháp đúng cho PromQL regex match. **Điều kiện**: query
phải dùng `=~"$instance"` — nếu dùng `="$instance"`, Grafana không chuyển sang regex và chỉ
match đúng khi chọn đúng 1 giá trị (multi-value sẽ không hoạt động).

**Import dashboard từ Grafana.com**:

```
Dashboard → Import → Dashboard ID (ví dụ):
  - 1860: Node Exporter Full (Linux OS metrics từ node_exporter)
  - 3662: Prometheus 2.0 Stats (xem trạng thái Prometheus chính nó)
  - 6417: Kubernetes Cluster (cần kube-state-metrics)

→ Load → Chọn data source (Prometheus đã cấu hình)
→ Import
```

Dashboard community cần check: metrics name có khớp với exporter version đang chạy không —
metric có thể đổi tên giữa các phiên bản.

**Export và version control dashboard**:

```
Dashboard → Share (icon) → Export → Save to file
→ grafana-dashboards/node-exporter-full.json

# Lưu vào git repository để version control
# Tránh mất dashboard khi Grafana reset hoặc migrate
```

Dashboard-as-code với Grafana: dùng `grafana_dashboard` resource trong Terraform, hoặc Grafonnet
(Jsonnet library), hoặc Grafana Operator cho K8s — nhưng phổ biến nhất vẫn là export JSON rồi
lưu vào git.

## 5. Lỗi thường gặp và cách chẩn đoán

**Panel hiển thị "No data"**
- Nguyên nhân phổ biến: (1) query sai (typo trong metric name, label filter không match); (2)
  time range không có data (chọn time range quá cũ); (3) data source connection fail; (4) metric
  chưa có data trong Prometheus.
- Cách debug: mở Explore (compass icon) → paste query → Run — xem error message cụ thể từ
  Prometheus; thử bỏ label filter để xem có metric name đó không.

**"Query Error" với Prometheus**
- Mở panel query → xem error message từ Prometheus. Thường: "vector matching multiple-to-one"
  (query dùng binary operation giữa 2 vector không cùng label set), "parse error" (syntax
  PromQL sai).

**Variable dropdown rỗng không có option**
- Nguyên nhân: query variable trả về empty (label không tồn tại, job không match, data source
  không có data trong time range).
- Cách debug: Dashboard Settings → Variables → [variable] → xem "Preview of values" — nếu
  rỗng, chạy query `label_values(...)` trong Explore để xem có data không.

**Dashboard hiển thị khác nhau giữa các user**
- Nguyên nhân: mỗi user có time zone và time range riêng. Đảm bảo dashboard dùng
  "Relative time" (last 1h) thay vì "Absolute time" cố định.

## 6. Tình huống thực tế

Xây dashboard "Service Health Overview" cho team:

```
Rows:
1. Traffic & Errors
   - Time series: request rate (req/s) theo service
   - Stat: error rate % (đỏ nếu > 1%)
   - Time series: P95 latency theo service

2. Resource Usage
   - Time series: CPU % theo pod
   - Time series: RAM usage theo pod
   - Gauge: disk usage % theo node

3. Infrastructure
   - Table: danh sách node với CPU/RAM/Disk metric
   - Stat: số Pod Running vs total

Variables:
- $namespace: label_values(kube_pod_info, namespace)
- $service: label_values(kube_pod_labels{namespace="$namespace"}, label_app)
- $environment: Custom = production, staging

Link từ overview → drill-down dashboard per service
(Dashboard links: Dashboard Settings → Links → Link to other dashboards)
```

## 7. Tự kiểm tra

**Câu 1**: Variable `$instance` được set multi-value ON. User chọn "host1" và "host2". Query
`rate(node_cpu_seconds_total{instance="$instance"}[5m])` có hoạt động đúng không? Tại sao?

a) Có, hoạt động đúng vì Grafana tự convert dấu = thành regex ngầm khi phát hiện multi-value
b) Không, vì multi-value chỉ hỗ trợ tối đa 1 giá trị được chọn tại 1 thời điểm
c) Có, nhưng chỉ khi cả 2 instance có cùng giá trị metric tại thời điểm query
d) KHÔNG trực tiếp — instance="$instance" dùng exact match. Khi multi-value, Grafana inject host1|host2 vào $instance

**Đáp án: d** — KHÔNG trực tiếp — `=` là exact match, không match được chuỗi `host1|host2`
như 2 giá trị riêng. Phải dùng `=~` (regex match). Grafana KHÔNG tự convert `=` thành regex —
người viết query phải tự chọn đúng toán tử `=~` (loại a); multi-value hỗ trợ CHỌN NHIỀU giá
trị cùng lúc — đó chính là ý nghĩa của "multi-value" (loại b); vấn đề nằm ở CÚ PHÁP toán tử
(`=` vs `=~`), không liên quan tới việc 2 instance có cùng giá trị metric hay không (loại c).

---

**Câu 2**: Dashboard đang dùng absolute time range (2026-10-01 to 2026-10-06). Vấn đề gì sẽ
xảy ra?

a) Dashboard chỉ hiện data cho đúng khoảng thời gian đó — không tự update
b) Dashboard tự động mở rộng time range thêm mỗi ngày để luôn bao gồm dữ liệu mới nhất
c) Không có vấn đề gì, absolute time range luôn tương đương relative time về mặt hiển thị
d) Dashboard sẽ báo lỗi và không load được data nếu dùng absolute time range quá 7 ngày

**Đáp án: a** — Dashboard chỉ hiện đúng khoảng cố định, không tự update. Cần relative time để
luôn hiện real-time. Absolute time KHÔNG tự mở rộng theo ngày — đây chính là vấn đề nó gây ra
(loại b); absolute và relative time có hành vi khác biệt rõ rệt (cố định vs theo thời điểm
hiện tại), không tương đương (loại c); không có giới hạn 7 ngày gây lỗi — absolute time range
hoạt động với khoảng thời gian bất kỳ, chỉ là không tự cập nhật (loại d).

---

**Câu 3**: Tại sao cần lưu dashboard JSON vào version control (git)?

a) Vì Grafana không có cách lưu dashboard nào khác ngoài git, bắt buộc phải commit để
   dashboard hoạt động
b) Grafana lưu dashboard trong database nội bộ (SQLite hoặc PostgreSQL)
c) Vì JSON trong git giúp Grafana render dashboard nhanh hơn so với đọc từ database
d) Vì git tự động đồng bộ 2 chiều với Grafana, sửa trên UI sẽ tự commit ngược lại repo

**Đáp án: b** — Grafana lưu dashboard trong database nội bộ; mất database/migrate/xoá nhầm sẽ
mất dashboard. Git cho lịch sử, review qua PR, restore dễ dàng. Dashboard hoạt động bình
thường mà KHÔNG CẦN git — git là biện pháp bảo vệ/quản lý thêm, không phải yêu cầu bắt buộc để
hoạt động (loại a); git không ảnh hưởng tốc độ render — Grafana vẫn đọc từ database khi chạy
(loại c); không có đồng bộ 2 chiều tự động — sửa trên UI KHÔNG tự commit ngược lại repo, đây
là lý do cần provisioning/quy trình riêng để đồng bộ (loại d).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `monitoring.prometheus-grafana.fundamentals` — PromQL syntax: cần biết để viết query đúng
  trong Grafana panel.
- `monitoring.prometheus-grafana.alertmanager` — alert routing: Grafana có thể hiển thị alert
  state từ Alertmanager.

**Bài liên quan ngoài module (xem thêm):**
- `monitoring.alerting-design.principles` — thiết kế dashboard theo nguyên tắc "mỗi panel phải
  actionable" — áp dụng khi xây Grafana dashboard cho production.

**Nguồn tham khảo:**
- [Data Sources — grafana.com](https://grafana.com/docs/grafana/latest/datasources/)
  — tất cả data source type, config, plugin.
- [Panels & Visualizations — grafana.com](https://grafana.com/docs/grafana/latest/panels-visualizations/)
  — time series, stat, gauge, table, heatmap...
- [Dashboards — grafana.com](https://grafana.com/docs/grafana/latest/dashboards/)
  — variables, links, provisioning, export/import.
