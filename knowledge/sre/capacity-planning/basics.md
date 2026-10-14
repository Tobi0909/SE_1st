---
id: sre.capacity-planning.basics
title: "Capacity planning: dự báo tải, đặt ngưỡng cảnh báo trước khi hết tài nguyên"
domain: sre
module: sre.capacity-planning
level: chuyên sâu
prerequisites:
  - monitoring.prometheus-grafana.fundamentals
applies_to:
  - Linux servers
  - Kubernetes clusters
  - General infrastructure
status: verified
sources:
  - https://sre.google/workbook/table-of-contents/
  - https://www.brendangregg.com/usemethod.html
last_verified: "2026-10-07"
author: tuank63uet@gmail.com
---

## 1. Vì sao cần biết

Hết tài nguyên (CPU, RAM, disk, network) thường xảy ra **đột ngột từ góc nhìn của người không theo dõi**, nhưng **có thể dự đoán** nếu có dữ liệu lịch sử. Capacity planning giúp:

- Trả lời câu hỏi "tháng sau có cần scale không?" trước khi outage xảy ra
- Đặt cảnh báo đúng: không alert quá sớm (false positive gây fatigue), không quá muộn (không kịp phản ứng)
- Mua thêm tài nguyên hoặc scale đúng thời điểm (đặt máy chủ phần cứng cần 2-4 tuần trước)

## 2. Khái niệm cốt lõi

### USE Method (Brendan Gregg)

Với mỗi tài nguyên, đo 3 chiều:

| Chiều | Định nghĩa | Ví dụ |
|-------|-----------|-------|
| **U**tilization | % thời gian tài nguyên đang bận | CPU 70%, disk 80% |
| **S**aturation | Mức độ công việc đang xếp hàng chờ | CPU run queue > nproc, disk await cao |
| **E**rrors | Số lỗi xảy ra | TCP retransmit, disk I/O error |

Chỉ nhìn Utilization là không đủ: CPU 50% nhưng run queue 10 (saturation cao) vẫn là vấn đề hiệu năng nghiêm trọng.

### Ngưỡng cảnh báo theo tài nguyên

```
0%          70%           90%  100%
│────────────│─────────────│────│
  Normal      Warning zone  ▲   Saturation point
                             │
                        Alert threshold
```

Thực hành phổ biến <!-- TODO-VERIFY: ngưỡng này là convention, không phải chuẩn RFC -->:

| Tài nguyên | Warning | Critical | Lý do headroom |
|------------|---------|----------|----------------|
| Disk | 80% | 90% | Log/core dump tạm thời, GC pause |
| CPU (sustained) | 70% over 5min | 90% over 1min | Absorb spike 2-3x |
| Memory | 85% | 95% | Kernel buffer/cache co lại, OOM ~95%+ |
| Network | 70% | 85% | Retransmit tăng phi tuyến khi gần saturation |

### Lead time và quy tắc 70%

Khi utilization đạt **70% capacity**, bắt đầu lên kế hoạch scale. Lead time thực tế:
- VM cloud: vài phút (auto-scaling) hoặc vài ngày (review budget)
- Bare metal / colocation: 2-4 tuần
- Network circuit upgrade: 1-3 tháng

### Headroom planning

Không chạy sát giới hạn vì:
- Spike traffic có thể 2-3x bình thường (flash sale, viral post)
- Zero-day patch cần restart → tạm thời tăng tải
- Blue-green deployment chạy 2x instance cùng lúc

Giữ **ít nhất 30% headroom** cho resource critical.

## 3. Cách nó hoạt động

### Quy trình capacity planning

```
1. COLLECT    Thu thập metric lịch sử 30-90 ngày
      │       (Prometheus TSDB / CSV export)
      ▼
2. ANALYZE    Tính growth rate; tách baseline từ spike (dùng P95)
      │
      ▼
3. MODEL      Dự báo: tuyến tính / exponential / seasonal
      │
      ▼
4. THRESHOLD  Alert = "projected time to capacity < lead_time"
      │       Ví dụ: alert khi disk đầy trong < 7 ngày
      ▼
5. REVIEW     So sánh dự báo vs thực tế mỗi tháng
              Cập nhật model nếu growth rate thay đổi
```

### PromQL cho capacity metrics

