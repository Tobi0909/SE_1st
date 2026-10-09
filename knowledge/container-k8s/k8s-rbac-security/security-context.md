---
id: container-k8s.k8s-rbac-security.security-context
title: "SecurityContext, Pod Security Standards, hạn chế quyền container"
domain: container-k8s
module: container-k8s.k8s-rbac-security
level: "chuyên sâu"
prerequisites: ["container-k8s.k8s-rbac-security.rbac"]
applies_to:
  - "Kubernetes 1.28+ — SecurityContext stable; Pod Security Admission (PSA) stable từ K8s 1.25 (thay thế PodSecurityPolicy đã bị removed từ 1.25)"
status: verified
sources:
  - "https://kubernetes.io/docs/tasks/configure-pod-container/security-context/"
  - "https://kubernetes.io/docs/concepts/security/pod-security-standards/"
  - "https://kubernetes.io/docs/concepts/security/pod-security-admission/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

RBAC (xem thêm `container-k8s.k8s-rbac-security.rbac`) kiểm soát ai được làm gì với K8s API.
Nhưng khi container bắt đầu chạy, RBAC không còn can thiệp được — container có thể chạy với UID
root, mount host filesystem, dùng `CAP_NET_ADMIN` để thay đổi iptables host... mà K8s API không
hay biết. **SecurityContext** hạn chế quyền ở tầng OS/container: UID, GID, Linux capability,
read-only filesystem, seccomp profile. **Pod Security Standards** (PSS) và **Pod Security
Admission** (PSA) cung cấp baseline chính sách áp dụng toàn namespace. Hai lớp này bổ sung nhau
tạo thành defense-in-depth.

## 2. Khái niệm cốt lõi

**SecurityContext** có hai tầng:
- `spec.securityContext` (PodSecurityContext): áp dụng cho TOÀN BỘ Pod và các container trong đó
  (`runAsUser`, `runAsGroup`, `fsGroup`, `sysctls`...)
- `spec.containers[*].securityContext`: áp dụng cho từng container cụ thể, override Pod-level
  (`runAsUser`, `allowPrivilegeEscalation`, `capabilities`, `readOnlyRootFilesystem`...)

**Các field quan trọng**:
- `runAsUser` / `runAsGroup`: UID/GID để chạy process trong container (0 = root — nguy hiểm).
- `runAsNonRoot: true`: K8s chặn start nếu image ENTRYPOINT chạy với UID 0.
- `allowPrivilegeEscalation: false`: ngăn process dùng `setuid`/`setgid` binary để leo thang đặc
  quyền (ví dụ `sudo`, `su`). Best practice: luôn bật.
- `readOnlyRootFilesystem: true`: container không ghi được vào filesystem — force app phải ghi vào
  volume riêng. Giảm surface attack (attacker không thể modify binary).
- `capabilities`: Linux capability (POSIX).
  - `drop: ["ALL"]`: bỏ hết capability mặc định (bao gồm `CHOWN`, `DAC_OVERRIDE`, `SETUID`...).
  - `add: ["NET_BIND_SERVICE"]`: thêm lại capability cụ thể cần thiết (ví dụ bind port < 1024).
- `privileged: true`: container nhận TOÀN BỘ capability của host — tương đương root trên node.
  Cực kỳ nguy hiểm, không bao giờ dùng trừ phi bắt buộc (ví dụ CNI plugin, storage driver).
- `seccompProfile`: áp dụng seccomp profile lọc syscall. `RuntimeDefault` dùng profile mặc định
  của container runtime — tốt cho production.

**Pod Security Standards (PSS)**: 3 mức policy được K8s định nghĩa sẵn:
- `privileged`: không giới hạn gì — dùng cho system component (CNI, CSI driver).
- `baseline`: ngăn các setting nguy hiểm nhất (hostNetwork, hostPID, privileged containers...).
  Tốt cho workload thông thường không có yêu cầu đặc biệt.
- `restricted`: thực thi best practice toàn diện (runAsNonRoot, allowPrivilegeEscalation:false,
  drop ALL capabilities, seccomp RuntimeDefault...). Khó comply nhất nhưng an toàn nhất.

**Pod Security Admission (PSA)**: controller tự động enforce PSS cho namespace qua label:
- `enforce`: Pod vi phạm policy BỊ CHẶN không tạo được.
- `audit`: Pod tạo được nhưng ghi log warning — dùng để đánh giá trước khi enforce.
- `warn`: Pod tạo được, trả về warning message cho kubectl — user-facing alert.

## 3. Cách nó hoạt động

**SecurityContext enforcement**: kubelet áp dụng SecurityContext khi khởi động container qua CRI
(containerd/CRI-O). `runAsUser` → `uid_map` trong user namespace hoặc setuid trực tiếp;
`capabilities` → Linux capability set; `seccompProfile` → seccomp BPF filter. Đây là kernel-level
enforcement — không phải K8s application logic.

