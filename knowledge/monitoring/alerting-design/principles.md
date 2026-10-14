---
id: monitoring.alerting-design.principles
title: "Thiết kế cảnh báo: tránh alert fatigue, alert phải actionable"
domain: monitoring
module: monitoring.alerting-design
level: "chuyên sâu"
prerequisites: ["monitoring.prometheus-grafana.alertmanager"]
applies_to:
  - "Platform-agnostic — nguyên tắc áp dụng cho Alertmanager, Zabbix, PagerDuty, OpsGenie, Grafana
    Alerting hay bất kỳ hệ thống alert nào; ví dụ lấy từ Prometheus/Alertmanager"
status: verified
sources:
  - "https://sre.google/sre-book/practical-alerting/"
  - "https://www.oreilly.com/library/view/effective-monitoring-and/9781449333515/"
  - "https://docs.pagerduty.com/docs/alerting-best-practices"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Alert fatigue là khi team nhận quá nhiều notification, dần dần bắt đầu bỏ qua hoặc dismiss
alert mà không điều tra. Kết quả: incident thật bị che khuất bởi alert noise, MTTR (Mean Time
To Recovery) tăng, on-call burn out. Bài này là lý thuyết thiết kế alert — áp dụng trực tiếp
khi viết Prometheus alert rule, Zabbix trigger, hay bất kỳ cấu hình cảnh báo nào. Mục tiêu:
mỗi alert đến là một tín hiệu có nghĩa, cần hành động, không phải noise.

## 2. Khái niệm cốt lõi

**Alert fatigue**: khi quá nhiều alert không actionable — team tự train reflexively dismiss,
snooze, hoặc delete notification mà không đọc. Dẫn đến cả alert thật cũng bị bỏ qua.

**Actionable alert**: alert chỉ nên fire khi:
1. **Có tác động đến user** (symptom) — không chỉ vì metric vượt ngưỡng nội bộ
2. **Cần con người quyết định** — nếu hệ thống tự xử lý được thì không cần alert on-call
3. **Cần hành động ngay** — thông tin "có thể hữu ích" → log/dashboard, không phải alert

**Symptom-based vs Cause-based alerting**:
- **Cause-based** (sai): "CPU > 80%", "Disk I/O latency > 100ms", "Memory usage > 70%"
  — trigger theo internal metric, có thể không ảnh hưởng user (hệ thống vẫn đáp ứng tốt)
- **Symptom-based** (đúng): "Error rate > 1%", "P99 latency > 500ms", "Payment success rate < 99%"
  — trigger theo điều user thực sự trải nghiệm

Google SRE gọi đây là "alerting on symptoms, not causes". Cause-based metric → dashboard/runbook,
không phải on-call page.

**Signal-to-noise ratio**: tỉ lệ alert có ý nghĩa / tổng alert. Đích đến: mỗi alert được page
là cần thiết phải page on-call ngay cả lúc 3 giờ sáng.

**False positive**: alert fire nhưng không có vấn đề thật. Giảm tín nhiệm vào hệ thống alert.

**False negative**: vấn đề thật xảy ra nhưng không có alert — tệ hơn false positive vì không
thấy.

**MTTA / MTTR**:
- MTTA (Mean Time To Acknowledge): thời gian từ khi alert fire đến khi ai đó nhận.
- MTTR (Mean Time To Recovery): thời gian từ khi incident xảy ra đến khi resolve.

## 3. Cách nó hoạt động

**4 tiêu chí cho 1 alert tốt** (từ Google SRE Book):

1. **Every page is actionable** — mỗi lần nhận page, on-call PHẢI làm gì đó (không được phép
   "huh, fine" và dismiss). Nếu thường xuyên dismiss: alert quá nhạy, cần chỉnh.

2. **Every page requires intelligence** — nếu máy tính có thể quyết định response tự động,
   thì tự động hóa đi thay vì page người. Người cần được paged chỉ khi cần reasoning.

3. **Every page is for something novel** — page lặp đi lặp lại về cùng 1 vấn đề = chưa fix root
   cause. Fix alert noise bằng cách fix vấn đề thật, không chỉ silence.

4. **Pages require a human to make a decision** — nếu runbook chỉ có bước "run this script",
   thì tự động hóa runbook đó thay vì page.

**Alert severity tiers** — giảm noise bằng cách phân loại:

| Tier | Kênh | Ví dụ |
|------|------|-------|
| **Critical/P1** | PagerDuty / SMS (wake on-call) | Payment down, site error rate > 5% |
| **Warning/P2** | Slack #alerts (không wake) | P99 latency tăng nhẹ, disk usage > 80% |
| **Info/P3** | Dashboard / log only | Slow query, non-critical background job fail |

Không nên dùng SMS/PagerDuty cho Warning — chỉ cho Critical thật sự.

**Alert grouping và routing** (đã học ở `monitoring.prometheus-grafana.alertmanager`):
Grouping tránh storm alert khi 50 node cùng lúc down. Routing đảm bảo alert đến đúng người.
Đây là cơ chế giảm volume; nguyên tắc thiết kế ở bài này là giảm số alert ngay từ đầu.

**Anti-patterns phổ biến**:

- **Too many alerts**: team nhận > 20 page/tuần on-call → hầu hết là noise. Benchmark: < 5 page/
  shift on-call = manageable.
- **Alert cascade**: 1 sự cố thật → 30 alert từ các downstream service. Fix: inhibition rule
  (Alertmanager) hoặc trigger dependency (Zabbix) để chỉ page root cause.
- **Alerting on rates without context**: "Error count = 10" không có nghĩa nếu total request = 10000
  (0.1%) vs 100 (10%). Dùng rate/percentage, không absolute count.
- **Static threshold**: CPU alert > 80% — nhưng vào peak hour bình thường CPU có thể là 85%
  không phải vấn đề. Xem xét dynamic threshold hoặc threshold dựa trên baseline.
- **Missing `for` clause**: alert fire ngay từ spike đầu tiên mà không confirm condition kéo dài.
  Prometheus `for: 5m` đảm bảo condition phải TRUE liên tục 5 phút trước khi page.

## 4. Thực hành

> Tất cả ví dụ alert rule dưới đây là **minh hoạ** — không có Prometheus thật trên máy demo.

**Ví dụ: refactor từ cause-based sang symptom-based**:

```yaml
# Xấu — cause-based, page khi CPU cao dù user không bị ảnh hưởng:
- alert: HighCPU
  expr: node_cpu_usage > 80
  for: 5m

# Tốt — symptom-based, chỉ page khi user thực sự bị ảnh hưởng:
- alert: HighErrorRate
  expr: |
    rate(http_requests_total{status=~"5.."}[5m]) /
    rate(http_requests_total[5m]) > 0.01
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Error rate > 1% on {{ $labels.service }}"
    description: "Current: {{ $value | humanizePercentage }}. Check logs and traces."
    runbook: "https://wiki.internal/runbook/high-error-rate"
```

**Annotation `runbook`**: link trực tiếp đến runbook từ alert — on-call không cần tìm kiếm
khi nhận page lúc 3 giờ sáng. Giảm MTTA và giảm context-switching.

**Alert cho SLO (kết hợp với module sli-slo)**:

```yaml
# Alert khi error budget bị consume quá nhanh (burn rate alert):
- alert: ErrorBudgetBurnHigh
  expr: |
    rate(http_requests_total{status=~"5.."}[1h]) /
    rate(http_requests_total[1h]) > 14.4 * 0.001
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Error budget burning 14.4× faster than allowed"
    description: "Will exhaust 30-day budget in ~50 hours (~2 days). Immediate action needed."
```

14.4× = hệ số burn rate khi budget sẽ hết trong ~50 giờ nếu duy trì rate này với 30-day SLO (xem thêm
`monitoring.sli-slo.error-budget`).

**Kiểm tra alert quality sau khi deploy**:

```
Hàng tuần, xem lại metrics sau cho mỗi alert rule:
1. Số lần fire trong 7 ngày qua
2. Tỉ lệ được acknowledge vs auto-resolve (không ai nhận)
3. Thời gian acknowledge trung bình (MTTA)
4. Kết quả investigate: real incident hay false positive?

Nếu alert fire > 3 lần/tuần nhưng không dẫn đến incident thật: threshold quá nhạy hoặc
không phải symptom đúng. Xem xét: tăng threshold, thêm for: clause, đổi sang metric khác,
hoặc xoá alert đó.
```

**Runbook template cơ bản**:

```markdown
## Alert: HighErrorRate

### Tác động
Error rate > 1% trên service [X]. User đang thấy lỗi.

### Nguyên nhân phổ biến
1. Deployment mới bị lỗi → xem recent deploys
2. Dependency (DB, cache, external API) down → xem dependency alerts
3. Traffic spike quá capacity → xem request rate

### Các bước chẩn đoán
1. Xem Grafana dashboard: [link]
2. Xem logs: `kubectl logs -n prod -l app=[X] --since=15m`
3. Kiểm tra dependency health: [link]

### Hành động
- Nếu deploy gần đây: rollback ngay
- Nếu dependency down: xem runbook [link]
- Nếu không rõ: escalate đến [team X]
```

## 5. Lỗi thường gặp và cách chẩn đoán

**On-call burn out — nhóm vận hành than phiền quá nhiều alert**
- Triệu chứng: team bắt đầu silence alert mà không điều tra; response time tăng; on-call không
  muốn nhận shift.
- Cách đánh giá: pull metrics từ PagerDuty/Alertmanager — xem số page/shift và tỉ lệ acknowledged
  vs auto-resolved (alert tự hết mà không có action).
- Cách xử lý: "alert audit" — với mỗi alert rule, hỏi: "Nếu alert này fire lúc 3 giờ sáng, on-call
  có cần làm gì ngay không?" Nếu không → hạ xuống Warning/Info hoặc xóa.

**Alert cascade — 1 sự cố tạo ra 50 alert**
- Triệu chứng: khi có incident, inbox/Slack bị flooded với alert từ nhiều service khác nhau
  liên quan đến cùng 1 root cause.
- Cách xử lý: Alertmanager inhibition rule (nếu alert A đang fire, suppress alert B có cùng
  nhóm) hoặc Zabbix trigger dependency; cũng xem lại liệu các service đó có nên alert độc lập
  không hay nên có 1 health check chung.

**Alert threshold bị copy-paste mà không có baseline**
- Triệu chứng: "CPU > 80%" không bao giờ fire vào ban ngày (CPU thường 40%) nhưng fire liên
  tục vào peak hour (CPU bình thường 82%), tạo noise không cần thiết.
- Cách xử lý: đặt threshold dựa trên đo lường baseline thực tế (P99 của normal behavior), không
  phải số "nghe có vẻ hợp lý". Dùng Grafana để xem distribution trước khi chốt ngưỡng.

## 6. Tình huống thực tế

Audit alert quality sau khi team phàn nàn "quá nhiều noise":

```
Tuần 1: Thu thập data
→ Xem Alertmanager/PagerDuty: 87 page trong 7 ngày (12/ngày!)
→ Breakdown: 23% critical, 77% warning/info đến PagerDuty (sai routing)
→ Trong 87 page: 12 là real incidents, 75 là false positive hoặc info-level

Tuần 2: Phân loại và sửa
→ 30 alert "cause-based" (CPU, memory, disk) → hạ xuống Warning (Slack only, không wake)
→ 15 alert không có runbook → tạm disable hoặc thêm runbook trong 2 tuần
→ 12 alert không có `for` clause → thêm `for: 5m` (giảm spike false positive)
→ 8 alert route nhầm vào PagerDuty → sửa routing tree

Kết quả tuần 3:
→ 18 page/tuần (giảm từ 87)
→ 15/18 là real incidents
→ MTTA giảm từ 8 phút xuống 3 phút (on-call trust alert hơn, phản hồi nhanh hơn)
```

## 7. Tự kiểm tra

**Câu 1**: Alert "Disk usage > 80%" fire liên tục mỗi ngày nhưng không gây incident. Nên làm
gì?

a) Luôn tăng ngưỡng lên 95% ngay, không cần xem xét nguyên nhân cụ thể đang gây fire
b) Snooze/mute alert vĩnh viễn vì nó chưa từng gây incident thật, không cần điều tra thêm
c) Tùy thuộc vào context: (a) Nếu disk tăng đều đặn và sẽ đầy trong vài tuần: đây là warning hợp lệ nhưng không cần wake on-call
d) Luôn xoá hẳn alert này khỏi hệ thống vì nó đã được xác nhận là false positive cố định

