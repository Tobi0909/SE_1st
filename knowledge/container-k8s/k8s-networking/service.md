---
id: container-k8s.k8s-networking.service
title: "Service: ClusterIP, NodePort, LoadBalancer"
domain: container-k8s
module: container-k8s.k8s-networking
level: "vận hành"
prerequisites: ["container-k8s.k8s-workload.pods-deployments"]
applies_to:
  - "Kubernetes 1.28+ — Service API stable; kube-proxy iptables/ipvs mode; không phụ thuộc cloud provider cho ClusterIP/NodePort; LoadBalancer cần cloud provider integration hoặc MetalLB trên bare metal"
status: draft
sources:
  - "https://kubernetes.io/docs/concepts/services-networking/service/"
  - "https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/"
  - "https://kubernetes.io/docs/reference/networking/virtual-ips/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

Pod có IP, nhưng IP đó thay đổi mỗi khi Pod bị recreate. Deployment có thể chạy 5 Pod — client
cần biết gọi vào IP nào, và không thể hardcode 5 IP vào config. **Service** giải quyết bài toán
service discovery trong K8s: cung cấp một địa chỉ (VIP hoặc DNS name) ổn định cho một nhóm Pod
phía sau, tự động load balance request vào Pod còn sống. Hiểu ba loại Service (ClusterIP, NodePort,
LoadBalancer) là nền tảng để thiết kế cách expose workload trong K8s.

## 2. Khái niệm cốt lõi

**ClusterIP** (mặc định): virtual IP chỉ có thể truy cập từ BÊN TRONG cluster. Không thể reach
từ ngoài. Dùng cho: giao tiếp giữa service nội bộ (frontend → backend, app → database). Mỗi
Service có một ClusterIP cố định không đổi suốt vòng đời Service.

**NodePort**: mở một port (mặc định range 30000-32767) trên MỌI node trong cluster. Traffic đến
`<bất-kỳ-node-nào>:<nodePort>` được forward vào ClusterIP → Pod. Dùng cho: expose service ra
ngoài cluster khi không có cloud LoadBalancer (bare metal, dev environment). Nhược điểm: phải
biết IP của node, và node IP có thể thay đổi.

**LoadBalancer**: yêu cầu cloud provider tạo external load balancer thật (AWS ELB, GCP GLB, Azure
LB) và trỏ vào NodePort của cluster. Cung cấp external IP ổn định. Đây là cách expose production
service ra internet trong cloud environment. Trên bare metal: cần MetalLB hoặc tương đương.

**ExternalName**: ánh xạ Service thành một DNS name bên ngoài cluster (`CNAME`). Không có proxy,
không có ClusterIP — chỉ là DNS alias. Dùng để trỏ service nội bộ sang external endpoint (ví dụ
database trên RDS mà code dùng qua tên service K8s).

| Type | Reach từ ngoài? | Dùng khi nào |
|---|---|---|
| ClusterIP | Không | Giao tiếp nội bộ cluster |
| NodePort | Có (qua NodeIP:port) | Dev/test, bare metal không có LB |
| LoadBalancer | Có (external IP) | Production trên cloud |
| ExternalName | N/A (DNS alias) | Proxy external service vào cluster |

**Headless Service** (`clusterIP: None`): không có VIP, DNS trả về list IP của Pod. Dùng cho
StatefulSet (xem thêm `container-k8s.k8s-workload.statefulset-daemonset`) và khi muốn client tự
làm load balancing hoặc discover tất cả Pod.

## 3. Cách nó hoạt động

**kube-proxy và iptables/ipvs**: mỗi node có kube-proxy theo dõi Service và Endpoints object từ
apiserver. Khi Service được tạo, kube-proxy lập tức cập nhật iptables/ipvs rule trên node:
```
ClusterIP:port → random một trong các Pod IP:port
```
Request đến ClusterIP không đi qua proxy process — kernel xử lý DNAT trực tiếp. Điều này giải
thích vì sao Service networking có latency rất thấp.

**Endpoints vs EndpointSlice**: K8s tự tạo và cập nhật `Endpoints` object chứa list IP của Pod
match selector. Khi Pod mới start và pass readiness probe → IP được thêm vào Endpoints. Khi Pod
fail → IP bị xoá. Service chỉ route tới Pod trong Endpoints — Pod chưa ready không nhận traffic.
K8s 1.22+ kube-proxy mặc định đọc `EndpointSlice` thay vì `Endpoints` để scale tốt hơn khi có
hàng nghìn Pod (EndpointSlice API GA từ 1.21, kube-proxy mặc định consume từ 1.22).

