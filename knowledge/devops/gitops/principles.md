---
id: devops.gitops.principles
title: "GitOps: nguyên lý declarative, reconciliation"
domain: devops
module: devops.gitops
level: chuyên sâu
prerequisites:
  - devops.cicd.concepts
  - container-k8s.k8s-architecture.control-plane
applies_to:
  - Kubernetes deployments
  - Infrastructure as Code
  - CI/CD pipelines
status: draft
sources:
  - https://opengitops.dev/
  - https://www.weave.works/technologies/gitops/
last_verified: "2026-10-07"
author: tuank63uet@gmail.com
---

## 1. Vì sao cần biết

Trong mô hình CI/CD truyền thống (push-based), pipeline chạy lệnh `kubectl apply` hay `helm upgrade` trực tiếp lên cụm. Cách này có ba vấn đề lớn:

- **Drift không phát hiện được**: ai đó sửa resource trực tiếp qua `kubectl edit` mà không qua pipeline — cụm lệch dần khỏi repo, không ai biết.
- **Quyền truy cập rộng**: CI runner cần credential đủ quyền ghi vào cụm, nếu bị lộ có thể deploy bất kỳ thứ gì.
- **Không có audit trail chuẩn**: lịch sử thay đổi nằm ở nhiều nơi (Jenkins log, GitLab CI, chat Slack), không phải một nguồn duy nhất.

**GitOps** giải quyết cả ba bằng cách lấy Git làm nguồn sự thật duy nhất (single source of truth) và để một agent bên trong cụm tự kéo (pull) config về, không để pipeline đẩy (push) vào.

## 2. Khái niệm cốt lõi

### 4 nguyên lý OpenGitOps

OpenGitOps (opengitops.dev) định nghĩa 4 nguyên lý cốt lõi:

| # | Nguyên lý | Ý nghĩa |
|---|-----------|---------|
| 1 | **Declarative** | Trạng thái mong muốn của hệ thống phải được mô tả dưới dạng khai báo (không phải lệnh mệnh lệnh) |
| 2 | **Versioned & Immutable** | Trạng thái mong muốn được lưu sao cho bất biến, có phiên bản, giữ lịch sử đầy đủ |
| 3 | **Pulled Automatically** | Agent phần mềm tự lấy khai báo trạng thái mong muốn từ nguồn, không để ngoài đẩy vào |
| 4 | **Continuously Reconciled** | Agent liên tục so sánh trạng thái thực với trạng thái mong muốn và tự sửa lệch |

### Declarative vs Imperative

```
# Imperative — mô tả HÀNH ĐỘNG:
kubectl scale deployment/api --replicas=5

# Declarative — mô tả TRẠNG THÁI MONG MUỐN:
# deployment.yaml
spec:
  replicas: 5
```

Declarative có thể áp đi áp lại (idempotent): chạy `kubectl apply` 10 lần kết quả vẫn giống nhau.

### Pull vs Push deployment

```
┌─────────────────────────────────────────────────────────────────┐
│ PUSH-BASED (truyền thống)                                       │
│                                                                 │
│  Dev ──push──▶ Git ──trigger──▶ CI Pipeline ──kubectl──▶ Cluster│
│                                    (cần credential rộng)        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ PULL-BASED (GitOps)                                             │
│                                                                 │
│  Dev ──push──▶ Git                                              │
│                 ▲                                               │
│                 │ pull (định kỳ)                                │
│            GitOps Agent (chạy trong cluster)                    │
│                 │                                               │
│                 ▼                                               │
│             Cluster ◀──reconcile──▶ Desired State              │
└─────────────────────────────────────────────────────────────────┘
```

Với pull model, CI pipeline không cần credential vào cụm — chỉ cần quyền ghi vào repo Git.

## 3. Cách nó hoạt động

### Vòng lặp reconciliation

GitOps agent thực hiện vòng lặp liên tục:

```
┌─────────────────────────────────────────────────────┐
│               RECONCILIATION LOOP                   │
│                                                     │
│  1. OBSERVE   Đọc trạng thái thực từ cluster        │
│       │       (Deployment replicas, ConfigMap, ...)  │
│       ▼                                             │
│  2. DIFF      So sánh với desired state trong Git   │
│       │       diff = desired − actual               │
│       ▼                                             │
│  3. ACT       Áp diff lên cluster (apply/delete)   │
│       │       nếu diff = ∅ → không làm gì           │
│       ▼                                             │
│  4. REPORT    Cập nhật status (Synced/OutOfSync)    │
│       │                                             │
│       └─────────────────────────────────────────────┘
│              (lặp lại mỗi N giây/phút)              │
└─────────────────────────────────────────────────────┘
```

Vòng lặp này là lý do GitOps tự sửa drift: nếu ai đó thay đổi trực tiếp trên cluster, vòng tiếp theo sẽ phát hiện diff và áp lại desired state từ Git.

### Cấu trúc repo GitOps điển hình

```
infra-gitops/
├── clusters/
│   ├── production/
│   │   ├── apps/          # ArgoCD Application / Flux Kustomization
│   │   └── infrastructure/
│   └── staging/
├── apps/
│   ├── api/
│   │   ├── deployment.yaml
│   │   ├── service.yaml
│   │   └── kustomization.yaml
│   └── frontend/
└── infrastructure/
    ├── cert-manager/
    ├── ingress-nginx/
    └── monitoring/
```

Tách biệt repo application code (có CI build image) và repo GitOps config (có manifest Kubernetes).

## 4. Thực hành

### Chạy thật: kiểm tra trạng thái Git repo

GitOps bắt đầu từ Git. Kiểm tra branch và commit gần nhất của repo config:

```bash
git -C /path/to/infra-gitops log --oneline -5
```

Kết quả minh họa:
```
a3f2b1c feat: bump api image to v2.4.1
9e1d8a0 fix: increase memory limit for worker
7c4f220 feat: add hpa for frontend
3b09155 chore: update cert-manager to 1.15.0
1a88de4 feat: initial cluster bootstrap
```

### Chạy thật: phát hiện drift thủ công

Không có GitOps agent, bạn có thể mô phỏng bước "diff" thủ công:

```bash
# So sánh desired state (Git) với actual state (cluster)
kubectl diff -f apps/api/deployment.yaml
```

`kubectl diff` thoát với code 1 nếu có drift, code 0 nếu đồng bộ — dùng được trong CI để cảnh báo.

### Commit message convention cho GitOps

Mỗi thay đổi config phải traceable:

```
feat(api): bump image to v2.4.1

Image: registry.example.com/api:v2.4.1
Built from: github.com/org/api@abc1234
Ticket: INFRA-512
```

Audit trail hoàn chỉnh từ `git log` — ai thay đổi gì, khi nào, tại sao.

## 5. Lỗi thường gặp

| Lỗi | Hậu quả | Cách tránh |
|-----|---------|------------|
| Lưu secret plaintext trong repo Git | Credential bị lộ | Dùng Sealed Secrets / External Secrets Operator |
| Merge trực tiếp lên nhánh deploy không qua review | Thay đổi chưa được duyệt vào production | Bắt buộc PR + approval cho nhánh `main`/`production` |
| Để dev tự sửa resource qua `kubectl edit` | Drift tích lũy, agent ghi đè lại không rõ lý do | Revoke `edit`/`admin` ClusterRole cho người dùng thường; chỉ giữ `view` |
| Dùng `latest` tag cho image | Agent không biết image đã thay đổi, không reconcile | Luôn dùng digest hoặc tag bất biến (`v2.4.1`, không phải `latest`) |
| Một repo chứa cả app code và GitOps config | CI build và GitOps changes lẫn lộn, khó audit | Tách thành 2 repo riêng biệt |

## 6. Tình huống thực tế

**Tình huống**: Team SRE phát hiện Deployment `api` đang chạy với 3 replicas thay vì 5 như đã config. Nguyên nhân: một kỹ sư đã `kubectl scale deployment/api --replicas=3` để debug rồi quên khôi phục.

**Không có GitOps**: phải tìm ai đã chạy lệnh đó (xem audit log Kubernetes hoặc hỏi từng người), sau đó chạy lại `kubectl apply` thủ công.