```promql
# Disk sẽ đầy sau bao nhiêu giây? (predict_linear)
predict_linear(node_filesystem_avail_bytes[7d], 30*24*3600) < 0

# % disk đã dùng
100 - (node_filesystem_avail_bytes / node_filesystem_size_bytes * 100)

# CPU utilization trung bình 5 phút
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory pressure: < 10% còn lại
node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes < 0.1
```

Hàm `predict_linear(metric[window], seconds)` trong Prometheus tự làm linear regression — không cần viết script riêng.

## 4. Thực hành

### Dự báo disk usage (chạy thật)

```bash
python3 << 'EOF'
import datetime

# Dữ liệu lịch sử disk usage (%) qua 30 ngày — trong thực tế lấy từ Prometheus API
data = [
    (0, 55.2), (3, 56.1), (6, 56.8), (9, 57.5), (12, 58.3),
    (15, 59.0), (18, 59.9), (21, 60.5), (24, 61.3), (27, 62.0),
    (30, 62.8),
]

days = [d[0] for d in data]
usage = [d[1] for d in data]

# Linear regression (least squares)
n = len(days)
slope = (n*sum(x*y for x,y in zip(days,usage)) - sum(days)*sum(usage)) / \
        (n*sum(x**2 for x in days) - sum(days)**2)
intercept = (sum(usage) - slope*sum(days)) / n

print(f"Growth rate: {slope:.2f}%/day  ({slope*30:.1f}%/month)")
print(f"Current usage: {usage[-1]:.1f}%")

for threshold in [70, 80, 90]:
    days_to = (threshold - intercept) / slope
    remaining = days_to - 30
    if remaining > 0:
        eta = datetime.date.today() + datetime.timedelta(days=int(remaining))
        print(f"Reach {threshold}%: ~{remaining:.0f} days ({eta})")
EOF
```

```
Growth rate: 0.25%/day  (7.5%/month)
Current usage: 62.8%
Reach 70%: ~29 days (2026-11-04)
Reach 80%: ~69 days (2026-12-14)
Reach 90%: ~109 days (2027-01-23)
```

**Đọc kết quả**: cần expand disk trước ngày 2026-11-04 (29 ngày nữa) nếu lead time là 14 ngày. Alert trigger ngay hôm nay.

### Kiểm tra tài nguyên hiện tại (chạy thật)

```bash
# Disk usage tất cả filesystem
df -h --output=source,size,used,avail,pcent | grep -v tmpfs
```

```
Filesystem       Size  Used Avail Use%
/dev/sda1        100G   46G   54G  47%
/dev/sda2        500G  312G  188G  63%
```

```bash
# Memory: MemAvailable là quan trọng nhất
grep -E 'MemTotal|MemFree|MemAvailable|Cached' /proc/meminfo | head -5
```

```
MemTotal:       32768000 kB
MemFree:         4096000 kB
MemAvailable:   18432000 kB
Cached:          8192000 kB
```

MemAvailable = 18.4GB / 32GB = 56% còn lại — còn nhiều headroom.

### Prometheus alert rule cho capacity

```yaml
# output minh họa — thêm vào PrometheusRule
groups:
  - name: capacity
    rules:
      - alert: DiskFillingUp
        expr: |
          predict_linear(node_filesystem_avail_bytes{fstype!="tmpfs"}[6h], 7*24*3600) < 0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Disk sẽ đầy trong 7 ngày"
          description: "{{ $labels.instance }}: {{ $labels.mountpoint }}"

      - alert: HighMemoryPressure
        expr: node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes < 0.15
        for: 5m
        labels:
          severity: warning
```

## 5. Lỗi thường gặp

| Lỗi | Hậu quả | Cách tránh |
|-----|---------|-----------|
| Đặt alert quá thấp (disk 50%) | Alert fatigue — team ignore alert | Dùng `predict_linear` thay vì threshold tĩnh |
| Dùng mean thay vì P95 | Spike che khuất, baseline sai | Tính growth rate từ P95 daily metric |
| Quên seasonal pattern | Flash sale tháng 12 gây outage | Nhân growth rate với seasonal factor (tháng 12 × 3x) |
| Chỉ theo dõi 1 chiều | Disk còn nhưng inode hết | Monitor disk space VÀ inode (`df -i`) |
| Bỏ qua network bandwidth | 1GbE đang 95% saturation âm thầm | Thêm `node_network_transmit_bytes_total` vào dashboard |

