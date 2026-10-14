---
id: devops.artifact-management.repos
title: "Quản lý artifact: container registry, package repo (Nexus/Artifactory)"
domain: devops
module: devops.artifact-management
level: vận hành
prerequisites:
  - container-k8s.docker-internals.images
applies_to:
  - Docker/Kubernetes environments
  - CI/CD pipelines
  - On-premises package management
status: verified
sources:
  - https://hub.docker.com/
  - https://help.sonatype.com/en/nexus-repository.html
last_verified: "2026-10-07"
author: tuank63uet@gmail.com
---

## 1. Vì sao cần biết

CI/CD pipeline không chỉ build code — nó còn tạo ra **artifact**: Docker image, JAR file, npm package, Helm chart. Không quản lý tốt artifact thì sẽ gặp vấn đề:

- Build lại từ đầu mỗi lần deploy vì không có nơi lưu image đã build
- Kéo image từ Docker Hub mỗi deploy → chậm, tốn bandwidth, bị rate-limit (anonymous: 100 pull/6h, authenticated free: 200 pull/6h)
- Không audit được "image nào đang chạy trên production?" khi cần điều tra sự cố

**Artifact repository** (còn gọi là registry) giải quyết cả ba: lưu trữ trung tâm, giảm tải mạng qua pull-through cache, và tạo audit trail đầy đủ.

## 2. Khái niệm cốt lõi

### Phân loại registry

| Loại | Ví dụ | Đặc điểm |
|------|-------|-----------|
| Public cloud registry | Docker Hub, GHCR, ECR, GCR | Managed, ít cấu hình |
| Private registry đơn giản | Docker Registry v2 | Open source, chỉ lưu image |
| Artifact repository đa năng | Nexus Repository, JFrog Artifactory | Lưu nhiều format, proxy cache, RBAC |

### Format artifact phổ biến

- **Docker/OCI image**: container image, indexed theo `name:tag` hoặc `name@sha256:...`
- **Maven/Gradle (Java)**: `.jar`, `.pom`, lưu theo `groupId/artifactId/version`
- **npm**: `.tgz` package
- **Helm chart**: `.tgz` chart, hosted trên Helm repo (HTTP với `index.yaml`)
- **Raw/binary**: ISO, firmware, file bất kỳ

### Image tag vs digest

```
# Tag: mutable — cùng tag có thể trỏ đến layer khác nhau
docker pull nginx:1.25

# Digest: immutable — luôn là cùng một image
docker pull nginx@sha256:a484819eb60211f5299034ac80f6a681b06f89e65866ce91f356ed7c72af059c
```

Production nên pin digest để đảm bảo reproducibility; CI/CD có thể dùng tag để tự động nhận bản mới.

### Pull-through proxy cache

Registry có thể hoạt động như **proxy**: khi client kéo image từ Docker Hub qua registry nội bộ, registry tự tải về và cache lại. Lần sau các máy khác kéo cùng image thì không tốn băng thông ra ngoài.

```
┌────────────────────────────────────────────────────────────────┐
│  Developer/CI runner                                           │
│  docker pull registry.internal.company.com/docker-hub/nginx:1.25│
│          │                                                     │
│          ▼                                                     │
│  Nexus / Artifactory (proxy group)                             │
│    ├── proxy: Docker Hub  ─── cache hit? serve from cache      │
│    │                         cache miss? pull + cache + serve  │
│    └── hosted: internal images (registry.internal.company.com) │
└────────────────────────────────────────────────────────────────┘
```

## 3. Cách nó hoạt động

### Docker Registry v2 (self-hosted đơn giản)

Docker Distribution (registry:2) là implementation chuẩn OCI Distribution Spec. Chạy như container:

```bash
# Khởi động registry cục bộ (output minh họa)
docker run -d \
  -p 5000:5000 \
  --name registry \
  -v /data/registry:/var/lib/registry \
  registry:2
```

Push/pull với private registry:

```bash
# Tag image để trỏ vào registry nội bộ (output minh họa)
docker tag myapp:v1.2.3 registry.internal:5000/myapp:v1.2.3
docker push registry.internal:5000/myapp:v1.2.3

# Trên máy khác
docker pull registry.internal:5000/myapp:v1.2.3
```

### Nexus Repository

Nexus hỗ trợ 3 loại repository:

| Loại | Mục đích | Ví dụ |
|------|----------|-------|
| **hosted** | Lưu artifact do team tự tạo | Internal Docker image, internal JAR |
| **proxy** | Cache từ remote source | Docker Hub cache, Maven Central cache |
| **group** | Hợp nhất nhiều repo, client chỉ cần 1 URL | `docker-all` = hosted + Docker Hub proxy |

Cấu hình Docker client trỏ vào Nexus:

```json
// /etc/docker/daemon.json (output minh họa)
{
  "insecure-registries": [],
  "registry-mirrors": ["https://nexus.internal.company.com:8083"]
}
```

### Kubernetes imagePullSecret

K8s cần credential để kéo image từ private registry:

```yaml
# output minh họa
apiVersion: v1
kind: Secret
metadata:
  name: registry-cred
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: <base64 of ~/.docker/config.json>
---
# Tham chiếu trong Pod spec
spec:
  imagePullSecrets:
    - name: registry-cred
  containers:
    - name: app
      image: registry.internal:5000/myapp:v1.2.3
```

## 4. Thực hành

### Kiểm tra Docker Hub rate limit (chạy thật)

```bash
TOKEN=$(curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:ratelimitpreview/test:pull" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

Vì không có Docker trên máy này, xem thử manifest API thông qua curl:

```bash
curl -sI https://registry.hub.docker.com/v2/ 2>&1 | head -5
```

```
curl: (6) Could not resolve host: registry.hub.docker.com
```

Không kết nối được từ môi trường sandbox. Dưới đây là output minh họa của lệnh kiểm tra rate limit:

```
# output minh họa — khi có kết nối Docker Hub
RateLimit-Limit: 100;w=21600
RateLimit-Remaining: 87;w=21600
```

### Tính toán storage cho registry (chạy thật)

```bash
python3 -c "
# Ước tính storage cần cho private registry
images = 20          # số lượng image khác nhau
tags_per_image = 5   # số tag giữ mỗi image (v1.0-v1.5)
avg_image_mb = 300   # MB mỗi image (sau layer dedup)
dedup_ratio = 0.4    # layers dùng chung giữa các image

raw_gb = images * tags_per_image * avg_image_mb / 1024
actual_gb = raw_gb * (1 - dedup_ratio)
print(f'Raw (không dedup): {raw_gb:.1f} GB')
print(f'Thực tế (sau dedup ~{dedup_ratio*100:.0f}%): {actual_gb:.1f} GB')
print(f'Đề xuất disk: {actual_gb * 2:.0f} GB (2x buffer)')
"
```

```
Raw (không dedup): 29.3 GB
Thực tế (sau dedup ~40%): 17.6 GB
Đề xuất disk: 35 GB (2x buffer)
```

### Garbage collection registry

Image bị xoá tag vẫn chiếm disk cho đến khi chạy GC:

```bash
# output minh họa
docker exec registry bin/registry garbage-collect /etc/docker/registry/config.yml --dry-run
# Sau khi verify output, chạy thật (không --dry-run) trong maintenance window
```

## 5. Lỗi thường gặp

| Lỗi | Triệu chứng | Cách xử lý |
|-----|-------------|-----------|
| Rate limit Docker Hub | `toomanyrequests: Too Many Requests` | Đăng nhập `docker login` hoặc dùng proxy cache |
| TLS untrusted cert | `x509: certificate signed by unknown authority` | Thêm CA cert vào `/etc/docker/certs.d/<registry>/ca.crt` hoặc cấu hình `insecure-registries` (dev only) |
| Push lên registry thiếu auth | `unauthorized: access to the requested resource is not authorized` | `docker login <registry>` trước khi push |
| Image cũ không bị dọn | Disk đầy dần | Cấu hình retention policy và chạy GC định kỳ |
| imagePullBackOff trong K8s | Pod không start được | Kiểm tra Secret đúng namespace, credential còn hiệu lực |

## 6. Tình huống thực tế

**Tình huống**: CI pipeline của team bắt đầu thất bại với lỗi `toomanyrequests` khi kéo base image `python:3.11-slim` từ Docker Hub. Nguyên nhân: cả CI runner lẫn dev machine đều pull từ Docker Hub không xác thực, bị chia sẻ quota 100 pull/6h theo IP công ty.

**Giải pháp qua Nexus proxy**:
1. Tạo proxy repository trong Nexus trỏ vào `https://registry-1.docker.io`
2. Tạo group repository gộp proxy + hosted
3. Cập nhật `daemon.json` trên CI runner để trỏ vào Nexus group URL
4. Image `python:3.11-slim` được cache lần đầu, các lần pull sau không tốn quota Docker Hub

