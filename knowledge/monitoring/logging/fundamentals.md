---
id: monitoring.logging.fundamentals
title: "Logging tập trung: vì sao cần, structured log"
domain: monitoring
module: monitoring.logging
level: "nền tảng"
prerequisites: []
applies_to:
  - "Concept-level — không phụ thuộc platform cụ thể; ví dụ dùng RFC 5424 (syslog), JSON log format, và trường hợp chung"
status: verified
sources:
  - "https://www.rfc-editor.org/rfc/rfc5424"
  - "https://12factor.net/logs"
  - "https://opentelemetry.io/docs/concepts/signals/logs/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Không có centralized logging = khi incident xảy ra trên 10 server, phải SSH từng máy đọc
`/var/log/` riêng lẻ. Khi container bị restart, log biến mất. Khi app crash, không có context
trước đó để debug. Centralized logging giải quyết: tất cả log về 1 chỗ, tìm kiếm được, có thể
tương quan giữa service, giữ lịch sử. Bài này đặt nền tảng: tại sao cần centralized logging,
structured log là gì và tại sao quan trọng, mức độ log nào nên dùng khi nào.

## 2. Khái niệm cốt lõi

**Distributed logging challenge**: trong môi trường nhiều service, mỗi service log riêng ra
file riêng trên máy riêng. Khi debug 1 user request đi qua 5 service → phải xem log trên 5 máy
khác nhau, khớp timestamp thủ công. Container/ephemeral workload: log mất khi container restart.
Centralized logging gom tất cả log về 1 platform — tìm kiếm, lọc, tương quan.

**Unstructured vs Structured log**:
- **Unstructured**: `"2026-10-06 10:05:33 ERROR Failed to connect to DB: connection refused"`
  — con người đọc được nhưng machine cần regex phức tạp để parse.
- **Structured (JSON)**: `{"level":"error","ts":"2026-10-06T10:05:33Z","msg":"DB connect failed","error":"connection refused","service":"api","trace_id":"abc123"}`
  — machine parse dễ dàng, filter theo field, aggregate theo service/level.

**Log levels** (theo convention phổ biến của logging framework, lấy cảm hứng từ RFC 5424):
- `DEBUG`: thông tin chi tiết nhất — chỉ bật ở dev/staging, không nên dùng production thường
  xuyên (tốn storage, performance impact).
- `INFO`: luồng bình thường của app — "User logged in", "Request processed in 45ms".
- `WARNING`/`WARN`: có vấn đề nhưng app vẫn chạy — "Retry attempt 2/3", "Deprecated API used".
- `ERROR`: lỗi nhưng app tiếp tục chạy — "Failed to send email, will retry".
- `CRITICAL`/`FATAL`: lỗi nghiêm trọng, app không thể tiếp tục — thường kèm process exit.

RFC 5424 thực tế định nghĩa 8 mức có tên chuẩn: Emergency(0), Alert(1), Critical(2), Error(3),
Warning(4), Notice(5), Informational(6), Debug(7) — Emergency là cao nhất (mã 0). Hầu hết
framework (Python `logging`, Log4j, Node.js Winston...) dùng subset đơn giản hơn và đổi tên
(INFO thay vì Informational, FATAL thay vì Emergency...). Trong thực tế vận hành, dùng tên
theo framework — chỉ cần nhớ thứ tự nghiêm trọng tăng dần.

**Retention**: log không nên giữ mãi mãi. Dữ liệu cũ ít có giá trị debugging, tốn storage.
Chiến lược phổ biến: hot tier (7-30 ngày, SSD, tìm kiếm nhanh) → warm tier (30-90 ngày, HDD,
tìm kiếm chậm hơn) → cold tier (> 90 ngày, object storage, chỉ audit/compliance).

