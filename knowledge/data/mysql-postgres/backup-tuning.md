---
id: data.mysql-postgres.backup-tuning
title: "Backup (dump/physical) và tuning cơ bản (index, slow query)"
domain: data
module: data.mysql-postgres
level: "vận hành"
prerequisites:
  - "data.mysql-postgres.fundamentals"
applies_to:
  - "MySQL 8.0 và PostgreSQL 16+ (góc nhìn vận hành)"
status: draft
sources:
  - "https://dev.mysql.com/doc/refman/8.0/en/backup-methods.html"
  - "https://dev.mysql.com/doc/refman/8.0/en/slow-query-log.html"
  - "https://www.postgresql.org/docs/current/backup-dump.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Database là thành phần duy nhất trong stack mà khi mất dữ liệu, không có cách khôi phục từ
code hay deployment. Backup sai cách (dump không consistent, không test restore) là backup
giả. Tuning database sai cách (thêm index tùy tiện, không dùng EXPLAIN) là tối ưu mù.

Bài này tập trung vào hai kỹ năng vận hành thiết yếu: **backup đúng cách** (hiểu sự khác biệt
logical/physical, khi nào dùng gì) và **tìm query chậm + thêm index** đúng chỗ.

## 2. Khái niệm cốt lõi

### Logical vs physical backup

**Logical backup** (mysqldump, pg_dump): export dữ liệu thành SQL text. Dễ dùng, portable
(có thể restore sang phiên bản/platform khác), nhưng chậm với database lớn vì phải parse lại
toàn bộ SQL khi restore.

**Physical backup** (Percona XtraBackup cho MySQL, pg_basebackup cho PostgreSQL): sao chép
file vật lý của database. Nhanh hơn nhiều khi restore (đặc biệt với database hàng trăm GB),
nhưng phải restore sang cùng phiên bản database.

| | Logical (dump) | Physical |
|---|---|---|
| Restore speed | Chậm (replay SQL) | Nhanh (copy file) |
| Portability | Cao — khác phiên bản/platform | Thấp — cùng phiên bản |
| Consistency | Cần cờ đặc biệt | Tích hợp sẵn |
| Incremental | Qua binlog/WAL | Tích hợp (XtraBackup/pg_basebackup) |
| DB size phù hợp | < ~50 GB | Mọi kích thước |

### Point-in-time recovery (PITR)

Backup đầy đủ chỉ cho phép khôi phục đến thời điểm backup. Để khôi phục đến bất kỳ thời
điểm nào (ví dụ: 5 phút trước khi ai đó chạy `DELETE FROM orders`), cần kết hợp:

- **Full backup** + **binary log liên tục** (MySQL) hoặc **WAL archiving** liên tục (PostgreSQL)

PITR = restore full backup → replay log/WAL đến thời điểm mong muốn.

### Index và khi nào cần thêm

Index B-tree tăng tốc truy vấn bằng cách giảm số row phải scan, nhưng làm chậm INSERT/UPDATE/DELETE
(phải cập nhật cấu trúc index). Quy tắc thực tế:

- Thêm index khi query thường xuyên dùng cột đó trong `WHERE`, `JOIN`, `ORDER BY`
- **Không** thêm index trên cột cardinality thấp (gender M/F, status active/inactive —
  index không giúp vì vẫn phải scan phần lớn bảng)
- **Composite index**: thứ tự cột quan trọng — cột có selectivity cao nhất đặt đầu, cột
  trong `WHERE =` trước cột trong `WHERE BETWEEN`/`ORDER BY`

## 3. Cách nó hoạt động

### Consistent backup với mysqldump `--single-transaction`

Khi mysqldump chạy backup, nếu có transaction đang ghi đồng thời, dữ liệu có thể không nhất
quán (một số bảng dump trước, một số dump sau khi dữ liệu đã thay đổi). `--single-transaction`
mở một transaction REPEATABLE READ trước khi bắt đầu dump — mọi bảng đều thấy cùng snapshot,
không cần lock. Chỉ hoạt động đúng với **InnoDB**; MyISAM phải dùng `--lock-all-tables` (block
toàn bộ write trong khi dump).

### pg_dump format và restore workflow

```
pg_dump -Fc  → binary custom format (.dump)  → pg_restore để restore
pg_dump -Fp  → plain SQL text (.sql)         → psql để restore
pg_dump -Fd  → directory format              → pg_restore -j parallel
```

Custom format (`-Fc`) là lựa chọn tốt nhất cho production: nén tốt, hỗ trợ restore song song
(`pg_restore -j N`), có thể restore từng table riêng lẻ.

## 4. Thực hành

> **Output minh họa** — MySQL và PostgreSQL không cài trên máy demo.

