---
id: data.message-queue.fundamentals
title: "Message queue: khái niệm, so sánh cơ bản Kafka/RabbitMQ"
domain: data
module: data.message-queue
level: vận hành
prerequisites: []
applies_to:
  - Kafka 3.x
  - RabbitMQ 3.x
  - Distributed systems
status: draft
sources:
  - https://kafka.apache.org/documentation/
  - https://www.rabbitmq.com/docs
last_verified: "2026-10-07"
author: tuank63uet@gmail.com
---

## 1. Vì sao cần biết

Khi service A cần gửi dữ liệu cho service B, cách đơn giản nhất là gọi trực tiếp (HTTP/gRPC). Nhưng cách này có vấn đề:

- **Temporal coupling**: A phải chờ B, nếu B chậm thì A chậm theo
- **Availability coupling**: nếu B down, A không gửi được — phải retry logic phức tạp
- **Scale mismatch**: A tạo 10,000 event/s nhưng B chỉ xử lý được 1,000/s

**Message queue** giải quyết bằng cách đặt buffer ở giữa: A gửi vào queue, B đọc theo tốc độ của mình. A và B không cần biết nhau và không phải online cùng lúc.

## 2. Khái niệm cốt lõi

### Mô hình giao tiếp

| Mô hình | Ví dụ | Queue đóng vai gì |
|---------|-------|------------------|
| **Point-to-point** (Queue) | Task worker: giao đúng 1 consumer xử lý | Message consumed = xoá |
| **Pub/Sub** (Topic) | Notification fan-out: mọi subscriber nhận | Message giữ đến khi retention hết |

### Kafka — log-based message streaming

Kafka coi message queue là **persistent, ordered log**:

```
Topic: "orders"
Partition 0: [msg1] [msg2] [msg3] [msg4] ...
Partition 1: [msg5] [msg6] [msg7] [msg8] ...

Consumer Group "billing":
  consumer-1 → Partition 0 (offset=3)
  consumer-2 → Partition 1 (offset=7)

Consumer Group "analytics":
  consumer-3 → Partition 0 (offset=3)  ← đọc lại từ offset cũ được
  consumer-4 → Partition 1 (offset=7)
```

**Đặc điểm Kafka**:
- **Retention**: message không xoá sau khi consumed; giữ theo thời gian (mặc định 7 ngày) <!-- TODO-VERIFY: Kafka default retention 7 ngày vs 168h -->
- **Replay**: consumer có thể seek về offset cũ để đọc lại
- **Consumer Group**: nhiều group độc lập — billing đọc riêng, analytics đọc riêng
- **Partition**: đơn vị parallelism — 1 partition chỉ được 1 consumer trong 1 group đọc tại 1 thời điểm
- **High throughput**: Kafka tối ưu cho write (sequential I/O, batch, zero-copy)

### RabbitMQ — message broker truyền thống

RabbitMQ theo mô hình AMQP: message đi qua **exchange** rồi routing vào **queue**:

```
Producer ──▶ Exchange ──routing key──▶ Queue ──▶ Consumer
                │
                ├── Direct: routing key khớp chính xác
                ├── Fanout: broadcast tất cả queue bound
                ├── Topic: routing key wildcard (*.error, payment.#)
                └── Headers: routing theo header attribute
```

**Đặc điểm RabbitMQ**:
- **Ack-based**: consumer ack sau khi xử lý xong — chưa ack thì broker giữ lại và requeue
- **Dead letter queue (DLQ)**: message fail sau N lần retry → chuyển sang DLQ để debug
- **Message routing linh hoạt**: Exchange type fanout/topic/headers
- **Lower throughput so với Kafka**: mỗi message được track riêng, phù hợp task queue

### So sánh Kafka vs RabbitMQ

| Tiêu chí | Kafka | RabbitMQ |
|---------|-------|---------|
| Throughput | Rất cao (triệu msg/s) | Trung bình (~50k msg/s) |
| Message retention | Theo thời gian/size | Sau khi ack, message bị xoá |
| Replay | Có (seek offset) | Không (một khi acked) |
| Routing | Partition key | Exchange type |
| Use case chính | Event streaming, log aggregation | Task queue, RPC, workflow |
| Ordering | Per-partition | Per-queue |
| Consumer model | Pull (consumer poll) | Push (broker push) |