**The 12-Factor App Logging principles**: app chỉ nên emit log ra `stdout` — không ghi file, không
quản lý rotation. Infra layer (container runtime, systemd) forward log ra nơi cần thiết. Giúp
app đơn giản hơn và portable giữa các platform (container, VM, bare metal).

**Correlation / Trace ID**: key kỹ thuật để debug microservices. Mỗi incoming request nhận 1
unique ID (trace ID), truyền qua tất cả service downstream trong header. Tất cả log trong 1 flow
có cùng trace_id → tìm kiếm `trace_id="abc123"` cho thấy toàn bộ journey.

## 3. Cách nó hoạt động

**Log pipeline phổ biến**:

```
App (stdout/file) → Collector (Filebeat/Fluent Bit/Vector)
                 → Buffer/Queue (Kafka - optional, tránh mất log khi collector overload)
                 → Processor (Logstash/Fluentd - parse, enrich, filter)
                 → Storage (Elasticsearch/OpenSearch/Loki/Splunk)
                 → UI (Kibana/Grafana/Splunk UI)
```

**Push vs Pull**:
- **Push (phổ biến)**: Agent/collector trên host đọc log file hoặc stdout, forward đến central
  storage. Agent chủ động gửi — gần real-time, tốt cho ephemeral container.
- **Pull**: central platform gọi đến agent để lấy log. Ít phổ biến hơn cho logging (phổ biến
  hơn cho metrics, xem thêm `monitoring.prometheus-grafana.fundamentals`).

**Log enrichment**: collector có thể thêm metadata vào log trước khi gửi đến storage:
- Hostname, IP, container ID, Kubernetes pod/namespace/label
- Environment (production, staging)
- Service version
- Giúp filter và aggregate mà không cần app phải tự thêm

**Parsing unstructured log**: nếu app log plain text, collector dùng regex/grok pattern để
parse thành field. Ví dụ Apache access log:
```
192.168.1.1 - - [06/Oct/2026:10:05:33 +0700] "GET /api/users HTTP/1.1" 200 1234
```
→ parse thành: `{client_ip: "192.168.1.1", method: "GET", path: "/api/users", status: 200, bytes: 1234}`

## 4. Thực hành

**Structured log với Python** (`structlog` library):

```python
import structlog
log = structlog.get_logger()

# Emit structured log
log.info("user.login", user_id=12345, ip="192.168.1.1", success=True)
log.error("db.connect.failed",
          host="db-primary.internal",
          error=str(e),
          retry_count=retry)

# Output (JSON):
# {"event":"user.login","user_id":12345,"ip":"192.168.1.1","success":true,"timestamp":"...","level":"info"}
```

**Structured log với Node.js** (`pino` library):

```javascript
const logger = require('pino')()
logger.info({ userId: 123, action: 'purchase', amount: 99.99 }, 'Order placed')
// {"level":30,"time":1728208833000,"msg":"Order placed","userId":123,"action":"purchase","amount":99.99}
```

**Trace ID propagation** (HTTP middleware):

```python
import uuid
from flask import Flask, request, g
import structlog

app = Flask(__name__)

@app.before_request
def set_trace_id():
    # Lấy trace ID từ upstream hoặc tạo mới
    g.trace_id = request.headers.get('X-Trace-ID', str(uuid.uuid4()))

@app.route('/api/orders')
def create_order():
    log = structlog.get_logger().bind(trace_id=g.trace_id, service='order-service')
    log.info("order.create.start", user_id=request.json.get('user_id'))
    # ... logic ...
    # Khi gọi service khác: thêm X-Trace-ID header
    # requests.post(inventory_url, headers={"X-Trace-ID": g.trace_id}, ...)
    log.info("order.create.success", order_id=new_order.id)
```

**Tìm kiếm log** — ví dụ trên hệ thống đã có centralized logging:

