---
id: container-k8s.docker-internals.images
title: "Docker image: layer, Dockerfile, build cache"
domain: container-k8s
module: container-k8s.docker-internals
level: "nền tảng"
prerequisites: ["container-k8s.docker-internals.namespaces-cgroups"]
applies_to:
  - "Docker Engine (containerd runtime) — khái niệm layer/overlay2 là chuẩn OCI (Open Container Initiative), áp dụng chung cho Podman, containerd, nerdctl"
status: verified
sources:
  - "https://docs.docker.com/storage/storagedriver/overlayfs-driver/"
  - "https://docs.docker.com/reference/dockerfile/"
  - "https://github.com/opencontainers/image-spec"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Docker không cài trên máy demo (sandbox phát triển). Toàn bộ output trong bài là
> **output minh hoạ** theo Docker Engine documentation và OCI Image Spec chính thức, đánh dấu bằng
> code block không có `$` tiền tố hoặc có chú thích "(minh hoạ)". Khái niệm và kỹ thuật là kỹ
> thuật thật.

Docker image là TEMPLATE bất biến để tạo container — nhưng không phải một file đơn, mà là một
CHUỖI LAYER XẾP CHỒNG (overlay filesystem). Hiểu cấu trúc này giải thích được: tại sao `docker
pull` chỉ tải layer chưa có; tại sao rebuild image từ Dockerfile không cần tải lại toàn bộ; tại
sao một container "ghi vào filesystem" không ảnh hưởng tới image gốc hoặc container khác; và tại
sao image lớn tốn thời gian deploy hơn image nhỏ theo cách không tuyến tính.

## 2. Khái niệm cốt lõi

**Image layer (read-only)**: mỗi lệnh trong Dockerfile sinh ra một layer mới — snapshot của
thay đổi filesystem từ layer trước. Layer là IMMUTABLE (bất biến sau khi tạo), được lưu thành
content-addressable blob (địa chỉ = hash SHA256 của nội dung), và được DÙNG CHUNG giữa nhiều image
có cùng layer.

**Container layer (read-write)**: khi container được tạo từ image, Docker thêm một layer ghi được
(ephemeral) ở TRÊN CÙNG của stack image layer. Mọi ghi vào filesystem của container xảy ra ở layer
này (copy-on-write — file từ layer bên dưới được sao lên trước khi ghi). Khi container bị xoá, layer
này biến mất — đây là lý do dữ liệu cần persist phải dùng volume (bài sau).

**overlay2 storage driver**: cơ chế kernel (`overlayfs`) cho phép mount nhiều thư mục (layer) thành
một filesystem thống nhất duy nhất. Mỗi layer là một thư mục trong `/var/lib/docker/overlay2/`.
Container thấy đúng một cây filesystem; kernel tự xử lý đọc từ layer nào, ghi vào layer nào.

**Dockerfile**: script khai báo CÁCH XÂY DỰNG image — mỗi lệnh (`FROM`, `RUN`, `COPY`...) tạo một
layer. Thứ tự lệnh quan trọng vì ảnh hưởng cache: layer được cache nếu lệnh AND mọi layer trước nó
giống hệt build trước đó.

| Lệnh Dockerfile | Tác dụng |
|---|---|
| `FROM <image>` | Base image — layer đầu tiên; mọi Dockerfile bắt đầu bằng đây |
| `RUN <cmd>` | Chạy lệnh, tạo layer mới chứa thay đổi filesystem |
| `COPY <src> <dst>` | Copy file từ build context vào image |
| `ADD <src> <dst>` | Như COPY nhưng có thêm: tự extract `.tar`; tải URL — tránh dùng vì ít tường minh |
| `ENV <key>=<value>` | Đặt biến môi trường, có sẵn trong container khi chạy |
| `EXPOSE <port>` | Khai báo port (metadata, không tự mở port) |
| `ENTRYPOINT [...]` | Command không thể override khi `docker run` |
| `CMD [...]` | Default argument — override được bằng argument sau `docker run <image>` |
| `USER <user>` | Đặt user chạy process (bảo mật: tránh chạy bằng root) |

## 3. Cách nó hoạt động

