---
id: container-k8s.helm.chart-authoring
title: "Viết Helm chart riêng: template, hooks"
domain: container-k8s
module: container-k8s.helm
level: "chuyên sâu"
prerequisites: ["container-k8s.helm.basics"]
applies_to:
  - "Helm 3.x — template syntax, hooks, Chart.yaml schema; không áp dụng cho Helm 2"
status: draft
sources:
  - "https://helm.sh/docs/chart_template_guide/"
  - "https://helm.sh/docs/topics/charts/"
  - "https://helm.sh/docs/topics/chart_hooks/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Helm không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Helm documentation chính thức.

Dùng chart có sẵn từ repo là một chuyện; khi cần đóng gói ứng dụng nội bộ để deploy đồng nhất
qua nhiều môi trường (dev/staging/production), hoặc cần tự động hoá migration DB trước mỗi lần
deploy, thì phải biết viết chart riêng. Bài này đi qua cấu trúc chart, template syntax đủ để
viết manifest dynamic, và hooks để quản lý lifecycle (database migration, backup trước upgrade).

## 2. Khái niệm cốt lõi

**Cấu trúc chart**:

```
my-chart/
├── Chart.yaml         # metadata: name, version, appVersion
├── values.yaml        # default values
├── templates/         # Go templates sinh ra K8s manifest
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── _helpers.tpl   # helper templates (không sinh manifest)
│   └── NOTES.txt      # message hiện sau install
├── charts/            # chart phụ thuộc (subchart)
└── .helmignore        # tương tự .gitignore
```

**Template syntax — Go templates**: Helm dùng Go `text/template` + Sprig functions. Cú pháp
cơ bản:
- `{{ .Values.key }}` — inject value từ values.yaml
- `{{ .Release.Name }}` — tên release
- `{{ .Release.Namespace }}` — namespace
- `{{ .Chart.Name }}` / `{{ .Chart.Version }}` — metadata từ Chart.yaml
- `{{ if ... }}...{{ else }}...{{ end }}` — điều kiện
- `{{ range .Values.list }}...{{ end }}` — lặp
- `{{ include "helper.name" . }}` — gọi helper template

**Named templates** (`_helpers.tpl`): file bắt đầu bằng `_` không được render thành manifest.
Dùng để định nghĩa snippet dùng lại, phổ biến nhất là label selector và tên resource:

```yaml
{{- define "my-chart.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
```

**Helm Hooks**: annotations trên manifest K8s để Helm chạy vào đúng thời điểm trong lifecycle
của release, không phải apply cùng với manifest thông thường:
- `pre-install` / `pre-upgrade`: chạy TRƯỚC khi Helm apply manifest chính
- `post-install` / `post-upgrade`: chạy SAU khi manifest chính đã apply
- `pre-delete` / `post-delete`: khi `helm uninstall`
- `pre-rollback` / `post-rollback`: khi `helm rollback`

Hook thường là K8s Job (chạy xong và exit) — Helm chờ Job thành công trước khi tiếp tục.

**`helm.sh/hook-delete-policy`**: quyết định K8s object của hook bị xoá khi nào. Nếu không đặt,
hook Job tích tụ lại sau nhiều lần upgrade. Thường đặt `before-hook-creation` (xoá cái cũ
trước khi tạo cái mới) hoặc `hook-succeeded` (xoá sau khi chạy thành công).

## 3. Cách nó hoạt động

**Render pipeline**: khi `helm install/upgrade`:
1. Helm load `Chart.yaml`, `values.yaml`, tất cả file trong `templates/`.
2. Merge values (default + user override) thành 1 object `.Values`.
3. Render từng template file bằng Go template engine.
4. Tách manifest thường và hook manifest (dựa trên annotation).
5. Chạy hook theo phase (pre-install trước, apply manifest, post-install sau).

**Scope của `.` (dot)**: trong template, `.` là "context hiện tại". Mặc định là top-level
context (`.Values`, `.Release`, `.Chart`). Trong `range`, `.` trở thành item hiện tại — cần
dùng `$.Values`, `$.Release.Name`, `$.Chart.Version`... để truy cập top-level từ trong vòng
lặp (`$` luôn là root context).

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Helm documentation.

**Tạo chart skeleton**:

```bash
helm create my-api
# Tạo thư mục my-api/ với cấu trúc đầy đủ + example templates
```

**Chart.yaml**:

```yaml
apiVersion: v2
name: my-api
description: "API server for production workload"
type: application
version: 0.1.0        # chart version — tăng khi sửa chart
appVersion: "1.5.0"   # app version — tăng khi deploy app version mới
```