```
# Tìm tất cả log của 1 request (Elasticsearch/Kibana query):
trace_id: "abc-123-xyz"

# Lọc ERROR trong 1 giờ từ service api-gateway:
level: "error" AND service: "api-gateway" AND @timestamp:[now-1h TO now]

# Xem tất cả log của user 12345 trong ngày hôm nay:
user_id: 12345 AND @timestamp:[now/d TO now]
```

**Log rotation** (khi phải ghi file, không dùng stdout):

```bash
# /etc/logrotate.d/myapp
/var/log/myapp/*.log {
    daily           # rotate hàng ngày
    rotate 7        # giữ 7 file cũ
    compress        # gzip file cũ
    delaycompress   # compress sau 1 ngày (tránh compress file đang ghi)
    missingok       # không báo lỗi nếu file không tồn tại
    notifempty      # không rotate nếu file rỗng
    postrotate      # signal app reload sau khi rotate
        systemctl reload myapp
    endscript
}
```

## 5. Lỗi thường gặp và cách chẩn đoán

**DEBUG log tràn storage trong production**
- Nguyên nhân: bật log level DEBUG (hoặc ALL) trên production — thường do dev quên đổi level.
- Cách phòng tránh: log level set qua environment variable (`LOG_LEVEL=info`), không hardcode.
  Nhiều framework hỗ trợ dynamic log level change không cần restart.
- Chi phí: 1 service high-traffic với DEBUG có thể tạo GB log/giờ — storage và ingestion cost
  tăng đột biến.

**Log không có context — chỉ thấy "Error occurred"**
- Nguyên nhân: log message quá generic, thiếu field contextual.
- Cách fix (không đổi framework, chỉ thêm field):
  ```python
  # Tệ:
  logger.error("Error occurred")
  # Tốt:
  logger.error("payment.failed", user_id=user.id, amount=order.total,
               payment_method=payment.type, error=str(e), order_id=order.id)
  ```
  Rule: mỗi log phải có đủ context để debug KHÔNG cần xem thêm log nào khác.

**Log mất khi container restart**
- Nguyên nhân: app ghi vào file bên trong container, không forward ra ngoài. Container runtime
  chỉ capture stdout/stderr.
- Cách fix: đảm bảo app log ra stdout (không phải file), hoặc mount volume cho log file và cài
  log collector đọc từ đó.

## 6. Tình huống thực tế

Thiết kế logging strategy cho microservices mới:

```
1. Standard: tất cả service emit JSON log ra stdout
   Format chuẩn: {timestamp, level, service, version, trace_id, msg, ...fields}

2. Collector: Fluent Bit DaemonSet (1 per K8s node)
   → Đọc log từ /var/log/containers/*.log
   → Thêm K8s metadata (pod name, namespace, labels)
   → Forward đến Elasticsearch

3. Retention: 30 ngày trong Elasticsearch (hot tier, SSD)
   → Sau 30 ngày: snapshot sang S3 (cold tier) nếu cần compliance

4. Kibana dashboard:
   → Error rate per service (last 1h)
   → Top 10 error message today
   → Search by trace_id khi debug incident

5. Alert: Elasticsearch watcher hoặc Kibana alert
   → Fire khi error count per minute > threshold
```

## 7. Tự kiểm tra

**Câu 1**: Tại sao 12-Factor App khuyến nghị log ra `stdout` thay vì ghi file?

a) Vì ghi ra file luôn chậm hơn stdout do phải chờ disk I/O đồng bộ mỗi dòng log
b) App không nên quản lý rotation, compression, hay destination của log — đó là responsibility của infra layer
c) Vì stdout được mã hoá tự động còn file log thì không, an toàn hơn cho dữ liệu nhạy cảm
d) Vì hầu hết ngôn ngữ lập trình không hỗ trợ API ghi file, chỉ hỗ trợ stdout

