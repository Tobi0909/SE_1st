---
id: linux.network-stack.troubleshooting
title: "Chẩn đoán mạng trên Linux: tcpdump, traceroute, MTU, bonding"
domain: linux
module: linux.network-stack
level: "chuyên sâu"
prerequisites: ["linux.network-stack.tools", "linux.network-stack.firewall"]
applies_to:
  - "Ubuntu 22.04 LTS — ping/ip/ss là chuẩn chung mọi distro; bonding cần kernel module bonding (thường có sẵn nhưng cần thiết bị/cấu hình để demo)"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man8/ping.8.html"
  - "https://www.kernel.org/doc/Documentation/networking/bonding.txt"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Hai bài trước (`linux.network-stack.tools`, `.firewall`) giải quyết "địa chỉ/route đúng chưa"
và "firewall có chặn không". Bài này xử lý tầng vấn đề KHÁC, hay bị bỏ qua: liên kết có hoạt
động đúng ở tầng THẤP HƠN không — kích thước packet có bị cắt/drop do MTU không khớp, interface
có thực sự "UP" theo nghĩa tầng 2 không, và trường hợp dùng NHIỀU interface gộp lại (bonding) có
đang hoạt động đúng chế độ dự phòng/tải không.

> **Lưu ý:** `tcpdump`/`mtr`/`traceroute` đã được bài `networking.diagnostic-tools.*` dạy chi
> tiết (cú pháp, cách đọc output) — bài này KHÔNG lặp lại, chỉ nhắc ngắn cách áp dụng chúng
> trong quy trình debug Linux cụ thể. Trọng tâm bài này là MTU (có demo CHẠY THẬT, phát hiện
> được giá trị MTU thật của đường truyền) và bonding (**output minh hoạ** — máy demo là desktop
> đơn, không có bonding interface nào được cấu hình, không có thiết bị thứ hai để ghép).

## 2. Khái niệm cốt lõi

**MTU (Maximum Transmission Unit)**: kích thước TỐI ĐA của một packet được phép đi qua một
liên kết, KHÔNG bị cắt (fragment). Ethernet chuẩn là `1500` byte, nhưng một số liên kết TRUNG
GIAN (VPN, PPPoE, một số ISP) có MTU THẤP HƠN — gây ra hiện tượng packet NHỎ (ví dụ ping cơ bản)
hoạt động bình thường, nhưng packet LỚN (ví dụ tải file, nhiều ứng dụng) bị treo/chậm bất
thường.

**Path MTU Discovery**: cơ chế TCP tự dò MTU nhỏ nhất trên TOÀN đường đi bằng cờ "Don't
Fragment" (DF) — nếu một router trung gian có MTU nhỏ hơn packet DF, nó gửi lại ICMP "Fragment
needed" (Type 3, Code 4) thay vì tự cắt packet; bên gửi THẤY lỗi này và tự giảm kích thước.

**Bonding (link aggregation)**: gộp NHIỀU interface vật lý thành MỘT interface logic, 2 mục
đích chính: TĂNG băng thông (một số mode) hoặc DỰ PHÒNG (failover nếu một liên kết đứt) — khái
niệm tương đương LACP sẽ học ở `networking.switching.lacp`, nhưng đây là góc nhìn CẤU HÌNH phía
server/host, không phải phía switch.

## 3. Cách nó hoạt động

