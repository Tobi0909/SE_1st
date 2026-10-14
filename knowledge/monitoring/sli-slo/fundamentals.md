---
id: monitoring.sli-slo.fundamentals
title: "SLI/SLO/SLA: định nghĩa và cách chọn chỉ số"
domain: monitoring
module: monitoring.sli-slo
level: "chuyên sâu"
prerequisites: []
applies_to:
  - "Platform-agnostic — SLI/SLO/SLA là framework khái niệm, không phụ thuộc vào tool cụ thể;
    ví dụ dùng Prometheus nhưng nguyên tắc áp dụng cho bất kỳ monitoring platform nào"
status: verified
sources:
  - "https://sre.google/sre-book/service-level-objectives/"
  - "https://sre.google/workbook/implementing-slos/"
  - "https://cloud.google.com/blog/products/management-tools/practical-guide-to-setting-slos"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

SLI/SLO/SLA là ngôn ngữ chung giữa engineering team, product, và business về "service này
hoạt động tốt như thế nào". Không có SLO = không có cơ sở để quyết định: có cần fix bug ngay
hay không? Có nên deploy vào peak hour không? Feature mới có làm chậm service không? Bài này
đặt nền khái niệm — định nghĩa SLI/SLO/SLA, cách chọn chỉ số đúng, và cách đo đạc.

## 2. Khái niệm cốt lõi

**SLI (Service Level Indicator)**: metric cụ thể đo chất lượng service từ góc độ user.

Ví dụ SLI tốt:
- Tỉ lệ request thành công (success rate): số request HTTP 2xx / tổng request × 100%
- Latency: % request hoàn thành trong X ms
- Throughput: số transaction thành công / giây

SLI phải đo được, liên quan trực tiếp đến user experience.

**SLO (Service Level Objective)**: mục tiêu cho SLI — "SLI phải đạt ≥ X% trong khoảng thời gian
Y". SLO là thỏa thuận NỘI BỘ, đặt ra bởi engineering/product team.

Ví dụ SLO:
- "99.9% request thành công trong 30 ngày qua"
- "95% request < 200ms trong 7 ngày qua"
- "Search API trả kết quả trong 1 giây cho 99% request"

**SLA (Service Level Agreement)**: cam kết NGOẠI VI với khách hàng, thường kèm điều khoản
bồi thường nếu vi phạm. SLA thường lỏng hơn SLO (để có buffer).

Ví dụ: SLO internal = 99.9% → SLA với khách hàng = 99.5% (buffer 0.4% để không vi phạm SLA
dù đôi khi vi phạm SLO).

**Quan hệ SLI → SLO → SLA**:
```
SLI: đo gì (metric cụ thể)
SLO: đạt bao nhiêu (mục tiêu nội bộ)
SLA: cam kết gì với khách hàng (có penalty nếu vi phạm)
```

Không phải service nào cũng cần SLA — SLO là đủ cho team nội bộ.

**Error budget**: phần được phép fail trong SLO.
- SLO 99.9% trong 30 ngày → error budget = 0.1% × 30 ngày × 24h × 60min = **43.2 phút** downtime
  cho phép mỗi tháng.
- Error budget dùng để: balance tốc độ release vs reliability; khi budget cạn → freeze deploy,
  tập trung cải thiện reliability.

## 3. Cách nó hoạt động

**Các loại SLI phổ biến** (theo Google SRE Workbook):

| Loại SLI | Áp dụng cho | Ví dụ |
|----------|-------------|-------|
| **Availability** | Service có phản hồi không? | % request không trả 5xx |
| **Latency** | Phản hồi có đủ nhanh không? | % request < 200ms |
| **Throughput** | Xử lý đủ nhiều không? | Tổng transaction thành công/phút |
| **Correctness** | Kết quả có đúng không? | % background job xử lý thành công |
| **Freshness** | Data có mới không? | % query trả data < 10 phút tuổi |
| **Durability** | Data có được giữ không? | % object lưu trữ có thể đọc lại |

