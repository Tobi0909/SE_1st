---
id: data.mysql-postgres.replication
title: "Replication: primary-replica, failover cơ bản"
domain: data
module: data.mysql-postgres
level: "vận hành"
prerequisites: ["data.mysql-postgres.fundamentals"]
applies_to:
  - "MySQL 8.0 (binlog replication + GTID) và PostgreSQL 16+ (streaming replication)"
status: draft
sources:
  - "https://dev.mysql.com/doc/refman/8.0/en/replication-configuration.html"
  - "https://www.postgresql.org/docs/current/warm-standby.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Database là single point of failure nguy hiểm nhất trong stack. Primary down → toàn bộ write và
phần lớn read ngừng. Replication là cơ chế tạo bản sao của primary trên một hoặc nhiều replica —
không chỉ để HA (failover) mà còn để:
- **Read scaling**: đẩy read query sang replica, giảm tải primary
- **Backup không lock production**: dump từ replica thay vì primary
- **Zero-downtime migration**: upgrade/migrate replica trước, failover, upgrade cũ sau

Hiểu replication giúp bạn biết khi nào replica bị "lag" nguy hiểm, khi nào cần failover, và failover
không đồng nghĩa với "không mất data."

## 2. Khái niệm cốt lõi

### Replication async vs semi-sync

**Asynchronous** (mặc định cả MySQL lẫn PostgreSQL):
- Primary commit xong → trả lời client thành công → gửi data cho replica
- Nếu primary crash ngay sau commit, replica chưa nhận data → **replication lag có thể mất data**
- Hiệu năng cao nhất (primary không chờ replica)

**Semi-synchronous** (MySQL plugin, PostgreSQL synchronous_commit):
- Primary chờ ít nhất 1 replica xác nhận đã nhận (không cần apply) trước khi trả lời client
- Đảm bảo data không mất nếu primary crash (data đã ở replica)
- Latency tăng nhẹ (thêm 1 network round-trip)

### MySQL: Binlog và GTID

MySQL replication dựa trên **binary log (binlog)** — file ghi lại mọi thay đổi data:

```
Primary                       Replica
[binlog]  ←  write            [relay log] → apply → data
   │                               ↑
   └──── IO thread ────────────────┘
              (replica kéo binlog từ primary)
```

**Binlog format** (MySQL 8.0):
- `ROW` (mặc định và khuyến nghị): ghi thay đổi từng row — safe cho mọi query
- `STATEMENT`: ghi SQL statement — nhỏ hơn nhưng không deterministic với `NOW()`, `RAND()`
- `MIXED`: tự động chọn ROW hoặc STATEMENT theo query

**GTID (Global Transaction ID)**: mỗi transaction có ID duy nhất (`server_uuid:transaction_seq`).
Replica tự biết đã apply đến đâu — không cần chỉ binlog file + position thủ công. GTID = modern
approach, dễ failover hơn.

### PostgreSQL: WAL Streaming Replication

PostgreSQL replication dựa trên **WAL (Write-Ahead Log)** — cùng log dùng cho crash recovery:

```
Primary (pg_wal/) → WAL sender → WAL receiver → standby (pg_wal/) → apply
```

Replica PostgreSQL chạy ở một trong hai mode:
- **Hot standby**: replica có thể serve read-only query
- **Warm standby**: replica apply WAL nhưng không nhận query

### Replication lag

**MySQL**: `SHOW REPLICA STATUS` → `Seconds_Behind_Source` — giây replica đang chậm hơn primary

**PostgreSQL**: `SELECT * FROM pg_stat_replication` trên primary — xem `sent_lsn`, `write_lsn`,
`flush_lsn`, `replay_lsn`. Lag = `sent_lsn - replay_lsn` convert sang bytes.

> **Warning**: `Seconds_Behind_Source = 0` không có nghĩa là "zero data loss" — chỉ nghĩa là
> replica đang apply kịp tốc độ. Nếu network drop, giá trị này có thể là NULL hoặc sai.

## 3. Cách nó hoạt động

### Setup MySQL replication (minh họa)

```sql
-- Trên PRIMARY: bật binlog và set server_id duy nhất
-- my.cnf:
-- [mysqld]
-- server-id = 1
-- log_bin = /var/log/mysql/mysql-bin.log
-- binlog_format = ROW
-- gtid_mode = ON
-- enforce_gtid_consistency = ON

-- Tạo user cho replica
CREATE USER 'replica_user'@'%' IDENTIFIED BY 'strong_password';
GRANT REPLICATION SLAVE ON *.* TO 'replica_user'@'%';
```

```sql
-- Trên REPLICA: chỉ primary và bắt đầu replication
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='primary.db.internal',
  SOURCE_PORT=3306,
  SOURCE_USER='replica_user',
  SOURCE_PASSWORD='strong_password',
  SOURCE_AUTO_POSITION=1;  -- dùng GTID

START REPLICA;
SHOW REPLICA STATUS\G
```

> **Output minh họa** — MySQL không cài trên máy demo.

### Setup PostgreSQL streaming replication (minh họa)

