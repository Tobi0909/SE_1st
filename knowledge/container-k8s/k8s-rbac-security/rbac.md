---
id: container-k8s.k8s-rbac-security.rbac
title: "RBAC trong K8s: Role, RoleBinding, ServiceAccount"
domain: container-k8s
module: container-k8s.k8s-rbac-security
level: "vận hành"
prerequisites: ["container-k8s.k8s-architecture.api-objects"]
applies_to:
  - "Kubernetes 1.28+ — RBAC API (rbac.authorization.k8s.io/v1) stable; RBAC được bật mặc định từ K8s 1.8+; áp dụng cho mọi cloud provider và bare metal"
status: verified
sources:
  - "https://kubernetes.io/docs/reference/access-authn-authz/rbac/"
  - "https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

Mặc định trong K8s, mọi Pod đều mount ServiceAccount `default` — và mọi ServiceAccount đều có
token truy cập apiserver. Nếu không cấu hình RBAC, một Pod bị compromise có thể dùng token đó
để list/xoá mọi resource trong namespace, đọc Secret của toàn cluster, hoặc leo thang đặc quyền.
**RBAC (Role-Based Access Control)** là cơ chế phân quyền của K8s: xác định ai được làm gì với
resource nào. Không hiểu RBAC = không thể vận hành K8s đúng cách, không viết được Helm chart
production, không thiết kế được security boundary.

## 2. Khái niệm cốt lõi

**Subject** (ai): ba loại:
- `User`: human user — K8s không lưu user, phụ thuộc vào authentication provider bên ngoài (X.509
  cert CN, OIDC token, ...). `kubectl` dùng kubeconfig credentials.
- `Group`: nhóm user — cũng từ auth provider bên ngoài (ví dụ `system:masters` → cluster-admin).
- `ServiceAccount`: identity cho Pod/process trong cluster — K8s quản lý, có namespace.

**Role và ClusterRole** (làm gì với resource nào):
- `Role`: namespace-scoped — chỉ cấp quyền trong 1 namespace.
- `ClusterRole`: cluster-scoped — cấp quyền trên toàn cluster hoặc non-namespaced resource (Node,
  PersistentVolume, Namespace...).

Mỗi Role/ClusterRole là tập hợp `rules` — mỗi rule gồm:
- `apiGroups`: API group của resource (`""` = core/v1, `"apps"` = Deployment, `"rbac.authorization.k8s.io"` = Role...)
- `resources`: loại resource (`pods`, `services`, `secrets`, `deployments`...)
- `verbs`: hành động (`get`, `list`, `watch`, `create`, `update`, `patch`, `delete`, `deletecollection`)

**RoleBinding và ClusterRoleBinding** (bind subject với role):
- `RoleBinding`: bind Role HOẶC ClusterRole vào subject trong 1 namespace.
- `ClusterRoleBinding`: bind ClusterRole vào subject toàn cluster.

| Bind | Role (namespace) | ClusterRole (cluster) |
|---|---|---|
| **RoleBinding** | quyền trong 1 namespace | quyền trong 1 namespace |
| **ClusterRoleBinding** | N/A | quyền toàn cluster |

Dùng `RoleBinding` + `ClusterRole` là cách tái dùng role definition nhưng giới hạn scope xuống 1
namespace.

**ServiceAccount**: object K8s trong namespace — token tự động mount vào Pod ở
`/var/run/secrets/kubernetes.io/serviceaccount/token` (JWT). Pod dùng token này để authenticate với
apiserver. Mặc định Pod dùng ServiceAccount `default` của namespace.

## 3. Cách nó hoạt động

**Authorization flow**: sau khi authenticate, mỗi request đến apiserver được check:
```
[Subject] muốn [verb] lên [resource] trong [namespace]?
  → tìm tất cả RoleBinding + ClusterRoleBinding gắn với subject
  → expand ra list (apiGroup, resource, verb) được phép
  → nếu có bất kỳ rule nào cho phép: ALLOW
  → nếu không có: DENY
```

RBAC là **allow-only** — không có explicit deny. Không có rule = không có quyền. `system:masters`
group bỏ qua RBAC check hoàn toàn (hardcoded bypass).

**`cluster-admin`**: ClusterRole built-in cho quyền wildcard toàn cluster (`*` verbs trên `*`
resources trong `*` apiGroups) — KHÔNG dùng aggregation, là ClusterRole standalone. Thường bind
qua `ClusterRoleBinding` cho admin thật sự.

