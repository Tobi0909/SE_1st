---
id: monitoring.logging.splunk-basics
title: "Splunk cơ bản: index, search (SPL)"
domain: monitoring
module: monitoring.logging
level: "vận hành"
prerequisites: ["monitoring.logging.fundamentals"]
applies_to:
  - "Splunk Enterprise 9.x / Splunk Cloud — SPL (Search Processing Language) ổn định qua các phiên bản; Splunk Free (500MB/day) tương tự về core"
status: verified
sources:
  - "https://docs.splunk.com/Documentation/Splunk/latest/SearchReference/WhatsInThisManual"
  - "https://docs.splunk.com/Documentation/Splunk/latest/Data/Aboutindexesanddatamodel"
  - "https://docs.splunk.com/Documentation/Splunk/latest/Alert/Aboutalerts"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Splunk không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Splunk documentation chính thức.

Splunk là platform centralized logging enterprise phổ biến nhất trong môi trường lớn (ngân
hàng, telco, cơ quan nhà nước). Khác ELK ở chỗ: Splunk là commercial product "all-in-one"
(không cần tự build pipeline), licensing theo dữ liệu ingest (GB/day), query language là SPL
(Search Processing Language — rất mạnh về aggregation và reporting). Biết Splunk = biết tìm
kiếm log trong enterprise, hiểu index lifecycle, viết được SPL search cơ bản khi có incident.

## 2. Khái niệm cốt lõi

**Splunk Index**: tập hợp data được lưu và index. Tương tự Elasticsearch index nhưng cách
tổ chức khác: Splunk tự parse và extract field lúc search (schema-on-read) thay vì phải
định nghĩa mapping trước (schema-on-write như Elasticsearch). Data trong index được chia
thành bucket (hot → warm → cold → frozen) theo thời gian.

**Schema-on-read vs Schema-on-write**:
- **Splunk (schema-on-read)**: ingest raw log ngay, không cần định nghĩa field trước. Khi
  search, Splunk parse và extract field từ raw text. Linh hoạt hơn nhưng search có thể chậm
  hơn với data không có field index sẵn.
- **Elasticsearch (schema-on-write)**: cần mapping field trước khi ingest (hoặc dùng dynamic
  mapping). Field được index khi ghi → search nhanh hơn, nhưng cần biết format trước.

**SPL (Search Processing Language)**: ngôn ngữ query của Splunk. Cú pháp dạng pipe —
`search | command1 | command2 | ...`. Mỗi command nhận output từ command trước và transform.
Rất mạnh cho aggregation, reporting, time-series analysis.

**Event**: 1 log entry trong Splunk — có `_time` (timestamp), `_raw` (raw text gốc), và
các field được extract. Splunk tự extract common field từ format biết sẵn (syslog, Apache
access log, JSON...) qua "automatic field extraction".

**Forwarder**: agent gửi data đến Splunk Indexer.
- **Universal Forwarder (UF)**: lightweight agent (chỉ forward, không parse) — cài trên
  server để ship log file. Phổ biến nhất, hiệu quả nhất.
- **Heavy Forwarder (HF)**: Splunk đầy đủ dùng như forwarder — có thể parse, filter, transform
  trước khi gửi. Dùng khi cần xử lý phức tạp phía nguồn.

**Splunk Search Head**: thành phần người dùng query qua UI. Trong môi trường lớn, Search Head
tách biệt với Indexer (horizontal scaling).

**Data Model và Pivot**: abstraction trên raw data — define field chuẩn, dùng Pivot UI để
tạo chart/report mà không cần viết SPL. Thường do Splunk admin build.

## 3. Cách nó hoạt động

**Data flow**:
```
Log file / syslog / API → Universal Forwarder
                        → Splunk Indexer (parse, index, store)
                        → Search Head (SPL query, dashboard, alert)
```

**Index bucket lifecycle**:
```
Hot bucket (ghi mới, SSD, `maxDataSize=auto` ~750MB/bucket, tối đa 90 ngày qua `maxHotSpanSecs`)
    ↓ roll (khi đầy hoặc đủ tuổi)
Warm bucket (chỉ đọc, SSD/HDD)
    ↓ (sau warm_db_cnt bucket limit hoặc maxDataSize)
Cold bucket (HDD, ít accessed)
    ↓ (sau coldToFrozenDir config)
Frozen bucket (archive, delete, hoặc archive script)
```

**Field extraction**: Splunk tự extract field phổ biến khi index (host, source, sourcetype,
_time). Với sourcetype đã biết (như `access_combined` cho Apache), tự extract `clientip`,
`method`, `uri`, `status`, `bytes`... Với log custom, có thể định nghĩa regex extraction
trong `props.conf` / `transforms.conf`.

