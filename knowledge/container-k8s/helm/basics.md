---
id: container-k8s.helm.basics
title: "Helm cơ bản: chart, release, values"
domain: container-k8s
module: container-k8s.helm
level: "vận hành"
prerequisites: ["container-k8s.k8s-workload.configmap-secret"]
applies_to:
  - "Helm 3.x — Tiller đã bị loại bỏ từ Helm 3 (2019); không áp dụng cho Helm 2"
status: draft
sources:
  - "https://helm.sh/docs/intro/using_helm/"
  - "https://helm.sh/docs/chart_template_guide/"
  - "https://helm.sh/docs/helm/helm/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Helm không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Helm documentation chính thức.

Triển khai một ứng dụng thực tế lên Kubernetes thường cần 10-20 manifest YAML khác nhau
(Deployment, Service, ConfigMap, Secret, Ingress, HPA, ServiceAccount, RBAC...). Helm là
**package manager cho Kubernetes** — gói toàn bộ manifest thành một "chart", cho phép cài đặt
và nâng cấp bằng 1 lệnh thay vì `kubectl apply -f` từng file. Biết dùng Helm là yêu cầu tiên
quyết để cài hầu hết open-source stack (Prometheus, nginx-ingress, cert-manager, ArgoCD) trên
K8s, và để quản lý release lifecycle (install/upgrade/rollback) đúng cách trong production.

## 2. Khái niệm cốt lõi

**Chart**: package Helm — thư mục chứa templates YAML + metadata + default values. Chart được
lưu trữ trên **Helm repository** (HTTP server, có thể host riêng hoặc dùng artifact hub).
Tương tự APT package hay Docker image.

**Release**: một instance đã được cài đặt của chart vào cluster — có tên riêng và namespace.
Một chart có thể được cài nhiều lần với tên release khác nhau trong cùng cluster (ví dụ:
`prometheus-prod` và `prometheus-staging`). Mỗi release giữ revision history cho rollback.

**Values**: biến cấu hình của chart. Chart có `values.yaml` chứa defaults; user override qua
`--set key=value` hoặc `-f custom-values.yaml` khi install/upgrade. Templates dùng Go
template syntax (`{{ .Values.image.tag }}`) để inject values vào manifest.

**Helm 3 vs Helm 2**: Helm 3 (2019+) loại bỏ **Tiller** (server-side component của Helm 2
cần chạy trong cluster với quyền rất cao). Helm 3 là CLI thuần client, dùng trực tiếp
kubeconfig để nói chuyện với apiserver — đơn giản hơn và bảo mật hơn nhiều.

**Release state được lưu ở đâu**: Helm 3 lưu release metadata (history, manifest đã apply)
dưới dạng Kubernetes **Secret** trong namespace của release, tên theo pattern
`sh.helm.release.v1.<release-name>.vN`. Không còn cần etcd riêng hay Tiller.

## 3. Cách nó hoạt động

**`helm install`**:
1. Helm đọc chart (từ file hoặc registry).
2. Render templates với values đã merge (default + user override).
3. Validate manifest (dry-run nếu có `--dry-run`).
4. `kubectl apply` tất cả manifest vào cluster.
5. Lưu release Secret trong namespace.

**`helm upgrade`**: render manifest mới, diff với manifest của revision trước, apply diff vào
cluster (K8s thực hiện rolling update). Lưu revision mới vào Secret history.

**`helm rollback`**: lấy manifest của revision cũ từ Secret history, apply lại vào cluster.

**Three-way strategic merge patch**: Helm 3 so sánh (1) manifest cũ đã deploy, (2) live state
trong cluster, (3) manifest mới — tính diff đúng hơn, không mất thay đổi thủ công ngoài Helm.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Helm documentation.

**Thêm repository và tìm chart**:

```bash
# Thêm repo chứa Helm charts
helm repo add stable https://charts.helm.sh/stable
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update    # cập nhật index từ tất cả repo đã thêm

# Tìm chart
helm search repo prometheus
# NAME                                    CHART VERSION   APP VERSION
# prometheus-community/prometheus         25.21.0         v2.50.1
# prometheus-community/alertmanager       1.9.0           v0.27.0

# Xem thông tin chart + values
helm show chart prometheus-community/prometheus
helm show values prometheus-community/prometheus | head -50
```

