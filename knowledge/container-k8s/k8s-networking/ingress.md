---
id: container-k8s.k8s-networking.ingress
title: "Ingress: HTTP routing và TLS termination"
domain: container-k8s
module: container-k8s.k8s-networking
level: "vận hành"
prerequisites: ["container-k8s.k8s-networking.service"]
applies_to:
  - "Kubernetes 1.28+ — Ingress API (networking.k8s.io/v1, stable từ K8s 1.19); cần Ingress controller (nginx-ingress, Traefik...) cài riêng — không có sẵn trong K8s"
status: verified
sources:
  - "https://kubernetes.io/docs/concepts/services-networking/ingress/"
  - "https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/"
  - "https://kubernetes.io/docs/tasks/access-application-cluster/ingress-minikube/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

LoadBalancer Service cho phép expose một service ra ngoài — nhưng mỗi LoadBalancer cần một IP riêng
từ cloud provider. Một app production có 10 service cần expose ra internet = 10 cloud LB = chi phí
không cần thiết. Ingress giải quyết bài toán này: một điểm vào duy nhất (1 IP, 1 LB) xử lý tất cả
traffic HTTP/HTTPS và route đến đúng Service backend dựa trên hostname hoặc URL path. Ngoài ra
Ingress còn xử lý TLS termination — không cần cert trong từng Pod.

## 2. Khái niệm cốt lõi

**Ingress resource** (object API): khai báo RULES định nghĩa làm sao route traffic HTTP đến Service
backend. Ingress KHÔNG tự hoạt động — nó chỉ là config. Cần **Ingress controller** thực sự xử lý
traffic.