**Build cache hoạt động theo nguyên tắc "invalidate từ dòng thay đổi trở xuống"** — Docker cache
mỗi layer theo hash của (nội dung lệnh + hash layer trước). Khi một lệnh bị thay đổi, MỌI layer
từ dòng đó trở xuống đều bị invalidate và rebuild. Đây là lý do thứ tự lệnh trong Dockerfile quan
trọng cho build performance: đặt những lệnh ÍT THAY ĐỔI (cài dependency) TRƯỚC lệnh HAY THAY ĐỔI
(copy source code).

**Một Dockerfile kém hiệu quả và cách tối ưu:**

```dockerfile
# CHẬM — copy source trước, cache bị invalidate mỗi khi code đổi
FROM node:20-alpine
WORKDIR /app
COPY . .                   ← mọi thay đổi source code invalidate tất cả bên dưới
RUN npm install            ← buộc re-download toàn bộ npm packages mỗi lần
CMD ["node", "server.js"]
```

```dockerfile
# NHANH — copy package.json trước, npm install được cache riêng
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./      ← chỉ invalidate khi dependency thay đổi
RUN npm install            ← được cache nếu package.json không đổi
COPY . .                   ← copy source cuối cùng (invalidate OK vì chỉ 1 layer)
CMD ["node", "server.js"]
```

**Multi-stage build giảm kích thước image production** — build environment (compiler, test deps, dev
tools) thường lớn hơn nhiều so với runtime. Multi-stage dùng nhiều `FROM` block: stage đầu build,
stage cuối chỉ copy artifact cần thiết vào base image nhỏ.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Docker Engine documentation.

Build một image từ Dockerfile đơn giản và xem layer:

```
$ cat Dockerfile
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y curl
COPY app.sh /usr/local/bin/app
RUN chmod +x /usr/local/bin/app
CMD ["/usr/local/bin/app"]

$ docker build -t demo-app:v1 .
[+] Building 12.3s (8/8) FINISHED
 => [internal] load build definition from Dockerfile         0.0s
 => [1/4] FROM ubuntu:22.04                                  3.1s
 => [2/4] RUN apt-get update && apt-get install -y curl      7.8s
 => [3/4] COPY app.sh /usr/local/bin/app                     0.1s
 => [4/4] RUN chmod +x /usr/local/bin/app                    0.2s
 => exporting to image                                        0.5s
```

Xem các layer của image (từ trên xuống = từ mới nhất về cũ nhất):

```
$ docker history demo-app:v1
IMAGE          CREATED         CREATED BY                              SIZE
d3a5f8e9c1b2   2 mins ago      CMD ["/usr/local/bin/app"]              0B
7a2b4d6e8f01   2 mins ago      RUN chmod +x /usr/local/bin/app        4.1kB
c9e1f3a5b7d4   2 mins ago      COPY app.sh /usr/local/bin/app          4.1kB
8b0d2e4c6f89   2 mins ago      RUN apt-get update && apt-get install   42.1MB
<missing>      2 weeks ago     /bin/sh -c #(nop)  CMD ["bash"]         0B
<missing>      2 weeks ago     /bin/sh -c #(nop) ADD file:...           77.9MB
```

Đọc: base image ubuntu:22.04 có 2 layer (`<missing>` = layer từ remote registry, không có manifest
local); lệnh `apt-get install curl` tạo layer 42.1MB — lớn nhất, đúng kỳ vọng.

Rebuild với cache khi thay đổi chỉ `app.sh` — layer 3/4 (`COPY app.sh`) và layer 4/4 (`RUN chmod`) rebuild, layer 2/4 (`RUN apt-get`) ĐƯỢC CACHE:

```
$ docker build -t demo-app:v2 .
[+] Building 0.8s (8/8) FINISHED
 => [1/4] FROM ubuntu:22.04                     0.0s (cached)
 => [2/4] RUN apt-get update ...                0.0s (cached)   ← CACHED
 => [3/4] COPY app.sh /usr/local/bin/app        0.1s            ← REBUILT (file đổi)
 => [4/4] RUN chmod +x /usr/local/bin/app       0.1s            ← REBUILT (layer trước đổi)
```

Xem image layers ở tầng storage driver (chứa trong `/var/lib/docker/overlay2/`):

