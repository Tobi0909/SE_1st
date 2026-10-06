---
id: monitoring.prometheus-grafana.alertmanager
title: "Alertmanager: routing, grouping, silence"
domain: monitoring
module: monitoring.prometheus-grafana
level: "vận hành"
prerequisites: ["monitoring.prometheus-grafana.fundamentals"]
applies_to:
  - "Alertmanager 0.25+ — routing tree, grouping, inhibition, silence; tương thích Prometheus 2.x"
status: draft
sources:
  - "https://prometheus.io/docs/alerting/latest/alertmanager/"
  - "https://prometheus.io/docs/alerting/latest/configuration/"
  - "https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Alertmanager không cài trên máy demo. Toàn bộ output trong bài là **output minh
> hoạ** theo Alertmanager documentation chính thức.

Prometheus biết KHAI BÁO alert rule. Alertmanager quyết định ROUTING alert: gửi cho ai,
qua kênh nào (email, Slack, PagerDuty...), khi nào không gửi (silence, inhibit). Không hiểu
Alertmanager = không giải thích được tại sao alert không gửi khi cần, hoặc tại sao spam alert
vào ban đêm không tắt được. Bài này đi qua: Prometheus alert rule → Alertmanager flow, grouping
(chống storm), routing tree (gửi đúng người), silence/inhibition (giảm noise).

## 2. Khái niệm cốt lõi

**Prometheus Alert Rule**: Prometheus evaluate PromQL expression theo `evaluation_interval`.
Khi expression TRUE lần đầu → alert vào `PENDING` state. Sau khi TRUE liên tục đủ `for`
duration → chuyển sang `FIRING` và Prometheus gửi đến Alertmanager. Khi expression FALSE →
alert về `INACTIVE`; nếu trước đó đang `FIRING`, Prometheus gửi resolved notification đến
Alertmanager. (Ba Prometheus alert state: `INACTIVE`, `PENDING`, `FIRING` — không có state
tên "RESOLVED"; "resolved" là trạng thái notification của Alertmanager, không phải Prometheus.)

```yaml
# prometheus-rules.yaml
groups:
  - name: node.alerts
    rules:
      - alert: HighCPUUsage
        expr: |
          100 - avg by (instance) (
            rate(node_cpu_seconds_total{mode="idle"}[5m])
          ) * 100 > 80
        for: 5m              # phải TRUE liên tục 5 phút mới fire (tránh spike ngắn)
        labels:
          severity: warning
          team: infrastructure
        annotations:
          summary: "High CPU on {{ $labels.instance }}"
          description: "CPU > 80% for 5 minutes on {{ $labels.instance }}"
```

`for: 5m`: alert ở `PENDING` state trong 5 phút trước khi chuyển `FIRING`. Không có `for` =
fire ngay khi expression TRUE lần đầu.

**Alertmanager workflow**: nhận alert → dedup (loại trùng) → group → route → notify

**Grouping**: gom nhiều alert cùng nhóm vào 1 notification thay vì gửi từng cái một. Tránh
"alert storm" khi 50 host cùng lúc bị vấn đề → 1 notification thay vì 50. Nhóm theo label
(ví dụ: `alertname`, `cluster`, `namespace`).

**Inhibition**: khi alert A đang FIRING, suppress alert B có liên quan. Ví dụ: node down →
suppress tất cả service alert trên node đó (vì service down là hệ quả, không phải nguyên nhân).
Tương tự Zabbix trigger dependency.

**Silence**: tắt notification cho alert matching một pattern trong khoảng thời gian (bảo trì
window, incident đang xử lý). Silence không dừng Prometheus evaluate alert — chỉ ngăn gửi
notification.

**Routing tree**: cấu trúc cây quyết định gửi alert đến receiver nào. Mỗi route có matchers
(label filter), receiver, và child routes. Alert đi từ root xuống, match route đầu tiên phù
hợp (depth-first, first-match-wins mặc định).

## 3. Cách nó hoạt động

**Architecture**:
```
Prometheus (evaluate rule) → FIRING alert → Alertmanager
                                                   ↓
                             dedup + group + route + inhibit + silence
                                                   ↓
                             Receiver: email / Slack / PagerDuty / webhook
```

Prometheus cấu hình trong `prometheus.yml`:
```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

**Group timing**:
- `group_wait`: chờ bao lâu trước khi gửi notification đầu tiên (để group thêm alert cùng
  nhóm vào, default 30s)
- `group_interval`: khi có alert mới trong group đang active, chờ bao lâu trước khi gửi lại
  (default 5m)
- `repeat_interval`: gửi lại notification cho alert đang FIRING bao lâu 1 lần (default 4h)

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Alertmanager documentation.

**`alertmanager.yml` cơ bản**:

```yaml
global:
  resolve_timeout: 5m    # sau 5 phút không nhận FIRING = resolved
  smtp_smarthost: 'smtp.company.com:587'
  smtp_from: 'alertmanager@company.com'

