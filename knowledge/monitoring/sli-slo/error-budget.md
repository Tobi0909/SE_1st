---
id: monitoring.sli-slo.error-budget
title: "Error budget: dùng SLO để ra quyết định vận hành"
domain: monitoring
module: monitoring.sli-slo
level: "chuyên sâu"
prerequisites: ["monitoring.sli-slo.fundamentals"]
applies_to:
  - "Platform-agnostic — error budget là framework quyết định; ví dụ burn rate alert dùng
    Prometheus/Alertmanager nhưng concept áp dụng cho bất kỳ SLO implementation nào"
status: verified
sources:
  - "https://sre.google/workbook/alerting-on-slos/"
  - "https://sre.google/sre-book/embracing-risk/"
  - "https://www.usenix.org/conference/srecon18asia/presentation/hidalgo"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Prometheus không cài trên máy demo. Toàn bộ PromQL trong bài là **minh hoạ**
> theo Prometheus documentation chính thức.

Error budget giải quyết câu hỏi căng thẳng nhất trong team vận hành: "Có nên deploy bây giờ
không?" hoặc "Bug này có phải fix ngay không?". Không có error budget = quyết định dựa trên
cảm tính, gây tranh cãi không cần thiết. Bài này là phần thực hành của SLO framework: tính
error budget, đọc burn rate, thiết kế alert dựa trên SLO.

## 2. Khái niệm cốt lõi

**Error budget** (đã học ở `monitoring.sli-slo.fundamentals`): phần được phép fail trong SLO
window. SLO 99.9% trong 30 ngày = 43.2 phút downtime được phép.

**Burn rate**: tốc độ tiêu thụ error budget so với tốc độ "chuẩn". Burn rate = 1 nghĩa là đang
tiêu error budget đúng tốc độ — sẽ hết ĐÚNG khi hết SLO window. Burn rate = 2 nghĩa là đang
tiêu gấp đôi bình thường — sẽ hết budget sau nửa thời gian SLO window.

```
Burn rate = actual_error_rate / (1 - SLO)

SLO = 99.9% → SLO_error_rate = 0.1%
Nếu actual_error_rate = 1% → burn rate = 1% / 0.1% = 10×
Nếu actual_error_rate = 0.1% → burn rate = 1× (đúng pace)
Nếu actual_error_rate = 0% → burn rate = 0× (không dùng budget)
```

**Burn rate 1× trong suốt window**: hết budget đúng lúc hết window (30 ngày).
**Burn rate 2×**: hết budget sau 15 ngày.
**Burn rate 14.4×**: hết budget trong **~50 giờ (~2 ngày)** — cần alert ngay (critical).
**Burn rate 6×**: hết budget trong **5 ngày** — cần alert (warning level).

**Multi-window alerting** (Google SRE approach): dùng 2 window khác nhau để giảm false positive
và giảm detection time.

| Alert | Burn rate | Window dài (detect) | Window ngắn (confirm) | Thời gian trước khi budget hết |
|-------|-----------|---------------------|----------------------|-------------------------------|
| Critical | 14.4× | 1h | 5min | ~50 giờ (~2 ngày) |
| Warning | 6× | 6h | 30min | 5 ngày |
| Slow burn | 3× | 3 ngày | 6h | 10 ngày |

Window dài (detect): phát hiện burn rate duy trì. Window ngắn (confirm): xác nhận vẫn còn xảy ra, giảm false positive.

**Deploy decision dựa trên error budget**:
- Budget còn nhiều (> 50%): deploy freely, thử feature mới, take risks.
- Budget khoảng 50%: deploy với caution, có rollback plan sẵn.
- Budget còn ít (< 20%): chỉ deploy hotfix/critical security patch.
- Budget hết (0% hoặc âm): FREEZE deploy, tập trung reliability improvement.

## 3. Cách nó hoạt động

**SLO compliance rate vs Error budget remaining**:

```
SLO compliance (hiện tại):
  1 - actual_error_rate_over_window

Error budget remaining:
  (SLO - actual_error_rate_over_window) / (1 - SLO)
```

Ví dụ: SLO = 99.9%, actual error rate trong 30 ngày = 0.05%:
- Compliance: 100% - 0.05% = 99.95% (đang vượt SLO)
- Budget remaining: (0.1% - 0.05%) / 0.1% = 50% còn lại

**Burn rate alert** — vì sao không chỉ alert khi SLO vi phạm?:

Nếu chỉ alert khi 30-day SLO vi phạm, phải chờ đến cuối tháng mới biết. Burn rate cho phép
phát hiện sớm: "nếu tiếp tục rate này, budget sẽ hết sau 2 giờ" → cần action ngay.

## 4. Thực hành

**PromQL: tính burn rate cho SLO 99.9%**:

```promql
# Burn rate hiện tại (1h window)
(
  1 - (
    sum(rate(http_requests_total{job="checkout", status!~"5.."}[1h]))
    /
    sum(rate(http_requests_total{job="checkout"}[1h]))
  )
) / 0.001
# Chia cho (1 - SLO) = (1 - 0.999) = 0.001
```

**Prometheus alert rules dựa trên burn rate** (multi-window):

```yaml
groups:
  - name: checkout_slo_alerts
    rules:
      # Critical: burn rate 14.4× qua cả 2 windows (1h và 5m)
      # Nếu tiếp tục: hết budget trong 2 giờ
      - alert: CheckoutSLOBurnRateCritical
        expr: |
          (
            checkout_error_budget_burn_rate:ratio_1h > 14.4
            AND
            checkout_error_budget_burn_rate:ratio_5m > 14.4
          )
        for: 2m
        labels:
          severity: critical
          service: checkout
        annotations:
          summary: "Checkout SLO burning critical fast (14.4× rate)"
          description: "Error budget will be exhausted in < 2 hours. Current burn: {{ $value }}×"
          runbook: "https://wiki.internal/runbook/checkout-slo-critical"

      # Warning: burn rate 6× qua cả 2 windows (6h và 30m)
      # Nếu tiếp tục: hết budget trong 5 giờ
      - alert: CheckoutSLOBurnRateHigh
        expr: |
          (
            checkout_error_budget_burn_rate:ratio_6h > 6
            AND
            checkout_error_budget_burn_rate:ratio_30m > 6
          )
        for: 15m
        labels:
          severity: warning
          service: checkout
        annotations:
          summary: "Checkout SLO burning fast (6× rate)"
          description: "Error budget burn rate: {{ $value }}×. Budget will exhaust in ~5 hours."

  # Recording rules cho burn rate (hiệu quả hơn inline query)
  - name: checkout_slo_recording
    rules:
      - record: checkout_error_budget_burn_rate:ratio_5m
        expr: |
          (1 - sum(rate(http_requests_total{job="checkout",status!~"5.."}[5m]))
               / sum(rate(http_requests_total{job="checkout"}[5m])))
          / 0.001

      - record: checkout_error_budget_burn_rate:ratio_30m
        expr: |
          (1 - sum(rate(http_requests_total{job="checkout",status!~"5.."}[30m]))
               / sum(rate(http_requests_total{job="checkout"}[30m])))
          / 0.001

      - record: checkout_error_budget_burn_rate:ratio_1h
        expr: |
          (1 - sum(rate(http_requests_total{job="checkout",status!~"5.."}[1h]))
               / sum(rate(http_requests_total{job="checkout"}[1h])))
          / 0.001

      - record: checkout_error_budget_burn_rate:ratio_6h
        expr: |
          (1 - sum(rate(http_requests_total{job="checkout",status!~"5.."}[6h]))
               / sum(rate(http_requests_total{job="checkout"}[6h])))
          / 0.001
```

**Grafana dashboard cho Error Budget**:

```
Panel 1 — "Error Budget Remaining (30d)"
  Type: Stat
  Query:
    1 - (
      sum(increase(http_requests_total{job="checkout",status=~"5.."}[30d]))
      /
      sum(increase(http_requests_total{job="checkout"}[30d]))
    ) / 0.001
  Unit: percentunit
  Thresholds: Green > 50%, Yellow 20-50%, Red < 20%

Panel 2 — "Burn Rate (1h)"
  Type: Stat
  Query: checkout_error_budget_burn_rate:ratio_1h
  Thresholds: Green < 1, Yellow 1-6, Red > 6

Panel 3 — "Error Budget Over Time (30d)"
  Type: Time series
  Query: 1 - (cumulative error rate over time) / 0.001
  → Hiển thị budget tiêu dần theo thời gian
```

**Error budget policy**: document hóa thành quy tắc rõ ràng:

```markdown
## Checkout Service Error Budget Policy

### Nguồn SLO
- SLO: 99.9% availability (30-day rolling)
- Measurement: HTTP 2xx responses / total requests tại ingress

### Thay đổi được phép theo budget còn lại
| Budget remaining | Deploy policy |
|------------------|---------------|
| > 50% | Deploy freely; feature flags OK |
| 20-50% | Deploy với caution; rollback plan bắt buộc |
| < 20% | Chỉ hotfix + security patch |
| 0% hoặc < 0% | FREEZE. Chỉ incident response |

### Khi SLO vi phạm
1. Tạo incident ticket ngay
2. Postmortem bắt buộc
3. Action items từ postmortem phải merge trước deploy mới
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Burn rate alert fire liên tục nhưng không có incident thật**
- Nguyên nhân: measurement window quá ngắn — một batch job fail trong 5 phút tạo spike burn rate
  cao, nhưng không phải sustained problem.
- Giải pháp: multi-window approach (1h AND 5m phải cùng cao) loại bỏ spike ngắn hạn. Nếu vẫn
  fire sai: tăng `for: 2m` trong alert rule.

**SLO window quá ngắn — "budget hết sau 2 ngày đầu tháng"**
- Nguyên nhân: SLO window ngắn (7 ngày) + SLO quá cao (99.99%) → error budget = 0.6 phút/tuần.
  Bất kỳ incident nhỏ nào cũng hết budget.
- Giải pháp: dùng 28-30 ngày rolling window. SLO quá cao phản ánh kỳ vọng không thực tế — giảm
  SLO hoặc đầu tư nghiêm túc vào reliability engineering.

**Team bỏ qua error budget policy — vẫn deploy dù budget gần hết**
- Nguyên nhân: policy không được enforce; hoặc product pressure.
- Giải pháp: đưa SLO vào technical roadmap, gắn với product decision. "Budget cạn = chúng ta
  đã có downtime quá nhiều tháng này, cần giải thích với stakeholder." SLO là business risk tool,
  không phải engineering internal metric.

## 6. Tình huống thực tế

Incident và cách error budget giúp decision-making:

```
Thứ 2, 10:00: Deploy feature mới vào checkout service
Thứ 2, 11:30: Alert: CheckoutSLOBurnRateCritical fire
  → Burn rate: 18× (hết budget sau ~90 phút)
  → Error budget trước incident: 60% còn lại
  → Budget đã tiêu: 60% × 43.2min = 25.9 phút (tương đương) trong 90 phút

On-call nhận PagerDuty, xem dashboard:
  → Burn rate tăng đột ngột sau deploy 10:00
  → Error rate: 0% trước 10:00 → 1.8% sau 10:00

Decision: rollback ngay (không cần điều tra root cause trước — budget không cho phép)

11:45: Rollback xong
  → Error rate về 0%
  → Burn rate = 0×
  → Alert resolved

Thứ 2 chiều: Postmortem
  → Root cause: SQL query mới không có index → timeout khi load cao
  → Fix: thêm index, add test
  → Budget còn lại sau incident: 60% - (15 phút × 100% usage / 43.2 min) = 60% - 35% = 25%