**Install chart**:

```bash
# Tạo namespace riêng cho monitoring stack
kubectl create namespace monitoring

# Install với tên release "prom" vào namespace monitoring
helm install prom prometheus-community/prometheus \
  --namespace monitoring \
  --set server.service.type=ClusterIP    # override 1 value

# Kiểm tra release
helm list -n monitoring
# NAME    NAMESPACE   REVISION   UPDATED             STATUS     CHART
# prom    monitoring  1          2026-10-06 10:00:00 deployed   prometheus-25.21.0
```

**Override nhiều values qua file**:

```yaml
# custom-values.yaml
server:
  service:
    type: ClusterIP
  resources:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "1Gi"
      cpu: "500m"
  retention: "7d"

alertmanager:
  enabled: false    # tắt alertmanager nếu chưa cần
```

```bash
# Dùng file values thay vì nhiều --set flag
helm install prom prometheus-community/prometheus \
  --namespace monitoring \
  -f custom-values.yaml
```

**Upgrade release**:

```bash
# Thêm config alertmanager sau
helm upgrade prom prometheus-community/prometheus \
  --namespace monitoring \
  -f custom-values.yaml \
  --set alertmanager.enabled=true

# Xem revision history
helm history prom -n monitoring
# REVISION  UPDATED             STATUS     CHART                  DESCRIPTION
# 1         2026-10-06 10:00    superseded prometheus-25.21.0    Install complete
# 2         2026-10-06 10:30    deployed   prometheus-25.21.0    Upgrade complete
```

**Rollback khi upgrade lỗi**:

```bash
# Rollback về revision 1
helm rollback prom 1 -n monitoring
# Rollback was a success! Happy Helming!

helm history prom -n monitoring
# REVISION  UPDATED             STATUS     CHART                  DESCRIPTION
# 1         ...                 superseded ...                    Install complete
# 2         ...                 superseded ...                    Upgrade complete
# 3         ...                 deployed   prometheus-25.21.0    Rollback to 1
```

Revision 3 là kết quả rollback (áp dụng lại manifest của revision 1), không phải "quay ngược
lịch sử" — revision counter chỉ tăng.

**Uninstall release**:

```bash
helm uninstall prom -n monitoring
# release "prom" uninstalled
# K8s resources tạo bởi chart bị xoá; Secret lưu history cũng bị xoá
```

**Dry-run trước khi apply** — xem manifest sẽ được render:

```bash
helm install prom prometheus-community/prometheus \
  --namespace monitoring \
  -f custom-values.yaml \
  --dry-run --debug | grep -A 5 "kind: Service"
```

## 5. Lỗi thường gặp và cách chẩn đoán

**`Error: INSTALLATION FAILED: cannot re-use a name that is still in use`**
- Nguyên nhân: release tên đó đã tồn tại trong namespace.
- Cách xử lý: dùng `helm upgrade` thay vì `helm install`; hoặc `helm uninstall` rồi
  `helm install` lại. Dùng `helm upgrade --install` để thực hiện install-or-upgrade
  trong 1 lệnh (idempotent, hữu ích cho CI/CD pipeline).

**`Error: unable to build kubernetes objects from release manifest: error validating`**
- Nguyên nhân: values override tạo ra manifest không hợp lệ (sai type, thiếu field bắt
  buộc, sai indent trong `--set` với nested key).
- Cách debug: `helm install ... --dry-run --debug` để xem manifest đã render mà không apply.
  Chú ý `--set` với nested key dùng dấu `.` (ví dụ `--set server.service.type=NodePort`).

**Release ở trạng thái `failed` sau install/upgrade**
- Nguyên nhân: K8s áp manifest nhưng Pod lỗi, Job thất bại, hoặc hook fail — release
  được đánh dấu `failed`.
- Cách xử lý: `kubectl get pods -n <namespace>` xem Pod nào lỗi; `kubectl describe` và
  `kubectl logs` để xem nguyên nhân. Sau khi fix values/config, dùng `helm upgrade` để
  retry.
- Lưu ý: release `failed` vẫn có thể `helm rollback` về revision trước.

**Helm upgrade không cập nhật ConfigMap/Secret (không có rolling update)**
- Nguyên nhân: Helm apply manifest mới, nhưng Pod không tự restart khi ConfigMap thay đổi
  (K8s không tự trigger rollout). Xem thêm `container-k8s.k8s-workload.configmap-secret`.