**values.yaml** — khai báo mọi thứ có thể thay đổi giữa môi trường:

```yaml
replicaCount: 2

image:
  repository: my-registry/my-api
  tag: "1.5.0"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 8080

resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"

env:
  LOG_LEVEL: "info"

migration:
  enabled: true    # bật/tắt Job migration
```

**`_helpers.tpl`** — helper tái sử dụng:

```yaml
{{/* Full name cho resource — tránh tên quá dài (truncate 63 ký tự) */}}
{{- define "my-api.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Labels chuẩn để selector khớp */}}
{{- define "my-api.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{- define "my-api.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

**`templates/deployment.yaml`**:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "my-api.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "my-api.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "my-api.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "my-api.selectorLabels" . | nindent 8 }}
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
    spec:
      containers:
      - name: api
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - containerPort: {{ .Values.service.port }}
        env:
        {{- range $key, $value := .Values.env }}
        - name: {{ $key }}
          value: {{ $value | quote }}
        {{- end }}
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
```

`nindent N` = `indent N` + thêm newline ở đầu; `toYaml` convert object sang YAML string.

**Hook migration** — `templates/job-migration.yaml`:

```yaml
{{- if .Values.migration.enabled }}
apiVersion: batch/v1
kind: Job
metadata:
  name: {{ include "my-api.fullname" . }}-migration
  namespace: {{ .Release.Namespace }}
  annotations:
    "helm.sh/hook": pre-upgrade,pre-install
    "helm.sh/hook-weight": "-5"          # nhỏ hơn = chạy trước
    "helm.sh/hook-delete-policy": before-hook-creation,hook-succeeded
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: migration
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        command: ["python", "manage.py", "migrate", "--noinput"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: {{ include "my-api.fullname" . }}-db
              key: url
{{- end }}
```

Khi `helm upgrade`, Job migration chạy và hoàn thành TRƯỚC khi Deployment được cập nhật —
đảm bảo DB schema mới có sẵn trước khi app mới start.

**Lint chart trước khi dùng**:

```bash
helm lint my-api/
# ==> Linting my-api/
# [INFO] Chart.yaml: icon is recommended
# 1 chart(s) linted, 0 chart(s) failed

# Render template để kiểm tra output (không apply)
helm template my-api-release my-api/ -f staging-values.yaml | head -80

# Dry-run với cluster thật (validate manifest qua apiserver)
helm install my-api-release my-api/ --dry-run
```

**Package và push lên registry**:

```bash
# Package thành .tgz
helm package my-api/
# Successfully packaged chart and saved it to: my-api-0.1.0.tgz

# Push lên OCI registry (Helm 3.8+)
helm push my-api-0.1.0.tgz oci://my-registry.example.com/charts
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Template render lỗi — `nil pointer evaluating interface{}.xxx`**
- Nguyên nhân: truy cập key không tồn tại trong values mà không check nil trước.
- Cách xử lý: dùng `default` function: `{{ .Values.key | default "fallback" }}`; hoặc
  `{{ if .Values.key }}...{{ end }}` để guard.

**Indentation sai trong YAML output**
- Nguyên nhân: `indent`/`nindent` đặt sai số spaces, hoặc block scalar (`|`, `>`) trong values
  không được xử lý đúng.
- Cách debug: `helm template ... | cat -A` xem whitespace thật; hoặc `helm lint --strict`.

**Hook Job không xoá sau khi chạy xong — Job cũ block lần upgrade tiếp**
- Nguyên nhân: `helm.sh/hook-delete-policy` không đặt hoặc đặt `hook-succeeded` nhưng Job
  FAILED (bị giữ lại để debug).
- Cách xử lý: đặt `before-hook-creation` để Helm tự xoá Job cũ trước khi tạo mới. Job failed
  cần xoá thủ công: `kubectl delete job <name> -n <namespace>`.

**`helm upgrade` không thấy thay đổi dù values file đã sửa**
- Nguyên nhân: file values nào cũng có thể không được pass đúng. Helm upgrade không tự lấy
  values đã dùng ở lần install — phải pass lại `-f values.yaml` mỗi lần upgrade, hoặc dùng
  `--reuse-values` (giữ values cũ, chỉ override field được pass mới).
- `helm get values <release> -n <namespace>` để xem values đang dùng của release hiện tại.

## 6. Tình huống thực tế

Đóng gói Python API thành Helm chart để deploy lên 2 môi trường:

1. **Tạo chart**: `helm create python-api`, sửa lại templates theo app.

2. **Staging values** (`staging-values.yaml`):
   ```yaml
   replicaCount: 1
   image:
     tag: "main-abc123"    # CI build tag
   resources:
     requests: {memory: "128Mi", cpu: "50m"}
     limits: {memory: "256Mi", cpu: "200m"}
   env:
     LOG_LEVEL: "debug"
   ```

3. **Production values** (`prod-values.yaml`):
   ```yaml
   replicaCount: 3
   image:
     tag: "v1.5.0"
   resources:
     requests: {memory: "256Mi", cpu: "100m"}
     limits: {memory: "512Mi", cpu: "500m"}
   env:
     LOG_LEVEL: "warn"
   migration:
     enabled: true    # chỉ chạy migration trên production
   ```

4. **CI/CD pipeline**:
   ```bash
   # Build + tag image
   docker build -t my-registry/python-api:$GIT_SHA .
   docker push my-registry/python-api:$GIT_SHA

   # Deploy staging
   helm upgrade --install python-api-staging charts/python-api \
     --namespace staging \
     -f staging-values.yaml \
     --set image.tag=$GIT_SHA

   # Deploy production (sau khi staging test pass)
   helm upgrade --install python-api-prod charts/python-api \
     --namespace production \
     -f prod-values.yaml \
     --set image.tag=v1.5.0
   ```

5. **Khi có lỗi production**: `helm rollback python-api-prod -n production` — không cần biết
   revision cụ thể; mặc định rollback về revision ngay trước.

## 7. Tự kiểm tra

1. `{{ .Values.env }}` là map, cần render thành env var list trong Deployment. Cú pháp loop
   đúng trong Helm template là gì?
   <details><summary>Đáp án</summary>Dùng `range` với key-value destructuring:
   ```yaml
   {{- range $key, $value := .Values.env }}
   - name: {{ $key }}
     value: {{ $value | quote }}
   {{- end }}
   ```
   `$key`/`$value` là biến có scope trong range block. `quote` bọc value trong `"..."` để xử
   lý đúng string có ký tự đặc biệt. Lưu ý `-` trước `{{` để trim whitespace trước block.</details>

2. Hook Job với annotation `helm.sh/hook: pre-upgrade` fail (Job exit code ≠ 0). Helm upgrade
   tiếp tục hay dừng lại?
   <details><summary>Đáp án</summary>Helm dừng lại và đánh dấu release là `failed` — không apply
   manifest chính (Deployment mới không được cập nhật). Đây là behaviour mong muốn cho migration:
   nếu migration thất bại, không deploy app mới lên để tránh app mới chạy với schema DB lỗi.
   Sau khi fix lỗi migration (sửa code migration, rebuild image), chạy `helm upgrade` lại.
   Job cũ bị giữ lại để debug (trừ khi đặt `hook-delete-policy: hook-failed` — xoá ngay sau
   khi Job thất bại; `before-hook-creation` chỉ xoá trước lần upgrade tiếp theo, không xoá ngay).</details>

3. Tại sao cần dùng `{{ include "my-chart.labels" . | nindent 4 }}` thay vì trực tiếp viết
   labels trong mỗi template?
   <details><summary>Đáp án</summary>DRY (Don't Repeat Yourself) — labels chuẩn K8s
   (`app.kubernetes.io/name`, `app.kubernetes.io/instance`, `app.kubernetes.io/version`) phải
   nhất quán giữa Deployment, Service, và các manifest khác để selector hoạt động đúng. Định
   nghĩa 1 lần trong `_helpers.tpl` và `include` lại tránh inconsistency. `nindent 4` đảm bảo
   output indent đúng với vị trí trong YAML (metadata.labels ở indent 4, spec.selector ở 6).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.helm.basics` — install/upgrade/rollback, values override, Helm repos.

**Bài liên quan ngoài module (xem thêm):**
- `container-k8s.k8s-workload.configmap-secret` — pattern checksum annotation để trigger rolling
  update khi ConfigMap thay đổi qua Helm upgrade.
- `container-k8s.k8s-workload.pods-deployments` — Deployment spec mà Helm template sẽ render.

**Nguồn tham khảo:**
- [Chart Template Guide — helm.sh](https://helm.sh/docs/chart_template_guide/)
  — Go template syntax, built-in objects, Sprig functions, named templates, hooks.
- [Charts — helm.sh](https://helm.sh/docs/topics/charts/)
  — Chart.yaml format, dependencies, chart types.
- [Chart Hooks — helm.sh](https://helm.sh/docs/topics/chart_hooks/)
  — hook lifecycle, weights, delete policy, hook resources.