```
# output minh họa — CI log sau khi dùng proxy
Pulling from nexus.internal:8083/python:3.11-slim
3.11-slim: Pulling from python
Cache: Hit (cached at 2026-10-07T08:00:00Z)
Status: Image is up to date for nexus.internal:8083/python:3.11-slim
```

Kết quả: zero lần hit Docker Hub trong tuần tiếp theo; build time giảm vì kéo từ LAN (~500MB/s) thay vì internet (~50MB/s).

## 7. Tự kiểm tra

**Câu 1**: Sự khác biệt giữa image tag và image digest trong Docker là gì? Khi nào nên dùng
digest thay vì tag?

a) Tag là mutable reference — cùng tag nginx:1.25 có thể trỏ đến image khác nhau nếu maintainer re-push. Digest
b) Digest là mutable reference có thể đổi; tag là immutable luôn cố định
c) Tag và digest hoàn toàn giống nhau, chỉ khác độ dài chuỗi ký tự
d) Chỉ nên dùng tag trong production vì digest không được Docker Hub hỗ trợ cho image public

**Đáp án: a** — Tag mutable, có thể đổi khi re-push. Digest immutable, luôn tương ứng đúng
một bộ layer. Dùng digest trong production để tránh drift và đảm bảo rollback đúng image. Vai
trò bị đảo ngược hoàn toàn trong lựa chọn b (loại b); tag và digest có bản chất KHÁC NHAU rõ
rệt (mutable vs immutable), không chỉ khác độ dài (loại c); digest được Docker Hub hỗ trợ đầy
đủ cho cả image public và private, không có hạn chế đó (loại d).

---

**Câu 2**: Registry loại "proxy" trong Nexus khác loại "hosted" thế nào?

a) Hosted kết nối remote registry và cache; proxy lưu artifact do team tự build
b) Hosted lưu artifact do team tự build/upload. Proxy kết nối đến remote registry
c) Cả hai loại hoàn toàn giống nhau, chỉ khác giao diện quản trị
d) Proxy chỉ dùng được cho Maven, không hỗ trợ Docker image

**Đáp án: b** — Hosted lưu artifact do team tự build; proxy kết nối remote registry và cache.
Group hợp nhất nhiều repo. Vai trò bị đảo ngược hoàn toàn trong lựa chọn a (loại a); hai loại
repo có CHỨC NĂNG khác biệt rõ rệt (lưu trữ tự build vs cache remote), không chỉ khác giao
diện (loại c); proxy repository hỗ trợ cả Docker Hub lẫn Maven Central, không giới hạn chỉ
Maven (loại d).

---

**Câu 3**: Tại sao cần chạy garbage collection cho Docker registry? Điều gì xảy ra nếu không
chạy?

a) Vì xoá tag sẽ tự động xoá cả blob layer ngay lập tức, GC chỉ dọn file log thừa
b) GC chỉ cần chạy đúng 1 lần duy nhất khi mới cài registry, sau đó không cần chạy lại nữa
c) Khi xoá tag hoặc manifest, registry chỉ xoá metadata; blob (layer data) vẫn còn trên disk vì có thể được tham chiếu bởi image khác
d) Không chạy GC sẽ khiến registry crash ngay lập tức khi push image mới, không liên quan
   tới dung lượng disk