**Ingress controller**: một Pod (thường là Deployment trong namespace `ingress-nginx` hoặc
`traefik`) chạy trong cluster, liên tục watch Ingress resource và cập nhật cấu hình proxy
(nginx/traefik/envoy) để phản ánh rules. K8s không cài controller mặc định — phải cài riêng.
Controllers phổ biến: **ingress-nginx** (Nginx-based, phổ biến nhất), **Traefik** (tự động
Let's Encrypt), **AWS ALB Ingress Controller** (cài trên EKS, tạo ALB thật).

**`ingressClassName`** (K8s 1.18+): chỉ định controller nào xử lý Ingress object này. Phiên bản
cũ (trước K8s 1.18) dùng annotation `kubernetes.io/ingress.class: nginx` — đã deprecated, nhưng
vẫn gặp trong manifest cũ của dự án.

**Routing rules**: Ingress route dựa trên:
- **Hostname** (`host: api.example.com`) — khớp HTTP header `Host`
- **Path** (`path: /api/v1`) — khớp URL path prefix hoặc exact match
- Kết hợp cả hai: `api.example.com/users` → Service A, `api.example.com/orders` → Service B

**TLS termination**: Ingress nhận HTTPS từ client, terminate TLS ở controller (dùng cert trong K8s
Secret), rồi forward HTTP thuần sang Service backend. Pod backend không cần xử lý TLS. Cert được
quản lý tập trung ở controller thay vì phân tán trong từng app Pod.

## 3. Cách nó hoạt động

**Luồng traffic**:
```
Client (HTTPS) → Cloud LB / NodePort → Ingress Controller Pod
  → [match rule by Host + Path] → ClusterIP Service → Pod
```

Ingress controller là một Pod thông thường với Service loại LoadBalancer (hoặc NodePort). Khi
request đến, controller đọc rules từ các Ingress object (watch từ apiserver), tìm rule khớp theo
`Host` header và URL path, forward tới đúng Service backend (ClusterIP).

**PathType**: quyết định cách khớp path:
- `Prefix`: `/api` khớp `/api`, `/api/v1`, `/api/users/123` (khớp prefix)
- `Exact`: `/api` chỉ khớp ĐÚNG `/api`, không khớp `/api/v1`
- `ImplementationSpecific`: tuỳ controller quyết định (không portable)

**TLS**: Ingress controller đọc cert/key từ K8s Secret (type `kubernetes.io/tls`), dùng để
terminate HTTPS. Renewal (ví dụ qua cert-manager + Let's Encrypt) tự động update Secret, controller
reload cert.

**Default backend**: khi không có rule nào khớp, Ingress controller forward tới default backend
(thường là 404 page). Có thể tự cấu hình (`defaultBackend` field) hoặc dùng default của controller.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

Ingress route theo hostname — 2 service trên cùng LB IP:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /   # rewrite path trước khi forward
spec:
  ingressClassName: nginx                           # chỉ định dùng controller nginx
  tls:
  - hosts:
    - api.example.com
    - web.example.com
    secretName: example-tls                         # Secret chứa cert + key
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-service                       # ClusterIP Service của backend API
            port:
              number: 80
  - host: web.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-service
            port:
              number: 80
```

Apply và kiểm tra:

```
$ kubectl apply -f ingress.yaml
ingress.networking.k8s.io/app-ingress created

$ kubectl get ingress app-ingress
NAME          CLASS   HOSTS                              ADDRESS          PORTS     AGE
app-ingress   nginx   api.example.com,web.example.com   203.0.113.10     80, 443   1m

$ kubectl describe ingress app-ingress
Name:             app-ingress
Namespace:        default
Address:          203.0.113.10
Ingress Class:    nginx
TLS:
  example-tls terminates api.example.com,web.example.com
Rules:
  Host             Path  Backends
  ----             ----  --------
  api.example.com  /     api-service:80 (10.244.1.5:8080,10.244.2.3:8080)
  web.example.com  /     frontend-service:80 (10.244.3.7:3000)
Events:
  Normal  Sync  1m  nginx-ingress-controller  Scheduled for sync
```

`ADDRESS` (203.0.113.10) là IP của Ingress controller Service (LoadBalancer). Cả `api.example.com`
và `web.example.com` đều resolve về cùng IP này — routing phân biệt bởi HTTP `Host` header.

Tạo TLS Secret từ cert file:

```
$ kubectl create secret tls example-tls \
    --cert=path/to/tls.crt \
    --key=path/to/tls.key
secret/example-tls created

# Hoặc dùng cert-manager để tự động issue Let's Encrypt cert:
# kubectl apply -f certificate.yaml  (cert-manager tự tạo Secret)
```

Ingress route theo path — tất cả traffic vào cùng 1 hostname:

```yaml
spec:
  rules:
  - host: app.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 80
      - path: /static
        pathType: Prefix
        backend:
          service:
            name: static-service
            port:
              number: 80
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-service   # catch-all — đặt cuối cùng
            port:
              number: 80
```

Ingress controller nginx khớp path theo thứ tự: path dài hơn được ưu tiên (`/api/v2` trước `/api`
trước `/`), không phải thứ tự khai báo trong YAML.

## 5. Lỗi thường gặp và cách chẩn đoán

**`ADDRESS` của Ingress mãi trống — không có IP**
- Nguyên nhân: Ingress controller chưa được cài trong cluster, hoặc đã cài nhưng Service của
  controller chưa có external IP (cluster bare metal không có cloud LB integration).
- Cách chẩn đoán: `kubectl get pods -n ingress-nginx` — controller Pod có đang chạy không?
  `kubectl get service -n ingress-nginx` — Service của controller ở trạng thái nào?
- Cách xử lý: cài Ingress controller (`kubectl apply -f https://...nginx-ingress-deploy.yaml`);
  trên bare metal dùng NodePort hoặc cài MetalLB.

**Request đến đúng IP nhưng trả 404 "default backend"**
- Nguyên nhân: không có Ingress rule nào khớp hostname và path trong request. Nguyên nhân phổ biến:
  (1) `Host` header của request không khớp với `host:` trong Ingress rule (ví dụ request dùng IP
  thay vì hostname); (2) sai `ingressClassName` — controller khác đang xử lý.
- Cách chẩn đoán: `kubectl describe ingress <name>` xem Rules section; `curl -H "Host: api.example.com" http://<IP>` — thêm Host header thủ công để test.

**TLS certificate error khi truy cập HTTPS**
- Nguyên nhân phổ biến: (1) Secret chứa cert chưa tồn tại hoặc tên sai; (2) cert hết hạn; (3) tên
  miền trong cert không khớp (CN/SAN mismatch với hostname trong Ingress rule).
- Cách chẩn đoán: `kubectl get secret <secretName>` xem Secret có tồn tại không; `kubectl get
  secret <secretName> -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -text -noout`
  đọc nội dung cert — kiểm tra `Not After` và `Subject Alternative Names`.

## 6. Tình huống thực tế

Migrate từ 3 LoadBalancer Service sang 1 Ingress (tiết kiệm chi phí cloud):

**Trước**: `api-service` (LB, IP: 1.2.3.4), `web-service` (LB, IP: 5.6.7.8), `admin-service`
(LB, IP: 9.10.11.12) — 3 cloud load balancer, 3 IP, 3 khoản phí riêng.

**Sau**:
1. Cài `ingress-nginx` controller (1 LB, 1 IP: 1.2.3.4).
2. Đổi `api-service`, `web-service`, `admin-service` từ `LoadBalancer` xuống `ClusterIP` (không
   còn cần external IP riêng).
3. Tạo Ingress object với rules: `api.example.com` → `api-service:80`, `www.example.com` →
   `web-service:80`, `admin.example.com` → `admin-service:80`.
4. Update DNS: trỏ cả 3 hostname về 1 IP mới của Ingress controller.

Kết quả: 3 khoản phí LB giảm còn 1, routing vẫn hoạt động đúng theo hostname.

## 7. Tự kiểm tra

1. Khác biệt giữa Ingress resource và Ingress controller là gì?
   <details><summary>Đáp án</summary>Ingress resource là K8s API object (YAML khai báo rules) —
   nó CHỈ là config, không làm gì nếu không có controller. Ingress controller là Pod thực sự chạy
   proxy (nginx, traefik...) và watch Ingress objects để cấu hình routing. Nếu không cài controller,
   apply Ingress resource không gây lỗi nhưng traffic không được route — không có gì xử lý rules đó
   cả.</details>

2. Vì sao nên dùng Ingress thay vì nhiều LoadBalancer Service?
   <details><summary>Đáp án</summary>Mỗi LoadBalancer Service cần 1 external IP từ cloud provider =
   1 khoản phí riêng. Với 10 service cần expose, đó là 10 cloud LB. Ingress gom toàn bộ HTTP/HTTPS
   traffic qua 1 điểm vào (1 LB, 1 IP), routing theo hostname/path — giảm chi phí đáng kể. Ingress
   còn tập trung TLS termination và cert management thay vì phân tán vào từng Pod.</details>

3. Ingress rule có 2 path: `/api` (Prefix) và `/` (Prefix). Request đến `/api/users` sẽ route vào
   backend nào?
   <details><summary>Đáp án</summary>Backend của `/api` — Ingress controller (nginx) ưu tiên match
   path DÀI HƠN trước, không phải thứ tự khai báo trong YAML. `/api/users` match `/api` (7 ký tự
   prefix) tốt hơn `/` (1 ký tự prefix) nên route vào backend `/api`. Đây là lý do rule catch-all
   `/` phải đặt sau nhưng thực ra thứ tự trong YAML không quan trọng — controller tự chọn match
   cụ thể nhất.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-networking.service` — Ingress dùng ClusterIP Service làm backend; hiểu
  Service trước để biết Ingress route tới gì.
- `container-k8s.k8s-networking.network-policy` — giới hạn traffic giữa Ingress controller và
  backend Service.

**Bài liên quan ngoài module (xem thêm):**
- `networking.tls-pki.pki-cert-mgmt` — TLS cert và key; cert-manager tự động issue Let's Encrypt
  và tạo K8s Secret cho Ingress.

**Nguồn tham khảo:**
- [Ingress — kubernetes.io](https://kubernetes.io/docs/concepts/services-networking/ingress/) —
  spec đầy đủ, PathType, defaultBackend, TLS.
- [Ingress Controllers — kubernetes.io](https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/)
  — danh sách controllers, so sánh, hướng dẫn chọn.
- [Set up Ingress on Minikube — kubernetes.io](https://kubernetes.io/docs/tasks/access-application-cluster/ingress-minikube/)
  — ví dụ end-to-end cài controller và test.