- Cách xử lý: thêm annotation `checksum/config` vào Deployment pod template spec —
  khi ConfigMap thay đổi, checksum thay đổi → Deployment rolling update tự kích hoạt.

## 6. Tình huống thực tế

Triển khai nginx-ingress controller vào cluster mới bằng Helm:

```bash
# 1. Thêm repo và cập nhật
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# 2. Xem values mặc định để biết có thể override gì
helm show values ingress-nginx/ingress-nginx | grep -A 3 "service:"

# 3. Tạo values file cho production
cat > ingress-values.yaml <<'EOF'
controller:
  replicaCount: 2
  service:
    type: LoadBalancer
    annotations:
      service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
  resources:
    requests:
      memory: "256Mi"
      cpu: "100m"
    limits:
      memory: "512Mi"
      cpu: "500m"
  metrics:
    enabled: true
EOF

# 4. Install (--create-namespace tạo namespace nếu chưa có)
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  -f ingress-values.yaml

# 5. Kiểm tra
helm list -n ingress-nginx
kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx    # xem LoadBalancer IP/hostname
```

## 7. Tự kiểm tra

1. Sự khác biệt quan trọng nhất giữa Helm 2 và Helm 3 là gì?
   <details><summary>Đáp án</summary>Helm 3 loại bỏ Tiller (server-side component của Helm 2).
   Tiller phải chạy trong cluster với ClusterRoleBinding `cluster-admin` — đây là security
   issue nghiêm trọng (mọi người dùng Helm 2 thực ra có quyền cluster-admin thông qua Tiller).
   Helm 3 là thuần CLI client, dùng trực tiếp kubeconfig + RBAC của user — bảo mật hơn và đơn
   giản hơn nhiều. Release metadata không còn lưu trong Tiller pod mà lưu dưới dạng K8s Secret
   trong namespace của release.</details>

2. Cần cài nginx-ingress vào 2 namespace khác nhau (production và staging). Có thể dùng cùng
   1 chart không? Làm thế nào?
   <details><summary>Đáp án</summary>Được — đây chính xác là use case Helm sinh ra để phục vụ.
   Chạy `helm install` 2 lần với TÊN RELEASE khác nhau và namespace khác nhau, ví dụ:
   `helm install ingress-prod ingress-nginx/ingress-nginx -n production -f prod-values.yaml`
   và `helm install ingress-staging ingress-nginx/ingress-nginx -n staging -f staging-values.yaml`.
   Mỗi lần install tạo 1 release độc lập với revision history riêng — upgrade/rollback release
   này không ảnh hưởng release kia.</details>

3. `helm upgrade --install` khác gì `helm install`? Khi nào nên dùng?
   <details><summary>Đáp án</summary>`helm upgrade --install` thực hiện install nếu release chưa
   tồn tại, hoặc upgrade nếu đã tồn tại — idempotent. `helm install` thất bại nếu release đã
   tồn tại. Dùng `helm upgrade --install` trong CI/CD pipeline (ví dụ GitHub Actions, ArgoCD
   sync) để không cần kiểm tra trước "đã có release chưa" — 1 lệnh xử lý cả 2 trường hợp.
   `helm install` dùng cho lần đầu interactive khi biết chắc chưa có release.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.helm.chart-authoring` — viết chart riêng: template syntax, hooks, lint.

**Bài liên quan ngoài module (xem thêm):**
- `container-k8s.k8s-workload.configmap-secret` — ConfigMap auto-update limitation: liên quan
  đến pattern checksum annotation trong Helm chart để trigger rolling update.
- `container-k8s.k8s-networking.ingress` — Ingress resource: được tạo bởi Helm chart, cần hiểu
  spec để viết values đúng.

**Nguồn tham khảo:**
- [Using Helm — helm.sh](https://helm.sh/docs/intro/using_helm/)
  — install, upgrade, rollback, values, repository management.
- [Helm CLI Reference — helm.sh](https://helm.sh/docs/helm/helm/)
  — tất cả subcommand với flags đầy đủ.
- [Chart Template Guide — helm.sh](https://helm.sh/docs/chart_template_guide/)
  — Go template syntax, built-in objects, values.