### MySQL: dump và restore

```bash
# Full backup — InnoDB only, consistent, không lock
mysqldump \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  -u root -p myapp_db > myapp_$(date +%Y%m%d).sql

# Restore
mysql -u root -p myapp_db < myapp_20261007.sql
```

`--routines`: bao gồm stored procedure/function. `--triggers`: bao gồm trigger. `--events`:
bao gồm scheduled event. Thiếu các cờ này, restore xong thiếu logic nghiệp vụ quan trọng.

```bash
# Kiểm tra binary log đang bật (cần cho PITR)
mysql -e "SHOW VARIABLES LIKE 'log_bin';"
# log_bin | ON   ← default trong MySQL 8.0

# Flush log để tạo ranh giới incremental
mysql -e "FLUSH BINARY LOGS;"
ls -lh /var/lib/mysql/binlog.*
```

### PostgreSQL: dump và restore

```bash
# Dump single database — custom format (nén, hỗ trợ restore song song)
pg_dump -Fc -f myapp_20261007.dump myapp_db

# Dump toàn cluster (bao gồm roles, tablespace — mysqldump không có tương đương)
pg_dumpall > cluster_globals.sql

# Restore custom format — song song 4 worker
createdb myapp_db_restored
pg_restore -j 4 -d myapp_db_restored myapp_20261007.dump

# Physical backup — streaming từ primary server
pg_basebackup -h pg-primary -U replicator -D /backup/base -Fp -Xs -P
# -Fp: plain format  -Xs: include WAL  -P: hiển thị tiến trình
```

`pg_basebackup` cần replication role (`REPLICATION` privilege). Kết hợp với `archive_command`
để lưu WAL liên tục → có thể PITR bất kỳ thời điểm.

### Bật slow query log (MySQL)

```sql
-- Bật slow query log tại runtime (không cần restart)
SET GLOBAL slow_query_log = 1;
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';
SET GLOBAL long_query_time = 1;  -- log query > 1 giây (default: 10 giây)
SET GLOBAL log_queries_not_using_indexes = 1;  -- cũng log query không dùng index

-- Xem cấu hình hiện tại
SHOW VARIABLES LIKE 'slow_query_log%';
SHOW VARIABLES LIKE 'long_query_time';
```

Phân tích slow log bằng `mysqldumpslow`:

```bash
# Top 10 query chậm nhất theo tổng thời gian
mysqldumpslow -s t -t 10 /var/log/mysql/slow.log
```

### Phân tích slow query (PostgreSQL)

```sql
-- Bật pg_stat_statements (trong postgresql.conf hoặc ALTER SYSTEM)
-- shared_preload_libraries = 'pg_stat_statements'

-- Tạo extension (một lần per database)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 10 query tốn CPU nhất
SELECT
  round(total_exec_time::numeric, 2) AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  left(query, 80) AS query_snippet
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

### EXPLAIN — đọc query plan

```sql
-- MySQL: xem execution plan (không chạy query thật)
EXPLAIN SELECT * FROM orders WHERE user_id = 42;
-- type: ALL → full table scan (cần index)
-- type: ref → dùng index (tốt)
-- type: const → primary key lookup (tốt nhất)

-- PostgreSQL: EXPLAIN ANALYZE chạy query thật, hiển thị actual vs estimated rows
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 42;
-- Seq Scan on orders  (cost=0.00..1234 rows=5000)  ← không có index
-- →  thêm index: CREATE INDEX idx_orders_user_id ON orders(user_id);
-- Index Scan using idx_orders_user_id on orders  (cost=0.43..8.45 rows=5)
```

**Tính storage overhead của index** (chạy thật):

```python
# Ước tính kích thước index B-tree
rows = 10_000_000
key_size_bytes = 8   # bigint user_id
ptr_size_bytes = 6   # heap pointer
fill_factor = 0.9    # B-tree thường 90% full

entry_size = key_size_bytes + ptr_size_bytes  # 14 bytes/entry
page_size = 8192  # PostgreSQL default page
entries_per_page = int(page_size * fill_factor / entry_size)
num_pages = rows / entries_per_page
size_mb = num_pages * page_size / 1024 / 1024