**Chọn SLI theo "user journey"**:
- Xác định user journey quan trọng nhất (critical path): checkout, login, search, load page...
- Mỗi journey → 1-3 SLI phản ánh "journey này hoạt động tốt không?"
- Tránh quá nhiều SLI — 3-5 SLI tốt hơn 20 SLI khó theo dõi.

**Measurement window**: khoảng thời gian tính SLO (không phải "uptime kể từ launch"):
- **Rolling window** (phổ biến): "30 ngày gần nhất". Luôn phản ánh trạng thái hiện tại.
- **Calendar window**: "trong tháng này". Dễ báo cáo hơn nhưng đầu tháng có nhiều budget hơn.

Rolling window 28-30 ngày phổ biến nhất trong thực tế.

**Tính SLI từ Prometheus**:

```promql
# Availability SLI: tỉ lệ request thành công
sum(rate(http_requests_total{status!~"5.."}[30d]))
/
sum(rate(http_requests_total[30d]))

# Latency SLI: % request < 200ms
sum(rate(http_request_duration_seconds_bucket{le="0.2"}[30d]))
/
sum(rate(http_request_duration_seconds_count[30d]))
```

## 4. Thực hành

> Tất cả ví dụ Prometheus dưới đây là **minh hoạ** — không có Prometheus thật trên máy demo.

**Ví dụ đầy đủ: SLO cho checkout service**:

```
Service: checkout-api
User journey: khách hàng hoàn thành thanh toán

SLIs:
1. Availability: % request POST /checkout trả 2xx
2. Latency: % request POST /checkout hoàn thành trong 2 giây
3. Correctness: % order được tạo thành công trong database

SLOs:
1. Availability: ≥ 99.9% trong rolling 30 ngày
2. Latency: ≥ 95% request < 2s trong rolling 30 ngày
3. Correctness: ≥ 99.99% trong rolling 30 ngày

Error budgets (30 ngày = 43,200 phút):
1. Availability: 43.2 phút downtime
2. Latency: 5% × 43,200 min = 2,160 phút slow responses
3. Correctness: 0.01% failed orders
```

**Prometheus recording rule cho SLO**:

```yaml
# Tính SLI availability dùng recording rule (hiệu quả hơn query trực tiếp)
groups:
  - name: checkout_slo
    interval: 30s
    rules:
      - record: job:checkout_request_success:rate5m
        expr: |
          sum(rate(http_requests_total{job="checkout",status!~"5.."}[5m]))
          /
          sum(rate(http_requests_total{job="checkout"}[5m]))

      - record: job:checkout_latency_p95:rate5m
        expr: |
          histogram_quantile(0.95,
            sum by (le) (rate(http_request_duration_seconds_bucket{job="checkout"}[5m]))
          )
```

**Dashboard Grafana cho SLO** (stat panel):
```
Panel: "Checkout Availability (30d)"
  Query: avg_over_time(job:checkout_request_success:rate5m[30d])
  Thresholds:
    Green: > 0.999 (đang đạt SLO)
    Yellow: 0.995-0.999 (đang approach limit)
    Red: < 0.995 (vi phạm SLO)
```

**Xác định SLO thực tế** — không nên đặt SLO theo cảm tính:
1. Thu thập lịch sử 3-6 tháng của SLI.
2. Xem P50, P75, P95, P99 của SLI.
3. Đặt SLO ở khoảng P75-P90 của hiện tại — đủ ambitious nhưng không bất khả thi.
4. Nếu service mới chưa có lịch sử: đặt SLO tạm thời (aspirational), review sau 3 tháng.

Không đặt SLO 99.99% nếu lịch sử cho thấy thực tế chỉ đạt 99.5%.

## 5. Lỗi thường gặp và cách chẩn đoán