## 6. Tình huống thực tế

**Tình huống**: Sáng thứ Hai, disk `/var/log` đột ngột đầy 100% do log debug một feature bị bật nhầm qua tuần cuối. Service không start được vì không ghi được log.

**Phòng ngừa qua capacity planning**:
1. `predict_linear` từ Prometheus phát hiện disk sẽ đầy trong 2 ngày — alert "DiskFillingUp" bắn từ Chủ Nhật
2. Alert routing (xem `monitoring.prometheus-grafana.alertmanager`) gửi PagerDuty cho người on-call
3. On-call dọn log debug trước khi đến mức 100%

**Nếu không có predict_linear**: chỉ có threshold tĩnh 80% — disk tăng từ 70% lên 100% trong 2 ngày, không kịp alert khi đang ở dưới 80%.

```
# PromQL output (output minh họa)
predict_linear(node_filesystem_avail_bytes{mountpoint="/var/log"}[6h], 2*24*3600)
→ -10737418240  # âm = sẽ âm 10GB sau 2 ngày = disk sẽ đầy
```

## 7. Tự kiểm tra

**Câu 1**: USE Method gồm 3 chiều nào? Tại sao chỉ nhìn Utilization là không đủ?

a) Utilization, Availability, Efficiency — ba chiều này đo trực tiếp SLA, không liên quan
   tới Saturation/Errors
b) Usage, Scalability, Efficiency — USE là viết tắt của 3 từ này, không phải
   Utilization/Saturation/Errors
c) Utilization (% bận), Saturation (queue depth / wait time), Errors. Utilization 50% có thể vẫn là bottleneck nếu Saturation cao (run queue dài)
d) Chỉ cần đo Utilization là đủ, Saturation và Errors chỉ là chỉ số phụ không cần theo dõi
   riêng

**Đáp án: c** — Utilization, Saturation, Errors. Utilization 50% vẫn có thể bottleneck nếu
Saturation cao. USE không phải viết tắt của Availability/Efficiency hay Usage/Scalability —
đúng 3 chữ là Utilization/Saturation/Errors (loại a, b); Saturation và Errors là hai chiều
CHÍNH, không phải chỉ số phụ — chính chúng mới phát hiện bottleneck mà Utilization bỏ sót
(loại d).

---

**Câu 2**: Tại sao không nên đặt alert disk ở 95% thay vì 80%?

a) Vì 95% là ngưỡng dành riêng cho RAM, không áp dụng được cho disk theo quy ước ngành
b) Vì hệ điều hành tự động chặn mọi write khi đạt đúng 80%, nên đặt alert ở đó là bắt buộc
   kỹ thuật
c) Vì 95% khiến Prometheus tính toán predict_linear sai hoàn toàn, chỉ 80% mới cho kết quả
   đúng
d) Disk 95% → chỉ còn 5% buffer. Log file, core dump, hay swap có thể tạo file lớn đột ngột — 5% biến mất trong vài phút

**Đáp án: d** — 95% chỉ còn 5% buffer, dễ cạn trong vài phút; lead time phản ứng cần 10-30
phút. 80% cho buffer đủ. Không có quy ước "95% riêng cho RAM" — đây là vấn đề chung về buffer
thời gian phản ứng, áp dụng cho cả disk (loại a); OS không có hành vi "tự chặn write ở đúng
80%" — đó không phải cơ chế kernel thật (loại b); `predict_linear` không bị ảnh hưởng bởi
việc chọn ngưỡng alert 80% hay 95% — đây là hai vấn đề độc lập (loại c).

---

**Câu 3**: Hàm `predict_linear` trong Prometheus làm gì? Ưu điểm so với threshold tĩnh?

a) predict_linear(metric[window], seconds) thực hiện linear regression trên chuỗi metric trong window và dự báo giá trị sau seconds giây
b) predict_linear tính trung bình động (moving average) của metric, không liên quan gì tới
   dự báo tương lai
c) predict_linear chỉ hoạt động với metric kiểu Counter, không áp dụng được cho Gauge như
   disk usage
d) predict_linear trả về giá trị hiện tại đã được làm tròn, không phải giá trị dự báo trong
   tương lai