print(f"10M rows, key 8 bytes → index ~{size_mb:.1f} MB")
print(f"Entries per page: {entries_per_page}")
```

Kết quả thực tế:

```
10M rows, key 8 bytes → index ~148.5 MB
Entries per page: 526
```

Index 10 triệu row với bigint key ~148 MB — đáng kể nhưng vẫn nhỏ hơn nhiều so với data
thực tế (10M row × vài trăm byte/row = vài GB). Overhead của index chấp nhận được khi query
đó chạy thường xuyên.

## 5. Lỗi thường gặp và cách chẩn đoán

**mysqldump không dùng `--single-transaction` → backup không consistent**: bảng A dump lúc
10:00, bảng B dump lúc 10:05 khi đã có thêm transaction — restore ra DB ở trạng thái không
nhất quán. Luôn dùng `--single-transaction` cho InnoDB.

**Không test restore**: backup chạy thành công nhưng chưa bao giờ thử restore — đến khi cần
mới phát hiện file dump lỗi, tablespace thiếu, hay password sai. Quy tắc: **backup chưa được
test restore không phải backup**. Test định kỳ trên môi trường riêng.

**Quên dump globals (PostgreSQL)**: `pg_dump` chỉ backup data, không backup roles. Restore
xong thiếu user/role → connect được nhưng không có quyền. Chạy thêm `pg_dumpall --globals-only`
để backup roles/tablespace riêng.

**Thêm index không đúng thứ tự cột composite**: index `(status, created_at)` không giúp query
`WHERE status = 'active' AND user_id = 42` vì `user_id` không có trong index. Index đúng:
`(status, user_id)` hoặc `(user_id, status)` tùy câu query cụ thể.

**`long_query_time = 10` bỏ sót query chậm**: 10 giây là threshold mặc định nhưng quá cao
cho production — query 2-3 giây đã ảnh hưởng UX. Đặt `long_query_time = 1` hoặc `0.5` để
bắt được đủ query cần tối ưu.

## 6. Tình huống thực tế

**Tình huống**: Sau khi app được deploy tính năng mới, DBA nhận alert "average query time tăng
từ 20ms lên 800ms". Bảng `orders` có 15 triệu row.

**Điều tra với EXPLAIN** (output minh họa):

```sql
-- Tìm query trong pg_stat_statements
SELECT mean_exec_time, calls, query
FROM pg_stat_statements
WHERE query ILIKE '%orders%'
ORDER BY mean_exec_time DESC
LIMIT 5;
-- mean_exec_time: 832ms | calls: 12000 | query: SELECT ... FROM orders WHERE status = $1 AND created_at > $2

-- Chạy EXPLAIN ANALYZE
EXPLAIN ANALYZE
SELECT * FROM orders WHERE status = 'pending' AND created_at > NOW() - INTERVAL '7 days';
-- Seq Scan on orders  (cost=0.00..482000.00 rows=1500 width=120)
--                     (actual time=0.05..791.23 rows=1500 loops=1)
-- Filter: ((status = 'pending') AND (created_at > ...))
-- Rows Removed by Filter: 14998500
```

Scan toàn bộ 15M row, loại 14.998M — thiếu index.

**Fix**:

```sql
-- Composite index: status trước (equality filter), created_at sau (range filter)
CREATE INDEX CONCURRENTLY idx_orders_status_created
ON orders(status, created_at DESC);
-- CONCURRENTLY: không lock table, build song song với production traffic
```

Sau khi index build xong:

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE status = 'pending' AND created_at > NOW() - INTERVAL '7 days';
-- Index Scan using idx_orders_status_created on orders
--   (cost=0.56..23.45 rows=1500 width=120)
--   (actual time=0.12..1.83 rows=1500 loops=1)
```

Từ 791ms → 1.8ms. Query plan chuyển từ `Seq Scan` sang `Index Scan`.

**Bài học**: luôn chạy `EXPLAIN ANALYZE` trên query chậm trước khi thêm index — plan cho thấy
chính xác cần index trên cột nào, theo thứ tự nào.

## 7. Tự kiểm tra

**Câu 1**: `mysqldump --single-transaction` đảm bảo backup consistent bằng cơ chế nào?

a) Lock toàn bộ database trong khi dump  
b) Tắt tất cả write connection trước khi dump  
c) Mở một transaction REPEATABLE READ trước khi bắt đầu dump — tất cả bảng đều thấy cùng snapshot, không cần lock; chỉ hoạt động đúng với InnoDB  
d) Copy file trực tiếp từ disk, không qua SQL layer

**Đáp án: c** — REPEATABLE READ snapshot đảm bảo mọi SELECT trong transaction đó thấy cùng một trạng thái dữ liệu. Cờ này KHÔNG hoạt động đúng với MyISAM (không hỗ trợ transaction) — với MyISAM phải dùng `--lock-all-tables` để lock write toàn bảng trong khi dump, ảnh hưởng production.

---

**Câu 2**: Sự khác biệt chính giữa `pg_dump -Fc` và `pg_dump -Fp` là gì, và khi nào dùng từng loại?

