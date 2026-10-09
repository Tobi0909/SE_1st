---
id: linux.network-stack.tools
title: "Công cụ mạng trên Linux: ip addr/route, ss cơ bản"
domain: linux
module: linux.network-stack
level: "nền tảng"
prerequisites: ["networking.tcpip.osi-tcpip-model"]
applies_to:
  - "Ubuntu 22.04 LTS — iproute2 (ip/ss), công cụ thay thế chuẩn cho net-tools (ifconfig/route/netstat) cũ trên mọi distro hiện đại"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man8/ip.8.html"
  - "https://man7.org/linux/man-pages/man8/ss.8.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Bài `networking.tcpip.osi-tcpip-model` đã giới thiệu `ip addr`/`ip route`/`ss` ở mức khái niệm
để minh hoạ các tầng OSI. Bài này đi sâu vào CÁCH DÙNG THỰC TẾ của bộ công cụ `iproute2` (`ip`,
`ss`) — bộ công cụ CHUẨN HIỆN ĐẠI thay thế hoàn toàn `net-tools` cũ (`ifconfig`/`route`/
`netstat`) trên mọi distro Linux gần đây. Một System Engineer cần thành thạo `ip`/`ss` để trả
lời nhanh các câu hỏi vận hành hằng ngày: "máy này có IP gì, qua interface nào?", "default
gateway là gì?", "cổng nào đang LISTEN, process nào đang giữ nó?".

## 2. Khái niệm cốt lõi

**`ip` là công cụ ĐA NĂNG, chia theo "object"** — cú pháp chung `ip <object> <command>`, các
object hay dùng: `addr` (địa chỉ IP), `link` (trạng thái interface tầng 2), `route` (bảng định
tuyến). Đây khác với `net-tools` cũ, nơi MỖI chức năng là MỘT lệnh riêng (`ifconfig` cho địa
chỉ, `route` cho định tuyến) — `ip` gộp lại dưới một cú pháp thống nhất.

**`ss` (socket statistics)** thay thế `netstat` — liệt kê socket (TCP/UDP) đang mở, kèm trạng
thái. Cờ hay dùng: `-t` (TCP), `-u` (UDP), `-l` (chỉ socket đang LISTEN), `-n` (hiện số cổng/IP
thô, không resolve tên — nhanh hơn và tránh treo nếu DNS chậm), `-p` (hiện process đang giữ
socket, cần quyền phù hợp để thấy process của user khác).

| Lệnh | Tác dụng |
|---|---|
| `ip addr show [dev]` | Xem địa chỉ IP (IPv4/IPv6) của interface |
| `ip link show [dev]` | Xem trạng thái tầng 2 (UP/DOWN, MTU, MAC) |
| `ip route` | Xem bảng định tuyến (route table) |
| `ss -tln` | Socket TCP đang LISTEN, không resolve tên |
| `ss -tn state established` | Socket TCP đang ESTABLISHED (đã kết nối) |
| `ss -s` | Thống kê tổng quan số lượng socket theo loại |

## 3. Cách nó hoạt động

**`ip route` đọc theo thứ tự "cụ thể nhất thắng" (longest prefix match)** — mỗi dòng là một
route, prefix (`/23`, `/24`...) CÀNG DÀI (càng cụ thể) được ưu tiên khớp trước route NGẮN hơn
(ít cụ thể hơn) cho cùng một địa chỉ đích; dòng `default` (tương đương `0.0.0.0/0`, prefix
`/0` — ít cụ thể NHẤT) chỉ được dùng khi KHÔNG route nào khác khớp. Đây là nguyên lý nền tảng
sẽ học ở `networking.routing.static`, áp dụng trực tiếp khi đọc output `ip route` trên Linux.

**`ss -n` không resolve tên — đây là lựa chọn CÓ CHỦ Ý, không phải thiếu tính năng** — resolve
tên (DNS reverse lookup) cho MỖI socket có thể làm lệnh TREO lâu nếu DNS chậm hoặc không phản
hồi, đặc biệt khi có nhiều socket. Luôn dùng `-n` khi cần kết quả NHANH (ví dụ trong script tự
động hoặc khi debug sự cố cần phản hồi ngay) — đổi lại phải tự tra tên bằng `dig`/`nslookup`
riêng nếu cần.

**`ss -p` cần quyền phù hợp để thấy đầy đủ thông tin process** — user thường chỉ thấy được
PID/process name của chính user đó, không thấy process của user/service khác (ẩn vì lý do bảo
mật — không phải lỗi hay thiếu quyền đọc socket, mà là giới hạn CHỦ Ý để tránh user A biết chi
tiết tiến trình của user B).