Thứ 3-thứ 5: Freeze deploy checkout (budget < 30%)
Thứ 6: Budget phục hồi (rolling 30d), deploy fix với slow rollout
```

Error budget cụ thể hóa "có nên rollback không?" → YES vì budget không chịu được 90 phút nữa.

## 7. Tự kiểm tra

1. SLO 99.9% trong 30 ngày. Hôm nay có 10 phút downtime. Còn bao nhiêu error budget (phút)?
   Burn rate trong 10 phút đó là bao nhiêu?
   <details><summary>Đáp án</summary>Tổng error budget = 0.1% × 30 × 24 × 60 = 43.2 phút.
   Đã dùng 10 phút → còn 33.2 phút. Burn rate trong 10 phút: error rate trong window = 100%
   (toàn bộ 10 phút là down). Burn rate = 100% / 0.1% = 1000×. Có nghĩa là trong 10 phút đó
   budget đang bị tiêu nhanh gấp 1000 lần pace cho phép — cực kỳ cấp bách.</details>

2. Tại sao burn rate alert dùng 2 window (ví dụ: 1h VÀ 5m) thay vì chỉ 1 window?
   <details><summary>Đáp án</summary>Một window: (a) Nếu chỉ dùng window ngắn (5m): nhạy với
   spike tạm thời, nhiều false positive; (b) Nếu chỉ dùng window dài (1h): ít false positive
   nhưng chậm phát hiện — incident có thể kéo dài 30+ phút mới fire. Hai window kết hợp (1h
   AND 5m đều phải cao): window dài đảm bảo đây là sustained problem (không phải spike 5 phút),
   window ngắn đảm bảo alert fire nhanh khi đủ data để xác nhận. Kết quả: low false positive VÀ
   fast detection time — đây là tradeoff chính của multi-window approach.</details>

3. Team product muốn deploy feature mới vào checkout. Error budget còn 15%. Bạn phản hồi thế nào?
   <details><summary>Đáp án</summary>Theo error budget policy: < 20% = chỉ hotfix + security patch.
   Phản hồi: "Error budget của checkout còn 15% tháng này — chúng ta đã có đủ downtime/error tháng
   này. Nếu deploy feature mới và có vấn đề, chúng ta có thể vi phạm SLO (và SLA với khách hàng)
   trước cuối tháng. Đề xuất: (1) đợi đầu tháng tới khi budget reset; (2) hoặc deploy với feature
   flag và traffic nhỏ (canary), sẵn sàng rollback ngay. Nếu feature này critical business, cần
   signoff từ engineering lead và product với rủi ro rõ ràng." SLO policy không phải để block work
   — để làm rõ tradeoff và đưa ra quyết định có thông tin đầy đủ.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `monitoring.sli-slo.fundamentals` — SLI/SLO/SLA: định nghĩa, cách chọn SLI, đặt SLO thực tế —
  nền tảng cho bài này.

**Bài liên quan ngoài module (xem thêm):**
- `monitoring.alerting-design.principles` — Alert design: burn rate là loại alert SLO-based tốt
  hơn threshold-based; kết hợp 2 bài này cho alerting strategy hoàn chỉnh.
- `monitoring.prometheus-grafana.alertmanager` — Alertmanager: routing alert burn rate đến đúng
  receiver (PagerDuty cho critical, Slack cho warning).

**Nguồn tham khảo:**
- [Alerting on SLOs — Google SRE Workbook](https://sre.google/workbook/alerting-on-slos/)
  — burn rate math, multi-window approach, alert fatigue vs detection time tradeoff.
- [Embracing Risk — Google SRE Book](https://sre.google/sre-book/embracing-risk/)
  — error budget philosophy; tại sao 100% reliability không phải mục tiêu tối ưu.
- [SREcon18: Practical Guide to Error Budgets](https://www.usenix.org/conference/srecon18asia/presentation/hidalgo)
  — real-world error budget policy, team dynamics, decision framework.
