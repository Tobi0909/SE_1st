---
id: devops.gitops.tools
title: "Công cụ GitOps: ArgoCD/Flux cơ bản"
domain: devops
module: devops.gitops
level: chuyên sâu
prerequisites:
  - devops.gitops.principles
applies_to:
  - Kubernetes clusters
  - GitOps CD pipelines
status: verified
sources:
  - https://argo-cd.readthedocs.io/en/stable/
  - https://fluxcd.io/flux/concepts/
last_verified: "2026-10-07"
author: tuank63uet@gmail.com
---

## 1. Vì sao cần biết

Đã hiểu 4 nguyên lý OpenGitOps (đã học ở [devops.gitops.principles](./principles.md)), câu hỏi tiếp theo là: dùng công cụ nào để hiện thực hóa? Hai lựa chọn phổ biến nhất là **ArgoCD** và **Flux**. Cả hai đều implement đủ 4 nguyên lý, nhưng có triết lý thiết kế khác nhau: ArgoCD tập trung vào UX và visibility (có dashboard web), còn Flux tập trung vào operator pattern và composability (toàn bộ là CRD + controller).

Biết cơ bản cả hai giúp team chọn đúng công cụ và đọc được config của dự án dù đang dùng tool nào.

## 2. Khái niệm cốt lõi

### So sánh ArgoCD và Flux

| Tiêu chí | ArgoCD | Flux v2 |
|---------|--------|---------|
| Mô hình cài đặt | Single namespace (`argocd`), nhiều component | GitOps Toolkit — nhiều controller độc lập |
| UI | Dashboard web đầy đủ | Không có UI chính thức (dùng Weave GitOps) |
| CRD chính | `Application`, `AppProject` | `GitRepository`, `Kustomization`, `HelmRelease` |
| Trigger sync | Poll Git (mặc định 3 phút) hoặc webhook | Poll Git (mặc định 1 phút) hoặc webhook |
| Multi-tenancy | AppProject phân quyền theo namespace | Flux namespace isolation mặc định |
| Helm support | Có (native, trong Application spec) | Có (qua `HelmRelease` CRD) |
| CLI | `argocd` CLI | `flux` CLI |
| CNCF status | Graduated | Graduated |

### Kiến trúc ArgoCD

ArgoCD chạy 5 component trong namespace `argocd`:

```
┌──────────────────────────────────────────────────────┐
│                   argocd namespace                   │
│                                                      │
│  argocd-server         ← API server + Web UI         │
│  argocd-repo-server    ← Clone và render manifest    │
│  argocd-application-controller ← Reconcile loop      │
│  argocd-dex-server     ← OIDC / SSO                  │
│  argocd-redis          ← Cache                       │
└──────────────────────────────────────────────────────┘
        │ watches
        ▼
  Application CRD  →  Git repo  →  Target cluster
```

`argocd-application-controller` là trái tim: nó poll Git, compare với cluster, và áp diff — đây là implementation của reconciliation loop.

### Kiến trúc Flux v2 (GitOps Toolkit)

Flux dùng nhiều controller chuyên dụng:

```
source-controller      ← Fetch từ Git/Helm/OCI registry
kustomize-controller   ← Apply Kustomization manifest
helm-controller        ← Manage HelmRelease
notification-controller ← Alert và webhook
image-automation-controller ← Tự động cập nhật image tag
```

Mỗi controller xử lý một loại resource — composable, thêm bớt controller theo nhu cầu.

## 3. Cách nó hoạt động

### ArgoCD: Application CRD

`Application` là đơn vị quản lý của ArgoCD — khai báo "lấy manifest từ đâu, deploy đến đâu":

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: api-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/org/infra-gitops.git
    targetRevision: main          # branch / tag / commit SHA
    path: apps/api                # thư mục chứa manifest
  destination:
    server: https://kubernetes.default.svc   # cluster nội bộ
    namespace: production
  syncPolicy:
    automated:
      prune: true       # xoá resource không còn trong Git
      selfHeal: true    # tự sửa khi phát hiện drift
    syncOptions:
      - CreateNamespace=true