**Có GitOps**: ArgoCD/Flux phát hiện drift ở vòng reconcile tiếp theo (thường < 3 phút), tự động áp lại `replicas: 5` từ Git. Alert "OutOfSync → Synced" xuất hiện trong dashboard.

```
# ArgoCD log khi phát hiện và sửa drift (output minh họa):
time="2026-10-07T14:23:01Z" level=info app=api msg="app is OutOfSync"
time="2026-10-07T14:23:01Z" level=info app=api msg="initiated sync"
time="2026-10-07T14:23:04Z" level=info app=api msg="sync succeeded" 
  resource=apps/Deployment/api revision=a3f2b1c
```

Không cần can thiệp thủ công; Git log ghi lại ai đã merge commit đó — đây là audit trail.

## 7. Tự kiểm tra

**1. Nguyên lý nào trong OpenGitOps giải thích tại sao GitOps agent phải PULL config thay vì nhận config được PUSH vào?**

Nguyên lý 3 — "Pulled Automatically": software agent tự chủ động lấy khai báo trạng thái mong muốn từ nguồn. Điều này loại bỏ nhu cầu CI pipeline có credential vào cluster và bảo vệ cluster khỏi push từ hệ thống ngoài.

**2. Drift xảy ra khi nào? GitOps phát hiện và xử lý drift như thế nào?**

Drift xảy ra khi trạng thái thực của cluster lệch khỏi desired state trong Git (ví dụ: ai đó chạy `kubectl edit` trực tiếp). GitOps agent phát hiện qua bước DIFF trong reconciliation loop, sau đó áp lại desired state từ Git (nguyên lý 4 — Continuously Reconciled).

**3. Tại sao không nên dùng `image: latest` trong manifest GitOps?**

Tag `latest` là mutable — cùng tag có thể trỏ đến image layer khác nhau qua thời gian. Agent GitOps so sánh manifest trong Git với resource trên cluster; nếu tag không đổi, agent không thấy diff nên không reconcile, dù image thực tế đã thay đổi. Dùng digest (`image@sha256:...`) hoặc tag bất biến (`v2.4.1`) để mỗi thay đổi image đều tạo ra diff rõ ràng trong Git.

**4. Sự khác biệt giữa mô hình Push và Pull trong CI/CD là gì? Mô hình nào an toàn hơn và tại sao?**

Push: CI pipeline dùng credential để ghi thẳng vào cluster (kubectl apply từ pipeline). Pull: agent trong cluster tự kéo config từ Git, pipeline không có quyền vào cluster. Pull an toàn hơn vì blast radius của credential bị lộ nhỏ hơn — CI chỉ cần quyền đọc/ghi Git, không cần quyền admin cluster.

**5. Trong GitOps, Git đóng vai trò gì khác so với khi chỉ dùng làm version control thông thường?**

Trong GitOps, Git là "source of truth" cho cả infrastructure lẫn trạng thái mong muốn của hệ thống — không chỉ lưu code mà còn là hệ thống audit trail, trigger cho reconciliation, và cơ chế rollback (revert commit = rollback deployment). Git commit history trở thành lịch sử đầy đủ của mọi thay đổi hạ tầng, bao gồm ai thay đổi và lý do.

## 8. Bài liên quan và nguồn

**Đã học ở:**
- [devops.cicd.concepts](../cicd/concepts.md) — CI/CD pipeline, trigger, artifact
- [container-k8s.k8s-architecture.control-plane](../../container-k8s/k8s-architecture/control-plane.md) — Kubernetes API server, controller, reconciliation

**Xem thêm:**
- [devops.gitops.tools](./tools.md) — ArgoCD và Flux: cách cài đặt và cấu hình cụ thể
- [devops.terraform.fundamentals](../terraform/fundamentals.md) — IaC declarative cho infrastructure ngoài Kubernetes

**Nguồn:**
- OpenGitOps Principles v1.0: https://opengitops.dev/
- Weaveworks: "What is GitOps?": https://www.weave.works/technologies/gitops/