## 4. Thực hành

Xem địa chỉ IP và interface thật trên máy:

```bash
$ ip addr show enp1s0
2: enp1s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    link/ether 24:6a:0e:74:b3:b7 brd ff:ff:ff:ff:ff:ff
    inet 192.168.25.227/23 brd 192.168.25.255 scope global dynamic noprefixroute enp1s0
       valid_lft 79111sec preferred_lft 79111sec
    inet6 fe80::da43:6c5a:23b:6eaf/64 scope link noprefixroute
       valid_lft forever preferred_lft forever
```

Xem bảng định tuyến — nhiều route cùng tồn tại, áp dụng đúng nguyên lý "cụ thể nhất thắng" ở
mục 3:

```bash
$ ip route
default via 192.168.24.1 dev enp1s0 proto dhcp metric 100
169.254.0.0/16 dev enp1s0 scope link metric 1000
172.16.1.0/24 dev vmnet1 proto kernel scope link src 172.16.1.1
172.16.73.0/24 dev vmnet8 proto kernel scope link src 172.16.73.1
192.168.24.0/23 dev enp1s0 proto kernel scope link src 192.168.25.227 metric 100
```

Đọc: gói tới `192.168.25.x` khớp route `192.168.24.0/23` (cụ thể hơn `default`) → đi qua
`enp1s0` trực tiếp, KHÔNG qua gateway. Gói tới địa chỉ Internet bất kỳ (ví dụ `8.8.8.8`) không
khớp route cụ thể nào (ngoại trừ các route LAN nội bộ `172.16.x`/`169.254.x`) → rơi vào
`default`, đi qua gateway `192.168.24.1`.

Xem socket đang LISTEN (chạy thật, dùng `-n` để nhanh):

```bash
$ ss -tln
State  Recv-Q Send-Q Local Address:Port  Peer Address:Port
LISTEN 0      4096   127.0.0.53%lo:53    0.0.0.0:*
LISTEN 0      10         0.0.0.0:7070    0.0.0.0:*
LISTEN 0      5        127.0.0.1:8080    0.0.0.0:*
LISTEN 0      128      127.0.0.1:631     0.0.0.0:*
```

`127.0.0.53%lo:53` là stub resolver của `systemd-resolved` (xem tiếp ở bài
`linux.network-stack.dns-resolution`) — chỉ LISTEN trên `lo` (loopback), không lộ ra ngoài
mạng.

Tạo một kết nối TCP thật (tự dựng bằng Python socket, không đụng dịch vụ hệ thống) để xem `ss
-tn state established` — xác nhận đúng cả 2 đầu của MỘT kết nối đều xuất hiện (view từ phía
server và phía client):

```bash
$ ss -tn state established
ESTAB 0      0           127.0.0.1:18082       127.0.0.1:44882
ESTAB 0      0           127.0.0.1:44882       127.0.0.1:18082
```

Thống kê tổng quan số socket theo loại:

```bash
$ ss -s
Total: 1423
TCP:   35 (estab 24, closed 0, orphaned 0, timewait 0)

Transport Total     IP        IPv6
RAW       2         1         1
UDP       34        29        5
TCP       35        30        5
INET      71        60        11
FRAG      0         0         0
```

## 5. Lỗi thường gặp và cách chẩn đoán

**`ss -t` (không `-n`) chạy rất chậm hoặc có vẻ "treo"**
- Nguyên nhân: đang resolve tên (reverse DNS) cho từng socket, DNS chậm hoặc không phản hồi làm
  mỗi dòng mất thời gian đáng kể.
- Cách xác nhận: so sánh thời gian chạy `ss -t` vs `ss -tn` — nếu `-tn` nhanh hẳn, xác nhận đúng
  nguyên nhân.
- Cách xử lý: luôn dùng `-n` làm mặc định khi cần kết quả nhanh, đặc biệt trong script.

**Đọc `ip route` xong vẫn không hiểu gói tin đi đường nào, vì có nhiều route "có vẻ khớp"**
- Nguyên nhân: không áp dụng đúng nguyên lý "cụ thể nhất thắng" — nhìn route NGẮN (ít cụ thể)
  trước route DÀI (cụ thể hơn) mà lại nghĩ route đọc theo thứ tự xuất hiện trên màn hình.
- Cách xác nhận: xác định đúng PREFIX LENGTH (`/23`, `/24`...) của từng route, route nào có
  prefix DÀI HƠN và khớp địa chỉ đích mới là route THẮNG.