route:
  receiver: 'default'          # receiver mặc định nếu không match route nào
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    - matchers:
        - severity = "critical"
      receiver: 'pagerduty-critical'
      continue: false          # dừng sau khi match (default)

    - matchers:
        - team = "infrastructure"
      receiver: 'slack-infra'
      group_by: ['alertname', 'instance']

    - matchers:
        - severity =~ "warning|info"
        - team = "backend"
      receiver: 'email-backend'

receivers:
  - name: 'default'
    email_configs:
      - to: 'oncall@company.com'

  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '<PAGERDUTY_INTEGRATION_KEY>'
        severity: 'critical'

  - name: 'slack-infra'
    slack_configs:
      - api_url: '<SLACK_WEBHOOK_URL>'
        channel: '#alerts-infra'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'email-backend'
    email_configs:
      - to: 'backend-team@company.com'
        send_resolved: true    # gửi thêm notification khi alert resolved

inhibit_rules:
  - source_matchers:
      - alertname = "NodeDown"
    target_matchers:
      - severity = "warning"
    equal: ['instance']    # suppress khi label "instance" của source = target
```

**Inhibition rule giải thích**: khi `NodeDown` alert đang FIRING trên instance `web-01`, suppress
tất cả `severity=warning` alert cũng có `instance=web-01` — vì service warning trên host đang
down là expected, không cần thêm noise.

**Silence qua UI** (Alertmanager web UI tại `:9093`):

```
Alertmanager UI → Silences → New Silence
  Matchers: alertname="NodeDown" instance="web-01"
  Start: now
  End: 2026-10-06 18:00  (window bảo trì)
  Comment: Planned maintenance - disk replacement
  Creator: admin
```

Silence qua `amtool` CLI:
```bash
amtool silence add \
  --alertmanager.url=http://alertmanager:9093 \
  alertname="NodeDown" instance="web-01" \
  --duration=2h \
  --comment="Planned maintenance"
```

**Xem alert đang FIRING**:
```bash
# Prometheus API
curl http://prometheus:9090/api/v1/alerts | jq '.data.alerts[] | {name: .labels.alertname, state: .state}'

# Alertmanager API
curl http://alertmanager:9093/api/v2/alerts | jq '.[] | {labels: .labels, status: .status}'
```

**Notification template** — tùy chỉnh message Slack:

```yaml
# Trong receiver slack_configs:
title: '[{{ .Status | toUpper }}{{ if eq .Status "firing" }}:{{ .Alerts.Firing | len }}{{ end }}] {{ .GroupLabels.alertname }}'
text: |
  {{ range .Alerts }}
  *Alert:* {{ .Annotations.summary }}
  *Severity:* {{ .Labels.severity }}
  *Instance:* {{ .Labels.instance }}
  *Description:* {{ .Annotations.description }}
  {{ end }}
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Alert FIRING nhưng không nhận notification**
- Checklist: (1) alert có match receiver nào trong routing tree không? Dùng
  `amtool config routes test --config.file=alertmanager.yml severity=critical team=infrastructure`
  để test routing; (2) receiver config đúng không (webhook URL, SMTP config); (3) alert có bị
  silence hay inhibit không? Xem Alertmanager UI → Silences và Inhibitions; (4) Alertmanager
  có nhận alert từ Prometheus không? Xem `http://alertmanager:9093/#/alerts`.

**Spam alert — nhận quá nhiều notification**
- Nguyên nhân: `repeat_interval` quá ngắn, hoặc alert flapping (firing/resolved liên tục vì
  metric dao động quanh ngưỡng).
- Cách xử lý: tăng `repeat_interval`; thêm `for: Xm` vào alert rule để tránh flapping; xem
  xét Inhibition rule cho alert phụ.

**Group không hoạt động — vẫn nhận nhiều notification riêng lẻ**
- Nguyên nhân: alert có label set khác nhau nên bị group vào group khác nhau. `group_by:
  ['alertname', 'cluster']` gom theo alertname + cluster — 2 alert cùng alertname nhưng khác
  cluster vẫn là 2 group riêng.
- Cách xử lý: điều chỉnh `group_by` labels — ít labels hơn = group rộng hơn.

**`continue: true` vs `continue: false`**
- Default `continue: false`: alert match route này thì dừng, không check route tiếp. `continue:
  true`: sau khi gửi cho receiver của route này, tiếp tục check route tiếp theo (alert có thể
  được gửi cho nhiều receiver).

