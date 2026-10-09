---
id: networking.diagnostic-tools.tcpdump-wireshark
title: "Bắt và đọc gói tin: tcpdump, Wireshark cơ bản"
domain: networking
module: networking.diagnostic-tools
level: "vận hành"
prerequisites: ["networking.tcpip.tcp-udp"]
applies_to:
  - "tcpdump (libpcap), Wireshark — chuẩn chung mọi distro Linux"
status: verified
sources:
  - "https://www.tcpdump.org/manpages/tcpdump.1.html"
  - "https://www.wireshark.org/docs/wsug_html_chunked/"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** bắt gói tin (packet capture) cần quyền root hoặc capability
> `CAP_NET_RAW` trên interface — môi trường viết bài này không có quyền này (xác nhận thật:
> `tcpdump -i lo` trả lỗi "Operation not permitted" khi thử, không phải giả định). Toàn bộ
> output capture trong bài đánh dấu **output minh hoạ**, lấy cú pháp từ tài liệu chính thức
> (`tcpdump.org`) và cấu trúc gói tin TCP/IP chuẩn đã học ở các bài trước — PHẢI tự kiểm chứng
> trên máy có quyền phù hợp trước khi dùng thật.

## 1. Vì sao cần biết

`ss` (bài trước) cho biết "có kết nối hay không", nhưng không cho biết GÌ được trao đổi trong
kết nối đó. Khi ứng dụng báo lỗi mơ hồ ("timeout", "connection reset") mà log ứng dụng không
đủ chi tiết, bắt gói tin (`tcpdump`) là cách DUY NHẤT thấy được CHÍNH XÁC điều gì xảy ra ở tầng
mạng — gói nào được gửi, gói nào không có phản hồi, ai gửi RST trước. Đây là kỹ năng "nhìn tận
gốc" khi mọi lớp trừu tượng cao hơn (log ứng dụng, metric) không đủ thông tin.

## 2. Khái niệm cốt lõi

`tcpdump` bắt gói tin TRỰC TIẾP từ một network interface, lọc theo điều kiện (BPF — Berkeley
Packet Filter), in ra dạng text (hoặc lưu file `.pcap` để phân tích sau bằng Wireshark — giao
diện đồ hoạ cho CÙNG dữ liệu).

```
tcpdump -i <interface> [-n] [-c <số gói>] [-w <file>] [filter expression]
```

| Cờ | Ý nghĩa |
|---|---|
| `-i` | Interface để bắt (`any` = mọi interface) |
| `-n` | Không resolve tên domain/service — tránh traffic DNS "lẫn" vào kết quả |
| `-c` | Dừng sau N gói |
| `-w` | Lưu ra file `.pcap` (đọc lại bằng `-r` hoặc mở bằng Wireshark) |

Filter expression phổ biến: `host <ip>`, `port <n>`, `tcp`/`udp`, kết hợp bằng `and`/`or`/`not`.

## 3. Cách nó hoạt động

**Cần quyền root/`CAP_NET_RAW` vì bắt gói đọc được MỌI traffic qua interface, không chỉ traffic
của chính user đó** — đây là giới hạn bảo mật CHỦ Ý của kernel: nếu user thường tự do bắt gói,
họ có thể đọc được traffic của NGƯỜI KHÁC trên cùng máy/mạng (bao gồm thông tin nhạy cảm nếu
không mã hoá) — đặc quyền này chỉ cấp cho root hoặc qua `setcap cap_net_raw+ep` cho một binary
cụ thể (cách Wireshark thường dùng để cho phép user thường chạy capture mà không cần `sudo`
toàn bộ giao diện).

**BPF filter được áp dụng NGAY TRONG KERNEL, trước khi gói tin tới được chương trình** — đây
là lý do `tcpdump host 1.2.3.4` hiệu quả hơn nhiều so với bắt TẤT CẢ rồi tự lọc bằng `grep`:
kernel LOẠI BỎ gói không khớp filter trước khi copy dữ liệu lên user-space, giảm tải CPU/
I/O đáng kể trên interface có traffic lớn — khác biệt rõ rệt khi debug trên server production
đang chịu tải cao, nơi bắt TOÀN BỘ traffic (không filter) có thể tự nó gây thêm tải đáng kể.

**File `.pcap` là một "ngôn ngữ chung"** — `tcpdump -w` ghi ra ĐÚNG định dạng mà Wireshark (và
nhiều công cụ khác: tshark, Zeek...) đọc được — bắt gói trên server KHÔNG CÓ GUI (qua SSH),
copy file `.pcap` về máy cá nhân, mở bằng Wireshark để phân tích TRỰC QUAN (xem từng gói, follow
TCP stream, lọc nâng cao) là quy trình RẤT PHỔ BIẾN trong vận hành thực tế, không cần cài
Wireshark trên server.

## 4. Thực hành (output minh hoạ theo tài liệu chính thức, CHƯA tự chạy thật trên máy)

Bắt gói TCP tới/từ một host cụ thể, in ra dạng text ngắn gọn:

```bash
$ sudo tcpdump -n -i eth0 host 192.0.2.1 and port 443
tcpdump: verbose output suppressed, use -v for full protocol decode
listening on eth0, link-type EN10MB (Ethernet), snapshot length 262144 bytes
12:34:56.123456 IP 10.0.0.5.52341 > 192.0.2.1.443: Flags [S], seq 1234567890, win 64240, length 0
12:34:56.145678 IP 192.0.2.1.443 > 10.0.0.5.52341: Flags [S.], seq 987654321, ack 1234567891, win 65160, length 0
12:34:56.145789 IP 10.0.0.5.52341 > 192.0.2.1.443: Flags [.], ack 987654322, win 64240, length 0
```

Đọc đúng 3-way handshake đã học ở bài `networking.tcpip.tcp-udp` BẰNG DỮ LIỆU GÓI TIN THẬT:
`Flags [S]` (SYN) → `Flags [S.]` (SYN-ACK, dấu `.` nghĩa là có kèm ACK) → `Flags [.]` (ACK thuần, không còn cờ SYN) —
đây chính xác là 3 bước đã học, giờ NHÌN THẤY TRỰC TIẾP qua từng gói, không chỉ lý thuyết.

Lưu ra file để phân tích bằng Wireshark sau:

```bash
$ sudo tcpdump -i eth0 -w /tmp/capture.pcap -c 1000 host 192.0.2.1
```

Đọc lại file đã lưu (không cần quyền root — đọc file không cần capture trực tiếp):

```bash
$ tcpdump -n -r /tmp/capture.pcap -c 5
```

Filter nâng cao — chỉ bắt gói SYN (bước đầu handshake, hữu ích để đếm số lần CONNECT THỬ, phân
biệt với traffic trên một kết nối ĐÃ thiết lập):