**SPL pipe model**: mỗi `|` truyền kết quả qua command tiếp theo.
```
index=production level=error
| stats count by service
| sort -count
| head 10
```
Đọc: "lấy tất cả event index=production có level=error, đếm theo service, sắp xếp giảm dần,
lấy 10 cái đầu".

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Splunk documentation.

**Splunk search cơ bản** (SPL):

> SPL không có cú pháp comment. Mỗi đoạn dưới đây là 1 query riêng biệt.

Tìm tất cả event trong index `production` có chứa từ "error":
```spl
index=production error
```

Giới hạn time range + field cụ thể:
```spl
index=production level=error service=api-gateway earliest=-1h latest=now
```

Tìm trace_id cụ thể (theo dấu toàn bộ request):
```spl
index=production trace_id="abc-123-xyz"
```

Substring search trong raw text:
```spl
index=production "connection refused"
```

NOT operator:
```spl
index=production level!=debug
index=production NOT (level=debug OR level=info)
```

**SPL aggregation — phân tích phổ biến**:

Đếm event theo service, sắp xếp nhiều nhất trước:
```spl
index=production level=error earliest=-24h
| stats count by service
| sort -count
```

Error rate theo giờ (timechart):
```spl
index=production earliest=-7d
| timechart span=1h count by level
```

Top 10 error message:
```spl
index=production level=error earliest=-1d
| stats count by message
| sort -count
| head 10
```

P95 response time (nếu có field `response_ms`):
```spl
index=production service=api-gateway earliest=-1h
| stats perc95(response_ms) by endpoint
```

Unique user bị ảnh hưởng bởi lỗi:
```spl
index=production level=error earliest=-24h
| stats dc(user_id) as affected_users by service
```

Event theo phút trong 1 giờ qua:
```spl
index=production
| timechart span=1m count
```

**SPL lookup và join** (nâng cao) — join với lookup table, ví dụ enrich IP với country:

```spl
index=production clientip=*
| lookup geoip clientip OUTPUT country
| stats count by country
| sort -count
```

**Tìm kiếm từ Splunk UI**:

```
1. Vào Search & Reporting
2. Nhập SPL vào search bar
3. Chọn time range (presets: Last 15 min, Last 24 hours, Last 7 days, Custom)
4. Ctrl+Enter để run
5. Xem kết quả: Events tab (raw log), Statistics tab (aggregated), Visualization tab (chart)

Shortcuts:
- Ctrl+/ : comment/uncomment dòng SPL
- Ctrl+Shift+E : format SPL
- Tab : autocomplete field name
```

**Splunk alert cơ bản**:

```
Search & Reporting → Save As → Alert
  Title: "High error rate - api-gateway"
  Alert type: Scheduled (chạy theo lịch)
    Run every: 5 minutes
    Time range: Last 5 minutes
  Trigger condition: Number of Results > 50
  Actions: Send email / Webhook
```

Alert có thể dùng Saved Search (lưu lại SPL query) → trigger khi kết quả vượt threshold.

**Universal Forwarder config** (`inputs.conf` trên server cần monitor):

```ini
[monitor:///var/log/nginx/access.log]
index = production
sourcetype = access_combined
host = web-server-01

[monitor:///var/log/app/*.log]
index = production
sourcetype = json_app_log
host = web-server-01
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Search trả về 0 kết quả dù chắc chắn có log**
- Checklist: (1) time range có đúng không? Default thường là "Last 15 minutes" — nếu log cũ
  hơn, cần điều chỉnh; (2) index name đúng không? `index=production` khác `index=main`
  (default index của Splunk); (3) search term có đúng case/spelling không? SPL field name
  case-sensitive (`level=error` ≠ `level=Error`), nhưng keyword search trong raw text
  case-insensitive (`error` match `ERROR`, `Error`...); (4) forwarder có đang chạy không?
  Kiểm tra bằng `splunk status` trên host có Universal Forwarder.

**SPL search chậm — timeout sau vài phút**
- Nguyên nhân: search quá rộng (`index=*`) hoặc time range quá dài với data lớn.
- Cách tối ưu: (1) luôn chỉ định `index=<tên>` thay vì `index=*`; (2) giới hạn time range;
  (3) filter bằng field (dùng indexed field như `index`, `host`, `source`, `sourcetype` trước,
  sau đó mới filter field khác); (4) dùng `tstats` command cho count/stats đơn giản trên
  indexed field — nhanh hơn full-text search.

**License warning — "reached daily data limit"**
- Splunk Enterprise license theo GB ingest per day. Khi vượt hạn mức, search vẫn hoạt động
  nhưng có warning và có thể indexing bị hạn chế.
- Cần xem log source nào gửi nhiều nhất: `index=_internal source=*license* | stats sum(b)
  as bytes by host | sort -bytes` — tìm host gửi nhiều nhất, xem có để log level DEBUG không.

**Field extraction không đúng — field bị null hoặc sai giá trị**
- Nguyên nhân: sourcetype sai (Splunk dùng sourcetype để chọn extraction rule).
- Cách debug: xem `sourcetype` của event trong search result; nếu không đúng, config
  `inputs.conf` phải chỉ đúng `sourcetype`. Dùng `| fieldsummary` để xem tất cả field được
  extract và % non-null.

## 6. Tình huống thực tế

Incident investigation: payment service trả lỗi 500 trong 10 phút.

```spl
* Bước 1: Xác nhận scope
index=production service=payment earliest=-30m latest=-10m level=error
| timechart span=1m count
* → Thấy spike lớn từ 14:30-14:40