**SLO quá cao — "chúng ta cần 5 nines" (99.999%)**
- Vấn đề: 99.999% trong 30 ngày = 26 giây downtime cho phép. Gần như không thể đạt được nếu
  không có redundancy đặc biệt. Mỗi deploy thường mất >26 giây.
- Thực tế: hầu hết dịch vụ web không cần > 99.9% (43 phút/tháng). Payment có thể cần 99.95%.
  99.999% chỉ dành cho infrastructure hạ tầng cực kỳ critical (DNS, power grid...).
- Quy tắc: SLO phải phản ánh nhu cầu thực của user, không phải aspirational.

**SLI đo sai thứ — không phản ánh user experience**
- Ví dụ sai: "uptime của server" (server up nhưng app có thể đang trả error) hay "response time
  đo từ server" (không tính network latency đến user).
- Đúng hơn: đo từ phía client/synthetic monitoring (canary request từ nơi user truy cập), hoặc
  đo từ load balancer/CDN (gần user hơn là từ internal service).
- Nếu không có: ít nhất đo từ reverse proxy (Nginx/HAProxy) thay vì từ app internal metrics.

**Không phân biệt "down" vs "degraded"**
- Service có thể không "down" nhưng latency tăng 10× → user experience tệ như down.
- Cần cả SLI availability VÀ SLI latency để bao phủ đủ scenarios.
- Chỉ có availability SLO mà không có latency SLO = có thể service "available" nhưng unusable.

## 6. Tình huống thực tế

Thiết kế SLO cho team vừa nhận service mới:

```
1. Identify critical user journeys:
   - User login
   - Search product
   - Add to cart
   - Checkout (critical nhất — có tiền liên quan)

2. Chọn SLI cho checkout journey:
   - SLI_1: success_rate = HTTP 2xx responses / total checkout requests
   - SLI_2: latency_ok = requests < 2s / total checkout requests

3. Thu thập baseline (nhìn Grafana 3 tháng gần nhất):
   - SLI_1 history: avg 99.95%, min 99.8%, max 100%
   - SLI_2 history: avg 97%, min 93%, max 99.5%

4. Đặt SLO:
   - Availability: 99.9% (bảo thủ hơn avg 99.95% → có buffer)
   - Latency: 95% (thấp hơn avg 97% → realistic, không quá dễ)

5. Tính error budget (30 ngày):
   - Availability: 0.1% × 43,200 min = 43.2 phút
   - Latency: 5% × tổng requests (không phải phút)

6. Set up Grafana dashboard + Alertmanager rule cho burn rate
   (xem bài error-budget)
```

## 7. Tự kiểm tra

**Câu 1**: Sự khác biệt giữa SLO và SLA là gì? Tại sao SLO thường "nghiêm hơn" SLA?

a) SLA là mục tiêu nội bộ, SLO là cam kết với khách hàng bên ngoài
b) SLO là mục tiêu nội bộ (internal agreement giữa engineering và product/business)
c) SLO và SLA luôn bằng nhau theo định nghĩa, không có khái niệm "nghiêm hơn"
d) SLO nghiêm hơn SLA chỉ vì lý do marketing, không có tác dụng kỹ thuật thực tế nào

**Đáp án: b** — SLO là mục tiêu nội bộ; SLA là cam kết ngoài có penalty. SLO nghiêm hơn để
tạo buffer/reaction time trước khi SLA bị vi phạm. Vai trò bị đảo ngược hoàn toàn trong lựa
chọn a (loại a); SLO và SLA KHÔNG bắt buộc bằng nhau — thực tế thường khác nhau có chủ đích để
tạo buffer (loại c); buffer giữa SLO/SLA có TÁC DỤNG KỸ THUẬT THẬT (thời gian phản ứng trước
khi vi phạm SLA), không chỉ vì marketing (loại d).

---