**Đáp án: a** — `predict_linear` làm linear regression và dự báo giá trị tương lai, ưu điểm
alert sớm theo dự báo thay vì threshold tĩnh. Đây KHÔNG phải moving average — nó là HỒI QUY
TUYẾN TÍNH dự báo tương lai, khác hẳn trung bình động (loại b); `predict_linear` áp dụng tốt
cho Gauge (disk usage), đó chính là use case điển hình của hàm này (loại c); hàm này trả về
giá trị DỰ BÁO trong tương lai (sau `seconds`), không phải giá trị hiện tại làm tròn (loại d).

---

**Câu 4**: Growth rate của disk là 0.5%/ngày. Disk hiện ở 65%, capacity 100GB. Cần hành động
khi nào nếu lead time expand là 14 ngày?

a) 90%-65%=25%, 25%/0.5%=50 ngày tới ngưỡng 90%; cần alert ngay lập tức ở 65% vì đã quá hạn
   lead time 14 ngày
b) Alert threshold cần kích hoạt 14 ngày trước khi đạt 90% (critical threshold). 90% - 65% = 25% còn lại. 25% / 0.5% per day = 50 ngày
c) Cần hành động khi disk đạt 86%, vì 100% - 14 ngày × 1%/ngày = 86% là ngưỡng an toàn duy
   nhất
d) Không cần hành động nào vì growth rate 0.5%/ngày quá chậm để gây nguy hiểm trong bất kỳ
   khung thời gian nào

**Đáp án: b** — 50 ngày tới 90%; trừ 14 ngày lead time → alert khi còn 36 ngày, tức disk đạt
72%. Tính đúng 50 ngày tới ngưỡng nhưng kết luận sai khi cho rằng cần alert "ngay ở 65%" — còn
tới 36 ngày nữa mới cần alert, không phải ngay lập tức (loại a); công thức "100% - 14×1%/ngày"
dùng sai growth rate (1%/ngày thay vì 0.5%/ngày đề cho) và sai ngưỡng (100% thay vì 90%
critical) — ra kết quả hoàn toàn khác đề bài (loại c); growth rate chậm không có nghĩa "không
bao giờ nguy hiểm" — vẫn cần tính thời điểm đạt ngưỡng để chủ động mở rộng trước (loại d).

---

**Câu 5**: Tại sao nên dùng P95 thay vì mean khi tính growth rate?

a) Mean loại bỏ được outlier tốt hơn P95 vì mean tính trên toàn bộ dữ liệu, không bỏ sót
   điểm nào
b) P95 và mean cho kết quả giống nhau khi dữ liệu tăng trưởng tuyến tính đều, không có khác
   biệt thực tế
c) Mean bị kéo bởi spike — nếu có 1 ngày usage đột tăng gấp đôi do migration data, mean sẽ overestimate growth rate, dẫn đến alert sớm không cần thiết
d) P95 luôn thấp hơn mean nên dùng P95 sẽ làm alert fire muộn hơn, tránh báo động giả

**Đáp án: c** — Mean bị kéo bởi spike, overestimate growth rate; P95 loại bỏ outlier, phản
ánh xu hướng thực. Mean KHÔNG loại bỏ outlier — ngược lại, mean bị KÉO LỆCH bởi outlier, đó
chính là nhược điểm cần tránh (loại a); dù trường hợp tăng trưởng đều hai giá trị có thể gần
nhau, mục đích của câu hỏi là trường hợp CÓ SPIKE bất thường — khi đó hai giá trị khác biệt rõ
rệt (loại b); P95 không LUÔN thấp hơn mean (phụ thuộc phân phối dữ liệu), và mục đích chọn P95
là phản ánh xu hướng thật, không phải cố ý làm alert fire muộn (loại d).

## 8. Bài liên quan và nguồn

**Đã học ở:**
- [monitoring.prometheus-grafana.fundamentals](../../monitoring/prometheus-grafana/fundamentals.md) — PromQL, recording rules, alert rule

**Xem thêm:**
- [monitoring.prometheus-grafana.alertmanager](../../monitoring/prometheus-grafana/alertmanager.md) — routing alert đúng người khi capacity threshold kích hoạt
- [sre.toil-automation.identifying-toil](../toil-automation/identifying-toil.md) — tự động hóa capacity review

**Nguồn:**
- Google SRE Workbook: https://sre.google/workbook/table-of-contents/
- Brendan Gregg USE Method: https://www.brendangregg.com/usemethod.html
