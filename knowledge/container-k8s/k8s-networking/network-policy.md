---
id: container-k8s.k8s-networking.network-policy
title: "NetworkPolicy: kiểm soát traffic giữa Pod"
domain: container-k8s
module: container-k8s.k8s-networking
level: "chuyên sâu"
prerequisites: ["container-k8s.k8s-networking.service"]
applies_to:
  - "Kubernetes 1.28+ — NetworkPolicy API (networking.k8s.io/v1, stable); cần CNI plugin hỗ trợ (Calico, Cilium, Weave Net...) — một số CNI phổ biến như Flannel KHÔNG enforce NetworkPolicy"
status: verified
sources:
  - "https://kubernetes.io/docs/concepts/services-networking/network-policies/"
  - "https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

Mặc định trong K8s, mọi Pod đều có thể giao tiếp với mọi Pod khác — không có tường ngăn cách giữa
namespace, không có phân vùng theo app tier. Một Pod bị compromise có thể lateral move sang mọi Pod
khác trong cluster. **NetworkPolicy** giải quyết bài toán này: khai báo tường lửa tầng Pod — Pod
nào được phép gọi vào Pod nào, theo chiều nào, qua port nào. Đây là thành phần bắt buộc khi thiết
kế security cho production K8s cluster.

## 2. Khái niệm cốt lõi

**Default: mọi traffic được phép**. Khi chưa có NetworkPolicy nào áp dụng cho một Pod, Pod đó
chấp nhận và gửi traffic tới mọi nơi (không có firewall). Đây là behavior của K8s vanilla — một
số managed K8s (GKE, EKS với Calico) mặc định mở nhưng cho phép override.

**NetworkPolicy là additive**: tất cả NetworkPolicy áp dụng cho một Pod được ORed lại — nếu một
policy cho phép traffic từ namespace A và một policy khác cho phép từ namespace B, Pod chấp nhận
CẢ HAI. Không có "deny override" kiểu tường lửa truyền thống.

**Ingress và Egress** trong NetworkPolicy là từ góc nhìn của Pod target:
- `ingress`: traffic ĐI VÀO Pod (ai được phép gọi vào Pod này?)
- `egress`: traffic ĐI RA từ Pod (Pod này được phép gọi đến đâu?)

Nếu Policy khai báo `policyTypes: [Ingress]` nhưng không có rule `ingress:`, tất cả inbound
traffic BỊ CHẶN (deny all inbound). Tương tự với Egress.

**Selector**: NetworkPolicy áp dụng cho Pod theo label selector. Peer (nguồn/đích) cũng được
chỉ định qua:
- `podSelector`: Pod nào (trong cùng namespace trừ khi kết hợp với `namespaceSelector`)
- `namespaceSelector`: namespace nào (áp dụng cho MỌI Pod trong namespace đó)
- `ipBlock`: dải CIDR (cho traffic ra/vào ngoài cluster)
- Kết hợp `podSelector` + `namespaceSelector`: Pod cụ thể trong namespace cụ thể (AND logic)

**CNI plugin phải hỗ trợ**: NetworkPolicy object có thể apply vào cluster dùng bất kỳ CNI nào —
K8s không báo lỗi. Nhưng nếu CNI không enforce NetworkPolicy (flannel không hỗ trợ), rules bị
HOÀN TOÀN BỎ QUA — traffic vẫn đi bình thường, không có error nào. Đây là silent failure nguy
hiểm. CNI hỗ trợ: Calico, Cilium, Weave Net, Canal (Flannel + Calico policy), Azure CNI.

## 3. Cách nó hoạt động

**Enforcement**: CNI plugin (không phải kube-proxy) là thứ thực sự enforce NetworkPolicy. Calico
dùng iptables/eBPF trên từng node; Cilium dùng eBPF thuần (hiệu năng cao hơn). Khi NetworkPolicy
được tạo/sửa, controller của CNI cập nhật iptables/eBPF rule trên node. Nếu CNI không có
controller này, rules không được enforce.

**Connection tracking (CNI-dependent)**: phần lớn CNI (Calico, Cilium) dùng conntrack để theo dõi
kết nối — kết nối TCP đang active không bị cắt ngay khi policy thay đổi, chỉ ảnh hưởng kết nối
MỚI. Đây là hành vi của CNI implementation, không phải đảm bảo của K8s spec.

