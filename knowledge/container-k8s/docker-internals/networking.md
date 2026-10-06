---
id: container-k8s.docker-internals.networking
title: "Docker networking: bridge, host, overlay cơ bản"
domain: container-k8s
module: container-k8s.docker-internals
level: "vận hành"
prerequisites: ["container-k8s.docker-internals.images", "networking.tcpip.osi-tcpip-model"]
applies_to:
  - "Docker Engine trên Linux — driver bridge/host/overlay; bridge network dùng Linux bridge + iptables/nftables trên host; hành vi khác biệt trên Docker Desktop (Mac/Windows dùng VM)"
status: draft
sources:
  - "https://docs.docker.com/network/"
  - "https://docs.docker.com/network/network-tutorial-standalone/"
  - "https://man7.org/linux/man-pages/man8/ip.8.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Docker không cài trên máy demo. Toàn bộ output trong bài là **output minh hoạ** theo
> Docker Engine documentation, trừ phần giải thích cơ chế kernel (namespace/bridge/iptables) dùng
> kiến thức đã học ở bài trước.

Khi container gặp vấn đề kết nối (không ping được container khác, service không reach được từ
ngoài), câu hỏi đầu tiên là "container đang dùng network mode nào?" — mỗi mode có kiến trúc khác
nhau, điểm giới hạn khác nhau, và cách debug khác nhau. Một SE không hiểu cơ chế bridge network
sẽ debug firewall hoặc cấu hình ứng dụng trong khi vấn đề thật là Docker `--publish` bị thiếu
hoặc container trong network khác.

## 2. Khái niệm cốt lõi

Docker có 4 network driver chính (thêm có thể cài qua plugin):

**`bridge` (mặc định)**: Docker tạo một Linux bridge ảo (`docker0` hoặc bridge đặt tên tùy chỉnh)
trên host. Mỗi container trong cùng network nhận một vNIC ảo (`veth` pair — một đầu trong container,
một đầu gắn vào bridge). Container giao tiếp trong cùng bridge qua L2. Ra ngoài internet: host thực
hiện MASQUERADE NAT (xem thêm: `networking.nat-firewall.nat-types`). Port publishing (`--publish
8080:80`): Docker thêm iptables/nftables DNAT rule để ánh xạ port host vào container.

**`host`**: container KHÔNG có network namespace riêng — dùng trực tiếp network của host. Cao nhất
về hiệu năng mạng (không có overhead veth/bridge), nhưng mất cách ly: container gắn trực tiếp vào
interface và routing table của host, port conflict với host process, không cần publish.

**`none`**: container có network namespace riêng nhưng không có gì trong đó (chỉ loopback). Dùng
cho container hoàn toàn không cần mạng (xử lý dữ liệu batch, build tool...) hoặc khi admin sẽ tự
cấu hình network sau.

**`overlay`**: kết nối container trên NHIỀU HOST Docker (Docker Swarm, hoặc tự cấu hình). Tạo
virtual L2 network span qua nhiều máy vật lý bằng VXLAN encapsulation. Không cần cho single-host
deployment thông thường.

| Mode | Namespace riêng | Giao tiếp container | Ra internet | Port publish cần? |
|---|---|---|---|---|
| `bridge` | Có | Qua bridge L2 | NAT/MASQUERADE | CÓ — để reach từ ngoài |
| `host` | Không (dùng host) | Trực tiếp | Trực tiếp | Không cần |
| `none` | Có (trống) | Không | Không | Không áp dụng |
| `overlay` | Có | VXLAN L2 | Qua underlay | Tuỳ cấu hình |

## 3. Cách nó hoạt động

**Bridge network và DNS tự động**: Docker Compose và user-defined bridge network (tạo bằng `docker
network create`) tự động cấu hình DNS resolver nội bộ — container trong cùng network có thể resolve
TÊN container/service thay vì dùng IP. Đây là lý do trong Compose file dùng tên service (ví dụ
`db`, `redis`) thay vì IP cứng. Bridge mặc định (`docker0`) KHÔNG có DNS — container phải dùng IP.
Đây là lý do nên tạo user-defined network thay vì dùng bridge mặc định.

