---
id: container-k8s.docker-internals.compose
title: "Docker Compose: định nghĩa và chạy multi-container app"
domain: container-k8s
module: container-k8s.docker-internals
level: "vận hành"
prerequisites:
  - "container-k8s.docker-internals.networking"
  - "container-k8s.docker-internals.storage"
applies_to:
  - "Docker Compose v2 (plugin, lệnh `docker compose`) — phổ biến từ Docker Engine 20.10+; khác với Compose v1 standalone binary (`docker-compose` có dấu gạch ngang)"
status: verified
sources:
  - "https://docs.docker.com/compose/"
  - "https://docs.docker.com/compose/compose-file/"
  - "https://docs.docker.com/compose/compose-file/05-services/"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Docker không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ** theo
> Docker Compose documentation chính thức.

Chạy riêng từng container bằng `docker run` với đủ flag (network, volume, env var, port, restart
policy...) là chuỗi lệnh dài, khó reproduce, khó share với đồng nghiệp. Docker Compose giải quyết
bằng cách định nghĩa TOÀN BỘ app stack trong một file YAML — mọi service, network, volume, config —
và quản lý lifecycle của stack đó bằng một lệnh. Hiểu Compose giúp đọc được cấu hình của bất kỳ
open-source project nào (hầu hết đều có `docker-compose.yml`), tự viết được config cho app mới,
và troubleshoot khi service không start đúng thứ tự hoặc không kết nối được nhau.

## 2. Khái niệm cốt lõi

**`docker-compose.yml`**: file khai báo stack — các `services` (container), `networks` (bridge
network — xem lại bài networking), `volumes` (named volume — xem lại bài storage). Mỗi service là
một container template, không phải container đang chạy. Compose đọc file này để biết phải tạo gì.

**Project**: đơn vị quản lý của Compose — tên project (mặc định = tên thư mục chứa Compose file)
là namespace cho mọi resource nó tạo ra. Container tên `db` trong project `myapp` sẽ được đặt tên
đầy đủ là `myapp-db-1` (format: `<project>-<service>-<replica>`). Compose prefix này tránh clash
khi chạy nhiều stack trên cùng host.

**Service vs container**: service là ĐỊNH NGHĨA (cấu hình trong YAML), container là INSTANCE. Một
service có thể scale thành nhiều container (`--scale db=3`). `docker compose ps` liệt kê container,
không phải service.

**Dependency management (`depends_on`)**: khai báo thứ tự start và điều kiện. Mặc định
(`depends_on: db`) chỉ đợi container `db` START (không đợi service sẵn sàng nhận connection). Để
đợi Postgres thực sự ready: kết hợp `depends_on` với `healthcheck`.

## 3. Cách nó hoạt động

**Lifecycle của Compose stack**: `docker compose up` tạo network, volume rồi start container theo
thứ tự dependency; `docker compose down` stop và remove container, network (mặc định giữ volume);
`docker compose down --volumes` xoá cả volume. Mỗi lần `up` sau khi sửa Compose file: Compose
so sánh config hiện tại với container đang chạy và chỉ recreate service có thay đổi — service
không đổi tiếp tục chạy không bị interrupt.

**Network isolation mặc định**: Compose tự tạo một user-defined bridge network cho project (tên
`<project>_default`) — đây là lý do các service giao tiếp nhau qua tên service (DNS tự động, giải
thích ở bài networking). Service KHÔNG trong cùng network không reach được nhau.

**Environment variable substitution**: Compose đọc file `.env` trong cùng thư mục và substitute
vào Compose file tại build/runtime. Ví dụ `${DB_PASSWORD}` trong YAML được thay bằng giá trị từ
`.env` hoặc từ shell environment — không cần hardcode secret trong YAML, `.env` có thể gitignore.

**`healthcheck` và `depends_on` condition**: chỉ wait và retry cho đến khi health check pass,
không đơn giản là "đợi container start xong". Postgres cần vài giây để init database cluster
lần đầu — nếu web app start ngay sau khi container Postgres bắt đầu run mà chưa accept
connection, app sẽ crash với "connection refused". Healthcheck giải quyết race condition này.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Docker Compose documentation.