## 3. Cách nó hoạt động

### Kafka: producer và consumer flow

```
1. Producer gửi: ProducerRecord{topic="orders", key="user-123", value=payload}
2. Partitioner: hash(key) % numPartitions → Partition 1
3. Batch + compress → gửi lên broker
4. Leader broker ghi vào log, replicat sang follower
5. Producer nhận ACK (acks=all → tất cả replica xác nhận)

6. Consumer poll mỗi N ms: fetch từ assigned partition theo offset
7. Xử lý message
8. Commit offset (auto hoặc manual)
```

`acks=all` + `min.insync.replicas=2` = message không mất ngay cả khi leader crash.

### RabbitMQ: delivery và ack flow

```
1. Producer publish: BasicPublish(exchange="orders", routingKey="payment")
2. Exchange route → Queue "payment-processing"
3. Consumer nhận (push)
4. Consumer xử lý
5. Channel.BasicAck(deliveryTag) → broker xoá message
   hoặc Channel.BasicNack(requeue=true) → broker requeue
   hoặc timeout → broker requeue (tùy `x-message-ttl`)
```

### Consumer lag — metric quan trọng nhất

**Kafka consumer lag** = offset cao nhất trong partition − offset consumer đã commit

```
partition  latest_offset  consumer_offset  lag
  0           5000            4900          100
  1           4800            4800            0
  2           5100            4500          600   ← cần chú ý
```

Lag tăng → consumer đang xử lý chậm hơn producer tạo. Alert khi lag vượt ngưỡng để scale consumer.

## 4. Thực hành

Kafka và RabbitMQ không cài trên máy. Dưới đây là output minh họa kết hợp với tính toán thật.

### Tính throughput cần thiết (chạy thật)

```bash
python3 -c "
# Ước tính partition Kafka cần thiết
target_throughput_msg_per_sec = 50_000
throughput_per_partition = 10_000  # Kafka guideline: 10MB/s hoặc ~10k msg/s per partition

partitions_needed = target_throughput_msg_per_sec / throughput_per_partition
consumers_needed = partitions_needed  # 1 consumer per partition

# Storage estimation
msg_size_bytes = 500
retention_days = 7
replication_factor = 3

raw_bytes_per_day = target_throughput_msg_per_sec * 86400 * msg_size_bytes
total_storage_gb = raw_bytes_per_day * retention_days * replication_factor / 1e9

print(f'Target: {target_throughput_msg_per_sec:,} msg/s')
print(f'Partitions needed: {partitions_needed:.0f}')
print(f'Consumers needed (1:1 partition): {consumers_needed:.0f}')
print(f'Storage per broker (RF=3): {total_storage_gb:.0f} GB for 7-day retention')
"
```

```
Target: 50,000 msg/s
Partitions needed: 5
Consumers needed (1:1 partition): 5
Storage per broker (RF=3): 907 GB for 7-day retention
```

### Kafka CLI — kiểm tra consumer lag (output minh họa)

```bash
# Xem lag của consumer group
kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --group billing-service \
  --describe

# Output:
GROUP            TOPIC     PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
billing-service  orders    0          4900            5000            100
billing-service  orders    1          4800            4800              0
billing-service  orders    2          4500            5100            600
```

### RabbitMQ management (output minh họa)

```bash
# Xem queue depth
rabbitmqctl list_queues name messages consumers

# Name                    Messages  Consumers
# payment-processing      1234      5
# email-notification      0         2
# dead-letter             89        0   ← DLQ có message, cần investigate
```

## 5. Lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|-----|-------------|-----------|
| Consumer lag tăng không ngừng | Consumer chậm hơn producer | Scale consumer (thêm instance), tăng partition, tối ưu processing logic |
| `LEADER_NOT_AVAILABLE` (Kafka) | Broker vừa restart hoặc partition đang elect leader | Retry với backoff; kiểm tra broker health |
| Message stuck trong DLQ (RabbitMQ) | Consumer throw exception liên tục | Kiểm tra log consumer, xử lý error case, rồi re-queue từ DLQ |
| Partition imbalance | Tất cả message vào 1 partition | Kiểm tra partition key — key `null` → round-robin; key trùng lặp cao → custom partitioner |
| Consumer không ack (RabbitMQ) | Unacked messages tăng, queue không giảm | Consumer bị stuck/crash; set `prefetch-count` phù hợp; giám sát unacked count |