**Port publishing và iptables/nftables**: khi `docker run -p 8080:80`, Docker Engine thêm rule vào
`iptables`/`nftables` của host để DNAT packet từ `host:8080` vào container IP:80. Điều này giải
thích tại sao UFW không thể block cổng Docker đã publish — Docker tự thêm rule ở tầng `iptables`
(mà UFW quản lý), nhưng Docker thêm rule TRƯỚC chain của UFW trong thứ tự traversal, bypass UFW một
phần (đây là một gotcha phổ biến về bảo mật Docker + UFW).

**Container DNS trong bridge network**: Docker chạy một DNS resolver nội bộ trên `127.0.0.11:53`
bên trong container (chỉ resolve tên service trong cùng network). `cat /etc/resolv.conf` bên trong
container sẽ thấy `nameserver 127.0.0.11` — khác với host đang dùng `127.0.0.53` của systemd-resolved.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Docker Engine documentation.

Liệt kê network mặc định khi install Docker:

```
$ docker network ls
NETWORK ID     NAME      DRIVER    SCOPE
a1b2c3d4e5f6   bridge    bridge    local
b2c3d4e5f6a7   host      host      local
c3d4e5f6a7b8   none      null      local
```

Tạo user-defined bridge network (khác với bridge mặc định — có DNS):

```
$ docker network create app-network
d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4

$ docker network inspect app-network --format='{{.IPAM.Config}}'
[{172.18.0.0/16  172.18.0.1 map[]}]
```

Docker tự cấp subnet `172.18.0.0/16` cho network mới (pool riêng, khác với `docker0` dùng
`172.17.0.0/16`).

Chạy hai container trong cùng network — giao tiếp qua tên:

```
$ docker run -d --name backend --network app-network my-api:v1
$ docker run -d --name frontend --network app-network -p 3000:3000 my-ui:v1

# Từ container frontend, có thể resolve "backend" qua DNS nội bộ Docker:
$ docker exec frontend curl http://backend:8080/health
{"status":"ok"}
```

Xem interface bridge trên host (Docker tạo bridge ảo giống `ip link show`):

```
$ ip link show
...
5: docker0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc noqueue state DOWN
    link/ether 02:42:a1:b2:c3:d4 brd ff:ff:ff:ff:ff:ff
6: br-d4e5f6a7b8c9: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP
    link/ether 02:42:b2:c3:d4:e5 brd ff:ff:ff:ff:ff:ff
7: veth1a2b3c4d@if6: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue master br-d4e5...
    link/ether b6:c7:d8:e9:f0:a1 brd ff:ff:ff:ff:ff:ff
```

`docker0` là bridge mặc định (`state DOWN` vì không có container nào đang dùng); `br-d4e5f6a7b8c9`
là bridge của `app-network` (`state UP` có container đang kết nối); `veth1a2b3c4d` là đầu host của
veth pair nối vào bridge — đầu kia trong container.

Xem rule DNAT của port publish trong iptables:

```
$ sudo iptables -t nat -L DOCKER --line-numbers -n
Chain DOCKER (2 references)
num  target     prot opt source               destination
1    RETURN     all  --  0.0.0.0/0            0.0.0.0/0
2    DNAT       tcp  --  0.0.0.0/0            0.0.0.0/0   tcp dpt:3000 to:172.18.0.3:3000
```

Rule 2: packet tới `host:3000` được DNAT tới `172.18.0.3:3000` (IP của container frontend trong
bridge) — đây là cơ chế port publish, thêm tự động bởi Docker Engine khi dùng `-p`.

## 5. Lỗi thường gặp và cách chẩn đoán

**Container không thể resolve tên container khác trong cùng Compose project**
- Nguyên nhân: một hoặc cả hai container không nằm trong cùng user-defined network; hoặc Compose
  đang dùng network legacy (bridge mặc định không có DNS).
- Cách xác nhận: `docker network inspect <network-name>` xem danh sách container trong network; từ
  bên trong container, `cat /etc/resolv.conf` — nếu thấy `nameserver 127.0.0.11` là đúng cấu hình
  (Docker DNS nội bộ); thử `nslookup <service-name> 127.0.0.11` xem có resolve không.
- Cách xử lý: đảm bảo cả hai service trong Compose file đều trong cùng network section; hoặc tạo
  user-defined network rõ ràng thay vì để Compose dùng mặc định.

**Port đã publish với Docker nhưng UFW vẫn block**
- Nguyên nhân: Docker bypass UFW bằng cách thêm iptables DNAT rule trực tiếp trên chain `DOCKER`,
  KHÔNG qua chain của UFW — tuy nhiên nếu UFW dùng `ufw-user-forward` chain có thể can thiệp. Ngược
  lại: UFW không "block" port Docker đã publish theo cách dự kiến.