```

**Trạng thái sync của Application:**

| Trạng thái | Ý nghĩa |
|-----------|---------|
| `Synced` | Cluster khớp với Git |
| `OutOfSync` | Cluster lệch khỏi Git |
| `Unknown` | Không thể so sánh |

**Trạng thái health:**

| Trạng thái | Ý nghĩa |
|-----------|---------|
| `Healthy` | Tất cả resource sẵn sàng |
| `Progressing` | Đang rollout (Pod khởi động) |
| `Degraded` | Resource không healthy (CrashLoopBackOff, ...) |
| `Suspended` | Sync bị tắt thủ công |
| `Missing` | Resource không tồn tại trên cluster |

### Flux v2: GitRepository + Kustomization

Flux tách biệt "lấy source" và "apply manifest":

```yaml
# Bước 1: Định nghĩa nguồn
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: infra-gitops
  namespace: flux-system
spec:
  interval: 1m           # poll mỗi 1 phút
  url: https://github.com/org/infra-gitops.git
  ref:
    branch: main
---
# Bước 2: Khai báo gì cần apply từ nguồn đó
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: api-production
  namespace: flux-system
spec:
  interval: 5m
  sourceRef:
    kind: GitRepository
    name: infra-gitops
  path: ./apps/api
  targetNamespace: production
  prune: true             # xoá resource không còn trong Git
```

## 4. Thực hành

Vì ArgoCD và Flux không được cài trên máy này, các lệnh dưới đây là **output minh họa** dựa trên tài liệu chính thức.

### ArgoCD CLI cơ bản (output minh họa)

```bash
# Đăng nhập vào ArgoCD server
argocd login argocd.example.com --username admin

# Danh sách Application và trạng thái
argocd app list
```

```
NAME             CLUSTER                         NAMESPACE    PROJECT  STATUS     HEALTH     SYNCPOLICY
api-production   https://kubernetes.default.svc  production   default  Synced     Healthy    Auto-Prune
frontend         https://kubernetes.default.svc  production   default  OutOfSync  Healthy    Auto
worker           https://kubernetes.default.svc  production   default  Synced     Degraded   Manual
```

```bash
# Xem chi tiết và diff của app đang OutOfSync
argocd app diff frontend

# Trigger sync thủ công
argocd app sync frontend --prune

# Rollback về revision trước
argocd app rollback api-production 5
```

### Flux CLI cơ bản (output minh họa)

```bash
# Xem trạng thái toàn bộ Flux resources
flux get all -n flux-system
```

```
NAME                        REVISION      SUSPENDED  READY    MESSAGE
gitrepository/infra-gitops  main/a3f2b1c  False      True     stored artifact for revision 'main/a3f2b1c'

NAME                        REVISION      SUSPENDED  READY    MESSAGE
kustomization/api-production main/a3f2b1c False      True     Applied revision: main/a3f2b1c
kustomization/frontend       main/a3f2b1c False      False    Health check timeout for: 'production/Deployment/frontend'
```

```bash
# Force reconcile ngay (không đợi interval)
flux reconcile kustomization api-production --with-source

# Suspend reconciliation (dừng auto-sync tạm thời)
flux suspend kustomization api-production

# Resume
flux resume kustomization api-production
```

### App-of-Apps pattern (ArgoCD)

Khi có nhiều Application, dùng App-of-Apps để quản lý tập trung:

```yaml
# root-app.yaml — Application quản lý các Application khác
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/org/infra-gitops.git
    path: clusters/production/apps   # thư mục chứa nhiều Application manifest
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

Toàn bộ cây Application được bootstrap chỉ bằng 1 `kubectl apply` cho root-app.

## 5. Lỗi thường gặp

| Lỗi | Triệu chứng | Cách xử lý |
|-----|------------|-----------|
| Repo private không có deploy key | ArgoCD/Flux không pull được, lỗi `authentication required` | Thêm SSH deploy key hoặc HTTPS token vào ArgoCD repo settings / Flux Secret |
| `prune: true` xoá resource không mong muốn | Resource quan trọng bị xoá sau khi xoá khỏi Git | Thêm annotation `argocd.argoproj.io/managed-by` đúng, hoặc dùng `prune: false` cho resource đó |
| Sync loop vô tận | App liên tục Synced → OutOfSync | Thường do resource có field tự mutate (timestamp, resourceVersion); dùng `ignoreDifferences` trong ArgoCD |
| Flux `kustomize-controller` OOMKilled | Controller bị kill khi repo lớn | Tăng memory limit cho kustomize-controller |
| ArgoCD app Degraded nhưng Pods chạy bình thường | Health check không nhận ra custom resource | Cần cấu hình custom health check script cho CRD đó |