**Scope**: NetworkPolicy là namespace-scoped — mỗi policy áp dụng trong một namespace. Để áp dụng
policy cho toàn cluster (tất cả namespace), cần dùng API cluster-scoped mở rộng như
`GlobalNetworkPolicy` của Calico (không phải K8s standard).

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

**Pattern 1: Deny all inbound cho một app (default-deny)**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-ingress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: payment-service   # áp dụng cho Pod có label này
  policyTypes:
  - Ingress
  # Không có ingress rules → tất cả inbound bị chặn
```

Sau khi apply, không Pod nào (kể cả trong cùng namespace) gọi được vào `payment-service`. Đây là
điểm xuất phát: chặn tất cả rồi mở dần.

**Pattern 2: Chỉ cho frontend gọi vào backend**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend-api           # policy này bảo vệ backend-api
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend          # chỉ Pod có label app=frontend được phép gọi vào
    ports:
    - protocol: TCP
      port: 8080
```

```
$ kubectl apply -f backend-policy.yaml
networkpolicy.networking.k8s.io/allow-frontend-to-backend created

$ kubectl get networkpolicy -n production
NAME                         POD-SELECTOR          AGE
deny-all-ingress             app=payment-service   5m
allow-frontend-to-backend    app=backend-api       10s
```

**Pattern 3: Pod chỉ gọi được DNS và database (egress restriction)**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-egress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend-api
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: postgres          # chỉ được gọi đến postgres
    ports:
    - protocol: TCP
      port: 5432
  - to:                          # DNS (bắt buộc phải mở nếu restrict egress)
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

**Cảnh báo DNS**: nếu khai báo `policyTypes: [Egress]` nhưng không mở port 53 đến CoreDNS
(`kube-system`), Pod sẽ không resolve được DNS name nào — `curl http://api-service` báo lỗi
"name resolution failed" dù Service tồn tại và healthy.

**Pattern 4: Chỉ cho phép từ namespace cụ thể**

```yaml
ingress:
- from:
  - namespaceSelector:
      matchLabels:
        kubernetes.io/metadata.name: monitoring   # chỉ Pod trong namespace "monitoring"
  ports:
  - port: 9090    # Prometheus scrape
```

**Pattern 5: Kết hợp podSelector + namespaceSelector (AND)**

```yaml
ingress:
- from:
  - namespaceSelector:           # namespace "staging"
      matchLabels:
        env: staging
    podSelector:                  # VÀ Pod có label role=tester trong namespace đó
      matchLabels:
        role: tester
```

Lưu ý YAML quan trọng: `namespaceSelector` và `podSelector` dưới cùng một item list `-` là AND.
Nếu mỗi cái ở một item list riêng (`- namespaceSelector: ...` rồi `- podSelector: ...`), đó là OR.

```yaml
# OR: namespace "staging" HOẶC bất kỳ Pod có label role=tester ở bất kỳ namespace
ingress:
- from:
  - namespaceSelector:
      matchLabels:
        env: staging
  - podSelector:
      matchLabels:
        role: tester
```

## 5. Lỗi thường gặp và cách chẩn đoán

**NetworkPolicy apply thành công nhưng traffic vẫn không bị chặn**
- Nguyên nhân: CNI plugin không hỗ trợ NetworkPolicy (đặc biệt là Flannel thuần, không có Canal).
- Cách xác nhận: `kubectl get pods -n kube-system | grep calico` hoặc `cilium` — nếu không thấy
  CNI có hỗ trợ policy, rules không được enforce. Flannel không có component enforce policy.
- Cách xử lý: migrate sang CNI có hỗ trợ (Calico, Cilium) — thao tác này ảnh hưởng toàn cluster,
  cần lên kế hoạch kỹ, không làm trực tiếp trên production đang chạy.

**Sau khi thêm egress policy, Pod không resolve được DNS**
- Nguyên nhân: Egress policy chặn hết traffic ra ngoài kể cả DNS query đến CoreDNS ở `kube-system`.
- Cách xử lý: luôn thêm egress rule cho DNS port 53 (UDP + TCP) đến namespace `kube-system` khi
  khai báo egress policy bất kỳ.

**AND/OR nhầm với `from`/`to` có nhiều selector**
- Nguyên nhân: nhầm giữa cú pháp AND (`namespaceSelector` + `podSelector` cùng 1 item) và OR
  (2 item riêng biệt trong list `from:`) — xem chi tiết ở mục 4.