**Aggregated ClusterRole**: `admin`, `edit`, `view` được build bằng cách aggregate nhiều
ClusterRole nhỏ theo label selector. Có thể extend `view` role bằng cách tạo ClusterRole mới
có label `rbac.authorization.k8s.io/aggregate-to-view: "true"`.

**`automountServiceAccountToken: false`**: Pod có thể opt-out không mount token SA nếu không cần
gọi apiserver — best practice cho workload không cần K8s API access (hầu hết app thông thường).

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

Tạo ServiceAccount riêng cho app:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: api-server-sa
  namespace: production
automountServiceAccountToken: false    # opt-out mount token — app không cần gọi apiserver
```

Role cho phép đọc ConfigMap và Secret trong namespace:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: config-reader
  namespace: production
rules:
- apiGroups: [""]           # "" = core API group (v1)
  resources: ["configmaps", "secrets"]
  verbs: ["get", "list", "watch"]
```

RoleBinding gắn Role vào ServiceAccount:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: api-server-config-reader
  namespace: production
subjects:
- kind: ServiceAccount
  name: api-server-sa
  namespace: production
roleRef:
  kind: Role
  name: config-reader
  apiGroup: rbac.authorization.k8s.io
```

Apply và kiểm tra:

```
$ kubectl apply -f serviceaccount.yaml -f role.yaml -f rolebinding.yaml

$ kubectl get rolebinding api-server-config-reader -n production
NAME                        ROLE                AGE
api-server-config-reader    Role/config-reader   10s

$ kubectl auth can-i get secrets --as=system:serviceaccount:production:api-server-sa -n production
yes

$ kubectl auth can-i delete secrets --as=system:serviceaccount:production:api-server-sa -n production
no

$ kubectl auth can-i get secrets --as=system:serviceaccount:production:api-server-sa -n default
no    ← Role chỉ cấp quyền trong namespace "production"
```

`kubectl auth can-i` là công cụ không thể thiếu để debug RBAC — kiểm tra subject có quyền X không.

Dùng ServiceAccount trong Pod:

```yaml
spec:
  serviceAccountName: api-server-sa    # dùng SA riêng thay vì "default"
  automountServiceAccountToken: false  # có thể override ở Pod level (ưu tiên hơn SA setting)
  containers:
  - name: api
    image: my-app:v1.0
```

ClusterRole cho monitoring (đọc metrics từ mọi namespace):

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus-reader
rules:
- apiGroups: [""]
  resources: ["nodes", "pods", "services", "endpoints"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["nodes/metrics"]    # subresource
  verbs: ["get"]
```

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: prometheus-cluster-reader
subjects:
- kind: ServiceAccount
  name: prometheus
  namespace: monitoring
roleRef:
  kind: ClusterRole
  name: prometheus-reader
  apiGroup: rbac.authorization.k8s.io
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Pod không làm được gì với K8s API — `403 Forbidden`**
- Nguyên nhân: ServiceAccount default không có quyền cần thiết (hoặc chủ ý không cấp).
- Cách chẩn đoán: `kubectl auth can-i <verb> <resource> --as=system:serviceaccount:<ns>:<sa> -n
  <ns>`. Check Pod đang dùng SA nào: `kubectl get pod <name> -o jsonpath='{.spec.serviceAccountName}'`.
- Cách xử lý: tạo Role/RoleBinding với đúng verbs cần thiết, gắn với SA của Pod.

**RoleBinding bind ClusterRole nhưng subject chỉ có quyền trong 1 namespace, không phải toàn cluster**
- Đây là ĐÚNG behavior (không phải lỗi): `RoleBinding` giới hạn scope xuống namespace dù bind
  `ClusterRole`. Để cấp quyền toàn cluster, phải dùng `ClusterRoleBinding`.
- Hay gặp nhầm: dùng `RoleBinding` nghĩ sẽ cho quyền cluster-wide vì "ClusterRole nghe có vẻ toàn
  cluster" — thực ra binding type (Role/ClusterRoleBinding) mới quyết định scope.

**`kubectl auth can-i` trả `yes` nhưng app vẫn bị `403`**
- Nguyên nhân: app đang chạy với SA khác với SA test trong `can-i` (hoặc Pod dùng SA `default`
  nhưng bạn test với SA riêng). RBAC change có hiệu lực ngay lập tức — KHÔNG cần restart Pod.
  Token SA chỉ là credential định danh SA, không nhúng permission; mỗi request đều evaluated
  against current RBAC state.
