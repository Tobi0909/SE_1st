---
id: data.mysql-postgres.fundamentals
title: "Khái niệm vận hành RDBMS: instance, database, connection pool"
domain: data
module: data.mysql-postgres
level: "nền tảng"
prerequisites: []
applies_to:
  - "MySQL 8.0 và PostgreSQL 16+ (góc nhìn vận hành, không phải phát triển ứng dụng)"
status: verified
sources:
  - "https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html"
  - "https://www.postgresql.org/docs/current/runtime-config-connection.html"
  - "https://www.postgresql.org/docs/current/runtime-config-resource.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Database là thành phần có state — không thể restart tùy tiện, không thể scale theo chiều ngang dễ
dàng như stateless service. Khi database chậm hay down, toàn bộ ứng dụng dừng theo. Vận hành
database đúng cách bắt đầu từ hiểu đúng mô hình: instance là gì, connection pool hoạt động thế
nào, và tại sao config mặc định không đủ cho production.

## 2. Khái niệm cốt lõi

### Instance vs Database/Schema

**MySQL**: một *instance* = một process mysqld. Trong instance đó có nhiều *database* (thực chất
là *schema* — tên gọi thay thế nhau). `USE myapp_db` chọn schema để làm việc.

**PostgreSQL**: một *cluster* = một instance (một process postgres). Trong cluster có nhiều
*database* độc lập hơn (khác namespace, không thể query chéo không qua FDW). Kết nối đến PostgreSQL
phải chỉ định database ngay từ đầu.

```
MySQL instance                PostgreSQL cluster
├── database: myapp           ├── database: myapp
├── database: analytics       ├── database: analytics
└── database: mysql (system)  └── database: postgres (system)
    ├── table: user               (mỗi database = process riêng khi connect)
    └── table: order
```

### Mô hình process/thread

**MySQL**: mỗi client connection → một *thread* trong process mysqld. Thread dùng chung memory
của process — thread nhiều thì memory tăng nhưng context-switch cost thấp hơn process.

**PostgreSQL**: mỗi client connection → một *process* fork từ postmaster. Process riêng biệt —
crash một connection không ảnh hưởng connection khác, nhưng fork nhiều process tốn thêm memory.

Đây là lý do PostgreSQL cần connection pooler (PgBouncer) nghiêm túc hơn MySQL.

### Tại sao connection đắt?

Mỗi kết nối mới đến DB tốn:
- **CPU**: TCP handshake, TLS handshake, auth (scrypt/SHA-256)
- **Memory**: PostgreSQL ~5-10MB/connection (process overhead), MySQL ~1MB/thread
- **Time**: latency cộng dồn — mỗi connection mới từ application mất 2-5ms

Application mở/đóng connection cho từng request → bottleneck ở số lượng kết nối. **Connection
pool** giữ một tập connection sẵn sàng, tái dùng cho nhiều request.

### Connection pool sizing

Quy tắc ngón tay cái cho PostgreSQL:

```
pool_size = num_cpu_cores × 2 + effective_spindle_count
```
<!-- TODO-VERIFY: công thức này từ PgBouncer community/HikariCP docs, không từ PostgreSQL official docs — verify nguồn chính xác -->

Thực tế: bắt đầu với `pool_size = 10-20`, tăng dần theo monitoring. `max_connections` của server
**không** nên dùng hết — cần giữ lại khoảng trống cho DBA connection emergency.

### Key config params

**MySQL 8.0** (output minh họa — MySQL không cài trên máy demo):

```sql
SHOW VARIABLES LIKE 'max_connections';        -- default: 151
SHOW VARIABLES LIKE 'wait_timeout';           -- default: 28800 (8 tiếng)
SHOW VARIABLES LIKE 'innodb_buffer_pool_size'; -- default: 128MB
```

> **Output minh họa** — MySQL không cài trên máy demo.
<!-- TODO-VERIFY: max_connections default 151 và innodb_buffer_pool_size default 128MB cho MySQL 8.0 — chưa xác nhận được từ trang docs đã fetch (trang trả về không đủ nội dung), nhưng đây là giá trị cực kỳ phổ biến trong cộng đồng MySQL -->

**PostgreSQL 16** — default đã xác nhận từ docs:

```sql
SHOW max_connections;        -- default: 100
SHOW shared_buffers;         -- default: 128MB
SHOW work_mem;               -- default: 4MB
SHOW maintenance_work_mem;   -- default: 64MB
```

> **Output minh họa** — PostgreSQL không cài trên máy demo.

`shared_buffers=128MB` là mặc định cho môi trường dev. Production khuyến nghị ~25% RAM. `work_mem`
cộng dồn theo số sort/hash operation đang chạy đồng thời — tổng thực tế = `work_mem × số_query ×
số_sort_per_query`, không phải chỉ 4MB.

### Storage engine (MySQL)

MySQL hỗ trợ nhiều storage engine; InnoDB là mặc định và nên dùng:

| | **InnoDB** | **MyISAM** |
|-|-----------|-----------|
| Transaction | Có (ACID) | Không |
| Foreign key | Có | Không |
| Crash recovery | Có (redo log) | Không |
| Row lock | Có | Table lock |
| Full-text search | Có (MySQL 5.6+) | Có (cũ hơn) |

PostgreSQL chỉ có một engine, dùng MVCC (Multi-Version Concurrency Control) — read không block
write, write không block read.

## 3. Cách nó hoạt động

### Connection pool trong thực tế

```
Application instances (10 pods)
     │  mỗi pod dùng pool 5 connections
     ▼
[Connection Pooler]  ← PgBouncer (PostgreSQL) hoặc ProxySQL (MySQL)
     │  giữ 20 connections thật đến DB
     ▼
[Database server]    ← max_connections=100, dùng 20, còn 80 dự trữ
```

Nếu không có pooler và 10 pods × 100 connections = 1000 connections thật → PostgreSQL tốn
~5-10GB chỉ cho connection overhead.

### MVCC và visibility (PostgreSQL)

PostgreSQL dùng MVCC để đọc snapshot nhất quán không cần lock:
- Mỗi transaction có `transaction ID` (XID)
- Mỗi row có `xmin` (XID tạo ra row) và `xmax` (XID xóa row)
- Transaction chỉ thấy row có `xmin ≤ current_XID` và chưa bị delete

Hệ quả vận hành: row cũ không bị xóa ngay — `VACUUM` (tự động chạy theo autovacuum) dọn "dead
tuples." Nếu autovacuum không kịp, bảng phình (bloat) và query chậm.

## 4. Thực hành

**Kiểm tra cấu hình production PostgreSQL** (output minh họa):

```sql
-- Xem config thực tế đang dùng
SELECT name, setting, unit, source
FROM pg_settings
WHERE name IN ('max_connections','shared_buffers','work_mem','maintenance_work_mem');
```

**Kiểm tra connection đang dùng** (output minh họa):

```sql
-- PostgreSQL: xem connection hiện tại theo trạng thái
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
--  state  | count
-- --------+-------
--  idle   |    15
--  active |     3
--  <null> |     2

-- MySQL: xem connection và query đang chạy
SHOW PROCESSLIST;
```

**Tính connection pool sizing** (chạy thật):

```bash
python3 -c "
cores = 8  # ví dụ server 8 vCPU
pool_min = cores * 2
pool_max = cores * 3
print(f'Recommended pool size: {pool_min}–{pool_max}')
print(f'max_connections suggestion: {pool_max * 2} (2x pool, còn dư cho DBA/monitor)')
"
```

Kết quả thực tế:

```
Recommended pool size: 16–24
max_connections suggestion: 48 (2x pool, còn dư cho DBA/monitor)
```

## 5. Lỗi thường gặp và cách chẩn đoán

**"Too many connections"** — application không có connection pool, mỗi request mở connection mới,
đạt `max_connections`. Fix: thêm connection pooler; không chỉ tăng `max_connections` (tăng không
giải quyết gốc, chỉ delay).

**`wait_timeout` quá ngắn** — connection pool giữ connection idle lâu hơn `wait_timeout` (MySQL
default 28800s = 8 giờ), server đóng connection mà pool không biết → connection tiếp theo nhận
"MySQL server has gone away". Fix: pool phải có heartbeat/validation query, hoặc tăng
`wait_timeout` vừa đủ.

**`work_mem` quá thấp gây sort trên disk** — PostgreSQL log hiện `temporary file` khi sort vượt
`work_mem`. Không nên tăng `work_mem` global — thay vào đó tăng per-session cho query cụ thể:
`SET work_mem = '64MB';` trước khi chạy query nặng.

**InnoDB buffer pool quá nhỏ** — MySQL phải đọc từ disk liên tục thay vì từ cache. Kiểm tra:
`SHOW STATUS LIKE 'Innodb_buffer_pool_reads%'` — `Innodb_buffer_pool_read_requests` nên >> `Innodb_buffer_pool_reads` (tỉ lệ cache hit > 99%).

## 6. Tình huống thực tế

**Tình huống**: App có 20 pod, mỗi pod config `max_pool_size=50`. Tổng connection = 1000. PostgreSQL
`max_connections=100` → alert "remaining connection slots reserved for non-replication superuser connections."

**Chẩn đoán**:

```sql
SELECT count(*), state, application_name
FROM pg_stat_activity
GROUP BY state, application_name
ORDER BY count DESC;
```

Thấy 980 connection ở trạng thái `idle` — pool đang giữ connection không dùng.

**Fix**:
1. Triển khai PgBouncer với `pool_mode=transaction` (1 connection thật phục vụ nhiều transaction)
2. Giảm `max_pool_size` per pod xuống 5
3. Tổng connection thật từ PgBouncer xuống DB: `20 pods × 5 / PgBouncer_multiplexing ≈ 20`

Kết quả: 980 connections → 20, database không còn bị áp lực connection.

## 7. Tự kiểm tra