**PSA enforcement**: apiserver chạy admission controller `PodSecurity`. Khi Pod được create/update,
controller đọc label của namespace, apply policy tương ứng, quyết định allow/deny/warn. PSA chỉ
check lúc admission — không retroactively enforce cho Pod đang chạy.

**Tại sao không còn PodSecurityPolicy (PSP)**: PSP deprecated từ K8s 1.21 và bị **REMOVED từ
K8s 1.25**. PSP có nhiều vấn đề UX (phức tạp, khó debug, dễ cấu hình sai). PSA thay thế với
model đơn giản hơn. Các cluster cũ hơn K8s 1.25 nếu dùng PSP phải migrate sang PSA trước khi
nâng cấp lên 1.25+.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

SecurityContext best practice cho web app:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-app
spec:
  securityContext:
    runAsUser: 1000          # UID 1000, không phải root
    runAsGroup: 3000
    fsGroup: 2000            # GID cho volume mount — file trong volume thuộc group này
    runAsNonRoot: true       # fail fast nếu image chạy root
  containers:
  - name: app
    image: my-app:v1.0
    securityContext:
      allowPrivilegeEscalation: false   # không cho sudo/setuid
      readOnlyRootFilesystem: true      # filesystem read-only
      capabilities:
        drop:
        - ALL                           # bỏ mọi capability
        add:
        - NET_BIND_SERVICE              # chỉ thêm lại cái cần
      seccompProfile:
        type: RuntimeDefault            # seccomp profile mặc định của runtime
    volumeMounts:
    - mountPath: /tmp            # app cần ghi /tmp → cấp volume riêng
      name: tmp-dir
    - mountPath: /var/cache/app
      name: cache-dir
  volumes:
  - name: tmp-dir
    emptyDir: {}
  - name: cache-dir
    emptyDir: {}
```

Áp dụng Pod Security Standard cho namespace (PSA):

```
$ kubectl label namespace production \
    pod-security.kubernetes.io/enforce=restricted \
    pod-security.kubernetes.io/enforce-version=v1.28 \
    pod-security.kubernetes.io/warn=restricted \
    pod-security.kubernetes.io/warn-version=v1.28
namespace/production labeled
```

Thử tạo Pod vi phạm policy (`restricted` không cho phép `privileged: true`):

```
$ kubectl run bad-pod --image=nginx --privileged -n production
Error from server (Forbidden): pods "bad-pod" is forbidden:
  violates PodSecurity "restricted:v1.28":
  privileged (container "bad-pod" must not set securityContext.privileged=true),
  allowPrivilegeEscalation != false (container "bad-pod" must set
    securityContext.allowPrivilegeEscalation=false),
  unrestricted capabilities (container "bad-pod" must set securityContext.capabilities.drop=["ALL"]),
  runAsNonRoot != true (pod or container "bad-pod" must set securityContext.runAsNonRoot=true),
  seccompProfile (pod or container "bad-pod" must set securityContext.seccompProfile.type to
    "RuntimeDefault" or "Localhost")
```

Error message liệt kê TẤT CẢ vi phạm — giúp developer biết chính xác phải fix gì.

Kiểm tra SecurityContext của Pod đang chạy:

```
$ kubectl get pod web-app -o jsonpath='{.spec.securityContext}'
{"fsGroup":2000,"runAsGroup":3000,"runAsNonRoot":true,"runAsUser":1000}