## 6. Tình huống thực tế

Thiết kế alert routing cho startup có 2 team (infrastructure và backend), production 24/7:

```yaml
route:
  receiver: 'slack-general'
  group_by: ['alertname', 'environment']
  group_wait: 30s
  repeat_interval: 4h

  routes:
    # Critical production: PagerDuty (wake up on-call)
    - matchers:
        - environment = "production"
        - severity = "critical"
      receiver: 'pagerduty'
      group_wait: 10s      # nhanh hơn cho critical

    # Infra warnings: Slack channel riêng
    - matchers:
        - team = "infrastructure"
        - severity = "warning"
      receiver: 'slack-infra'

    # Backend warnings: team backend channel
    - matchers:
        - team = "backend"
        - severity = "warning"
      receiver: 'slack-backend'

    # Maintenance window: silence staging alerts ban đêm
    # → dùng Silence (time-based) thay vì routing

inhibit_rules:
  # Node down → suppress service alerts trên node đó
  - source_matchers: [alertname="KubernetesNodeNotReady"]
    target_matchers: [severity="warning"]
    equal: ['node']
```

Kết quả: production critical → PagerDuty (wake up); staging warning ban đêm → silence; infra/
backend warning → đúng channel Slack; node down → không spam warning về service trên node.

## 7. Tự kiểm tra

1. Alert rule có `for: 5m`. Lúc 14:00 expression TRUE. Alert FIRING lúc mấy giờ và
   notification đến khi nào?
   <details><summary>Đáp án</summary>Alert PENDING từ 14:00 → FIRING lúc 14:05 (sau 5 phút
   TRUE liên tục). Alertmanager nhận FIRING tại 14:05 → chờ `group_wait` (ví dụ 30s) → notification
   đến ~14:05:30. Nếu expression chỉ TRUE một lần rồi FALSE trong 5 phút đó, alert KHÔNG fire
   (về INACTIVE/UNKNOWN). `for` là safeguard tránh false positive từ spike ngắn.</details>

2. Cần tắt alert cho cả namespace `staging` trong 2 giờ bảo trì. Dùng Silence hay Inhibition?
   Tại sao?
   <details><summary>Đáp án</summary>Silence — vì cần tắt có thời hạn (2 giờ), không phải logic
   "suppress B vì A đang xảy ra". Inhibition phù hợp cho quan hệ nhân quả (node down → suppress
   service alert). Silence phù hợp cho window thời gian (bảo trì, deploy, off-hours). Silence
   cho staging: matchers `namespace="staging"`, duration 2h. Alertmanager vẫn nhận alert nhưng
   không gửi notification trong thời gian silence.</details>

3. Routing tree có route A (`severity=critical`) và route B (`team=infrastructure`). Alert có
   cả 2 label. Alert được gửi cho receiver nào?
   <details><summary>Đáp án</summary>Phụ thuộc vào thứ tự trong config. Routes được evaluate
   theo thứ tự, first-match-wins (nếu `continue: false`). Nếu route A viết trước route B:
   alert match route A → gửi cho A's receiver → dừng. Route B không được check. Để gửi cho cả
   2 receiver: đặt `continue: true` trên route A. Thứ tự route quan trọng — route cụ thể (nhiều
   matchers) nên đặt trước route chung.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `monitoring.prometheus-grafana.fundamentals` — Prometheus alert rule: PromQL expression,
  `for` duration, label/annotation trong rule — Alertmanager nhận và xử lý alert từ đây.
- `monitoring.prometheus-grafana.grafana-dashboards` — Grafana hiển thị alert state từ
  Alertmanager (nếu cấu hình Alertmanager data source).

**Bài liên quan ngoài module (xem thêm):**
- `monitoring.alerting-design.principles` — alert phải actionable, không gây fatigue:
  Alertmanager routing/grouping/silence là kỹ thuật implement những nguyên tắc đó.
- `monitoring.zabbix.items-triggers` — Zabbix trigger dependency: khái niệm tương tự
  Alertmanager inhibition (suppress phụ thuộc khi root cause đang active).

**Nguồn tham khảo:**
- [Alertmanager — prometheus.io](https://prometheus.io/docs/alerting/latest/alertmanager/)
  — khái niệm, architecture, grouping.
- [Alertmanager Configuration — prometheus.io](https://prometheus.io/docs/alerting/latest/configuration/)
  — route, receiver, inhibit_rules, silence, templates đầy đủ.
- [Alerting Rules — prometheus.io](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
  — rule syntax, `for`, labels, annotations, template variables.
