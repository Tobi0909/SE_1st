---
id: container-k8s.k8s-workload.configmap-secret
title: "ConfigMap và Secret: tách cấu hình khỏi image"
domain: container-k8s
module: container-k8s.k8s-workload
level: "vận hành"
prerequisites: ["container-k8s.k8s-workload.pods-deployments"]
applies_to:
  - "Kubernetes 1.28+ — ConfigMap/Secret API, immutable ConfigMap/Secret (1.21+); lưu ý Secret encoding base64 là KHÔNG mã hoá; encryption at rest cần kích hoạt riêng"
status: draft
sources:
  - "https://kubernetes.io/docs/concepts/configuration/configmap/"
  - "https://kubernetes.io/docs/concepts/configuration/secret/"
  - "https://kubernetes.io/docs/concepts/configuration/secret/#security-properties"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Kubernetes không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ**
> theo Kubernetes documentation chính thức.

Image nên là bất biến — cùng image chạy ở dev, staging, production chỉ khác ở configuration. Nếu
config được hardcode trong image, mỗi môi trường cần build image riêng, phá vỡ nguyên tắc này.
ConfigMap và Secret tách config khỏi image: bạn inject config vào container lúc runtime, không
phải lúc build. **ConfigMap** cho config không nhạy cảm (URL, port, feature flag); **Secret** cho
thông tin nhạy cảm (password, API key, certificate). Hiểu hai object này và cạm bẫy bảo mật của
Secret là kỹ năng thiết yếu cho bất kỳ ai vận hành K8s.

## 2. Khái niệm cốt lõi

**ConfigMap**: key-value store lưu config data không nhạy cảm. Value có thể là string ngắn
(feature flag, URL) hoặc file dài (nginx.conf, application.properties). Tối đa 1MB per ConfigMap.

**Secret**: tương tự ConfigMap nhưng cho data nhạy cảm. Khác biệt quan trọng với ConfigMap:
- Data được **base64 encoded** — KHÔNG phải mã hoá (encryption). `echo <base64>| base64 -d` trả
  về giá trị gốc ngay. Base64 là encoding để đảm bảo binary data truyền qua JSON, không phải
  bảo mật.
- K8s không ghi Secret vào disk của node (chỉ giữ trong RAM của kubelet qua tmpfs) — giảm nguy
  cơ data leak qua disk.
- RBAC có thể giới hạn ai được `get`/`list` Secret (không thể làm tương tự hiệu quả với
  ConfigMap vì thường nhiều người cần đọc config).
- **Encryption at rest** phải được kích hoạt riêng ở tầng etcd (`EncryptionConfiguration`) —
  mặc định Secret lưu trong etcd dưới dạng plaintext (chỉ base64).

**Inject vào Pod theo 2 cách**:
- **Environment variable**: từng key được inject thành env var. Thay đổi ConfigMap/Secret KHÔNG
  tự cập nhật vào container đang chạy (cần restart Pod).
- **Volume mount**: mount ConfigMap/Secret như filesystem — mỗi key thành một file. Thay đổi
  ConfigMap/Secret được **tự động cập nhật** vào container đang chạy (kubelet sync định kỳ ~1
  phút). Cách này ưu việt hơn cho config file.
  **Ngoại lệ với `subPath`**: nếu `volumeMounts` dùng `subPath` để mount một file cụ thể thay
  vì toàn bộ directory, kubelet KHÔNG propagate cập nhật — hành vi giống env var (cần restart
  Pod mới nhận config mới).

## 3. Cách nó hoạt động

**Projected volume**: K8s có thể project nhiều nguồn (ConfigMap, Secret, ServiceAccount token,
downward API) vào cùng một volume mount path — hữu ích khi app cần nhiều loại data trong cùng
thư mục.

**Immutable ConfigMap/Secret** (K8s 1.21+): khi set `immutable: true`, object không thể thay đổi
— phải xoá và tạo lại với tên mới. Ưu điểm: kubelet không cần watch định kỳ → giảm load apiserver
đáng kể khi có hàng nghìn Pod mount cùng ConfigMap.

**Secret type**: K8s có nhiều loại Secret với validation riêng:
- `Opaque` (mặc định): bất kỳ key-value nào.
- `kubernetes.io/tls`: phải có `tls.crt` và `tls.key`.
- `kubernetes.io/dockerconfigjson`: credential cho private registry (imagePullSecrets).
- `kubernetes.io/service-account-token`: token của ServiceAccount (K8s tự tạo).

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Kubernetes documentation.