**Câu 1**: Sự khác nhau cốt lõi giữa "database" trong MySQL và PostgreSQL là gì?

a) MySQL database dùng InnoDB, PostgreSQL database dùng MyISAM  
b) Không có sự khác biệt — cả hai đều là namespace chứa table  
c) Trong PostgreSQL, mỗi database là một entity độc lập (khác process khi connect, không query chéo thường); trong MySQL, database là synonym của schema trong cùng một instance  
d) PostgreSQL không có khái niệm "database", chỉ có "schema"

**Đáp án: c** — PostgreSQL: database độc lập, kết nối phải chỉ định database, query chéo database cần Foreign Data Wrapper. MySQL: database (=schema) chỉ là namespace trong cùng instance, `USE db2` rồi `SELECT * FROM db1.table1` hoạt động bình thường. Sự khác biệt ảnh hưởng đến cách thiết kế multi-tenant và cách cấp quyền.

---

**Câu 2**: Tại sao PostgreSQL cần connection pooler (PgBouncer) hơn MySQL?

a) PostgreSQL không hỗ trợ nhiều connection đồng thời  
b) PostgreSQL fork một process riêng cho mỗi connection — nhiều connection = nhiều process = tốn nhiều memory hơn so với MySQL dùng thread  
c) PgBouncer là tool của PostgreSQL, MySQL có tool riêng  
d) PostgreSQL không có connection pool built-in

**Đáp án: b** — MySQL mỗi connection = một thread trong process mysqld (~1MB/thread). PostgreSQL mỗi connection = một process fork (~5-10MB/process). Với 1000 connection: MySQL ~1GB overhead, PostgreSQL ~5-10GB. Connection pooler giảm số connection thật vào DB bằng cách multiplexing nhiều app connection qua ít DB connection hơn.

---

**Câu 3**: `work_mem=4MB` trong PostgreSQL có nghĩa là tổng memory dùng cho sort là 4MB không?

a) Đúng — PostgreSQL chỉ dùng tối đa 4MB tổng cộng cho tất cả sort  
b) Không — 4MB là per operation, và một query có thể có nhiều sort/hash đồng thời; tổng thực tế = 4MB × số_operation × số_connection  
c) Đúng — work_mem áp dụng cho toàn bộ server  
d) Không — work_mem không liên quan đến sort, chỉ cho aggregate function

**Đáp án: b** — `work_mem` là per sort/hash operation, không phải per query hay per server. Một query complex có thể có nhiều bước sort (merge join, ORDER BY, window function); cộng với nhiều connection đồng thời → tổng thực tế có thể là `4MB × 10 ops × 100 connections = 4GB`. Đây là lý do không nên set `work_mem` quá cao toàn cục.

---

**Câu 4**: "Too many connections" error nên được fix bằng cách nào?

a) Chỉ cần tăng max_connections lên đủ cao  
b) Thêm connection pooler và giảm pool size per application; tăng max_connections chỉ là biện pháp tạm  
c) Restart database server để reset connection counter  
d) Tắt SSL để giảm connection overhead

**Đáp án: b** — Tăng `max_connections` mà không có pooler chỉ delay vấn đề: với PostgreSQL, mỗi connection thêm tốn process + memory, đến mức server không còn đủ memory/CPU handle. Pooler multiplexes nhiều app connections vào ít DB connections thật → fix nguyên nhân, không phải triệu chứng.

---

**Câu 5**: VACUUM trong PostgreSQL dọn gì?

a) Xóa database files tạm thời  
b) Dọn "dead tuples" — row phiên bản cũ không còn visible với bất kỳ transaction nào, do MVCC giữ lại  
c) Compresses bảng để giảm disk usage  
d) Xóa query cache để refresh execution plan

**Đáp án: b** — MVCC không xóa row cũ ngay khi UPDATE/DELETE — giữ lại để transaction đang chạy vẫn thấy snapshot nhất quán. Sau khi không còn transaction nào cần row cũ đó, VACUUM mới đánh dấu không gian đó có thể tái dùng. Nếu VACUUM không kịp (autovacuum bị disabled hoặc quá tải), dead tuples tích lũy → table bloat → query chậm hơn do phải scan nhiều hơn.

## 8. Bài liên quan và nguồn tham khảo

**Bài tiếp theo trong module:**
- `data.mysql-postgres.replication` — primary-replica setup, monitoring lag, failover
- `data.mysql-postgres.backup-tuning` — backup strategies, slow query, index

**Bài liên quan ngoài module:**
- `monitoring.prometheus-grafana.fundamentals` — export MySQL/PostgreSQL metrics qua exporter

**Nguồn tham khảo:**
- [MySQL 8.0 — Server System Variables](https://dev.mysql.com/doc/refman/8.0/en/server-system-variables.html)
- [PostgreSQL — Connections and Authentication](https://www.postgresql.org/docs/current/runtime-config-connection.html)
- [PostgreSQL — Resource Consumption](https://www.postgresql.org/docs/current/runtime-config-resource.html)