**Đáp án: b** — App không nên tự quản lý rotation/destination log — đó là việc của infra
layer. stdout giúp app portable giữa dev/container/VM mà không cần mount volume riêng. Lý do
cốt lõi là TRÁCH NHIỆM (separation of concerns), không phải tốc độ I/O (loại a); stdout không
tự mã hoá — bảo mật log là vấn đề riêng, không liên quan tới lựa chọn stdout vs file (loại c);
hầu hết ngôn ngữ ĐỀU hỗ trợ ghi file, lý do khuyến nghị không nằm ở hạn chế kỹ thuật này (loại
d).

---

**Câu 2**: Tại sao trace ID quan trọng trong microservices, và ai tạo ra trace ID đầu tiên?

a) Trace ID chỉ quan trọng trong monolith, không áp dụng cho microservices vì mỗi service đã
   có log riêng
b) Trace ID luôn do database tạo ra đầu tiên khi ghi transaction, không phải edge service hay
   client
c) Trong microservices, 1 user request có thể qua 5-10 service
d) Trace ID không cần thiết nếu mọi service đã dùng cùng timestamp format, timestamp đủ để
   khớp log

**Đáp án: c** — Microservices có request qua nhiều service; trace ID giúp theo dõi toàn bộ
lifecycle. Tạo bởi edge service/client, forward tiếp nếu đã có. Trace ID QUAN TRỌNG HƠN chính
xác trong microservices (nhiều service tham gia 1 request), monolith ít cần vì mọi thứ trong
1 process (loại a); database không phải nơi tạo trace ID — nó được tạo ở EDGE của hệ thống
trước khi vào service nào (loại b); timestamp không đủ để khớp chính xác (nhiều request đồng
thời cùng thời điểm), đó chính là lý do cần trace ID riêng biệt (loại d).

---

**Câu 3**: Log level `WARNING` vs `ERROR` — nên chọn level nào khi một background job fail
nhưng sẽ được retry?

a) ERROR — mọi lần job fail đều phải log ERROR ngay cả khi sẽ retry thành công sau đó
b) Không có khác biệt, WARNING và ERROR chỉ là tên gọi khác nhau cho cùng mức độ nghiêm trọng
c) INFO — vì retry là hành vi bình thường của hệ thống, không cần log ở mức cao hơn INFO
d) WARNING — vì app vẫn tiếp tục chạy và có cơ chế xử lý (retry). ERROR nên dùng khi fail cuối cùng sau khi đã retry hết

**Đáp án: d** — WARNING vì app vẫn tiếp tục chạy, có cơ chế retry. ERROR dành cho fail cuối
cùng sau khi đã retry hết. Dùng ERROR cho MỌI lần fail (kể cả retry thành công sau đó) gây
alert fatigue — chính là vấn đề cần tránh (loại a); hai level có mức độ nghiêm trọng khác
nhau rõ rệt theo convention logging chuẩn, không phải tên gọi tương đương (loại b); INFO quá
NHẸ cho một lỗi thật (dù sẽ retry) — WARNING phản ánh đúng mức "có vấn đề nhưng đang xử lý"
(loại c).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `monitoring.logging.elk-stack` — ELK/Elastic stack: implementation của centralized logging.
- `monitoring.logging.splunk-basics` — Splunk: platform enterprise cho centralized logging.

**Bài liên quan ngoài module (xem thêm):**
- `monitoring.prometheus-grafana.fundamentals` — pull model của Prometheus: contrast với push
  model của centralized logging.
- `monitoring.alerting-design.principles` — alert design: log-based alert là một trong các
  sources của alert.

**Nguồn tham khảo:**
- [RFC 5424 — The Syslog Protocol](https://www.rfc-editor.org/rfc/rfc5424)
  — chuẩn log severity levels (Emergency → Debug).
- [12-Factor App: Logs — 12factor.net](https://12factor.net/logs)
  — nguyên tắc app log ra stdout, treat log as event stream.
- [OpenTelemetry Logs — opentelemetry.io](https://opentelemetry.io/docs/concepts/signals/logs/)
  — logs trong observability context, trace correlation.
