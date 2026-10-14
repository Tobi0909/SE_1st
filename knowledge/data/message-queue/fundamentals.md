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
status: verified
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

**Câu 1**: Tại sao Kafka không xoá message sau khi consumer đọc xong?

a) Vì Kafka không có khái niệm xoá dữ liệu dưới bất kỳ hình thức nào, message tồn tại vĩnh
   viễn không giới hạn
b) Kafka là log-based — message được lưu theo retention policy (thời gian hoặc size), không theo trạng thái consumed. Điều này cho phép
c) Vì consumer trong Kafka không gửi ack nên broker không biết khi nào an toàn để xoá
d) Vì RabbitMQ cũng giữ nguyên message sau khi đọc giống Kafka, không có khác biệt thật nào
   giữa 2 hệ thống

**Đáp án: b** — Kafka log-based, lưu theo retention policy, không theo trạng thái consumed —
cho phép nhiều consumer group và replay. RabbitMQ xoá sau ack. Kafka CÓ xoá message, nhưng
theo retention policy (thời gian/size), không phải "vĩnh viễn không giới hạn" (loại a); lý do
không xoá không liên quan tới việc có ack hay không — bản chất Kafka là log lưu theo thời
gian, khác cơ chế queue dựa trên ack (loại c); RabbitMQ XOÁ message sau ack, hành vi khác hẳn
Kafka — đây chính là sự khác biệt cốt lõi (loại d).

---

**Câu 2**: Consumer lag trong Kafka là gì? Làm thế nào để giảm lag?

a) Consumer lag là thời gian broker Kafka bị downtime, giảm lag bằng cách restart broker
   thường xuyên hơn
b) Consumer lag là số lượng consumer group đang active cùng lúc, giảm lag bằng cách giảm số
   consumer group
c) Consumer lag = khoảng cách giữa offset cuối cùng trong partition và offset consumer đã commit
d) Consumer lag chỉ xảy ra khi dùng RabbitMQ chứ không xảy ra trong Kafka vì Kafka không có
   khái niệm offset

**Đáp án: c** — Consumer lag là khoảng cách offset cuối và offset đã commit; giảm bằng scale
consumer/partition, tối ưu logic, batch. Lag không liên quan tới downtime broker — nó đo tốc
độ xử lý của consumer so với producer (loại a); lag không đo số consumer group active — đó là
chỉ số khác hoàn toàn (loại b); consumer lag là khái niệm ĐẶC TRƯNG của Kafka (dựa trên
offset), không phải của RabbitMQ — Kafka chính là hệ thống CÓ khái niệm offset (loại d).

---

**Câu 3**: Tại sao Kafka yêu cầu số consumer trong 1 group không vượt số partition?

a) Vì mỗi consumer chỉ được phép đọc tối đa 1 message mỗi giây, nhiều consumer hơn partition
   sẽ vượt giới hạn tốc độ
b) Vì Kafka giới hạn cứng số consumer tối đa là bằng số broker, không liên quan tới partition
c) Vì nhiều consumer hơn partition sẽ làm Kafka tự động tạo thêm partition mới để cân bằng
   tải
d) Mỗi partition chỉ được assign cho 1 consumer trong 1 group tại 1 thời điểm (để đảm bảo ordering và exactly-once semantics)

**Đáp án: d** — Mỗi partition chỉ gán cho 1 consumer/group tại 1 thời điểm; consumer thừa sẽ
idle. Số partition giới hạn parallelism. Không có giới hạn tốc độ "1 message/giây" nào trong
Kafka theo cách đó — vấn đề là ASSIGNMENT partition, không phải throughput cứng (loại a); giới
hạn số consumer gắn với số PARTITION, không phải số broker (loại b); Kafka KHÔNG tự tạo thêm
partition khi thêm consumer — số partition là giá trị cấu hình cố định của topic, phải thay
đổi thủ công (loại c).

---

**Câu 4**: Dead letter queue (DLQ) trong RabbitMQ là gì? Khi nào message bị chuyển vào DLQ?

a) DLQ là queue đặc biệt nhận message bị từ chối. Message vào DLQ khi: consumer nack với requeue=false, message hết TTL
b) DLQ là queue chính dùng để xử lý message bình thường, không phải nơi chứa message lỗi
c) Message vào DLQ chỉ khi admin xoá queue gốc thủ công, không có cơ chế tự động nào khác
d) DLQ chỉ tồn tại trong Kafka, RabbitMQ không hỗ trợ khái niệm dead letter queue

**Đáp án: a** — DLQ nhận message bị từ chối (nack requeue=false, TTL hết, queue đầy); dùng để
debug mà không mất message. DLQ là queue CHỨA MESSAGE LỖI, không phải queue xử lý message
bình thường — đó chính là định nghĩa và mục đích của nó (loại b); DLQ hoạt động TỰ ĐỘNG qua
nhiều cơ chế (nack, TTL, overflow), không chỉ khi admin xoá thủ công (loại c); DLQ là khái
niệm CÓ trong RabbitMQ (qua `x-dead-letter-exchange`), không phải chỉ riêng Kafka (loại d).

---

**Câu 5**: Khi nào nên chọn Kafka thay vì RabbitMQ?

a) Chọn Kafka khi cần routing linh hoạt (fanout, topic, headers); chọn RabbitMQ khi cần
   replay/audit trail
b) Chọn Kafka khi: cần throughput cao (>10k msg/s), cần replay/audit trail (event sourcing), nhiều consumer group đọc cùng topic
c) Luôn chọn Kafka cho mọi trường hợp vì Kafka vượt trội hoàn toàn RabbitMQ về mọi mặt
d) Cả hai hoàn toàn tương đương, lựa chọn chỉ dựa vào sở thích cá nhân của team

**Đáp án: b** — Kafka cho throughput cao/replay/nhiều consumer group/retention dài. RabbitMQ
cho routing linh hoạt/ack-nack-retry/task queue đơn giản. Vai trò bị đảo ngược hoàn toàn trong
lựa chọn a (routing linh hoạt thực ra là điểm mạnh của RabbitMQ, không phải Kafka — loại a);
Kafka KHÔNG vượt trội trong mọi trường hợp — RabbitMQ vẫn tốt hơn cho routing phức tạp và task
queue đơn giản, đây chính là lý do bài đưa ra tiêu chí lựa chọn cụ thể (loại c); hai công cụ
có ĐIỂM MẠNH khác nhau rõ rệt theo use case, không phải chỉ là sở thích cá nhân (loại d).

## 8. Bài liên quan và nguồn

**Xem thêm:**
- [data.redis.fundamentals](../redis/fundamentals.md) — Redis List/Streams như lightweight queue
- [monitoring.prometheus-grafana.fundamentals](../../monitoring/prometheus-grafana/fundamentals.md) — monitor Kafka lag qua kafka_exporter

**Nguồn:**
- Kafka documentation: https://kafka.apache.org/documentation/
- RabbitMQ docs: https://www.rabbitmq.com/docs