a) Không có khác biệt — chỉ khác extension file  
b) `-Fc` tạo binary custom format (nén tốt hơn, hỗ trợ restore song song với `pg_restore -j`, có thể restore từng table); `-Fp` tạo plain SQL text (restore bằng `psql`, dễ đọc); dùng `-Fc` cho production DB lớn, `-Fp` khi cần migrate sang platform khác hoặc đọc script  
c) `-Fc` chỉ backup schema, `-Fp` backup cả data  
d) `-Fc` chỉ chạy được trên Linux, `-Fp` chạy được trên mọi OS

**Đáp án: b** — Custom format là lựa chọn tốt nhất cho production: nén (thường 3-5x nhỏ hơn plain SQL), restore song song `pg_restore -j N` giảm thời gian restore đáng kể với DB lớn, có thể `--list` để xem nội dung rồi restore chọn lọc. Plain SQL hữu ích khi cần đọc/chỉnh sửa script trước khi restore.

---

**Câu 3**: MySQL `long_query_time` mặc định là bao nhiêu? Tại sao giá trị này thường không phù hợp production?

a) 1 giây — phù hợp cho hầu hết production  
b) 0 — log tất cả query  
c) 10 giây — quá cao cho production; query 1-3 giây đã ảnh hưởng UX nhưng không bị log; nên đặt 0.5–1 giây  
d) 60 giây — chỉ log query thực sự nghiêm trọng

**Đáp án: c** — Theo MySQL docs, default là 10 giây. Với application web, query 2-3 giây đã làm người dùng thấy chậm (thông thường P95 latency mục tiêu < 500ms). Đặt `long_query_time = 1` để bắt được query cần tối ưu. Kết hợp `log_queries_not_using_indexes = 1` để bắt thêm query thiếu index dù chưa đạt ngưỡng thời gian.

---

**Câu 4**: Khi nào KHÔNG nên thêm index vào một cột?

a) Khi cột đó có kiểu VARCHAR  
b) Khi bảng có ít hơn 1000 row  
c) Khi cột có cardinality thấp (ít giá trị phân biệt so với số row, ví dụ: cột gender với 2 giá trị, status với 3-4 giá trị) — index không giúp vì optimizer vẫn phải đọc phần lớn bảng  
d) Khi cột đó đã có NULL value

**Đáp án: c** — Index hữu ích khi giúp lọc xuống phần nhỏ của bảng. Cột `status` có 4 giá trị trong bảng 1M row: mỗi giá trị ~250K row (25%). Với query `WHERE status = 'active'`, optimizer thường chọn Seq Scan vì đọc 250K/1M row qua index sẽ random I/O hơn sequential scan. Cardinality thấp = index waste. Trường hợp ngoại lệ: composite index dùng cột cardinality thấp kết hợp với cột khác.

---

**Câu 5**: `EXPLAIN ANALYZE` và `EXPLAIN` trong PostgreSQL khác nhau thế nào?

a) Hoàn toàn giống nhau  
b) `EXPLAIN` hiển thị estimated cost/rows từ query planner (không chạy query); `EXPLAIN ANALYZE` thực sự chạy query và hiển thị cả estimated lẫn actual rows/time — dùng để phát hiện khi planner estimate sai (rows mismatch lớn = statistics cần cập nhật bằng ANALYZE)  
c) `EXPLAIN ANALYZE` chỉ dùng được cho SELECT, không dùng được cho UPDATE/DELETE  
d) `EXPLAIN` nhanh hơn vì không cần quyền đặc biệt

**Đáp án: b** — `EXPLAIN` không chạy query, chỉ cho thấy plan dự tính. `EXPLAIN ANALYZE` chạy query thật (cẩn thận với INSERT/UPDATE/DELETE — nên dùng trong transaction rồi ROLLBACK). Khi "actual rows" >> "estimated rows" (ví dụ estimate 5 rows, actual 50000 rows), statistics lỗi thời → `ANALYZE tablename` để cập nhật. Sau đó `EXPLAIN` lại để xem plan có cải thiện không.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước trong module:**
- `data.mysql-postgres.fundamentals` — instance, connection pool, MVCC
- `data.mysql-postgres.replication` — primary-replica, failover

**Bài liên quan ngoài module:**
- `virt-storage.backup-dr.strategies` — chiến lược backup 3-2-1 áp dụng cho database (xem thêm)
- `monitoring.prometheus-grafana.fundamentals` — export MySQL/PostgreSQL metrics để alert query chậm (xem thêm)

**Nguồn tham khảo:**
- [MySQL 8.0 — Backup Methods](https://dev.mysql.com/doc/refman/8.0/en/backup-methods.html)
- [MySQL 8.0 — Slow Query Log](https://dev.mysql.com/doc/refman/8.0/en/slow-query-log.html)
- [PostgreSQL — SQL Dump](https://www.postgresql.org/docs/current/backup-dump.html)