**DNS trong cluster**: CoreDNS (chạy trong `kube-system`) cung cấp DNS cho cluster. Mỗi Service
có DNS name theo pattern: `<service-name>.<namespace>.svc.cluster.local`. Pod trong cùng namespace
chỉ cần dùng tên ngắn `<service-name>`; Pod ở namespace khác dùng `<service-name>.<namespace>`.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

Manifest Service loại ClusterIP:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-service
spec:
  selector:
    app: api-server        # tìm Pod có label này
  ports:
  - protocol: TCP
    port: 80               # port của Service (client dùng)
    targetPort: 8080       # port của container trong Pod
  type: ClusterIP          # mặc định nếu không khai báo
```

Apply và kiểm tra:

```
$ kubectl apply -f service.yaml
service/api-service created

$ kubectl get service api-service
NAME          TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
api-service   ClusterIP   10.96.45.123    <none>        80/TCP    30s

$ kubectl describe service api-service
Name:              api-service
Selector:          app=api-server
Type:              ClusterIP
IP:                10.96.45.123
Port:              80/TCP
TargetPort:        8080/TCP
Endpoints:         10.244.1.5:8080,10.244.2.3:8080,10.244.3.7:8080   ← IP của 3 Pod
```

Từ bất kỳ Pod nào trong cluster, có thể reach service qua ClusterIP hoặc DNS:

```
$ kubectl exec other-pod -- curl http://api-service/health       # DNS ngắn (cùng namespace)
$ kubectl exec other-pod -- curl http://api-service.default/health
$ kubectl exec other-pod -- curl http://api-service.default.svc.cluster.local/health
$ kubectl exec other-pod -- curl http://10.96.45.123/health       # ClusterIP trực tiếp
```

NodePort — expose ra ngoài cluster:

```yaml
spec:
  type: NodePort
  ports:
  - port: 80
    targetPort: 8080
    nodePort: 30080        # chỉ định cụ thể, hoặc để trống để K8s tự cấp trong range 30000-32767
```

```
$ kubectl get service api-service
NAME          TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
api-service   NodePort   10.96.45.123    <none>        80:30080/TCP   1m

# Reach từ ngoài cluster (cần IP của bất kỳ node nào):
$ curl http://192.168.1.11:30080/health    # worker-1 IP
$ curl http://192.168.1.12:30080/health    # worker-2 IP — cả hai đều hoạt động
```

LoadBalancer — trên cloud provider:

```yaml
spec:
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 8080
```

```
$ kubectl get service api-service
NAME          TYPE           CLUSTER-IP      EXTERNAL-IP      PORT(S)        AGE
api-service   LoadBalancer   10.96.45.123    203.0.113.10     80:31234/TCP   2m

# External IP được cloud provider cấp — có thể gọi thẳng:
$ curl http://203.0.113.10/health
```

`EXTERNAL-IP` ban đầu là `<pending>` trong khi cloud provider đang tạo LB — sau 1-2 phút mới có IP.

Xem Endpoints để debug routing:

```
$ kubectl get endpoints api-service
NAME          ENDPOINTS                                         AGE
api-service   10.244.1.5:8080,10.244.2.3:8080,10.244.3.7:8080   5m