- Cách xác nhận: `kubectl exec <pod> -- cat /var/run/secrets/kubernetes.io/serviceaccount/token |
  cut -d. -f2 | base64 -d | python3 -m json.tool` — decode JWT để xem `sub` field (ServiceAccount
  thật Pod đang dùng).

## 6. Tình huống thực tế

Thiết kế RBAC cho một K8s cluster multi-team (team A và team B, mỗi team một namespace):

1. **Namespace isolation**: tạo `namespace/team-a` và `namespace/team-b` với ResourceQuota riêng.

2. **Developer role** (read-write trong namespace của team):
   ```yaml
   # Dùng ClusterRole "edit" có sẵn + RoleBinding vào namespace từng team
   kubectl create rolebinding team-a-dev \
     --clusterrole=edit \
     --group=team-a-developers \
     -n team-a
   ```

3. **Read-only role** (SRE xem cross-team):
   ```yaml
   # ClusterRoleBinding với ClusterRole "view" → xem tất cả namespace
   kubectl create clusterrolebinding sre-view \
     --clusterrole=view \
     --group=sre-team
   ```

4. **App ServiceAccount** (mỗi service có SA riêng với quyền tối thiểu):
   - Backend: đọc ConfigMap/Secret của chính mình → `Role` riêng per service
   - Không mount SA token nếu không cần (`automountServiceAccountToken: false`)

5. **Không bao giờ** dùng `cluster-admin` cho ServiceAccount của app — đây là anti-pattern phổ biến
   khi deploy Helm chart không đọc kỹ (nhiều chart mặc định yêu cầu `cluster-admin`).

## 7. Tự kiểm tra

1. Sự khác biệt giữa `RoleBinding` và `ClusterRoleBinding`?
   <details><summary>Đáp án</summary>`RoleBinding` cấp quyền trong 1 namespace — kể cả khi bind
   `ClusterRole`, scope vẫn bị giới hạn trong namespace của RoleBinding. `ClusterRoleBinding` cấp
   quyền trên toàn cluster (và non-namespaced resource). Để tái dùng ClusterRole definition nhưng
   giới hạn xuống namespace: dùng `RoleBinding` + `ClusterRole`.</details>

2. Tại sao nên dùng `automountServiceAccountToken: false` cho phần lớn Pod?
   <details><summary>Đáp án</summary>Mặc định K8s mount token của SA `default` vào mọi Pod. Token
   này có thể bị dùng bởi code độc hại hoặc attacker để authenticate với apiserver và thực hiện
   các thao tác K8s API. Phần lớn app không cần gọi K8s API — opt-out mount token là defense-in-
   depth: ngay cả khi Pod bị compromise, attacker không có credential apiserver. Nếu cần gọi API,
   tạo SA riêng với quyền tối thiểu và enable mount token chỉ cho Pod đó.</details>

3. `kubectl auth can-i list pods --as=system:serviceaccount:production:api-server-sa` trả về
   `no`. Nhưng code trong Pod vẫn call được API `GET /api/v1/namespaces/production/pods` thành
   công. Giải thích được không?
   <details><summary>Đáp án</summary>Có thể vì: (1) câu lệnh test `-n` thiếu (check ở namespace
   sai — mặc định test ở namespace `default`, không phải `production` nơi RoleBinding tồn tại);
   (2) Pod đang chạy với SA khác (không phải `api-server-sa`); (3) có ClusterRoleBinding cấp
   quyền toàn cluster cho SA đó mà bạn bỏ sót. Debug bằng: thêm `-n production` vào lệnh
   `can-i`; kiểm tra SA thật của Pod; `kubectl get clusterrolebindings | grep api-server-sa`.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-rbac-security.security-context` — SecurityContext hạn chế quyền ở tầng
  OS/container; kết hợp với RBAC để defense-in-depth.

**Bài liên quan ngoài module (xem thêm):**
- `container-k8s.k8s-architecture.api-objects` — apiserver là điểm tiếp nhận mọi request K8s;
  hiểu API object và kubectl trước khi hiểu cơ chế phân quyền.

**Nguồn tham khảo:**
- [RBAC Authorization — kubernetes.io](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
  — spec đầy đủ, built-in roles, aggregated roles, ví dụ canonical.
- [Configure ServiceAccount for Pod — kubernetes.io](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/)
  — ServiceAccount token projection, automounting, image pull secrets.
