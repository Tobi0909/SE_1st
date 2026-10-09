---
id: monitoring.logging.elk-stack
title: "ELK/Elastic stack cơ bản: Logstash/Filebeat, Elasticsearch, Kibana"
domain: monitoring
module: monitoring.logging
level: "vận hành"
prerequisites: ["monitoring.logging.fundamentals"]
applies_to:
  - "Elasticsearch 8.x + Kibana 8.x + Filebeat 8.x — OpenSearch (AWS fork) tương tự nhưng UI khác; Elastic Stack 7.x tương tự về core"
status: verified
sources:
  - "https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html"
  - "https://www.elastic.co/guide/en/beats/filebeat/current/index.html"
  - "https://www.elastic.co/guide/en/kibana/current/index.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** ELK stack không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Elasticsearch/Kibana documentation chính thức.

ELK stack (Elasticsearch + Logstash + Kibana, sau này thêm Beats → "Elastic Stack") là platform
centralized logging phổ biến nhất trong môi trường on-premises và một phần cloud. Biết ELK nghĩa
là: cài Filebeat trên host để ship log, biết Elasticsearch index là gì (ảnh hưởng đến performance
và retention cost), biết tìm kiếm trong Kibana khi có incident. Không biết = phụ thuộc hoàn toàn
vào người khác mỗi lần cần debug.

## 2. Khái niệm cốt lõi

**Thành phần Elastic Stack**:
- **Elasticsearch**: distributed search & analytics engine — lưu và index log, cung cấp API
  tìm kiếm (full-text + structured). Built trên Apache Lucene.
- **Kibana**: web UI — tìm kiếm log (Discover), dashboard visualization, alert.
- **Filebeat**: lightweight agent đọc log file hoặc stdin, ship đến Elasticsearch hoặc Logstash.
  Dùng thay Logstash khi chỉ cần ship log đơn giản (không cần transform phức tạp).
- **Logstash**: pipeline xử lý log — nhận từ nhiều input (Filebeat, syslog, JDBC...), parse/
  transform/filter, gửi đến Elasticsearch. Cần khi: parse log format phức tạp, enrich với
  data từ DB, route log đến nhiều output.
- **Beats** (family): lightweight agent cho các loại data khác — Metricbeat (metrics), Packetbeat
  (network), Heartbeat (uptime)...

**Elasticsearch Index**: tập hợp document (log entries) được index cùng nhau. Tương tự database
table nhưng phân tán. Naming convention: `logs-nginx-2026.10.06` (tên-index + date) — ILM (Index
Lifecycle Management) tự rollover sang index mới mỗi ngày/tuần/khi đủ lớn.

**Document**: 1 log entry trong Elasticsearch — JSON object. Mỗi field được index riêng để tìm
kiếm nhanh. Ví dụ:
```json
{
  "@timestamp": "2026-10-06T10:05:33.000Z",
  "level": "error",
  "service": "api-gateway",
  "message": "DB connection refused",
  "trace_id": "abc123",
  "kubernetes.pod.name": "api-gateway-7d9f-p2m1",
  "kubernetes.namespace": "production"
}
```

**ILM (Index Lifecycle Management)**: quản lý lifecycle của index — hot (ghi + tìm kiếm), warm
(chỉ tìm kiếm), cold (tìm kiếm chậm, ít RAM), frozen (archive), delete. Tự động rollover và
tiết kiệm resource theo thời gian.

**Shards và Replicas**: Elasticsearch chia index thành shard (đơn vị lưu trữ phân tán). Primary
shard ghi data; replica shard bản copy (high availability + đọc nhanh hơn). Production cần ít
nhất 1 replica mỗi primary shard.

## 3. Cách nó hoạt động

**Data flow đơn giản (Filebeat → Elasticsearch)**:
```
Log file / stdout ← Filebeat reads
                  → JSON document
                  → Elasticsearch index via HTTP (:9200)
                  → Kibana query (:5601)
```

**Data flow với Logstash (khi cần parse)**:
```
Filebeat → Logstash (:5044) → Elasticsearch
           (parse grok, enrich, filter)
```

**Filebeat registry**: Filebeat lưu vị trí đã đọc (inode + offset) vào registry file. Khi
restart Filebeat, tiếp tục từ chỗ đó — không đọc lại toàn bộ file, không bỏ sót log mới.

**Elasticsearch Query DSL**: ngôn ngữ query JSON. Kibana Discover dùng Lucene query syntax
đơn giản hơn cho user; API dùng Query DSL cho automation.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Elastic documentation.

**Filebeat config** (`/etc/filebeat/filebeat.yml`):