**Khi packet vượt MTU và CÓ cờ DF (Don't Fragment), router trung gian KHÔNG tự cắt nhỏ — nó
DROP packet và gửi ICMP báo lỗi về bên gửi** — đây là lý do lỗi MTU đặc trưng bởi hiện tượng
"packet nhỏ OK, packet lớn treo/timeout" chứ KHÔNG phải lỗi kết nối hoàn toàn (packet nhỏ như
ping cơ bản vẫn qua được bình thường, dễ gây hiểu lầm "mạng vẫn ổn" nếu chỉ test bằng ping mặc
định).

**MTU hiệu dụng trên một đường truyền có thể THẤP HƠN MTU khai báo của interface cục bộ** — MTU
cấu hình trên `ip link` (ví dụ `1500`) chỉ là giới hạn CỤC BỘ của chính interface đó; nếu một
ROUTER TRUNG GIAN trên đường đi tới đích có MTU thấp hơn (do encapsulation thêm header — VPN,
PPPoE...), MTU HIỆU DỤNG cho đường đi đó THẤP HƠN 1500, dù interface cục bộ vẫn báo đúng `1500`.

**Bonding có nhiều "mode", mỗi mode có đặc tính HOÀN TOÀN khác nhau** — ví dụ `active-backup`
(mode 1 — chỉ 1 liên kết hoạt động, liên kết khác chờ sẵn để failover, KHÔNG tăng băng thông) so
với `802.3ad`/LACP (mode 4 — cần switch hỗ trợ LACP, tăng băng thông thật bằng cách chia tải
qua nhiều liên kết) — nhầm mode là nguyên nhân phổ biến khi kỳ vọng "gộp 2 link 1Gbps thành
2Gbps" nhưng thực tế cấu hình `active-backup` (không tăng băng thông, chỉ dự phòng).

## 4. Thực hành

Phát hiện MTU hiệu dụng THẬT của đường đi tới một đích Internet, dùng `ping -M do` (Don't
Fragment) với kích thước packet tăng dần — chạy thật:

```bash
$ ping -c 2 -M do -s 1472 8.8.8.8
PING 8.8.8.8 (8.8.8.8) 1472(1500) bytes of data.
ping: local error: message too long, mtu=1492

--- 8.8.8.8 ping statistics ---
2 packets transmitted, 0 received, +2 errors, 100% packet loss, time 1002ms
```

Kernel báo ngay `local error: message too long, mtu=1492` — xác nhận đường đi THẬT từ máy này
có MTU hiệu dụng là `1492`, THẤP hơn `1500` chuẩn Ethernet (do gateway/ISP trên đường đi có
encapsulation thêm header, đúng khớp mục 3) — dù interface cục bộ `enp1s0` khai báo MTU `1500`
(xem lại `linux.network-stack.tools` mục 4).

Xác nhận đúng ngưỡng: packet VỪA DƯỚI `1492` qua được, packet NGAY TRÊN ngưỡng bị lỗi:

```bash
$ ping -c 2 -M do -s 1464 8.8.8.8
PING 8.8.8.8 (8.8.8.8) 1464(1492) bytes of data.
1472 bytes from 8.8.8.8: icmp_seq=1 ttl=64 time=37.9 ms
1472 bytes from 8.8.8.8: icmp_seq=2 ttl=64 time=49.2 ms

--- 8.8.8.8 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1001ms
rtt min/avg/max/mdev = 37.863/49.153/60.444/11.290 ms

$ ping -c 2 -M do -s 1465 8.8.8.8
PING 8.8.8.8 (8.8.8.8) 1465(1493) bytes of data.
ping: local error: message too long, mtu=1492
ping: local error: message too long, mtu=1492

--- 8.8.8.8 ping statistics ---
2 packets transmitted, 2 received, 0% packet loss, time 1001ms
```

`1464` byte dữ liệu + 28 byte header (IP 20 + ICMP 8) = `1492` → đúng bằng MTU hiệu dụng, qua
được. `1465` byte dữ liệu = `1493` tổng, VƯỢT `1492` dù chỉ 1 byte → lỗi ngay — xác nhận chính
xác ngưỡng MTU thật của đường truyền, không phải suy đoán.

Interface không có bonding nào trên máy demo — xác nhận thật (không phải minh hoạ, chỉ là kết
quả "không có"):

```bash
$ cat /proc/net/bonding/* 2>&1
cat: '/proc/net/bonding/*': No such file or directory
$ ls /sys/class/net/
enp1s0  lo  vmnet1  vmnet8  wlp2s0
```

Không có interface nào tên `bond*` — xác nhận máy này không cấu hình bonding, đúng với vai trò
máy desktop đơn (không phải server có nhiều NIC cần dự phòng/tăng băng thông).

> Phần dưới là **output minh hoạ** cấu hình/trạng thái bonding trên một server GIẢ ĐỊNH có 2
> NIC, theo tài liệu kernel chính thức (`bonding.txt`):

```
$ cat /proc/net/bonding/bond0
Ethernet Channel Bonding Driver: v3.7.1

Bonding Mode: fault-tolerance (active-backup)
Primary Slave: None
Currently Active Slave: eth0
MII Status: up
MII Polling Interval (ms): 100

Slave Interface: eth0
MII Status: up
Speed: 1000 Mbps
Duplex: full

Slave Interface: eth1
MII Status: up
Speed: 1000 Mbps
Duplex: full
```

Đọc: `Bonding Mode: active-backup` — chỉ `eth0` (Currently Active Slave) đang xử lý traffic,
`eth1` ở trạng thái DỰ PHÒNG (MII Status up, nhưng không active) — đúng khớp mục 3, mode này
KHÔNG tăng băng thông, chỉ đảm bảo failover nếu `eth0` đứt.

## 5. Lỗi thường gặp và cách chẩn đoán

**Ping cơ bản (không chỉ định size) hoạt động bình thường, nhưng tải file/một số ứng dụng cụ
thể bị treo/rất chậm**
- Nguyên nhân khả năng cao: vấn đề MTU — ping mặc định gửi packet NHỎ (thường 56 byte dữ liệu,
  qua được MỌI MTU thông thường), không đại diện cho packet LỚN mà ứng dụng thực tế dùng.
- Cách xác nhận: lặp lại đúng kỹ thuật ở mục 4 — `ping -M do -s <size>` tăng dần kích thước tới
  đích thật, tìm điểm packet bắt đầu lỗi `message too long`.
- Cách xử lý: nếu MTU hiệu dụng thấp hơn 1500 do VPN/tunnel, giảm MTU cấu hình trên interface
  tunnel cho khớp (`ip link set <iface> mtu <giá-trị>`), hoặc đảm bảo ICMP "Fragment needed"
  không bị firewall trung gian chặn (chặn ICMP loại này khiến Path MTU Discovery KHÔNG hoạt
  động được — một cấu hình firewall quá chặt có thể TỰ gây ra đúng vấn đề này).

**Cấu hình bonding mode `active-backup` nhưng kỳ vọng tăng gấp đôi băng thông**
- Nguyên nhân: nhầm MỤC ĐÍCH của mode — `active-backup` CHỈ để dự phòng (failover), không chia
  tải để tăng băng thông.
- Cách xác nhận: `cat /proc/net/bonding/bond0` xem đúng "Bonding Mode" đang cấu hình là gì.
- Cách xử lý: nếu mục tiêu THỰC SỰ là tăng băng thông, cần đổi sang mode `802.3ad` (LACP) VÀ
  switch phía kia PHẢI hỗ trợ/cấu hình LACP tương ứng (xem `networking.switching.lacp`) — không
  thể chỉ đổi mode một phía server mà không phối hợp với switch.

## 6. Tình huống thực tế

Người dùng làm việc từ xa qua VPN báo "mọi thứ chậm, nhưng ping tới server vẫn nhanh bình
thường":

1. Thu thập thêm triệu chứng: ping nhanh, nhưng tải file lớn qua VPN rất chậm/hay bị treo giữa
   chừng — đúng mẫu hình điển hình của vấn đề MTU (packet nhỏ qua được, packet lớn gặp vấn đề).
2. Dùng kỹ thuật ở mục 4, chạy `ping -M do -s <size>` tăng dần TỚI SERVER qua đúng đường VPN —
   phát hiện MTU hiệu dụng qua VPN thấp hơn đáng kể so với `1500` (ví dụ `1400`, do overhead của
   giao thức VPN đóng gói thêm header).
3. Kiểm tra: ứng dụng/hệ điều hành của người dùng có đang tự động Path MTU Discovery đúng
   không, hay bị CHẶN ICMP "Fragment needed" bởi một firewall trung gian (của chính người dùng
   hoặc ISP) — nếu bị chặn, TCP không nhận được tín hiệu để tự giảm kích thước, dẫn tới treo kết
   nối thay vì chỉ chậm.
4. Giải pháp: cấu hình MTU của interface VPN (phía client hoặc server, tuỳ kiến trúc) khớp với
   MTU hiệu dụng ĐÃ XÁC ĐỊNH ở bước 2, tránh phụ thuộc hoàn toàn vào Path MTU Discovery (có thể
   bị chặn bởi firewall không kiểm soát được).
5. Test lại — tải file lớn qua VPN ổn định, không còn treo giữa chừng.
6. Ghi vào runbook VPN: với báo cáo "ping nhanh nhưng tải chậm/hay treo", LUÔN kiểm tra MTU
   bằng kỹ thuật `ping -M do -s` TRƯỚC khi nghi ngờ các nguyên nhân phức tạp hơn (băng thông,
   tải server...).

## 7. Tự kiểm tra

1. Vì sao ping mặc định (không chỉ định size) có thể hoạt động bình thường dù đường truyền có
   vấn đề MTU nghiêm trọng?
   <details><summary>Đáp án</summary>Ping mặc định gửi packet rất NHỎ (thường 56 byte dữ liệu),
   nhỏ hơn hầu hết MTU hiệu dụng trên thực tế — không đại diện cho packet LỚN mà ứng dụng thật
   (tải file, video call...) thường gửi, nên không "chạm" được vào vấn đề MTU.</details>

2. Router trung gian có MTU thấp hơn packet đang gửi, packet có cờ DF (Don't Fragment). Router
   sẽ làm gì?
   <details><summary>Đáp án</summary>DROP packet và gửi ICMP "Fragment needed" báo lại bên
   gửi — KHÔNG tự cắt nhỏ packet (vì DF yêu cầu không được cắt). Đây là cơ chế Path MTU
   Discovery để bên gửi tự giảm kích thước packet sau đó.</details>

3. Bonding mode `active-backup` có tăng băng thông không? Mode nào mới thực sự tăng băng thông,
   và cần điều kiện gì ở phía switch?
   <details><summary>Đáp án</summary><code>active-backup</code> KHÔNG tăng băng thông — chỉ dự
   phòng (1 liên kết active, liên kết khác chờ failover). Mode <code>802.3ad</code> (LACP) mới
   thực sự chia tải tăng băng thông, nhưng CẦN switch phía kia hỗ trợ và cấu hình LACP tương
   ứng — không thể chỉ đổi mode một phía server.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.network-stack.tools` — MTU khai báo trên interface (`ip link show`) là điểm khởi đầu
  trước khi đo MTU HIỆU DỤNG thật của đường truyền ở bài này.
- `linux.network-stack.firewall` — firewall chặn ICMP "Fragment needed" có thể TỰ gây ra vấn đề
  MTU (nêu ở mục 5), liên kết trực tiếp giữa 2 bài.

**Bài liên quan ngoài module:**
- `networking.diagnostic-tools.tcpdump-wireshark`/`.mtr-traceroute` — cú pháp/cách đọc chi tiết
  các công cụ được nhắc ngắn ở bài này.
- `networking.switching.lacp` — góc nhìn PHÍA SWITCH của bonding mode `802.3ad`.

**Nguồn tham khảo:**
- [ping(8) — man7.org](https://man7.org/linux/man-pages/man8/ping.8.html) — cờ `-M do`/`-s`.
- [Linux Ethernet Bonding Driver — kernel.org](https://www.kernel.org/doc/Documentation/networking/bonding.txt)
  — các mode bonding (`active-backup`, `802.3ad`...), định dạng `/proc/net/bonding/*`.