Tạo ConfigMap từ literal và file:

```
$ kubectl create configmap app-config \
    --from-literal=APP_ENV=production \
    --from-literal=LOG_LEVEL=info \
    --from-file=nginx.conf=./nginx.conf
configmap/app-config created

$ kubectl get configmap app-config -o yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  APP_ENV: production
  LOG_LEVEL: info
  nginx.conf: |
    server {
      listen 80;
      ...
    }
```

Tạo Secret (data tự động được base64 encode):

```
$ kubectl create secret generic db-credentials \
    --from-literal=username=appuser \
    --from-literal=password=S3cur3P@ss!
secret/db-credentials created

$ kubectl get secret db-credentials -o yaml
apiVersion: v1
kind: Secret
type: Opaque
data:
  username: YXBwdXNlcg==      ← base64("appuser")
  password: UzNjdXIzUEBzcyE=  ← base64("S3cur3P@ss!") — KHÔNG phải mã hoá
```

Xem giá trị thật: `echo "YXBwdXNlcg==" | base64 -d` → `appuser`. Bất kỳ ai có quyền đọc Secret
đều thấy plaintext ngay.

Inject vào Pod — dùng cả env var và volume mount:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  template:
    spec:
      containers:
      - name: api
        image: my-api:v1.0
        env:
        # Từ ConfigMap — inject từng key
        - name: APP_ENV
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: APP_ENV
        # Từ Secret — inject từng key
        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: username
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
        volumeMounts:
        # Mount file config từ ConfigMap (tự update khi CM thay đổi)
        - name: nginx-config
          mountPath: /etc/nginx/conf.d
          readOnly: true
      volumes:
      - name: nginx-config
        configMap:
          name: app-config
          items:
          - key: nginx.conf
            path: nginx.conf   # tên file trong mountPath
```

Import TOÀN BỘ keys của ConfigMap thành env vars (tiện nhưng ít kiểm soát hơn):

```yaml
        envFrom:
        - configMapRef:
            name: app-config    # mọi key trong ConfigMap thành env var
        - secretRef:
            name: db-credentials
```

TLS certificate Secret cho Ingress:

```
$ kubectl create secret tls api-tls \
    --cert=api.example.com.crt \
    --key=api.example.com.key
secret/api-tls created

$ kubectl get secret api-tls -o jsonpath='{.data.tls\.crt}' | base64 -d | openssl x509 -noout -dates
notBefore=Oct  1 00:00:00 2026 GMT
notAfter=Oct  1 00:00:00 2027 GMT
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Container không nhận được giá trị mới sau khi update ConfigMap**
- Nguyên nhân: config được inject qua **env var** — env var chỉ được đọc lúc container start,
  không tự cập nhật runtime. Thay đổi ConfigMap không ảnh hưởng container đang chạy.
- Cách xử lý: restart Pod (`kubectl rollout restart deployment/<name>`) để container mới start
  với env var mới. Hoặc chuyển sang inject qua volume mount (tự cập nhật sau ~1 phút).

**Secret bị expose qua `kubectl get secret` do RBAC quá rộng**
- Nguyên nhân: Role `get,list,watch` trên resource `secrets` ở namespace scope cho quá nhiều
  ServiceAccount/user — bất kỳ ai có quyền đó đều thấy plaintext.
- Cách xử lý: giới hạn RBAC cho Secret chặt hơn ConfigMap; ưu tiên dùng external secret
  manager (Vault, AWS Secrets Manager với External Secrets Operator) cho production để Secret
  không ở trong etcd plaintext.

## 6. Tình huống thực tế

Một ứng dụng cần 3 loại config: (1) URL public không nhạy cảm, (2) database password, (3) TLS
certificate file:

```yaml
# ConfigMap cho config không nhạy cảm
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-env
data:
  API_BASE_URL: "https://api.example.com"
  REDIS_URL: "redis://redis-service:6379"
  LOG_LEVEL: "warn"
---
# Secret cho database password
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
stringData:              # dùng stringData (K8s tự encode) thay vì data (phải tự encode)
  DB_PASSWORD: "S3cur3P@ss!"
---
# Deployment inject cả ba
spec:
  template:
    spec:
      containers:
      - name: app
        envFrom:
        - configMapRef:
            name: app-env
        env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: DB_PASSWORD
        volumeMounts:
        - name: tls-certs
          mountPath: /etc/ssl/app
          readOnly: true
      volumes:
      - name: tls-certs
        secret:
          secretName: api-tls     # Secret type tls chứa tls.crt và tls.key
```

Điểm thiết kế trong ví dụ:
- `stringData` trong Secret YAML cho phép viết plaintext — K8s tự encode base64 khi lưu (chỉ
  trong YAML khai báo, không ảnh hưởng cách K8s lưu). File YAML này CẦN gitignore — không commit
  Secret plaintext.
- Env var cho scalar value (URL, password); volume mount cho file config (cert, .properties file).
- TLS cert mount vào `/etc/ssl/app` — nginx/app đọc file path, không phải env var.

## 7. Tự kiểm tra

1. Secret trong Kubernetes "an toàn hơn" ConfigMap ở điểm nào? Và điểm yếu bảo mật nào cần
   lưu ý?
   <details><summary>Đáp án</summary>An toàn hơn: K8s không ghi Secret lên disk node (dùng tmpfs
   trong memory); RBAC có thể giới hạn <code>get</code> Secret chặt hơn ConfigMap; audit log ghi
   lại mọi access. Điểm yếu: base64 KHÔNG phải mã hoá; etcd mặc định lưu plaintext (phải kích
   hoạt <code>EncryptionConfiguration</code> riêng); bất kỳ ai có quyền <code>get secret</code>
   đều đọc được ngay; Secret trong env var có thể xuất hiện trong process listing hoặc log nếu
   app vô tình in ra.</details>

2. App đọc config từ ConfigMap qua env var. Sau khi update ConfigMap, app vẫn thấy giá trị cũ.
   Nguyên nhân và cách xử lý?
   <details><summary>Đáp án</summary>Env var chỉ được đọc khi container start — không có cơ chế
   tự cập nhật runtime. Container đang chạy không bị ảnh hưởng khi ConfigMap thay đổi. Cách xử
   lý: <code>kubectl rollout restart deployment/&lt;name&gt;</code> tạo Pod mới với env var mới;
   hoặc chuyển sang inject qua volume mount (kubelet tự cập nhật file trong ~1 phút mà không
   cần restart Pod).</details>

3. `kubectl create secret generic` vs khai báo Secret trong YAML file và `kubectl apply` — cách
   nào nên dùng trong quy trình CI/CD và tại sao?
   <details><summary>Đáp án</summary>Không nên commit Secret YAML có plaintext vào git. Trong
   CI/CD: dùng <code>kubectl create secret</code> với giá trị từ CI secret store (GitHub Actions
   Secrets, GitLab CI Variables), hoặc dùng External Secrets Operator để K8s tự kéo Secret từ
   Vault/AWS Secrets Manager — Secret YAML không bao giờ tồn tại trong repo. Nếu dùng GitOps
   (ArgoCD/Flux), cần thêm bước encrypt Secret (Sealed Secrets, SOPS) trước khi commit.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.k8s-workload.pods-deployments` — inject ConfigMap/Secret vào Deployment Pod
  qua env var hoặc volume mount như ví dụ trong bài.
- `container-k8s.k8s-workload.statefulset-daemonset` — StatefulSet database thường inject DB
  root password qua Secret (ví dụ mysql-secret trong bài kia).

**Bài liên quan ngoài module:**
- `container-k8s.k8s-networking.ingress` — TLS Secret (`kubernetes.io/tls`) được Ingress controller
  dùng để terminate TLS — khai báo trong `spec.tls[].secretName`.

**Nguồn tham khảo:**
- [ConfigMap — kubernetes.io](https://kubernetes.io/docs/concepts/configuration/configmap/) —
  cách tạo, inject qua env/volume, immutable ConfigMap.
- [Secret — kubernetes.io](https://kubernetes.io/docs/concepts/configuration/secret/) — types,
  inject mechanisms, security caveats.
- [Secret security properties — kubernetes.io](https://kubernetes.io/docs/concepts/configuration/secret/#security-properties)
  — giải thích rõ những gì K8s BẢO VỆ được và không bảo vệ được với Secret.