# Nếu ENDPOINTS là <none> — không có Pod nào match selector hoặc Pod chưa Ready
```

## 5. Lỗi thường gặp và cách chẩn đoán

**`kubectl get endpoints <service>` thấy `<none>` — Service không route được tới Pod nào**
- Nguyên nhân phổ biến: (1) label selector trong Service không khớp với label của Pod; (2) Pod
  chưa pass readiness probe (Pod đang `Running` nhưng `READY 0/1`); (3) không có Pod nào chạy.
- Cách chẩn đoán: `kubectl get pods -l <selector>` thấy Pod nào? Pod có READY 1/1 không? So sánh
  label selector trong Service với label thật của Pod (`kubectl get pod <name> --show-labels`).
- Điểm hay gặp nhầm: Service selector dùng `app: api-server` nhưng Deployment template dùng
  `app: apiserver` (khác nhau dấu gạch ngang).

**LoadBalancer `EXTERNAL-IP` mãi là `<pending>`**
- Nguyên nhân: cluster chạy trên bare metal/on-premise không có cloud provider integration —
  K8s tạo Service nhưng không có gì để cấp external IP.
- Cách xử lý: cài MetalLB để cung cấp L2/BGP load balancer trên bare metal; hoặc đổi sang
  NodePort nếu không cần external IP cố định.

## 6. Tình huống thực tế

Thiết kế networking cho một app 3 tier (frontend, backend API, database) trong K8s:

1. **Database** (Postgres StatefulSet): headless Service `clusterIP: None` + ClusterIP Service
   riêng cho kết nối thông thường từ backend. Không expose ra ngoài (không có NodePort/LB).
2. **Backend API** (Deployment): ClusterIP Service — chỉ frontend và các service nội bộ khác
   cần gọi, không expose trực tiếp ra internet.
3. **Frontend** (Deployment): LoadBalancer Service (trên cloud) hoặc NodePort (bare metal) —
   expose HTTPS ra internet, nginx frontend forward request tới backend ClusterIP.
4. DNS giữa các tier: backend config `DATABASE_URL=postgres://db-service:5432/appdb` (dùng tên
   Service, không hardcode IP); frontend config `API_URL=http://backend-service:8080`.
5. Khi backend scale từ 3 lên 6 Pod: ClusterIP và DNS không thay đổi — frontend không cần biết
   gì, kube-proxy tự cập nhật routing rule đến 6 Pod mới.

## 7. Tự kiểm tra

1. Service `clusterIP: None` (headless) khác Service ClusterIP thông thường ở điểm gì khi Pod
   query DNS?
   <details><summary>Đáp án</summary>Service thông thường: DNS trả về một ClusterIP duy nhất
   (virtual IP), kube-proxy DNAT route đến 1 trong các Pod. Headless: DNS trả về LIST tất cả
   IP của Pod match selector (A record cho mỗi Pod). Client tự chọn Pod để kết nối. Với
   StatefulSet: mỗi Pod còn có DNS riêng <code>&lt;pod-name&gt;.&lt;service&gt;</code> trỏ đúng
   vào Pod đó.</details>

2. Endpoint của Service bị xoá một IP — lý do có thể là gì?
   <details><summary>Đáp án</summary>Pod tương ứng fail readiness probe (Pod vẫn <code>Running</code>
   nhưng app chưa/không còn ready nhận traffic). K8s Endpoints controller tự động remove IP của
   Pod không ready khỏi Endpoints — Service ngừng route traffic vào Pod đó cho đến khi readiness
   probe pass lại.</details>

3. Tại sao cần Service thay vì gọi thẳng vào Pod IP?
   <details><summary>Đáp án</summary>Pod IP thay đổi mỗi khi Pod bị recreate (crash, rolling
   update, eviction). Service cung cấp ClusterIP cố định và DNS name ổn định, luôn trỏ vào tập
   Pod đang ready. Service cũng làm load balancing — phân phối request vào nhiều replica tự động,
   client không cần biết có bao nhiêu Pod hay IP của Pod là gì.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-networking.ingress` — Ingress dùng Service ClusterIP làm backend; Ingress
  controller là thứ thật sự expose HTTP/HTTPS ra ngoài.
- `container-k8s.k8s-networking.network-policy` — giới hạn Pod nào được phép gọi vào Service.

**Bài liên quan ngoài module:**
- `container-k8s.k8s-workload.statefulset-daemonset` — headless Service là bắt buộc cho
  StatefulSet; giải thích tại sao ở bài đó.
- `container-k8s.docker-internals.networking` — kube-proxy dùng iptables/ipvs tương tự cơ chế
  Docker bridge network; cùng nguyên lý kernel DNAT (xem thêm bài đó để hiểu tầng kernel).

**Nguồn tham khảo:**
- [Service — kubernetes.io](https://kubernetes.io/docs/concepts/services-networking/service/) —
  tất cả loại Service, session affinity, external traffic policy.
- [DNS for Services and Pods — kubernetes.io](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
  — DNS naming pattern, headless DNS, Pod DNS.
- [Virtual IPs — kubernetes.io](https://kubernetes.io/docs/reference/networking/virtual-ips/) —
  cơ chế iptables/ipvs của kube-proxy, ClusterIP implementation.