- Cách xác nhận: thêm Pod test và dùng `kubectl exec` thử kết nối; hoặc dùng tool như `netassert`
  hoặc feature `Network Policy Editor` của Cilium UI để visualize policy.

## 6. Tình huống thực tế

Thiết kế NetworkPolicy cho 3-tier app (frontend, backend, database) trong namespace `production`:

```
frontend → backend (port 8080)
backend → postgres (port 5432)
backend → DNS (UDP/TCP 53)
monitoring namespace → backend (port 9090, Prometheus scrape)
Không gì khác được phép
```

Thực thi theo thứ tự:

1. **Deny all** cho cả 3 tier trước:
   ```yaml
   # 3 NetworkPolicy riêng, mỗi cái chặn hết ingress + egress cho từng app
   ```

2. **Mở dần**:
   - Frontend: cho phép ingress từ Ingress controller Pod (label `app: ingress-nginx`)
   - Backend: ingress từ frontend Pod; egress đến postgres + kube-system DNS + monitoring scrape
   - Postgres: ingress chỉ từ backend Pod port 5432; không có egress rule cần thiết (DB không
     cần gọi ra ngoài)

3. **Test**: `kubectl exec frontend-pod -- curl http://backend-service:8080` (phải được);
   `kubectl exec frontend-pod -- curl http://postgres-service:5432` (phải bị chặn).

Nguyên tắc: bắt đầu từ deny-all rồi mở từng kết nối cần thiết — không ngược lại (allow-all rồi
chặn dần, vì dễ bỏ sót).

## 7. Tự kiểm tra

1. Cluster dùng Flannel CNI. Apply NetworkPolicy chặn inbound traffic. Có thực sự chặn được không?
   <details><summary>Đáp án</summary>Không — Flannel không enforce NetworkPolicy. Object apply thành
   công (K8s không báo lỗi) nhưng rules bị bỏ qua hoàn toàn. Traffic vẫn đi bình thường. CNI phải
   hỗ trợ NetworkPolicy (Calico, Cilium, Canal...) để rules thực sự có tác dụng — đây là lý do cần
   kiểm tra CNI trước khi phụ thuộc vào NetworkPolicy cho security.</details>

2. NetworkPolicy có `policyTypes: [Egress]` không có rule `egress:`. Chuyện gì xảy ra?
   <details><summary>Đáp án</summary>TẤT CẢ egress traffic từ Pod bị chặn — Pod không gọi được
   đến bất kỳ đâu, kể cả DNS. `policyTypes: [Egress]` mà không có `egress:` rules = explicit
   deny-all egress. Đây là cách tạo "internet isolation" hoàn toàn cho một Pod: khai báo cả hai
   `policyTypes: [Ingress, Egress]` không có rules = deny all in/out.</details>

3. Sự khác biệt giữa AND và OR khi dùng `namespaceSelector` + `podSelector` trong cùng rule?
   <details><summary>Đáp án</summary>AND (cùng một item trong list): traffic được phép chỉ khi
   ĐỒNG THỜI khớp cả namespace lẫn Pod label — namespace "staging" VÀ Pod có label "tester".
   OR (hai item riêng biệt trong list `from:`): traffic được phép khi khớp HOẶC namespace "staging"
   HOẶC bất kỳ Pod có label "tester" ở mọi namespace. Nhầm AND/OR ở đây là lỗi rất phổ biến dẫn
   tới mở rộng policy hơn dự định — luôn test sau khi viết.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-networking.service` — NetworkPolicy dùng label selector để chỉ định Pod
  target, cùng cơ chế selector như Service.
- `container-k8s.k8s-networking.ingress` — Ingress controller cần được cho phép trong NetworkPolicy
  nếu backend Pod có policy restrict ingress.

**Bài liên quan ngoài module (xem thêm):**
- `networking.nat-firewall.firewall-concepts` — tường lửa stateful/stateless, deny-by-default
  là nguyên tắc chung áp dụng ở đây.

**Nguồn tham khảo:**
- [Network Policies — kubernetes.io](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
  — spec đầy đủ, các ví dụ canonical (deny-all, allow-same-namespace, allow-from-ingress...).
- [Declare Network Policy — kubernetes.io](https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/)
  — walkthrough với nginx demo, cách verify policy đang được enforce.