## 6. Tình huống thực tế

**Tình huống**: E-commerce platform sau khi flash sale, queue `order-created` của RabbitMQ có 50,000 message pending, consumer lag tăng liên tục. Đội phát hiện thêm: 3,000 message trong DLQ.

**Điều tra**:
```
# rabbitmqctl list_queues (output minh họa)
order-created     50234    3
order-dlq          3012    1
```

Consumer group chỉ có 3 instance, mỗi instance xử lý 1 message/s — throughput 3 msg/s trong khi order đến 100 msg/s lúc đỉnh điểm.

**Khắc phục**:
1. Scale consumer từ 3 → 15 instance (15 msg/s → lag giảm dần)
2. Điều tra DLQ: 3,000 message fail vì call tới payment service timeout — payment service bị quá tải
3. Thêm circuit breaker: nếu payment timeout, nack message và retry sau 30s thay vì immediate requeue
4. Thêm monitoring: alert khi `queue.messages > 1000` hoặc `dlq.messages > 100`

Sau 20 phút scale consumer, lag về 0. DLQ message được reprocess sau khi payment service ổn định.

## 7. Tự kiểm tra

**1. Tại sao Kafka không xoá message sau khi consumer đọc xong?**

Kafka là log-based — message được lưu theo retention policy (thời gian hoặc size), không theo trạng thái consumed. Điều này cho phép: (1) nhiều consumer group đọc độc lập cùng topic, (2) consumer có thể replay về offset cũ để xử lý lại. RabbitMQ thì xoá message sau khi consumer ack — phù hợp cho task queue nơi mỗi task chỉ cần xử lý một lần.

**2. Consumer lag trong Kafka là gì? Làm thế nào để giảm lag?**

Consumer lag = khoảng cách giữa offset cuối cùng trong partition và offset consumer đã commit. Lag tăng nghĩa là consumer đang xử lý chậm hơn producer. Giảm lag bằng: scale consumer (không vượt số partition), tăng partition để tăng parallelism, tối ưu logic xử lý, hoặc batch processing.

**3. Tại sao Kafka yêu cầu số consumer trong 1 group không vượt số partition?**

Mỗi partition chỉ được assign cho 1 consumer trong 1 group tại 1 thời điểm (để đảm bảo ordering và exactly-once semantics). Nếu có nhiều consumer hơn partition, consumer thừa sẽ idle — không có partition để đọc. Số partition là giới hạn parallelism của consumer group.

**4. Dead letter queue (DLQ) trong RabbitMQ là gì? Khi nào message bị chuyển vào DLQ?**

DLQ là queue đặc biệt nhận message bị từ chối. Message vào DLQ khi: consumer nack với `requeue=false`, message hết TTL (`x-message-ttl`), hoặc queue đầy (`x-overflow: dead-letter`). DLQ dùng để debug message thất bại mà không làm mất — team có thể inspect, sửa code, rồi requeue lại.

**5. Khi nào nên chọn Kafka thay vì RabbitMQ?**

Chọn Kafka khi: cần throughput cao (>10k msg/s), cần replay/audit trail (event sourcing), nhiều consumer group đọc cùng topic (streaming pipeline), hoặc cần retention dài (log aggregation). Chọn RabbitMQ khi: cần routing linh hoạt (fanout, topic, headers), workflow với ack/nack/retry built-in, hoặc task queue đơn giản với throughput vừa phải.

## 8. Bài liên quan và nguồn

**Xem thêm:**
- [data.redis.fundamentals](../redis/fundamentals.md) — Redis List/Streams như lightweight queue
- [monitoring.prometheus-grafana.fundamentals](../../monitoring/prometheus-grafana/fundamentals.md) — monitor Kafka lag qua kafka_exporter

**Nguồn:**
- Kafka documentation: https://kafka.apache.org/documentation/
- RabbitMQ docs: https://www.rabbitmq.com/docs