```yaml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/nginx/access.log
      - /var/log/nginx/error.log
    fields:
      service: nginx
      environment: production
    fields_under_root: true   # thêm field ở root level, không lồng trong "fields"
    json.keys_under_root: true  # nếu log là JSON, parse thẳng
    json.overwrite_keys: true
    json.add_error_key: true

  - type: container              # log từ Docker container
    paths:
      - /var/lib/docker/containers/*/*.log
    processors:
      - add_docker_metadata: ~   # tự thêm metadata từ Docker API

output.elasticsearch:
  hosts: ["https://elasticsearch:9200"]
  index: "logs-%{[service]}-%{+yyyy.MM.dd}"
  username: "filebeat_writer"
  password: "${FILEBEAT_PASSWORD}"  # từ keystore hoặc env var

processors:
  - add_host_metadata: ~         # thêm hostname, IP của host chạy Filebeat
  - drop_fields:
      fields: ["agent", "ecs"]   # drop field không cần
```

**Logstash pipeline** (`/etc/logstash/conf.d/nginx.conf`):

```ruby
input {
  beats { port => 5044 }
}

filter {
  if [service] == "nginx" {
    grok {
      match => { "message" => '%{IPORHOST:client_ip} - - \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status_code:int} %{NUMBER:bytes:int}' }
    }
    date {
      match => ["timestamp", "dd/MMM/yyyy:HH:mm:ss Z"]
      target => "@timestamp"
    }
    if [status_code] >= 500 {
      mutate { add_tag => ["error"] }
    }
  }
}

output {
  elasticsearch {
    hosts => ["https://elasticsearch:9200"]
    index => "logs-nginx-%{+YYYY.MM.dd}"
  }
}
```

**Kibana Discover — tìm kiếm log**:

```
# Lucene query syntax trong Kibana:
level: "error" AND service: "api-gateway"
message: "connection refused"
trace_id: "abc123"
status_code: [500 TO 599]
kubernetes.namespace: "production" AND @timestamp: [now-1h TO now]

# KQL (Kibana Query Language) — đơn giản hơn:
level : "error" and service : "api-gateway"
status_code >= 500
```

**Kiểm tra Elasticsearch cluster health**:

```bash
# Health status
curl -X GET "https://elasticsearch:9200/_cluster/health?pretty" \
  -u "admin:password"
# {
#   "cluster_name": "production-logs",
#   "status": "green",      ← green=OK, yellow=replica thiếu, red=shard mất data
#   "number_of_nodes": 3,
#   "active_primary_shards": 20,
#   "active_shards": 40
# }

# Xem list index
curl -X GET "https://elasticsearch:9200/_cat/indices?v" -u "admin:password"
# health status index                    pri rep docs.count store.size
# green  open   logs-nginx-2026.10.06     1   1    1234567      512mb

# Disk usage theo node
curl -X GET "https://elasticsearch:9200/_cat/allocation?v" -u "admin:password"
```

**ILM policy ví dụ** (qua Kibana UI hoặc API):

```json
{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_size": "50gb",
            "max_age": "1d"
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 }
        }
      },
      "delete": {
        "min_age": "30d",
        "actions": { "delete": {} }
      }
    }
  }
}
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Elasticsearch cluster ở trạng thái `yellow`**
- Nguyên nhân: primary shard OK nhưng replica chưa assigned (thường do số node ít hơn số
  replica). Một cluster 1 node không thể assign replica (replica cần node khác với primary).
- Yellow = không mất data, nhưng không có HA. Nếu cần HA: thêm node; nếu chỉ dev, set
  `number_of_replicas: 0`.
- `red` = shard unassigned, có thể mất data → cần điều tra ngay.

**Filebeat lag — log delay nhiều phút so với thực tế**
- Nguyên nhân: Elasticsearch chậm (overload), Filebeat queue đầy, hoặc network bottleneck.
- Cách chẩn đoán: `filebeat --test output` xem có connect được không; xem Elasticsearch indexing
  rate (Kibana Stack Monitoring); xem Filebeat monitoring metrics (queue.filled.pct).
- Cách xử lý: tăng `output.elasticsearch.worker` trong Filebeat config; hoặc thêm Logstash/
  Kafka làm buffer.

**Log không xuất hiện trong Kibana dù Filebeat đang chạy**
- Checklist: (1) index pattern trong Kibana có khớp với tên index Filebeat ghi không?
  (Configuration → Data Views → kiểm tra pattern); (2) time filter trong Kibana có bao gồm
  khoảng thời gian log được tạo không? (3) `filebeat test output` từ host để xác nhận kết nối
  đến Elasticsearch; (4) xem Filebeat log (`journalctl -u filebeat`) có error không.

**Disk usage tăng nhanh — Elasticsearch sắp đầy**
- Nguyên nhân: không có ILM policy, hoặc retention quá dài.
- Emergency: `DELETE /logs-*-2026.09.*` xóa index cũ; bật ILM policy cho rollover/delete tự động.
- Watermark: Elasticsearch có 3 ngưỡng — low (85%): không cấp phát shard mới; high (90%): cố
  relocate shard sang node khác; **flood stage (95%)**: enforce read-only block, từ chối ghi
  (`cluster.routing.allocation.disk.watermark.flood_stage`). Ngưỡng 90% KHÔNG từ chối ghi.

## 6. Tình huống thực tế

Debug incident: api-gateway trả 503 cho 5% request trong 10 phút.

```
1. Kibana Discover:
   level: "error" AND service: "api-gateway" AND @timestamp: [now-20m TO now]
   → Thấy nhiều: "upstream connect error or disconnect/reset before headers"