Compose file đầy đủ cho web app + Postgres + Redis:

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: appdb
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d appdb"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

  web:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://appuser:${DB_PASSWORD}@db:5432/appdb
      REDIS_URL: redis://redis:6379
    depends_on:
      db:
        condition: service_healthy      # đợi healthcheck pass — không phải chỉ container start
      redis:
        condition: service_started      # Redis start nhanh, không cần wait healthy

volumes:
  postgres-data:
  redis-data:
```

Các lệnh quản lý stack:

```
$ docker compose up -d                 # start tất cả service ở background (-d = detach)
[+] Running 4/4
 ✔ Network myapp_default  Created
 ✔ Container myapp-db-1   Started (healthy sau ~10s)
 ✔ Container myapp-redis-1 Started
 ✔ Container myapp-web-1  Started

$ docker compose ps                    # xem trạng thái service
NAME              IMAGE            STATUS                 PORTS
myapp-db-1        postgres:16      Up 2 minutes (healthy) 5432/tcp
myapp-redis-1     redis:7-alpine   Up 2 minutes           6379/tcp
myapp-web-1       myapp-web        Up 1 minute            0.0.0.0:3000->3000/tcp

$ docker compose logs web --follow     # xem log realtime của service web
$ docker compose logs -f               # tất cả service

$ docker compose exec db psql -U appuser appdb  # chạy lệnh trong container đang running

$ docker compose restart web           # restart chỉ service web (không ảnh hưởng db/redis)

$ docker compose down                  # stop và remove container + network (giữ volume)
$ docker compose down --volumes        # xoá cả volume (cẩn thận với data production!)
```

Override config cho từng môi trường:

```
# docker-compose.override.yml (tự động merge khi chạy `docker compose up`)
services:
  web:
    build:
      target: development              # build stage khác (multi-stage Dockerfile)
    volumes:
      - .:/app:cached                  # bind mount source code để hot-reload
    environment:
      NODE_ENV: development
```

Compose tự động đọc và merge `docker-compose.override.yml` (nếu có) vào `docker-compose.yml`
— pattern này dùng để có dev config riêng mà không sửa file production. File override KHÔNG
commit vào git (thêm vào `.gitignore`).

Scale một service (chỉ stateless service — service phải KHÔNG khai báo `ports:` với host port cố
định, nếu không Docker báo lỗi port conflict khi tạo replica thứ 2). Để scale, định nghĩa port
không có host port cố định: `- "3000"` thay vì `- "3000:3000"` — Docker tự cấp host port ngẫu nhiên
cho mỗi replica:

```
$ docker compose up -d --scale web=3
$ docker compose ps
NAME              STATUS    PORTS
myapp-db-1        Up        5432/tcp
myapp-redis-1     Up        6379/tcp
myapp-web-1       Up        0.0.0.0:49201->3000/tcp
myapp-web-2       Up        0.0.0.0:49202->3000/tcp
myapp-web-3       Up        0.0.0.0:49203->3000/tcp
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Service `web` fail ngay lúc start vì "connection refused" đến database**
- Nguyên nhân: `depends_on: db` chỉ đợi container start, không đợi Postgres sẵn sàng nhận
  connection (Postgres cần ~5-10 giây để init). Web app start, thử connect, bị refused.
- Cách xác nhận: `docker compose logs web` thấy database connection error ở giây đầu; `docker
  compose ps` thấy db "Up" nhưng không phải "(healthy)".
- Cách xử lý: thêm `healthcheck` cho `db` service và `depends_on: db: condition:
  service_healthy` cho web — Compose sẽ đợi DB healthy trước khi start web.

**`docker compose down` xoá mất data, phải bắt đầu lại từ đầu**
- Nguyên nhân: dùng `docker compose down --volumes` không chủ ý, hoặc service đang dùng
  anonymous volume (không khai báo trong `volumes:` top-level) bị xoá.