```bash
# postgresql.conf trên PRIMARY:
wal_level = replica          # hoặc logical
max_wal_senders = 10
wal_keep_size = 1GB          # giữ WAL đủ lâu cho replica lag

# pg_hba.conf trên PRIMARY:
host replication replica_user 10.0.2.0/24 scram-sha-256
```

```bash
# Trên REPLICA: clone data từ primary
pg_basebackup -h primary.db.internal -U replica_user \
  -D /var/lib/postgresql/16/main --wal-method=stream --progress

# postgresql.conf trên REPLICA:
primary_conninfo = 'host=primary.db.internal user=replica_user'
hot_standby = on             # cho phép read-only query
```

> **Output minh họa** — PostgreSQL không cài trên máy demo.

### Monitoring replication health

```sql
-- MySQL: kiểm tra replication status (output minh họa)
SHOW REPLICA STATUS\G
-- Các field quan trọng:
--   Replica_IO_Running: Yes   ← IO thread đang kết nối primary
--   Replica_SQL_Running: Yes  ← SQL thread đang apply
--   Seconds_Behind_Source: 0  ← lag tính bằng giây
--   Last_Error:               ← nếu có lỗi apply transaction
```

```sql
-- PostgreSQL: kiểm tra trên PRIMARY (output minh họa)
SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
       (sent_lsn - replay_lsn) AS lag_bytes
FROM pg_stat_replication;
```

## 4. Thực hành

**Tính replication lag từ bytes sang thời gian** (chạy thật):

```bash
python3 -c "
# Ví dụ: replica lag 52428800 bytes (50MB), write rate của primary 5MB/s
lag_bytes = 52428800
write_rate_bytes_per_sec = 5 * 1024 * 1024
lag_seconds = lag_bytes / write_rate_bytes_per_sec
print(f'Lag: {lag_bytes / 1024 / 1024:.1f}MB')
print(f'Estimated time to catch up: {lag_seconds:.0f}s ({lag_seconds/60:.1f} phút)')
print(f'Action needed: {\"YES - investigate\" if lag_seconds > 60 else \"OK - monitor\"}')
"
```

Kết quả thực tế:

```
Lag: 50.0MB
Estimated time to catch up: 10s (0.2 phút)
Action needed: OK - monitor
```

**Alert threshold thực tế**: lag > 30 giây là warning, > 5 phút cần investigate, > 30 phút là
nguy cơ đáng kể mất data khi failover.
<!-- TODO-VERIFY: threshold 30s/5min/30min là convention phổ biến không từ MySQL/PostgreSQL official docs — cần verify từ nguồn SLA chính thức -->

## 5. Lỗi thường gặp và cách chẩn đoán

**`Replica_SQL_Running: No` với Last_Error** — SQL thread gặp lỗi khi apply transaction: thường
là `Duplicate entry` (data bất đồng bộ) hoặc constraint violation. Không tự ý skip error trừ khi
hiểu rõ — skip có thể tạo data divergence không phát hiện được.

**Replication lag tăng dần không hồi phục** — replica apply chậm hơn primary write: nguyên nhân
thường là replica thiếu index (write trên primary không cần index, nhưng replica apply theo row-by-row cần scan). Giải pháp: thêm index trên replica (MySQL: cho phép index khác primary).

**"Binary log file not found"** (MySQL) — replica lag quá xa, primary đã purge binlog cũ. Phải
re-clone replica từ đầu. Phòng ngừa: tăng `binlog_expire_logs_seconds` hoặc `wal_keep_size` đủ
để cover expected max lag.

**Failover nhầm → split brain** (MySQL async) — hai node cùng nghĩ mình là primary, cùng nhận
write. Data diverge, merge cực kỳ khó. Phòng ngừa: dùng orchestrator/MHA tool cho automated
failover; không tự tay promote replica khi primary "có vẻ" down mà chưa xác nhận.

## 6. Tình huống thực tế

**Tình huống**: Primary PostgreSQL bị OOM killed lúc 03:00. Replica `Seconds_Behind_Source` lúc
đó là 3 giây. On-call nhận alert và cần quyết định failover.

**Quy trình failover PostgreSQL** (output minh họa):

```bash
# Bước 1: Confirm primary thực sự down (không phải network blip)
pg_isready -h primary.db.internal -p 5432
# Connection refused → down thật

# Bước 2: Trên replica, promote lên primary
pg_ctl promote -D /var/lib/postgresql/16/main
# Hoặc tạo file trigger:
touch /var/lib/postgresql/16/main/promote_trigger

# Bước 3: Verify replica đã là primary
psql -h replica.db.internal -c "SELECT pg_is_in_recovery();"
-- f  ← không còn recovery = đã là primary

# Bước 4: Redirect app connection string sang replica (đã thành primary)
# Nếu dùng HAProxy/Patroni: tự động; nếu không: cập nhật config app
```

**Data loss assessment**: 3 giây lag + async replication = tối đa 3 giây transaction cuối của
primary chưa replica nhận. Cần confirm với team: các transaction đó là gì, có thể replay không
(nếu có application-level log). Đây là lý do SLA replication lag quan trọng.