- Cách xử lý: dùng `ip route get <địa-chỉ-đích>` để Linux tự tính và trả về CHÍNH XÁC route nào
  sẽ được dùng, không cần tự suy luận bằng tay.

## 6. Tình huống thực tế

Một ứng dụng báo lỗi "connection refused" khi client thử kết nối tới port `9090` trên server,
dù team khẳng định "service đang chạy":

1. SSH vào server, chạy `ss -tln | grep 9090` — KHÔNG thấy dòng nào khớp → xác nhận ngay: service
   KHÔNG thực sự LISTEN trên port đó (dù process có thể đang chạy, nó có thể đang lắng nghe port
   KHÁC, hoặc đã crash một phần).
2. Kiểm tra lại cấu hình service, phát hiện service thực tế LISTEN trên `127.0.0.1:9090` (chỉ
   loopback) chứ không phải `0.0.0.0:9090` (mọi interface) — `ss -tln` cho thấy rõ cột "Local
   Address" là `127.0.0.1:9090`, không phải `0.0.0.0:9090`.
3. Giải thích đúng nguyên nhân: service chỉ chấp nhận kết nối TỪ CHÍNH MÁY ĐÓ (loopback), client
   từ máy khác trong mạng không thể kết nối tới — đây không phải vấn đề firewall (xem thêm
   `linux.network-stack.firewall`), mà là cấu hình bind address của ứng dụng.
4. Sửa cấu hình service để bind `0.0.0.0` (hoặc địa chỉ IP cụ thể của interface mạng), restart,
   `ss -tln | grep 9090` lại để xác nhận đã đổi đúng thành `0.0.0.0:9090`.
5. Test lại từ máy client — kết nối thành công, xác nhận đúng nguyên nhân gốc.

## 7. Tự kiểm tra

1. Vì sao nên dùng `ss -tn` thay vì `ss -t` khi cần kết quả nhanh?
   <details><summary>Đáp án</summary><code>-n</code> bỏ qua việc resolve tên (reverse DNS) cho
   từng socket — nếu không có <code>-n</code>, lệnh có thể chạy rất chậm khi DNS không phản hồi
   nhanh, vì phải tra tên cho MỖI socket.</details>

2. Bảng `ip route` có cả `192.168.24.0/23` và `default via ...`. Gói tin tới địa chỉ
   `192.168.25.100` sẽ đi theo route nào? Vì sao?
   <details><summary>Đáp án</summary><code>192.168.24.0/23</code> — route này CỤ THỂ HƠN
   (prefix dài hơn, <code>/23</code> so với <code>/0</code> của default) và khớp địa chỉ đích,
   nên thắng theo nguyên lý longest prefix match. <code>default</code> chỉ dùng khi KHÔNG route
   nào khác khớp.</details>

3. `ss -tln` cho thấy một service LISTEN trên `127.0.0.1:9090` thay vì `0.0.0.0:9090`. Điều này
   ảnh hưởng gì tới khả năng kết nối từ máy khác trong mạng?
   <details><summary>Đáp án</summary>Client từ máy KHÁC không thể kết nối — service chỉ bind
   vào loopback (<code>127.0.0.1</code>), chỉ chấp nhận kết nối từ CHÍNH máy đó. Cần bind
   <code>0.0.0.0</code> (hoặc IP cụ thể của interface mạng) để chấp nhận kết nối từ bên
   ngoài.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.network-stack.dns-resolution` — giải thích dòng `127.0.0.53%lo:53` xuất hiện trong
  `ss -tln` ở mục 4.
- `linux.network-stack.firewall` — phân biệt "service không LISTEN" (vấn đề ở bài này) với
  "service LISTEN nhưng firewall chặn" (vấn đề khác, dễ nhầm lẫn khi debug).

**Bài liên quan ngoài module:**
- `networking.tcpip.osi-tcpip-model` — giới thiệu `ip`/`ss` ở mức khái niệm, bài này đi sâu vào
  cách dùng thực tế.
- `networking.routing.static` — nguyên lý longest prefix match áp dụng ở mục 3.
- `networking.diagnostic-tools.ss-netstat` — so sánh `ss` với `netstat` (cú pháp cũ), và các
  cờ nâng cao của `ss` không đề cập ở bài này.

**Nguồn tham khảo:**
- [ip(8) — man7.org](https://man7.org/linux/man-pages/man8/ip.8.html) — cú pháp object `addr`/
  `link`/`route`.
- [ss(8) — man7.org](https://man7.org/linux/man-pages/man8/ss.8.html) — cờ `-t`/`-u`/`-l`/`-n`/
  `-p`/`-s`.
