---
id: container-k8s.docker-internals.storage
title: "Docker storage: volume, bind mount, tmpfs"
domain: container-k8s
module: container-k8s.docker-internals
level: "vận hành"
prerequisites: ["container-k8s.docker-internals.images"]
applies_to:
  - "Docker Engine trên Linux — volume driver local, bind mount, tmpfs; hành vi tương tự trên Docker Desktop với lưu ý path host ánh xạ vào VM trên Mac/Windows"
status: draft
sources:
  - "https://docs.docker.com/storage/"
  - "https://docs.docker.com/storage/volumes/"
  - "https://docs.docker.com/storage/bind-mounts/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Docker không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ** theo
> Docker Engine documentation.

Mọi dữ liệu ghi vào container layer đều biến mất khi container bị remove (đã học ở bài
`container-k8s.docker-internals.images`). Với ứng dụng thực tế — database cần lưu data, app
cần đọc config file, log cần persist để debug sau — đây là vấn đề nghiêm trọng. Docker cung cấp
ba cơ chế storage khác nhau cho ba nhu cầu khác nhau, và chọn sai cơ chế gây ra mất dữ liệu
hoặc vấn đề performance không rõ nguyên nhân.

## 2. Khái niệm cốt lõi

**Volume**: Docker-managed storage — Docker tạo và quản lý thư mục trong `/var/lib/docker/volumes/`
trên host. Hoàn toàn do Docker kiểm soát: không bị ảnh hưởng bởi cấu trúc thư mục host, không
accidentally bị xoá bởi `rm -rf` thông thường, mount được vào nhiều container, backup được bằng
`docker volume export`. Volume tồn tại ĐỘC LẬP với container — xoá container không xoá volume.

**Bind mount**: mount một path CỤ THỂ trên host vào container — container thấy và ghi trực tiếp
vào thư mục host đó. Phụ thuộc vào cấu trúc thư mục host; nếu path không tồn tại, Docker tạo mới
(hay gây nhầm lẫn). Dùng chủ yếu để: inject config file vào container trong dev, share source
code giữa host và container (hot-reload), hay cần file host trong quá trình build.

**tmpfs**: mount một vùng RAM vào container — dữ liệu chỉ tồn tại trong RAM, mất khi container
dừng. Dùng cho dữ liệu nhạy cảm tạm thời (token, secret) không muốn ghi ra disk, hoặc
performance-critical temp data (scratch space).

| Cơ chế | Nơi lưu | Tồn tại sau `docker rm`? | Dùng khi nào |
|---|---|---|---|
| Volume | `/var/lib/docker/volumes/` (Docker quản lý) | Có (xoá riêng bằng `docker volume rm`) | Database, persistent data production |
| Bind mount | Path cụ thể trên host | Có (là file của host) | Dev workflow, config inject, source code |
| tmpfs | RAM (Linux only) | Không (mất khi container dừng) | Secret tạm thời, scratch space |

## 3. Cách nó hoạt động

**Volume mounting và overlay filesystem**: khi mount volume vào container, kernel mount volume path
đè lên layer tương ứng của overlay filesystem của container (đã học cơ chế overlay ở bài images).
Ghi vào volume path đi THẲNG vào volume storage, không qua container's copy-on-write layer — đây
là lý do performance volume tốt hơn ghi vào container layer.

**Volume initialization**: khi mount volume RỖNG vào một path đã có dữ liệu trong image (ví dụ
`/var/lib/postgresql/data` trong image Postgres), Docker copy dữ liệu từ image layer vào volume lần
đầu tiên — đây là lý do Postgres container khởi động thành công ngay từ đầu mà không cần thủ công
init database.

**Bind mount ownership**: file tạo bởi container (chạy với UID cụ thể trong container) trong bind
mount directory sẽ thuộc về UID ĐÓ trên host — có thể gây vấn đề permission khi user host khác UID
cố gắng đọc/xoá file đó. Vấn đề phổ biến trong CI/CD: container ghi file, CI runner (UID khác)
không đọc được artifact.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Docker Engine documentation.

Tạo và dùng named volume cho database:

```
$ docker volume create postgres-data
postgres-data

$ docker run -d \
    --name postgres \
    --volume postgres-data:/var/lib/postgresql/data \
    -e POSTGRES_PASSWORD=secret \
    postgres:16

$ docker volume inspect postgres-data
[
  {
    "Name": "postgres-data",
    "Driver": "local",
    "Mountpoint": "/var/lib/docker/volumes/postgres-data/_data",
    "Labels": {},
    "Scope": "local"
  }
]
```

Data được lưu tại `/var/lib/docker/volumes/postgres-data/_data` trên host — đây là path thật,
có thể backup bằng `cp` hoặc `rsync` trực tiếp.

```
$ docker rm postgres     # xoá container
postgres

$ docker volume ls       # volume vẫn tồn tại
DRIVER    VOLUME NAME
local     postgres-data  ← VẪN CÒN
```

Bind mount để inject config:

```
$ docker run -d \
    --name nginx \
    --mount type=bind,source=$(pwd)/nginx.conf,target=/etc/nginx/nginx.conf,readonly \
    -p 80:80 \
    nginx:alpine
```

`readonly` flag: container chỉ đọc được file config, không ghi được — good practice với config.
`--mount` syntax (thay vì `-v`): tường minh hơn, không có "docker sẽ tạo thư mục nếu không tồn
tại" hành vi ngầm của `-v`.

Dùng tmpfs cho data nhạy cảm trong RAM:

```
$ docker run -d \
    --name app \
    --tmpfs /run/secrets:rw,noexec,nosuid,size=65536k \
    myapp:latest
```

`size=65536k` giới hạn tmpfs ở 64MB — không bị tiêu hết RAM. `noexec,nosuid`: hạn chế bảo mật
thêm (không chạy được binary, không có setuid).