## 7. Tự kiểm tra

**Câu 1**: Async replication có thể gây mất data trong tình huống nào?

a) Khi replica bị restart  
b) Khi primary crash ngay sau commit nhưng trước khi replica nhận data đó  
c) Khi replica lag vượt 100 giây  
d) Khi có nhiều hơn 2 replica

**Đáp án: b** — Async replication: primary commit → trả lời client thành công → *sau đó* gửi data cho replica. Nếu primary crash sau commit nhưng trước khi data reach replica, replica không bao giờ nhận data đó. Từ góc độ client: transaction đã committed thành công; từ góc độ replica: transaction không tồn tại. Đây là "replication lag = potential data loss window" trong async mode.

---

**Câu 2**: `Seconds_Behind_Source = 0` trong MySQL SHOW REPLICA STATUS nghĩa là gì?

a) Replica đang đồng bộ hoàn toàn, không có rủi ro mất data  
b) Replica đang apply kịp tốc độ hiện tại của primary — không đảm bảo zero data loss nếu primary crash  
c) Replica không cần binlog file từ primary nữa  
d) Replica đang ở chế độ read-only

**Đáp án: b** — `Seconds_Behind_Source` đo thời gian delay trong việc *apply* binlog, không phải thời gian từ commit trên primary đến replica nhận. Với async replication, ngay cả `Seconds_Behind_Source = 0` cũng có một khoảng nhỏ giữa primary commit và replica receive. Nếu network giữa primary và replica bị gián đoạn, field này có thể NULL.

---

**Câu 3**: GTID trong MySQL replication giải quyết vấn đề gì so với binlog position?

a) GTID cho phép replication nhanh hơn vì không cần đọc binlog  
b) GTID là ID duy nhất mỗi transaction, replica tự biết đã apply đến đâu mà không cần lưu binlog filename + position thủ công — dễ failover và tránh duplicate apply  
c) GTID bật semi-sync tự động  
d) GTID chỉ dùng cho PostgreSQL

**Đáp án: b** — Với binlog position (cũ): khi failover, replica mới phải biết "bắt đầu từ file `mysql-bin.000042` position `12345`" — thông tin này phải track thủ công và dễ sai. GTID: mỗi transaction có ID duy nhất toàn cụm, replica chỉ cần nói "tôi đã có đến GTID X, cho tôi từ X+1 trở đi" — server tự handle. Failover với GTID đơn giản và an toàn hơn nhiều.

---

**Câu 4**: Khi nào cần re-clone replica từ đầu (thay vì chỉ restart replication)?

a) Mỗi khi primary restart  
b) Khi replica lag vượt 60 giây  
c) Khi primary đã purge binlog/WAL mà replica cần để catch up từ vị trí hiện tại  
d) Khi replica có read query nhiều hơn primary

**Đáp án: c** — Primary giữ binlog/WAL trong thời gian giới hạn (`binlog_expire_logs_seconds` hoặc `wal_keep_size`). Nếu replica lag quá xa và primary đã xóa binlog đó, replica không còn nguồn để catch up — phải re-clone toàn bộ data từ primary. Phòng ngừa: set giữ binlog đủ lâu để cover expected max lag (ví dụ: lag max 30 phút → giữ binlog tối thiểu 2 tiếng).

---

**Câu 5**: Tại sao "split brain" (hai node cùng là primary) nguy hiểm với database?

a) Vì một node sẽ bị overload  
b) Vì cả hai node nhận write đồng thời với data khác nhau → diverge không tự động merge được, phải manual intervention để quyết định data nào đúng  
c) Vì network giữa hai node bị loop  
d) Vì autovacuum chạy hai lần trên cùng data

**Đáp án: b** — Khi cả hai node nhận write: `node A: UPDATE orders SET status='paid' WHERE id=1` trong khi `node B: DELETE FROM orders WHERE id=1`. Data diverge không có cách merge tự động đúng đắn. Recovery yêu cầu manual comparison, có thể mất data một phía. Đây là lý do failover tool (Patroni, MHA, Orchestrator) dùng distributed consensus (etcd, ZooKeeper) để đảm bảo chỉ một node được promote tại một thời điểm.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước trong module:**
- `data.mysql-postgres.fundamentals` — instance, connection pool, storage engine

**Bài liên quan trong module:**
- `data.mysql-postgres.backup-tuning` — backup từ replica, slow query log

**Bài liên quan ngoài module:**
- `monitoring.prometheus-grafana.fundamentals` — alert replication lag qua mysqld_exporter / postgres_exporter
- `sre.incident-response.process` — failover là incident P1, áp dụng đúng quy trình

**Nguồn tham khảo:**
- [MySQL 8.0 — Replication Configuration](https://dev.mysql.com/doc/refman/8.0/en/replication-configuration.html)
- [PostgreSQL — Standby Server Operation (Streaming Replication)](https://www.postgresql.org/docs/current/warm-standby.html)
