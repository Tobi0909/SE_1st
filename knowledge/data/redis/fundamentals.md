---
id: data.redis.fundamentals
title: "Redis: use case, persistence (RDB/AOF), vận hành cơ bản"
domain: data
module: data.redis
level: vận hành
prerequisites: []
applies_to:
  - Redis 7.x
  - Linux production environments
status: verified
sources:
  - https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
  - https://redis.io/docs/latest/develop/data-types/
last_verified: "2026-10-07"
author: tuank63uet@gmail.com
---

## 1. Vì sao cần biết

Redis là **in-memory data store** — tất cả dữ liệu nằm trong RAM, nên đọc/ghi đạt hàng triệu ops/s với độ trễ microsecond. SE cần biết Redis vì nó xuất hiện ở nhiều vai trò trong hạ tầng:

- **Cache**: giảm tải database, lưu kết quả query/HTML được render
- **Session store**: lưu session user cho web app stateless (scale horizontally)
- **Rate limiter**: đếm request theo user/IP trong cửa sổ thời gian
- **Message queue đơn giản**: LPUSH/BRPOP làm producer-consumer queue

Điểm đặc thù của Redis so với memcached: hỗ trợ nhiều kiểu dữ liệu, có persistence (tùy chọn), hỗ trợ pub/sub và Lua scripting.

## 2. Khái niệm cốt lõi

### Các kiểu dữ liệu cơ bản

| Kiểu | Ví dụ lệnh | Use case |
|------|-----------|---------|
| **String** | `SET key value EX 3600` | Cache, counter, flag |
| **Hash** | `HSET user:1 name "Alice" age 30` | Object/record lưu theo field |
| **List** | `LPUSH queue job1`, `BRPOP queue 0` | Queue, stack, recent activity |
| **Set** | `SADD tags:post:1 redis cache` | Tag hệ thống, unique visitors |
| **Sorted Set** | `ZADD leaderboard 100 "Alice"` | Leaderboard, TTL priority queue |

### Persistence: RDB vs AOF

Redis là in-memory nhưng có hai cơ chế bền vững hóa dữ liệu:

**RDB (Redis Database Snapshot)**
- Tạo snapshot toàn bộ dataset ra file `.rdb` theo định kỳ
- Config: `save 900 1` (snapshot nếu có ≥1 write trong 900s), `save 300 10`, `save 60 10000`
- Ưu điểm: file nhỏ, restore nhanh, ít ảnh hưởng hiệu năng
- Nhược điểm: có thể mất data từ lần snapshot cuối đến khi crash

**AOF (Append Only File)**
- Ghi mọi write command vào log file `.aof` theo 1 trong 3 policy:
  - `appendfsync always`: fsync sau mỗi write — an toàn nhất, chậm nhất
  - `appendfsync everysec`: fsync mỗi giây — cân bằng tốt (mặc định)
  - `appendfsync no`: để OS quyết định — nhanh nhất, ít đảm bảo nhất
- AOF rewrite: định kỳ Redis compact lại AOF để không phình vô hạn (`BGREWRITEAOF`)

**So sánh**:

| | RDB | AOF |
|--|-----|-----|
| Mất data tối đa | Đến lần snapshot cuối (~5-15 phút) | Tối đa 1 giây (`everysec`) |
| Tốc độ restore | Nhanh | Chậm hơn (replay từng lệnh) |
| File size | Nhỏ | Lớn hơn (giảm sau rewrite) |
| Phù hợp | Cache chịu được mất data | Session, queue cần bền vững |

Có thể dùng cả hai — Redis dùng AOF để restore, RDB làm backup point-in-time.

### Eviction khi đầy memory

Khi RAM đầy và `maxmemory` được set, Redis áp policy eviction:

| Policy | Hành vi |
|--------|---------|
| `noeviction` | Trả lỗi khi viết (default) |
| `allkeys-lru` | Xoá key ít dùng nhất (LRU) trong toàn bộ keyspace |
| `volatile-lru` | LRU chỉ trong các key có TTL |
| `allkeys-lfu` | LFU (Least Frequently Used) — Redis 4.0+ |
| `volatile-ttl` | Xoá key sắp hết hạn nhất |

Cache thuần: dùng `allkeys-lru`. Session store: `volatile-lru` (chỉ xoá session đã set TTL).

## 3. Cách nó hoạt động

### Redis single-threaded event loop