## 6. Tình huống thực tế

**Tình huống**: Deploy hotfix khẩn cấp lúc nửa đêm. Thay vì gọi kỹ sư DevOps cầm credential cluster, team thực hiện qua GitOps:

1. Dev tạo PR trên repo GitOps, bump image tag từ `v2.4.0` sang `v2.4.1-hotfix`
2. TL review và approve PR trong 5 phút
3. PR merge vào `main`
4. ArgoCD phát hiện commit mới trong vòng 3 phút (hoặc ngay lập tức nếu có webhook), tự động sync

```
# ArgoCD dashboard sau khi merge (output minh họa):
Application: api-production
  Status: Progressing → Healthy
  Revision: main/f9a3b2c
  Sync time: 2026-10-07 02:14:33 UTC
  Images deployed:
    registry.example.com/api:v2.4.1-hotfix
```

Audit trail đầy đủ: Git log ghi ai approve PR, lúc mấy giờ, ArgoCD log ghi sync thành công. Không ai cần trực tiếp chạm vào cluster.

## 7. Tự kiểm tra

**Câu 1**: ArgoCD Application ở trạng thái `OutOfSync` nhưng `Healthy`. Điều này có nghĩa gì?

a) OutOfSync và Healthy luôn đi cùng nhau, không thể có OutOfSync mà vẫn Healthy
b) Healthy nghĩa là config khớp Git; OutOfSync nghĩa là resource đang lỗi
c) OutOfSync nghĩa là config trên cluster khác với desired state trong Git (ví dụ: replicas bị scale thủ công)
d) OutOfSync chỉ xảy ra khi ArgoCD mất kết nối tới Git repo, không liên quan tới config trên
   cluster

**Đáp án: c** — OutOfSync = config lệch Git; Healthy = resource chạy bình thường. Hai trạng
thái ĐỘC LẬP — app có thể healthy nhưng lệch Git. Hai trạng thái này ĐỘC LẬP, không bắt buộc
đi cùng nhau — chính câu hỏi mô tả trường hợp OutOfSync nhưng vẫn Healthy (loại a); định
nghĩa của hai trạng thái bị đảo ngược hoàn toàn (loại b); OutOfSync phản ánh SO SÁNH config
cluster với Git, không chỉ xảy ra khi mất kết nối repo (loại d).

---

**Câu 2**: Khi nào nên dùng `selfHeal: true` và khi nào không?

a) Luôn dùng selfHeal: true cho mọi môi trường bao gồm cả lúc debug khẩn cấp, không có
   ngoại lệ
b) selfHeal: true chỉ ảnh hưởng tới tốc độ sync, không liên quan tới việc ghi đè thay đổi
   thủ công
c) Chỉ dùng selfHeal: true cho môi trường staging, tuyệt đối không dùng cho production
d) Dùng selfHeal: true (ArgoCD) / prune: true (Flux) cho môi trường production khi muốn GitOps là nguồn sự thật tuyệt đối

**Đáp án: d** — Dùng cho production khi muốn GitOps là nguồn sự thật tuyệt đối. Không dùng
khi cần can thiệp thủ công tạm thời hoặc resource tự-mutate khó cấu hình. Không nên luôn bật
khi đang debug khẩn cấp — đó chính là trường hợp CẦN TẠM TẮT để can thiệp thủ công (loại a);
`selfHeal` ảnh hưởng TRỰC TIẾP tới việc có ghi đè thay đổi thủ công hay không, không chỉ tốc
độ sync (loại b); thực tế thường NGƯỢC LẠI — production mới là nơi cần `selfHeal: true` nhất
để đảm bảo nguồn sự thật tuyệt đối (loại c).

---

**Câu 3**: Sự khác biệt giữa `targetRevision: main` và `targetRevision: v1.2.3` trong ArgoCD
Application là gì?