2. Xem trace_id của 1 lỗi, tìm tất cả log trong request đó:
   trace_id: "abc-123"
   → Thấy: api-gateway log error sau khi gọi inventory-service
   → inventory-service log: "DB query timeout after 30s"

3. Xem inventory-service DB logs:
   service: "inventory-db" AND level: "error"
   → "Too many connections: max_connections=100 exceeded"

4. Root cause: inventory-db quá tải kết nối
   → Fix: tăng connection pool limit hoặc thêm replica read DB
```

Từ "503 error" đến "DB connection pool exhausted" trong 5 phút nhờ centralized logging +
trace ID.

## 7. Tự kiểm tra

1. Elasticsearch cluster status `yellow` vs `red` nghĩa là gì? Cần hành động gì?
   <details><summary>Đáp án</summary>Yellow: tất cả primary shard assigned và data OK, nhưng ít
   nhất 1 replica shard chưa được assigned (thường do không đủ node). Không mất data, nhưng nếu
   node chứa primary shard chết = mất shard đó (không có replica bù). Red: ít nhất 1 primary
   shard unassigned — có khả năng mất data. Hành động: yellow = xem có đủ node không, cân nhắc
   giảm replica nếu chỉ có 1 node; red = điều tra ngay (`GET /_cluster/allocation/explain`).</details>

2. Cần parse Nginx access log (không phải JSON) bằng ELK. Dùng Filebeat hay Logstash để
   parse? Tại sao?
   <details><summary>Đáp án</summary>Logstash — Filebeat rất nhẹ, parse cơ bản (JSON, multiline)
   nhưng không có grok pattern parser mạnh. Logstash có `grok` filter plugin với hàng trăm
   pattern dựng sẵn (bao gồm `COMBINEDAPACHELOG` cho Nginx). Filebeat chỉ ship log; Logstash
   parse và transform trước khi vào Elasticsearch. Alternative: Elasticsearch Ingest Pipeline
   (có grok processor) — parse phía Elasticsearch, không cần Logstash riêng.</details>

3. Index name `logs-nginx-2026.10.06` — ngày trong tên index có ý nghĩa gì với retention?
   <details><summary>Đáp án</summary>Tạo điều kiện delete theo ngày. Khi hết 30 ngày retention,
   chỉ cần `DELETE /logs-nginx-2026.09.06` — xóa nguyên index thay vì phải delete từng document
   (cực kỳ chậm với Elasticsearch). ILM policy tự động `rollover` sang index mới và delete index
   cũ theo min_age. Đây là pattern chuẩn cho log data — immutable, append-only, xoá theo thời
   gian.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `monitoring.logging.fundamentals` — structured log, retention strategy, pipeline concept:
  nền tảng để hiểu ELK stack role.
- `monitoring.logging.splunk-basics` — Splunk: platform enterprise thay thế ELK; so sánh cách
  tiếp cận.

**Bài liên quan ngoài module (xem thêm):**
- `monitoring.prometheus-grafana.grafana-dashboards` — Grafana cũng support Elasticsearch/Loki
  làm data source.

**Nguồn tham khảo:**
- [Elasticsearch Reference — elastic.co](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)
  — index, shards, ILM, query DSL, cluster API.
- [Filebeat Reference — elastic.co](https://www.elastic.co/guide/en/beats/filebeat/current/index.html)
  — input types, processors, output config.
- [Kibana Guide — elastic.co](https://www.elastic.co/guide/en/kibana/current/index.html)
  — Discover, Dashboard, Data View, KQL syntax.