**Câu 2**: Service checkout có SLO availability 99.9% trên rolling 30 ngày. Hôm nay là ngày
15 của tháng. Error budget đã dùng 40 phút. Còn bao nhiêu? Nên làm gì?

a) Error budget 30 ngày = 0.1% × 30 = 3 giờ; đã dùng 40 phút thì còn rất nhiều, không cần
   hành động gì
b) Error budget đã hết hoàn toàn (0 phút) nên phải rollback ngay toàn bộ hệ thống về version
   cũ nhất
c) Error budget 30 ngày = 0.1% × 30 × 24 × 60 = 43.2 phút. Đã dùng 40 phút (93% budget cạn!) và mới đến giữa tháng. Còn 3.2 phút
d) Error budget được reset lại ngay giữa tháng nếu team fix xong nguyên nhân downtime

**Đáp án: c** — Tổng budget 43.2 phút (0.1% × 30 ngày tính ra phút), đã dùng 40 phút, còn 3.2
phút ở giữa tháng — cực kỳ cấp bách, cần dừng deploy risky và điều tra. Công thức tính thiếu
nhân với 24×60 (đổi ra phút) cho ra kết quả sai hoàn toàn (3 giờ thay vì 43.2 phút — loại a);
budget còn 3.2 phút, KHÔNG phải 0 — chưa cần rollback toàn hệ thống (loại b); error budget
reset theo CHU KỲ rolling window (30 ngày), không tự reset giữa tháng chỉ vì fix xong nguyên
nhân — vẫn phải chờ window trôi qua (loại d).

---

**Câu 3**: Tại sao "uptime server" không phải SLI tốt để đo user experience?

a) Vì uptime server luôn đo bằng %, trong khi SLI bắt buộc phải đo bằng số tuyệt đối theo giây
b) Vì server uptime chỉ áp dụng được cho bare-metal, không áp dụng được cho cloud/VM
c) Vì "uptime" là thuật ngữ cũ đã bị thay thế hoàn toàn bằng SLO, không còn dùng trong SRE
   hiện đại
d) Server "up" (process chạy, port mở) không đảm bảo: (1) app đang trả response đúng

**Đáp án: d** — Server up không đảm bảo app trả response đúng, user kết nối được, hay đủ
nhanh. SLI nên đo từ phía user (symptom), không phải cause metric nội bộ. SLI không bị giới
hạn đơn vị đo theo cách đó — vấn đề không nằm ở % vs giây (loại a); uptime server áp dụng
được cho cả bare-metal và cloud/VM, không giới hạn hạ tầng (loại b); "uptime" vẫn là khái niệm
dùng phổ biến, không bị "thay thế hoàn toàn" bởi SLO — SLO là MỤC TIÊU, uptime có thể là MỘT
phần của SLI đo lường, hai khái niệm khác cấp độ (loại c).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `monitoring.sli-slo.error-budget` — Error budget: cách dùng SLO để ra quyết định vận hành
  (freeze deploy, burn rate alert).

**Bài liên quan ngoài module (xem thêm):**
- `monitoring.alerting-design.principles` — Alert design: SLO-based alerting (burn rate) là
  approach tốt hơn threshold-based alerting.
- `monitoring.prometheus-grafana.fundamentals` — PromQL: cần để tính SLI từ Prometheus metrics.

**Nguồn tham khảo:**
- [Service Level Objectives — Google SRE Book](https://sre.google/sre-book/service-level-objectives/)
  — định nghĩa SLI/SLO/SLA, error budget, cách đặt SLO thực tế.
- [Implementing SLOs — Google SRE Workbook](https://sre.google/workbook/implementing-slos/)
  — measuring SLIs, recording rules, dashboards, alert thresholds.
- [Practical Guide to Setting SLOs — Google Cloud Blog](https://cloud.google.com/blog/products/management-tools/practical-guide-to-setting-slos)
  — user journey approach, chọn SLI, đặt SLO realistic.