a) main là mutable reference (branch): ArgoCD poll và theo commit mới nhất trên branch đó — mỗi merge đều trigger sync. v1.2.3 là immutable reference
b) main là immutable tag; v1.2.3 là mutable branch
c) Cả hai hoàn toàn tương đương về hành vi sync, chỉ khác cách hiển thị trên UI ArgoCD
d) targetRevision chỉ nhận branch, không hỗ trợ version tag như v1.2.3

**Đáp án: a** — `main` mutable (branch, theo commit mới nhất); `v1.2.3` immutable (tag, cố
định). Production thường dùng tag, staging dùng branch. Vai trò bị đảo ngược hoàn toàn trong
lựa chọn b (loại b); hai cấu hình có hành vi sync KHÁC NHAU rõ rệt (tự động theo mới nhất vs
cố định), không tương đương (loại c); `targetRevision` HOÀN TOÀN hỗ trợ cả branch và tag
(cũng như commit SHA) (loại d).

---

**Câu 4**: Flux tách `GitRepository` và `Kustomization` thành hai CRD riêng. Lợi ích của
thiết kế này là gì?

a) Vì Flux yêu cầu bắt buộc phải tách 2 CRD theo giới hạn kỹ thuật của Kubernetes CRD,
   không phải lựa chọn thiết kế
b) Một GitRepository có thể được tham chiếu bởi nhiều Kustomization
c) Tách 2 CRD giúp Flux chạy nhanh hơn do giảm số lượng field trong 1 object duy nhất
d) GitRepository và Kustomization bắt buộc phải có tỉ lệ 1:1, tách riêng chỉ để dễ đọc YAML
   hơn

**Đáp án: b** — Một GitRepository dùng cho nhiều Kustomization (reuse), và có thể thay thế
nguồn (HelmRepository/OCIRepository) mà không đổi Kustomization — loose coupling. Đây là
LỰA CHỌN THIẾT KẾ có chủ đích (loose coupling), không phải giới hạn kỹ thuật bắt buộc của
Kubernetes CRD (loại a); lý do tách không phải để tăng tốc hiệu năng theo cách đó (loại c); tỉ
lệ chính xác là 1-NHIỀU (1 GitRepository nhiều Kustomization), không bắt buộc 1:1 (loại d).

---

**Câu 5**: App-of-Apps pattern trong ArgoCD giải quyết vấn đề gì?

a) Giải quyết vấn đề giới hạn số lượng Application tối đa mà 1 cluster ArgoCD có thể chạy
b) App-of-Apps chỉ dùng để tăng tốc độ sync khi có nhiều Application cùng lúc
c) Khi có nhiều Application, bootstrap thủ công (kubectl apply từng file) dễ sót và không traceable
d) App-of-Apps yêu cầu phải xoá hết Application cũ trước khi tạo root Application mới,
   không tương thích ngược

**Đáp án: c** — Giải quyết vấn đề bootstrap thủ công dễ sót, không traceable. Root
Application quản lý nhiều Application con, bootstrap chỉ cần 1 lần apply. Không có giới hạn
cứng số lượng Application mà ArgoCD áp đặt cần giải quyết bằng pattern này (loại a); mục đích
chính không phải tăng tốc sync — mà là quản lý bootstrap/thêm mới có tổ chức (loại b);
App-of-Apps hoàn toàn TƯƠNG THÍCH NGƯỢC — không yêu cầu xoá Application cũ, có thể áp dụng
dần cho hệ thống hiện có (loại d).

## 8. Bài liên quan và nguồn

**Đã học ở:**
- [devops.gitops.principles](./principles.md) — 4 nguyên lý OpenGitOps, reconciliation loop, pull vs push

**Xem thêm:**
- [container-k8s.k8s-architecture.control-plane](../../container-k8s/k8s-architecture/control-plane.md) — Kubernetes controller pattern (nền tảng của ArgoCD/Flux)
- [devops.terraform.fundamentals](../terraform/fundamentals.md) — Declarative IaC cho infrastructure ngoài Kubernetes

**Nguồn:**
- ArgoCD documentation: https://argo-cd.readthedocs.io/en/stable/
- Flux concepts: https://fluxcd.io/flux/concepts/
- OpenGitOps spec: https://opengitops.dev/