```bash
$ sudo tcpdump -n 'tcp[tcpflags] & tcp-syn != 0 and tcp[tcpflags] & tcp-ack == 0'
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Chạy `tcpdump` không filter trên server production có traffic lớn, gây tải thêm đáng kể**
- Nguyên nhân: bắt TOÀN BỘ gói (không filter) khiến kernel phải copy MỌI gói lên user-space để
  `tcpdump` xử lý/in ra — với interface 10Gbps traffic cao, điều này có thể tự nó gây tải CPU/
  I/O đáng kể, làm trầm trọng thêm vấn đề đang điều tra.
- Cách xác nhận: theo dõi CPU usage của chính process `tcpdump` và tải hệ thống tăng ngay sau
  khi bắt đầu capture không filter.
- Cách xử lý: LUÔN filter CHÍNH XÁC (host/port cụ thể) trước khi chạy trên production, đặc
  biệt với traffic lớn — BPF filter áp dụng trong kernel (mục 3) giảm tải đáng kể so với bắt
  hết rồi lọc sau.

**`tcpdump: permission denied` dù đã `sudo`**
- Nguyên nhân phổ biến: SELinux/AppArmor (đã học ở module `linux.users-permissions`) chặn thêm
  một lớp MAC riêng, ngoài permission DAC thông thường mà `sudo` cấp.
- Cách xác nhận: kiểm tra log MAC (`ausearch -m avc`/AppArmor log) xem có deny nào liên quan
  `tcpdump`/capability `net_raw` không.
- Cách xử lý: sửa policy MAC tương ứng (hoặc dùng chế độ permissive/complain tạm để xác nhận
  đúng nguyên nhân trước khi sửa policy chính thức).

**Capture xong một file `.pcap` lớn, Wireshark mở rất chậm hoặc treo**
- Nguyên nhân: file quá lớn (capture lâu, không filter, hoặc không giới hạn `-c`) — Wireshark
  tải TOÀN BỘ file vào RAM để phân tích, không phù hợp với file hàng GB.
- Cách xác nhận: kích thước file `.pcap` (vài trăm MB tới GB là dấu hiệu rõ).
- Cách xử lý: luôn giới hạn `-c <số gói>` hoặc dùng filter hẹp khi capture; nếu đã có file lớn,
  dùng `tcpdump -r <file lớn> -w <file nhỏ> <filter thêm>` để tách ra phần cần phân tích trước
  khi mở bằng Wireshark.

## 6. Tình huống thực tế

Một ứng dụng báo lỗi "connection reset by peer" ngẫu nhiên khi gọi một API bên thứ ba, log ứng
dụng không có thêm chi tiết.

1. `ss -tn | grep <ip-api-thứ-ba>` xác nhận có kết nối tới đúng IP/port mong đợi — loại trừ vấn
   đề DNS/routing cơ bản (đã học ở bài trước trong module).
2. Chạy `tcpdump -n -i eth0 host <ip-api> and port 443 -w /tmp/api_issue.pcap` TRONG LÚC lỗi
   tái diễn (hoặc theo lịch nếu lỗi xảy ra định kỳ), limit thời gian capture hợp lý để tránh
   file quá lớn (mục 5).
3. Copy file `.pcap` về máy cá nhân, mở bằng Wireshark, dùng tính năng "Follow TCP Stream" để
   xem TOÀN BỘ cuộc trò chuyện của một kết nối cụ thể theo đúng thứ tự.
4. Phát hiện: ngay TRƯỚC gói RST, có một gói từ PHÍA SERVER BÊN THỨ BA với kích thước payload
   LỚN BẤT THƯỜNG, gần giới hạn MTU — nghi ngờ vấn đề fragmentation hoặc giới hạn kích thước
   request mà server bên thứ ba áp dụng.
5. Xác nhận giả thuyết: kiểm tra tài liệu API bên thứ ba, tìm thấy giới hạn kích thước payload
   request mà ứng dụng đôi khi vượt qua trong một số trường hợp cụ thể (dữ liệu lớn bất
   thường) — server họ RESET kết nối khi vượt giới hạn, không trả lỗi HTTP rõ ràng.
6. Sửa ứng dụng để giới hạn/chia nhỏ payload trước khi gửi, theo đúng tài liệu API. Ghi vào
   runbook: khi log ứng dụng không đủ chi tiết cho lỗi tầng mạng, bắt gói kèm "Follow Stream"
   trên Wireshark THƯỜNG tiết lộ nguyên nhân mà log tầng cao không bao giờ ghi lại được.

## 7. Tự kiểm tra

1. Vì sao bắt gói tin cần quyền root/`CAP_NET_RAW`, trong khi xem thông tin socket bằng `ss`
   (bài trước) không cần?
   <details><summary>Đáp án</summary><code>ss</code> chỉ đọc thông tin SOCKET CỦA CHÍNH quyền
   user hiện tại (hoặc cần sudo để xem đủ của user khác). Bắt gói tin đọc được MỌI traffic qua
   interface, kể cả của người/process khác — đây là đặc quyền nhạy cảm hơn nhiều, kernel giới
   hạn chỉ cho root/capability đặc biệt.</details>

2. Vì sao filter BPF (ví dụ `host 1.2.3.4`) hiệu quả hơn việc bắt hết rồi dùng `grep` lọc lại?
   <details><summary>Đáp án</summary>Filter BPF được áp dụng NGAY TRONG KERNEL, loại bỏ gói
   không khớp TRƯỚC KHI copy lên user-space — giảm tải CPU/I/O đáng kể so với copy TOÀN BỘ gói
   lên rồi mới lọc bằng công cụ ở user-space như <code>grep</code>.</details>

3. Trong output `tcpdump`, bạn thấy `Flags [S]` rồi `Flags [S.]` rồi `Flags [.]` giữa 2 địa
   chỉ. Đây tương ứng với bước nào đã học ở bài TCP?
   <details><summary>Đáp án</summary>Đúng 3-way handshake: <code>[S]</code> = SYN,
   <code>[S.]</code> = SYN-ACK (dấu <code>.</code> là ACK kèm theo), <code>[.]</code> (ACK thuần, không còn SYN) =
   ACK cuối — khớp chính xác 3 bước thiết lập kết nối TCP đã học ở bài
   <code>networking.tcpip.tcp-udp</code>.</details>

4. Vì sao nên LUÔN giới hạn `-c <số gói>` hoặc dùng filter hẹp khi capture trên server
   production, thay vì bắt không giới hạn?
   <details><summary>Đáp án</summary>Bắt không giới hạn trên traffic lớn có thể tự nó gây tải
   CPU/I/O đáng kể (copy mọi gói lên user-space), làm trầm trọng thêm vấn đề đang điều tra; file
   kết quả cũng dễ quá lớn khiến Wireshark/công cụ phân tích xử lý chậm hoặc treo.</details>

5. Vì sao bắt gói trên server qua SSH (không GUI) rồi phân tích bằng Wireshark trên máy cá
   nhân là quy trình phổ biến, thay vì cài Wireshark trực tiếp trên server?
   <details><summary>Đáp án</summary><code>tcpdump -w</code> ghi ra file <code>.pcap</code> —
   định dạng chuẩn mà Wireshark đọc được trực tiếp. Server production thường không có GUI/
   không nên cài thêm phần mềm nặng; tách việc BẮT (tcpdump, nhẹ, dòng lệnh) khỏi việc PHÂN
   TÍCH (Wireshark, cần giao diện trực quan) là cách làm gọn và an toàn hơn.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.diagnostic-tools.ss-netstat` — bước đầu xác nhận có kết nối trước khi cần bắt
  gói chi tiết.

**Bài liên quan ngoài module:**
- `networking.tcpip.tcp-udp` — nền tảng 3-way handshake, flags TCP mà bài này đọc trực tiếp
  từ gói tin thật.

**Nguồn tham khảo:**
- [tcpdump(1) — tcpdump.org](https://www.tcpdump.org/manpages/tcpdump.1.html) — cú pháp đầy
  đủ, filter expression, các cờ chính thức.
- [Wireshark User's Guide](https://www.wireshark.org/docs/wsug_html_chunked/) — tài liệu chính
  thức, bao gồm tính năng "Follow TCP Stream".