- Cách xử lý: luôn dùng named volume khai báo trong top-level `volumes:` section; `docker
  compose down` không có `--volumes` flag giữ nguyên data; thêm `--volumes` chỉ khi muốn
  intentionally reset sạch.

## 6. Tình huống thực tế

Onboard một dự án open source mới chạy local để debug, dự án có `docker-compose.yml`:

1. `docker compose pull` — tải về tất cả image cần thiết.
2. Tạo `.env` từ `.env.example` của project, điền giá trị cần thiết.
3. `docker compose up -d` — start stack; `docker compose logs -f` để watch log khi các service
   khởi động.
4. Nếu web service crash loop: `docker compose logs web | tail -50` xem error cuối cùng; `docker
   compose ps` xem trạng thái từng service — service nào "(healthy)" hay "Exit 1".
5. Thường gặp: DB chưa healthy khi web start → đọc `depends_on` trong Compose file — nếu không
   có `condition: service_healthy`, có thể cần `docker compose restart web` sau khi DB đã up.
6. Khi đã debug xong: `docker compose down` (giữ data) hoặc `docker compose down --volumes`
   (reset hoàn toàn, bắt đầu lại từ seed data).

## 7. Tự kiểm tra

1. Sự khác biệt giữa `docker compose up` và `docker compose start` là gì?
   <details><summary>Đáp án</summary><code>docker compose up</code> tạo container nếu chưa có
   (từ định nghĩa trong YAML), rồi start. <code>docker compose start</code> chỉ start container
   ĐÃ TỒN TẠI (từ lần <code>up</code> trước) — không tạo mới nếu container đã bị <code>rm</code>.
   Thực tế gần như luôn dùng <code>up</code>.</details>

2. Hai service khai báo trong cùng `docker-compose.yml` không thể giao tiếp với nhau dù đã
   dùng tên service. Nguyên nhân có thể là gì?
   <details><summary>Đáp án</summary>Hai service được khai báo trong <code>networks:</code> KHÁC
   NHAU — chỉ service trong cùng network mới resolve được tên nhau qua Docker DNS nội bộ. Cách
   xác nhận: <code>docker network inspect &lt;network&gt;</code> xem Containers section — chỉ
   liệt kê container trong network đó. Cách xử lý: đảm bảo cả hai service khai báo cùng network,
   hoặc bỏ <code>networks:</code> riêng để dùng mặc định của Compose (<code>&lt;project&gt;
   _default</code>).</details>

3. Tại sao nên có `healthcheck` cho database service trong Compose?
   <details><summary>Đáp án</summary>Container Postgres có thể START (process chạy) nhưng chưa
   READY (accept connection — cần vài giây để init). Nếu app service chỉ dùng <code>depends_on:
   condition: service_started</code>, app start khi container DB đang khởi động, gặp "connection
   refused", crash. Healthcheck (ví dụ <code>pg_isready</code>) test xem DB thực sự accept
   connection — <code>service_healthy</code> condition đảm bảo app chỉ start sau khi DB sẵn
   sàng thực sự.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.docker-internals.networking` — Compose tự tạo user-defined bridge network, DNS
  tự động giữa service là tính năng của user-defined network (không phải bridge mặc định).
- `container-k8s.docker-internals.storage` — khai báo named volume trong Compose file và
  lifecycle qua `docker compose down [--volumes]`.

**Xem thêm (module tiếp theo):**
- `container-k8s.k8s-architecture` — Kubernetes giải quyết những hạn chế của Compose trong
  production scale (multi-host, self-healing, rolling update, service discovery...).

**Nguồn tham khảo:**
- [Docker Compose overview — docs.docker.com](https://docs.docker.com/compose/) — giới thiệu,
  ví dụ nhanh.
- [Compose file reference — docs.docker.com](https://docs.docker.com/compose/compose-file/) —
  tất cả directive trong file YAML.
- [Services top-level element — docs.docker.com](https://docs.docker.com/compose/compose-file/05-services/)
  — chi tiết `depends_on`, `healthcheck`, `deploy`, `build` và mọi option khác của `services:`.