$ kubectl exec web-app -- id
uid=1000 gid=3000 groups=3000,2000
```

Chạy `id` bên trong container để confirm UID/GID thật đang được áp dụng.

## 5. Lỗi thường gặp và cách chẩn đoán

**Pod bị `CreateContainerConfigError` hoặc không start được**
- Nguyên nhân: `runAsNonRoot: true` nhưng image ENTRYPOINT chạy với UID 0 (nhiều image mặc định
  chạy root).
- Cách chẩn đoán: `kubectl describe pod <name>` → Events: "container has runAsNonRoot and image
  has non-numeric user (`root`)".
- Cách xử lý: sửa Dockerfile thêm `USER 1000`; hoặc khai báo `runAsUser: 1000` trong SecurityContext
  để override image default.

**App bị lỗi permission khi ghi file**
- Nguyên nhân: `readOnlyRootFilesystem: true` — app cố ghi vào path không có volume mount (ví dụ
  `/tmp`, `/var/cache`).
- Cách xử lý: thêm `emptyDir` volume mount cho mỗi path app cần ghi. Lỗi này thường phát hiện
  khi đầu tiên bật `readOnlyRootFilesystem` — cần xem xét toàn bộ path app ghi.

**Namespace bị label PSA nhưng Pod cũ đang chạy vẫn còn, vi phạm policy**
- PSA chỉ enforce lúc admission (tạo mới). Pod đang chạy trước khi label namespace không bị ảnh
  hưởng ngay. Dùng `audit` mode trước để tìm vi phạm rồi mới `enforce`.
- Cách kiểm tra trước: `kubectl label namespace production pod-security.kubernetes.io/audit=restricted`
  → `kubectl get events -n production | grep Warning` → tìm audit violation.

## 6. Tình huống thực tế

Hardening Kubernetes cluster production theo CIS Benchmark — bước SecurityContext:

1. **Bật PSA `baseline` cho tất cả namespace non-system** (namespace user/app):
   ```bash
   for ns in $(kubectl get ns -o name | grep -v kube-system | grep -v kube-public); do
     kubectl label $ns pod-security.kubernetes.io/enforce=baseline --overwrite
   done
   ```

2. **Bật PSA `restricted` cho namespace production** sau khi fix toàn bộ vi phạm (dùng `warn`
   mode trước 1-2 sprint để developer sửa dần).

3. **SecurityContext template** cho mọi Deployment mới (enforced qua OPA Gatekeeper hoặc Kyverno
   policy):
   - `runAsNonRoot: true`
   - `allowPrivilegeEscalation: false`
   - `capabilities.drop: [ALL]`
   - `readOnlyRootFilesystem: true`
   - `seccompProfile.type: RuntimeDefault`

4. **Exception process**: workload cần quyền cao hơn (CNI, CSI, monitoring agent) → namespace
   riêng với PSS `privileged`, documented rõ lý do, review định kỳ.

## 7. Tự kiểm tra

1. `allowPrivilegeEscalation: false` ngăn chặn điều gì cụ thể?
   <details><summary>Đáp án</summary>Ngăn process trong container thực thi binary có `setuid`/`setgid`
   bit để thay đổi UID/GID của chính nó (ví dụ `sudo`, `su`, `newgrp`). Cụ thể hơn, nó set Linux
   `no_new_privs` flag — khi process có flag này, mọi execve() sau đó không thể tăng privilege.
   Không ảnh hưởng đến UID hiện tại của process (đó là `runAsUser`), chỉ ngăn THAY ĐỔI UID sau
   khi process đã chạy. Quan trọng cho container chạy root (UID 0): dù chạy root, không thể dùng
   `su` để switch sang user khác rồi exec process mới với quyền khác.</details>

2. Tại sao PSP bị xoá khỏi K8s 1.25?
   <details><summary>Đáp án</summary>PSP có nhiều vấn đề: (1) UX phức tạp — phải tạo PSP + ClusterRole
   + ClusterRoleBinding, không ai thấy mình đã configure đúng chưa; (2) scope confusing — PSP áp
   dụng theo SA của Pod, không theo namespace; (3) dễ cấu hình sai dẫn tới over-permissive hoặc
   block oan; (4) không có mode dry-run/audit. PSA thay thế với model namespace-label đơn giản hơn,
   có audit/warn mode để migrate dần.</details>

3. Sự khác biệt giữa `drop: [ALL]` + `add: [NET_BIND_SERVICE]` và không khai báo capabilities gì?
   <details><summary>Đáp án</summary>Không khai báo = container giữ DEFAULT capability set của
   container runtime (Docker/containerd mặc định cấp ~14 capability: CHOWN, DAC_OVERRIDE, FSETID,
   FOWNER, MKNOD, NET_RAW, SETGID, SETUID, SETFCAP, SETPCAP, NET_BIND_SERVICE, SYS_CHROOT, KILL,
   AUDIT_WRITE). `drop: [ALL]` + `add: [NET_BIND_SERVICE]` = chỉ có đúng 1 capability cần thiết.
   Nguyên tắc least privilege: không cấp capability không dùng — NET_RAW chẳng hạn cho phép tạo
   raw socket để sniff traffic hoặc làm MITM attack trên cùng network.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-rbac-security.rbac` — RBAC kiểm soát quyền ở tầng K8s API; SecurityContext
  kiểm soát quyền ở tầng OS/kernel; hai lớp bổ sung nhau.

**Bài liên quan ngoài module (xem thêm):**
- `container-k8s.docker-internals.namespaces-cgroups` — Linux namespace và capability là cơ chế
  kernel nền tảng mà SecurityContext leverage.

**Nguồn tham khảo:**
- [Security Context — kubernetes.io](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
  — tất cả field SecurityContext với ví dụ cụ thể.
- [Pod Security Standards — kubernetes.io](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
  — bảng so sánh chi tiết privileged/baseline/restricted theo từng field.
- [Pod Security Admission — kubernetes.io](https://kubernetes.io/docs/concepts/security/pod-security-admission/)
  — label syntax, mode (enforce/audit/warn), exemptions.