```
$ docker inspect demo-app:v2 --format='{{range .RootFS.Layers}}{{.}}\n{{end}}'
sha256:a1b2c3d4e5f6789012345678901234567890abcdef01234567890abcdef012345
sha256:b2c3d4e5f6789012345678901234567890abcdef01234567890abcdef0123456
sha256:c3d4e5f6789012345678901234567890abcdef01234567890abcdef01234567
sha256:d4e5f6789012345678901234567890abcdef01234567890abcdef012345678
```

Mỗi SHA256 là content hash của một layer — dùng chung hash = dùng chung storage, không lưu duplicate.

## 5. Lỗi thường gặp và cách chẩn đoán

**Image rebuild luôn chậm dù chỉ đổi một dòng code nhỏ**
- Nguyên nhân: Dockerfile đặt `COPY . .` (copy toàn bộ source) TRƯỚC `RUN npm install`/`pip install`/
  `mvn package` — thay đổi BẤT KỲ file nào trong source invalidate cache của install command.
- Cách xác nhận: nhìn output `docker build` — nếu install command KHÔNG hiện `(cached)` dù
  dependency không đổi, xác nhận đúng pattern này.
- Cách xử lý: đặt `COPY <dependency-file-only> ./` và install TRƯỚC, sau đó `COPY . .` — dependency
  file ít thay đổi hơn source code, cache sẽ hit thường xuyên hơn nhiều.

**Container ghi dữ liệu vào filesystem, khi restart mất hết**
- Nguyên nhân: dữ liệu được ghi vào container layer (ephemeral), bị xoá khi container bị remove và
  recreate. `docker restart` giữ container layer (KHÔNG xoá dữ liệu), nhưng `docker rm` + `docker
  run` thì mất.
- Cách xử lý: bất kỳ dữ liệu cần persist (database, config thay đổi, upload file) phải nằm trong
  Docker volume hoặc bind mount (bài `container-k8s.docker-internals.storage`).

## 6. Tình huống thực tế

Pipeline CI/CD mất 8-10 phút cho bước `docker build` mỗi lần commit, làm chậm vòng lặp feedback:

1. Phân tích `docker build --progress=plain` để xem layer nào tốn thời gian nhất — thường là
   `RUN apt-get install` hoặc `RUN npm install` (vài phút).
2. Kiểm tra: các layer đó có hiện `(cached)` không? Nếu KHÔNG, xác nhận cache bị invalidate.
3. Tìm nguyên nhân invalidate: `COPY . .` đứng trước install command → mọi commit invalidate cache.
4. Tái cấu trúc Dockerfile theo pattern "install sau khi copy dependency file, copy source sau cùng":
   - Node.js: `COPY package*.json ./` → `RUN npm ci` → `COPY . .`
   - Python: `COPY requirements.txt ./` → `RUN pip install -r requirements.txt` → `COPY . .`
   - Java (Maven): `COPY pom.xml ./` → `RUN mvn dependency:go-offline` → `COPY src/ ./src/`
5. Rebuild — `RUN npm ci` hiện `(cached)` trong mọi commit không đổi dependency. Build time giảm
   từ 8 phút xuống còn 30-40 giây cho phần lớn commit.
6. Bổ sung `--no-cache` trong pipeline cho periodic full rebuild hàng đêm để đảm bảo base image
   nhận update bảo mật.

## 7. Tự kiểm tra

**Câu 1**: Tại sao `docker pull` chỉ tải một số layer thay vì toàn bộ image?

a) Vì Docker Hub giới hạn băng thông tải xuống, chỉ cho tải một phần mỗi lần request
b) Vì layer được đánh số thứ tự, Docker chỉ tải các layer có số thứ tự chưa từng thấy trước đó
   bất kể nội dung
c) Vì image luôn được chia nhỏ ngẫu nhiên mỗi lần build, layer cũ không còn hợp lệ để tái sử
   dụng
d) Layer được xác định bằng SHA256 hash của nội dung — nếu local đã có layer đó (cùng hash), không cần tải lại