Liệt kê và dọn dẹp volume không dùng:

```
$ docker volume ls
DRIVER    VOLUME NAME
local     postgres-data
local     redis-data
local     a1b2c3d4e5f6   ← anonymous volume (ID random — từ container cũ đã xoá)

$ docker volume prune    # xoá mọi volume không có container nào dùng
WARNING! This will remove anonymous local volumes not used by at least one container.
Are you sure you want to continue? [y/N] y
Deleted Volumes:
a1b2c3d4e5f6
Total reclaimed space: 156 MB
```

`prune` chỉ xoá volume KHÔNG CÓ container nào mount (kể cả container đã stopped) — safe để
chạy định kỳ.

## 5. Lỗi thường gặp và cách chẩn đoán

**Container restart xong dữ liệu mất — dù tưởng đã dùng volume**
- Nguyên nhân: đang dùng `docker-compose.yml` với volume định nghĩa ở service level (`volumes:
  - ./data:/app/data`) nhưng chưa khai báo trong top-level `volumes:` section; hoặc dùng
  anonymous volume (`-v /app/data` không có tên) — anonymous volume KHÔNG bị xoá bởi `docker
  restart`, nhưng BỊ xoá bởi `docker compose down --volumes` (cùng với named volume).
- Cách xác nhận: `docker inspect <container>` → `Mounts` section — xem `Type` (`bind`/`volume`)
  và `Name` (volume có tên vs ID random = anonymous).
- Cách xử lý: luôn dùng named volume trong production (`volumes: postgres-data:/path`).

**Bind mount path bị tạo sai kiểu**
- Nguyên nhân: dùng `-v /path/on/host:/path/in/container` nhưng `/path/on/host` CHƯA tồn tại
  — Docker tạo nó như DIRECTORY (dù host user muốn mount file). Kết quả: file config bị mount
  vào một thư mục trống thay vì đọc từ file.
- Cách xử lý: tạo file/thư mục host trước khi mount; hoặc dùng `--mount type=bind,...` thay
  vì `-v` (explicit bind mount từ chối nếu source không tồn tại thay vì tự tạo thư mục).

## 6. Tình huống thực tế

Docker Compose cho app production với Postgres + Redis + Web app:

```yaml
services:
  db:
    image: postgres:16
    volumes:
      - postgres-data:/var/lib/postgresql/data   # named volume — persist qua restart/redeploy
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data                          # named volume cho Redis RDB/AOF persistence

  web:
    build: .
    volumes:
      - ./config/nginx.conf:/etc/nginx/nginx.conf:ro  # bind mount config — dễ sửa không rebuild
    tmpfs:
      - /tmp:size=100m,noexec                         # scratch space cho app trong RAM

volumes:                    # PHẢI khai báo named volume ở đây để Compose quản lý
  postgres-data:
  redis-data:
```

Điểm quan trọng trong ví dụ này:
1. Named volume cho DB/Redis: `docker-compose down` không xoá (cần `--volumes` flag để xoá có
   chủ ý).
2. Config inject bằng bind mount readonly: thay đổi config không cần rebuild image.
3. tmpfs cho `/tmp`: không để debris ghi lên container layer hoặc disk — tốt cho performance.
4. `volumes:` section ở cuối file: PHẢI có, nếu không Compose tạo anonymous volume (tên = random
   hash, khó tìm lại).

## 7. Tự kiểm tra

1. Sự khác biệt quan trọng nhất giữa named volume và anonymous volume là gì?
   <details><summary>Đáp án</summary>Named volume có tên cố định, dễ backup và quản lý; anonymous
   volume có ID random, khó tìm lại. Cả hai đều tồn tại sau <code>docker compose down</code> — chỉ
   bị xoá khi dùng <code>docker compose down --volumes</code>. Named volume được quản lý tường minh
   hơn và không bị nhầm xoá.</details>

2. Khi nào dùng bind mount thay vì volume?
   <details><summary>Đáp án</summary>Khi cần: (1) inject file config cụ thể từ host, (2) share
   source code giữa host và container để hot-reload trong dev, (3) cần access trực tiếp file từ
   phía host (không thông qua Docker volume API). Không dùng cho database data production —
   volume tốt hơn vì portable, không phụ thuộc đường dẫn host, performance tốt hơn trên
   Docker Desktop (Mac/Windows).</details>

3. `docker volume prune` có thể xoá volume Postgres đang dùng cho database production không?
   <details><summary>Đáp án</summary>Không, nếu có container (dù đã stopped) đang mount volume đó.
   <code>prune</code> chỉ xoá volume KHÔNG CÓ container nào mount — kể cả container stopped vẫn
   "giữ" volume. Để xoá volume đang được container stopped mount, phải <code>docker rm</code>
   container trước, sau đó mới <code>docker volume rm</code> — hoặc dùng <code>docker-compose
   down --volumes</code> (xoá cả container lẫn volume cùng lúc).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.docker-internals.images` — container layer và tại sao dữ liệu trong đó không
  persist khi `docker rm`; volume mount đè lên layer của overlay filesystem.
- `container-k8s.docker-internals.compose` — định nghĩa named volume trong Compose file và
  lifecycle của chúng qua `docker-compose down [--volumes]`.

**Nguồn tham khảo:**
- [Docker storage overview — docs.docker.com](https://docs.docker.com/storage/) — so sánh 3 cơ
  chế, khi nào dùng gì.
- [Docker volumes — docs.docker.com](https://docs.docker.com/storage/volumes/) — named vs
  anonymous, driver, backup/restore.
- [Bind mounts — docs.docker.com](https://docs.docker.com/storage/bind-mounts/) — `--mount` vs
  `-v`, ownership, read-only.