**Đáp án: c** — Tuỳ context: hạ mức độ nếu tăng đều đặn chậm, tăng ngưỡng nếu ổn định ở
80-85%, tìm root cause nếu tăng đột ngột. Không nên silently dismiss. Tăng ngưỡng NGAY mà
không xem xét nguyên nhân có thể bỏ sót trường hợp disk tăng đột ngột do lỗi thật (log
explosion...) (loại a); mute vĩnh viễn không điều tra là chính xác hành vi "silently dismiss"
cần tránh (loại b); xoá hẳn alert bỏ mất khả năng phát hiện khi disk THẬT SỰ gần đầy trong
tương lai — cần điều chỉnh chứ không xoá hoàn toàn (loại d).

---

**Câu 2**: Sự khác biệt giữa symptom-based và cause-based alerting là gì? Cho ví dụ cụ thể.

a) Cause-based luôn chính xác hơn symptom-based vì đo trực tiếp nguyên nhân gốc, không bao
   giờ noise
b) Symptom-based và cause-based là hai tên gọi khác nhau cho cùng một kỹ thuật alerting
c) Symptom-based chỉ áp dụng được cho hệ thống không có database, cause-based mới áp dụng
   được cho DB
d) Cause-based: alert theo internal metric không trực tiếp phản ánh user experience

**Đáp án: d** — Cause-based dựa trên internal metric, có thể noise hoặc bỏ sót; symptom-based
dựa trên trải nghiệm user thật, fire khi và chỉ khi user bị ảnh hưởng. Cause-based CÓ THỂ
noise hoặc bỏ sót user impact thật — không phải "luôn chính xác hơn, không bao giờ noise"
(loại a); hai kỹ thuật có TRIẾT LÝ khác nhau rõ rệt (nguyên nhân nội bộ vs trải nghiệm user),
không phải tên gọi của cùng một thứ (loại b); cả hai kỹ thuật áp dụng được cho hệ thống có
hoặc không có database — sự phân biệt không nằm ở có database hay không (loại c).

---

**Câu 3**: Alert rule không có `for` clause. Điều gì xảy ra khi có spike ngắn (30 giây) vượt
ngưỡng?

a) Alert fire ngay khi expression TRUE lần đầu — dù condition chỉ kéo dài 30 giây
b) Alert sẽ không fire gì cả vì thiếu for clause, Prometheus mặc định yêu cầu for mới cho fire
c) Alert fire và giữ nguyên trạng thái FIRING mãi mãi dù spike đã hết từ lâu, không bao giờ
   tự resolved
d) Alertmanager sẽ tự động thêm for: 5m ngầm định nếu config không khai báo, nên hành vi
   không đổi

**Đáp án: a** — Không có `for`, alert fire NGAY khi expression TRUE lần đầu, rồi resolved
ngay khi spike hết — gây false alarm vô ích. Thêm `for: 5m` loại bỏ spike ngắn. Không có `for`
KHÔNG ngăn alert fire — ngược lại, nó khiến alert fire NGAY LẬP TỨC, không cần chờ gì (loại
b); alert TỰ RESOLVED khi expression trở về FALSE, không giữ FIRING mãi mãi (loại c); không
có `for` mặc định tương đương `for: 0`, Alertmanager KHÔNG tự thêm `for: 5m` ngầm định (loại
d).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này (module này chỉ có 1 bài):**
- Module này là singleton — nguyên tắc tổng quan trước khi đi vào SLO.

**Bài liên quan ngoài module (xem thêm):**
- `monitoring.prometheus-grafana.alertmanager` — Alertmanager: grouping, routing, inhibition,
  silence: đây là công cụ implement các nguyên tắc trong bài này.
- `monitoring.zabbix.items-triggers` — Zabbix trigger dependency: tương tự inhibition rule,
  tránh alert cascade.
- `monitoring.sli-slo.error-budget` — Error budget burn rate alert: cách thiết kế alert dựa
  trên SLO thay vì threshold tùy ý.

**Nguồn tham khảo:**
- [Practical Alerting — Google SRE Book](https://sre.google/sre-book/practical-alerting/)
  — Rob Ewaschuk's philosophy on alerting; "every page should be actionable".
- [PagerDuty Alerting Best Practices](https://docs.pagerduty.com/docs/alerting-best-practices)
  — symptom vs cause, severity tiers, reducing noise.
- [Effective Monitoring and Alerting — Slawek Ligus](https://www.oreilly.com/library/view/effective-monitoring-and/9781449333515/)
  — signal-to-noise ratio, alert design patterns.