**Đáp án: d** — Layer được xác định bằng SHA256 hash của nội dung — nếu local đã có layer đó
(cùng hash), không cần tải lại. Đây không phải giới hạn băng thông của Docker Hub — là cơ chế
dedup theo nội dung, không theo chính sách tải (loại a); layer được nhận diện bằng HASH nội
dung, không phải số thứ tự — hai layer khác image nhưng cùng hash vẫn được coi là MỘT layer
(loại b); layer không chia ngẫu nhiên mỗi build — hash ổn định cho cùng nội dung, đó chính là
lý do tái sử dụng được (loại c).

---

**Câu 2**: Một Dockerfile có `RUN apt-get update` ở một layer riêng và `RUN apt-get install
nginx` ở layer tiếp theo. Đây là best practice hay anti-pattern?

a) Anti-pattern ("apt-get cache buster") — nếu layer apt-get update được cache từ lâu nhưng layer install bị rebuild
b) Best practice, vì tách riêng 2 lệnh luôn giúp build nhanh hơn do tận dụng cache tối đa cho
   mỗi bước
c) Anti-pattern, nhưng chỉ vì tốn thêm 1 layer làm image nặng hơn, không liên quan tới cache
   metadata
d) Best practice nếu dùng multi-stage build, anti-pattern nếu build thường — phụ thuộc loại
   build

**Đáp án: a** — Anti-pattern ("apt-get cache buster") — nếu layer `apt-get update` được cache
từ lâu nhưng layer install bị rebuild, lệnh install dùng package metadata CŨ từ cache. Đúng là
gộp cả hai vào một `RUN`. Tách riêng không giúp build nhanh hơn một cách an toàn — nó gây rủi
ro metadata lệch, đây chính là lý do coi là anti-pattern (loại b); vấn đề cốt lõi là METADATA
LỆCH (cache stale), không chỉ đơn thuần tốn thêm 1 layer (loại c); đây không phải vấn đề riêng
của multi-stage build — nguyên lý cache layer áp dụng giống nhau cho cả hai loại build (loại
d).

---

**Câu 3**: `CMD ["node", "server.js"]` vs `ENTRYPOINT ["node"]` + `CMD ["server.js"]` — khác
nhau thực tế ở điểm nào khi dùng `docker run`?

a) Cả hai hoàn toàn tương đương về hành vi override, chỉ khác cách viết cú pháp YAML/Dockerfile
b) Với CMD thuần: docker run myimage bash sẽ chạy bash thay vì node server.js (override hoàn toàn)
c) ENTRYPOINT luôn bị override hoàn toàn giống CMD thuần, không có gì khác biệt thực tế
d) CMD thuần không thể override bằng docker run, chỉ ENTRYPOINT mới override được

**Đáp án: b** — Với `CMD` thuần, `docker run myimage bash` override hoàn toàn thành `bash`. Với
`ENTRYPOINT ["node"] + CMD ["server.js"]`, phần sau `docker run` chỉ override CMD (argument),
ENTRYPOINT cố định. Hai cách có hành vi override KHÁC nhau rõ rệt, không tương đương (loại a);
`ENTRYPOINT` KHÔNG bị override hoàn toàn như CMD thuần — đó chính là điểm khác biệt cốt lõi
(loại c); `CMD` thuần HOÀN TOÀN override được bằng cách truyền argument khác sau image name
trong `docker run` (loại d).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.docker-internals.namespaces-cgroups` — overlay filesystem kết hợp với `mnt`
  namespace tạo ra cái nhìn filesystem riêng cho mỗi container.
- `container-k8s.docker-internals.storage` — volume và bind mount giải quyết vấn đề dữ liệu mất khi
  container bị remove.

**Nguồn tham khảo:**
- [Docker overlayfs driver — docs.docker.com](https://docs.docker.com/storage/storagedriver/overlayfs-driver/)
  — cơ chế overlay2, layer graph, copy-on-write.
- [Dockerfile reference — docs.docker.com](https://docs.docker.com/reference/dockerfile/) — cú pháp
  đầy đủ từng instruction.
- [OCI Image Spec — github.com/opencontainers](https://github.com/opencontainers/image-spec) — chuẩn
  mở định nghĩa format image (layer, manifest, config) mà Docker và mọi container runtime khác tuân theo.