**Đáp án: c** — Xoá tag/manifest chỉ xoá metadata, blob vẫn còn trên disk. GC quét và xoá
blob không còn tham chiếu. Không chạy GC thì disk đầy dần. Xoá tag KHÔNG tự xoá blob ngay lập
tức — đó chính là lý do cần GC riêng (loại a); GC cần chạy ĐỊNH KỲ (hoặc theo lịch), không chỉ
1 lần khi cài, vì blob rác tích lũy liên tục theo thời gian sử dụng (loại b); không chạy GC
gây đầy DISK DẦN THEO THỜI GIAN, không gây crash ngay lập tức khi push (loại d).

---

**Câu 4**: Pod Kubernetes bị `ImagePullBackOff`. Bước đầu tiên để debug là gì?

a) Xoá Pod và tạo lại ngay, ImagePullBackOff luôn tự hết sau khi recreate Pod
b) Restart toàn bộ node đang chạy Pod đó, lỗi image luôn liên quan tới node bị lỗi
c) Tăng resources.limits.memory của Pod lên cao hơn, ImagePullBackOff thường do thiếu RAM
   khi pull image
d) Chạy kubectl describe pod <name> để xem Events — thường thấy rõ lý do (registry không tồn tại, credential sai, image tag không tồn tại)

**Đáp án: d** — `kubectl describe pod` xem Events để biết lý do cụ thể; kiểm tra
`imagePullSecrets`; thử `docker pull` thủ công xác nhận. Xoá/tạo lại Pod không tự giải quyết
nguyên nhân gốc (credential sai, tag không tồn tại...) — lỗi sẽ lặp lại (loại a); lỗi pull
image thường KHÔNG liên quan tới node mà liên quan tới registry/credential/tag (loại b);
`ImagePullBackOff` không liên quan tới RAM — đó là lỗi ở bước TẢI image, không phải chạy
container (loại c).

---

**Câu 5**: Tại sao không nên dùng `insecure-registries` trong production?

a) insecure-registries cho phép Docker kết nối HTTP (không mã hóa) hoặc bỏ qua xác minh TLS
b) Vì insecure-registries làm giảm tốc độ pull image đáng kể do phải mã hoá lại nhiều lần
c) insecure-registries chỉ là flag hiển thị cảnh báo trên log, không ảnh hưởng gì tới bảo
   mật thật
d) Vì insecure-registries chỉ hoạt động được với registry nội bộ, không áp dụng được cho
   Docker Hub

**Đáp án: a** — Cho phép HTTP/bỏ qua TLS verify, mở đường tấn công MITM. Chỉ chấp nhận cho
dev/test tách biệt. `insecure-registries` làm GIẢM mã hoá (bỏ TLS), không phải "mã hoá lại
nhiều lần" gây chậm — thực tế bỏ TLS thường nhanh hơn, nhưng đổi lại mất an toàn (loại b);
đây là rủi ro bảo mật THẬT (MITM), không chỉ là cảnh báo hiển thị (loại c); flag này áp dụng
cho registry bất kỳ được khai trong danh sách, không giới hạn registry nội bộ — có thể bật
cho cả registry công khai nếu cấu hình sai (loại d).

## 8. Bài liên quan và nguồn

**Đã học ở:**
- [container-k8s.docker-internals.images](../../container-k8s/docker-internals/images.md) — Docker image layer, tag, build

**Xem thêm:**
- [devops.cicd.concepts](../cicd/concepts.md) — CI/CD pipeline, artifact trong pipeline
- [container-k8s.k8s-workload.configmap-secret](../../container-k8s/k8s-workload/configmap-secret.md) — imagePullSecret

**Nguồn:**
- Docker Hub rate limiting: https://hub.docker.com/
- Nexus Repository docs: https://help.sonatype.com/en/nexus-repository.html