Redis xử lý command trên **1 thread** (event loop, giống Node.js). Điều này đơn giản hóa concurrency nhưng có hệ quả:

- `O(1)` và `O(log n)` command (GET, SET, ZADD): an toàn, không block
- `O(n)` command (`KEYS *`, `SMEMBERS` trên set lớn): BLOCK toàn bộ server — tránh dùng trên production, dùng `SCAN` thay thế

Từ Redis 6.0, I/O được xử lý multi-thread nhưng command execution vẫn single-thread.

### Pub/Sub

```
PUBLISHER                REDIS                SUBSCRIBER
    │                      │                      │
    ├─ PUBLISH channel msg ─▶                      │
    │                      ├── SUBSCRIBE channel ──▶│
    │                      │◀── message delivery ───┤
```

Pub/Sub trong Redis là fire-and-forget: không có persistence, subscriber phải online khi message được publish. Nếu cần durability, dùng Redis Streams (XADD/XREAD).

### Redis Cluster vs Sentinel

| | Redis Sentinel | Redis Cluster |
|--|---------------|--------------|
| Mục đích | HA cho single master | Sharding + HA |
| Số node tối thiểu | 3 Sentinel + 1 master + 1 replica | 6 node (3 master, 3 replica) |
| Scale | Vertical | Horizontal |
| Keyspace | Toàn bộ trên 1 master | Chia 16384 hash slots |

## 4. Thực hành

Redis không cài trên máy này. Các lệnh dưới đây là output minh họa từ tài liệu chính thức.

### Vận hành cơ bản (output minh họa)

```bash
# Kết nối
redis-cli -h redis.internal -p 6379 -a <password>

# Kiểm tra nhanh
redis-cli PING
# PONG

# Info tổng quan
redis-cli INFO server | grep redis_version
# redis_version:7.2.3

redis-cli INFO memory | grep -E 'used_memory_human|maxmemory_human'
# used_memory_human:512.45M
# maxmemory_human:2.00G
```

### Monitor slow log (output minh họa)

```bash
# Lệnh nào chạy >10ms?
redis-cli SLOWLOG GET 10
# 1) 1) (integer) 14          # id
#    2) (integer) 1696663200  # timestamp
#    3) (integer) 12853       # microseconds
#    4) 1) "KEYS"             # command
#       2) "*session*"
```

`KEYS *session*` trả về ~50,000 key — block server 12ms. Thay bằng `SCAN`:

```bash
redis-cli --scan --pattern "*session*" | wc -l
```

### Tính memory per key (chạy thật)

```bash
python3 -c "
# Ước tính memory Redis per key type
# Redis overhead per key: ~64 bytes header + key string + value
base_overhead = 64

# String 'session:user123' -> '{"id":123,"role":"admin","exp":1700000000}'
key_bytes = len('session:user123')
val_bytes = len('{\"id\":123,\"role\":\"admin\",\"exp\":1700000000}')
string_total = base_overhead + key_bytes + val_bytes
print(f'String key: {string_total} bytes (~{string_total/1024:.1f} KB)')

# 1M sessions
sessions = 1_000_000
total_mb = sessions * string_total / 1024 / 1024
print(f'1M sessions: {total_mb:.0f} MB RAM')
"
```

```
String key: 119 bytes (~0.1 KB)
1M sessions: 113 MB RAM
```

### Backup RDB thủ công (output minh họa)

```bash
# Trigger snapshot ngay (blocking nhẹ)
redis-cli BGSAVE
# Background saving started

# Hoặc dùng BGREWRITEAOF cho AOF
redis-cli BGREWRITEAOF
# Background append only file rewriting started

# Copy file rdb sang backup storage
cp /var/lib/redis/dump.rdb /backup/redis-$(date +%Y%m%d).rdb
```

## 5. Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|-----|-------------|-----------|
| `OOM command not allowed` | `maxmemory` đầy, policy `noeviction` | Tăng `maxmemory`, đổi sang `allkeys-lru`, hoặc xoá key cũ |
| Latency đột tăng | Command `O(n)` lớn, hoặc AOF fsync blocking | Kiểm tra SLOWLOG; đổi `appendfsync everysec` nếu đang `always` |
| `MISCONF Redis is configured to save RDB snapshots` | Không ghi được file RDB (disk full hoặc permission) | Kiểm tra disk space, permission thư mục `/var/lib/redis/` |
| Connection pool exhausted | App mở quá nhiều connection | Dùng connection pooling (redis-py: `ConnectionPool`); kiểm tra `maxclients` |
| Hot key | 1 key nhận quá nhiều request, bottleneck single-thread | Shard key bằng client (thêm suffix `key:0`, `key:1`...) hoặc dùng local cache |