- Cách xử lý thực tế: với server production, bổ sung rule UFW cụ thể thay vì phụ thuộc hoàn toàn
  vào UFW để kiểm soát access vào container; hoặc dùng `--publish 127.0.0.1:8080:80` để bind chỉ
  trên loopback (không thể reach từ ngoài), sau đó UFW manage traffic ở reverse proxy layer.

## 6. Tình huống thực tế

Multi-container app có frontend (React), backend (Node.js API), và database (Postgres), dùng Docker
Compose:

1. Tất cả service khai báo trong cùng `networks: [app-net]` trong Compose — đảm bảo DNS tự động.
2. Frontend kết nối backend qua tên `http://backend:3000` (không phải IP) — bền vững khi container
   restart và IP thay đổi.
3. Database không publish port ra ngoài (`ports:` bỏ trống) — chỉ frontend/backend trong `app-net`
   mới reach được. Host (và internet) không thể kết nối trực tiếp vào DB.
4. Frontend publish `3000:3000` ra ngoài để user access; backend publish KHÔNG khai báo (chỉ nội bộ).
5. Debug khi backend không kết nối được DB: `docker exec backend nslookup db` xem resolve thành
   công chưa; `docker exec backend curl -v db:5432` (không connect nhưng xem error: "refused" = DB
   listen OK, "timeout" = mạng/firewall vấn đề).

## 7. Tự kiểm tra

1. Hai container trong cùng Docker Compose project. Container A có thể `ping B` bằng tên (`ping
   backend`) — hoạt động được không và cần điều kiện gì?
   <details><summary>Đáp án</summary>Có, nếu cả hai cùng user-defined bridge network (Compose tự
   tạo mặc định, hoặc khai báo <code>networks:</code> chung). Docker DNS nội bộ (<code>127.0.0.11
   </code>) resolve tên service trong cùng network. Bridge mặc định (<code>docker0</code>) KHÔNG
   có DNS, phải dùng IP.</details>

2. `docker run -p 8080:80 nginx` vs `docker run --network=host -p 8080:80 nginx`. Cái nào đúng hơn
   với `--network=host`?
   <details><summary>Đáp án</summary>Với <code>--network=host</code>, container dùng trực tiếp
   network của host — Nginx bind cổng 80 TRỰC TIẾP trên host (không qua bridge/NAT). Flag <code>-p
   </code> bị IGNORED khi dùng <code>--network=host</code> (không có gì để publish vì không có
   network namespace riêng). Truy cập qua <code>host:80</code>, không phải 8080.</details>

3. Vì sao UFW không block được port Docker đã publish như mong đợi?
   <details><summary>Đáp án</summary>Docker thêm iptables DNAT rule trực tiếp vào chain
   <code>DOCKER</code> (trước chain UFW trong traversal order), bypass UFW. Giải pháp thực tế: bind
   container port chỉ trên loopback (<code>--publish 127.0.0.1:port:port</code>) rồi dùng reverse
   proxy (nginx) quản lý access, thay vì phụ thuộc UFW để block Docker port.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.docker-internals.namespaces-cgroups` — bridge network tạo `net` namespace riêng
  cho container; `--network=host` không tạo namespace mới.
- `container-k8s.docker-internals.compose` — Compose tự động tạo user-defined bridge network cho
  project, đây là lý do DNS hoạt động giữa service mà không cần cấu hình thêm.

**Bài liên quan ngoài module:**
- `networking.nat-firewall.nat-types` — Docker bridge dùng MASQUERADE NAT ra ngoài internet; port
  publish dùng DNAT — đúng cơ chế đã học ở bài đó.
- `linux.network-stack.firewall` — Docker thêm rule iptables/nftables tự động; hiểu layering ufw ↔
  iptables để tránh bất ngờ khi cả hai cùng hoạt động.

**Nguồn tham khảo:**
- [Docker networking overview — docs.docker.com](https://docs.docker.com/network/) — tổng quan 4
  driver, khi nào dùng gì.
- [Standalone container networking tutorial — docs.docker.com](https://docs.docker.com/network/network-tutorial-standalone/)
  — demo thực tế bridge vs host network.
- [ip(8) — man7.org](https://man7.org/linux/man-pages/man8/ip.8.html) — xem bridge/veth tạo ra bởi
  Docker trên host.