* Bước 2: Top error messages
index=production service=payment earliest=-30m latest=-10m level=error
| stats count by message
| sort -count
| head 5
* → "Database connection timeout: 30000ms exceeded" chiếm 87%

* Bước 3: Trace toàn bộ journey của 1 request lỗi
index=production trace_id="def-456-ghi"
| sort _time
* → Thấy: payment-service → inventory-service (15s) → db-primary (timeout)

* Bước 4: Xem DB metrics cùng thời điểm
index=production service=db-primary earliest=14:28 latest=14:42
| timechart span=1m avg(query_duration_ms)
* → Query duration tăng từ 50ms lên 28000ms lúc 14:30

* Root cause: DB query chậm đột biến → payment timeout → 500 error
* Action: xem slow query log của DB, tìm query không có index
```

## 7. Tự kiểm tra

1. SPL: `index=production level=error | stats count by service | sort -count`. Command nào
   làm gì trong pipeline này?
   <details><summary>Đáp án</summary>(1) `index=production level=error`: lọc events từ index
   "production" có field level=error — đây là base search, không phải command trong pipe; (2)
   `stats count by service`: tổng hợp — đếm số events nhóm theo giá trị của field "service",
   kết quả là bảng 2 cột: service và count; (3) `sort -count`: sắp xếp bảng theo cột "count"
   giảm dần (dấu `-` = descending). Kết quả cuối: danh sách service kèm số error log, nhiều
   nhất ở trên.</details>

2. Splunk schema-on-read vs Elasticsearch schema-on-write — ưu điểm của Splunk trong tình
   huống nào?
   <details><summary>Đáp án</summary>Schema-on-read (Splunk) ưu điểm: (1) ingest log ngay mà
   không cần biết format trước — tốt khi log format thay đổi thường xuyên hoặc chưa biết sẽ
   cần field nào; (2) có thể "back-fill" extraction — định nghĩa field mới và Splunk sẽ extract
   từ data cũ khi search (không cần re-index); (3) giảm friction khi onboard log source mới.
   Nhược điểm: search chậm hơn trên field chưa được index. Schema-on-write (Elasticsearch)
   nhanh hơn khi field đã được index sẵn, phù hợp khi format stable và cần low-latency search
   với cardinality cao.</details>

3. Universal Forwarder vs Heavy Forwarder — khi nào dùng Heavy Forwarder thay vì Universal?
   <details><summary>Đáp án</summary>Universal Forwarder (UF): chỉ forward raw data, chiếm rất
   ít tài nguyên (~30MB RAM) — dùng cho 99% trường hợp cài trên server để ship log. Heavy
   Forwarder (HF): dùng khi cần (1) parse/filter/mask data phía nguồn trước khi gửi (ví dụ
   mask PII như số thẻ tín dụng trong log trước khi gửi ra ngoài data center); (2) routing điều
   kiện (log security → Splunk A, log app → Splunk B); (3) aggregate từ nhiều UF trước khi gửi
   (Splunk Intermediate Forwarder pattern cho network có bandwidth hạn chế).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `monitoring.logging.fundamentals` — structured log, retention strategy, log pipeline:
  nền tảng để hiểu Splunk index và forwarder role.
- `monitoring.logging.elk-stack` — ELK/Elastic stack: so sánh open-source alternative với
  Splunk enterprise; schema-on-write vs schema-on-read; ILM vs bucket lifecycle.

**Nguồn tham khảo:**
- [Splunk Search Reference — docs.splunk.com](https://docs.splunk.com/Documentation/Splunk/latest/SearchReference/WhatsInThisManual)
  — SPL command reference đầy đủ: stats, timechart, sort, eval, rex, lookup...
- [About indexes and data model — docs.splunk.com](https://docs.splunk.com/Documentation/Splunk/latest/Data/Aboutindexesanddatamodel)
  — index lifecycle, bucket types, data model concept.
- [About alerts — docs.splunk.com](https://docs.splunk.com/Documentation/Splunk/latest/Alert/Aboutalerts)
  — alert types, scheduled search, trigger conditions, actions.