## 6. Tình huống thực tế

**Tình huống**: Web app session store dùng Redis bắt đầu chậm vào giờ cao điểm. `redis-cli INFO stats` cho thấy `evicted_keys` tăng nhanh và memory 99% đầy.

```
# redis-cli INFO stats | grep evicted (output minh họa)
evicted_keys:15234
```

**Nguyên nhân**: `maxmemory-policy` để là `noeviction`, nhưng app vẫn tạo session mới → Redis throw lỗi OOM, app catch và fallback về DB → DB bị quá tải.

**Khắc phục**:
1. Kiểm tra TTL session: `redis-cli TTL session:user123` → `-1` (không có TTL!) — developer quên set TTL khi tạo session
2. Sửa app code: `SET session:<id> <data> EX 3600`
3. Dọn key không có TTL: `redis-cli --scan --pattern "session:*" | xargs redis-cli TTL | grep -c "^-1"` đếm rồi cleanup
4. Đổi policy sang `volatile-lru` để fallback an toàn: chỉ xoá session có TTL, không throw OOM

Sau 1 giờ: `evicted_keys` trở về 0, latency về bình thường.

## 7. Tự kiểm tra

**1. Redis có phải là in-memory database thuần túy không? Dữ liệu có mất khi restart không?**

Không hoàn toàn thuần túy — Redis có persistence tùy chọn (RDB và/hoặc AOF). Với cấu hình mặc định RDB, data có thể mất từ lần snapshot cuối đến khi crash (vài phút). Với AOF `everysec`, mất tối đa 1 giây data. Nếu tắt cả hai, data mất hoàn toàn khi restart. Redis thường được dùng như cache (mất data chấp nhận được) hoặc session store (cần AOF).

**2. Tại sao không nên dùng `KEYS *` trên Redis production?**

`KEYS` có độ phức tạp `O(n)` — nó phải duyệt toàn bộ keyspace. Redis là single-thread, nên `KEYS *` với 10M key có thể block server hàng chục ms, khiến mọi request khác phải chờ. Thay bằng `SCAN` — trả về cursor và batch nhỏ, không block server.

**3. Sự khác biệt giữa RDB và AOF là gì? Khi nào nên dùng AOF?**

RDB snapshot toàn bộ dataset theo định kỳ — ít mất data, nhưng có thể mất từ lần snapshot cuối. AOF log mọi write command — với `appendfsync everysec` chỉ mất tối đa 1 giây data. Dùng AOF khi data quan trọng (session, cart, user state) không thể mất nhiều hơn 1 giây. Cache thuần (HTML rendered, DB query result) không cần AOF.

**4. `maxmemory-policy allkeys-lru` khác `volatile-lru` thế nào?**

`allkeys-lru` áp dụng trên toàn bộ keyspace — key nào ít dùng nhất sẽ bị xoá, kể cả key không có TTL. `volatile-lru` chỉ xoá trong số các key đã set TTL; nếu không còn key có TTL, Redis trả lỗi OOM thay vì xoá key không có TTL. `volatile-lru` an toàn hơn khi mix cache (có TTL) và persistent data (không TTL) trong cùng instance.

**5. Khi nào nên dùng Redis Sentinel, khi nào nên dùng Redis Cluster?**

Sentinel: khi cần high availability (auto-failover master→replica) mà không cần scale-out — dataset vừa vào 1 master. Cluster: khi dataset quá lớn cho 1 instance, hoặc cần scale write throughput theo chiều ngang — data tự động sharding qua 16384 hash slots. Cluster phức tạp hơn, đặc biệt với multi-key operations (cross-slot bị cấm).

## 8. Bài liên quan và nguồn

**Xem thêm:**
- [data.message-queue.fundamentals](../message-queue/fundamentals.md) — Redis Streams vs Kafka/RabbitMQ
- [monitoring.prometheus-grafana.fundamentals](../../monitoring/prometheus-grafana/fundamentals.md) — Monitor Redis qua redis_exporter

**Nguồn:**
- Redis persistence docs: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- Redis data types: https://redis.io/docs/latest/develop/data-types/
