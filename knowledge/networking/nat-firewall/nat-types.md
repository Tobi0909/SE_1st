---
id: networking.nat-firewall.nat-types
title: "NAT: static, dynamic, PAT/masquerade"
domain: networking
module: networking.nat-firewall
level: "vận hành"
prerequisites: ["networking.tcpip.ipv4-subnetting"]
applies_to:
  - "Linux netfilter (iptables/nftables) — NAT khái niệm chung mọi hệ thống mạng"
status: draft
sources:
  - "https://www.netfilter.org/documentation/HOWTO/NAT-HOWTO.txt"
  - "https://man7.org/linux/man-pages/man8/iptables.8.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** cấu hình NAT thật (iptables/nftables) cần quyền root — máy
> viết bài không có sudo không-mật-khẩu (xác nhận thật: `iptables -L` báo "Permission denied
> (you must be root)"). Lệnh THAY ĐỔI rule (thêm NAT) đánh dấu **output minh hoạ** theo tài
> liệu chính thức netfilter.org. Lệnh ĐỌC cấu hình kernel hiện tại (`/proc/sys/net/...`) chạy
> thật, không cần root.

## 1. Vì sao cần biết

Hầu hết mạng nội bộ (nhà, văn phòng, datacenter) dùng địa chỉ IP PRIVATE (`192.168.x.x`,
`10.x.x.x` — đã học ở bài `networking.tcpip.ipv4-subnetting`), nhưng Internet chỉ định tuyến
được bằng IP PUBLIC. NAT (Network Address Translation) là cầu nối giữa hai thế giới này — mọi
máy trong nhà bạn ra Internet qua "một" IP public của router. Hiểu đúng CÁC LOẠI NAT khác nhau
giúp chẩn đoán đúng khi "máy A truy cập được Internet nhưng không ai từ ngoài truy cập được
VÀO máy A" — đây không phải lỗi, mà là hệ quả THIẾT KẾ của loại NAT phổ biến nhất.

## 2. Khái niệm cốt lõi

| Loại NAT | Ánh xạ | Dùng khi |
|---|---|---|
| Static NAT | 1 IP private ↔ 1 IP public CỐ ĐỊNH | Server cần truy cập được từ ngoài qua đúng 1 IP |
| Dynamic NAT | 1 IP private ↔ 1 IP public, chọn từ một POOL | Có nhiều IP public, không cần cố định ai dùng IP nào |
| PAT (Port Address Translation) / Masquerade | NHIỀU IP private ↔ 1 IP public (phân biệt bằng PORT) | Phổ biến NHẤT — toàn bộ mạng nhà/văn phòng ra Internet qua 1 IP |

Theo đúng thuật ngữ netfilter (Linux), còn phân biệt theo CHIỀU dịch:

- **SNAT (Source NAT)**: đổi địa chỉ NGUỒN — dùng khi traffic đi RA (máy nội bộ → Internet).
- **DNAT (Destination NAT)**: đổi địa chỉ ĐÍCH — dùng khi traffic đi VÀO (Internet → server nội
  bộ, "port forwarding" là một dạng DNAT phổ biến).
- **MASQUERADE**: một dạng ĐẶC BIỆT của SNAT, dùng khi IP public KHÔNG CỐ ĐỊNH (ví dụ IP động từ
  ISP) — tự động lấy IP hiện tại của interface, không cần khai báo cứng.

## 3. Cách nó hoạt động

**PAT/Masquerade giải quyết đúng vấn đề "thiếu địa chỉ IPv4"** — đã nhắc tới ở bài
`networking.tcpip.ipv6-basics`: hàng trăm triệu thiết bị không thể mỗi cái có một IP public
riêng (không đủ IPv4). PAT cho phép NHIỀU thiết bị dùng CHUNG một IP public, phân biệt bằng
CỔNG (port) — router nhớ "port nguồn X trên IP public này tương ứng với máy nội bộ Y, port Z" —
bảng ánh xạ này gọi là CONNECTION TRACKING (conntrack), và CHÍNH BẢNG NÀY là lý do PAT chỉ hoạt
động cho traffic BẮT ĐẦU TỪ BÊN TRONG: không có traffic đi ra trước, không có entry trong bảng
để biết traffic đi vào thuộc về máy nội bộ nào.

**Đây chính là lý do "NAT một chiều" — máy sau NAT ra Internet được, nhưng không ai từ ngoài
chủ động kết nối VÀO được**: với PAT/Masquerade thông thường, không có ánh xạ CỐ ĐỊNH nào từ
IP:port public tới một máy nội bộ cụ thể — router/firewall KHÔNG BIẾT phải chuyển một kết nối
ĐẾN (không có trong bảng conntrack) cho máy nội bộ nào, nên MẶC ĐỊNH drop. Đây KHÔNG phải lỗi
cấu hình — đây CHÍNH LÀ cách PAT hoạt động, và cũng là lý do PAT được coi là một lớp bảo vệ tự
nhiên (dù không phải thiết kế CHÍNH cho mục đích bảo mật).

**Muốn "ai đó từ ngoài kết nối VÀO" một máy sau NAT — cần DNAT/port forwarding tường minh**:
admin phải CHỦ ĐỘNG tạo một rule DNAT, ví dụ "mọi traffic tới IP public, port 8080 → chuyển
tới máy nội bộ 192.168.1.50, port 80" — đây là cách games server, web server tự host, hay SSH
vào máy ở nhà từ xa hoạt động được qua NAT. Không có rule này, traffic đến port đó đơn giản bị
drop vì không có conntrack entry tương ứng (như giải thích ở trên) và không có DNAT rule tĩnh
nào thay thế.

## 4. Thực hành

Kiểm tra máy CÓ ĐANG làm NAT/router (forward traffic giữa 2 mạng) hay không — đọc kernel
setting, chạy thật, không cần root:

```bash
$ cat /proc/sys/net/ipv4/ip_forward
0
```

`0` xác nhận: máy này KHÔNG forward traffic giữa các interface (không đóng vai trò router/NAT
gateway cho máy khác) — đây là giá trị mặc định ĐÚNG cho một máy desktop/laptop thông thường,
chỉ router/gateway chuyên dụng mới cần `1`.

Cấu hình MASQUERADE cho một gateway Linux chia sẻ Internet (ví dụ máy có 2 interface: `eth0`
ra Internet, `eth1` nối mạng nội bộ) — **output minh hoạ** theo cú pháp chính thức:

```bash
# Bật forward (bước BẮT BUỘC trước khi NAT có tác dụng gì)
$ echo 1 > /proc/sys/net/ipv4/ip_forward

# MASQUERADE: mọi traffic ra khỏi eth0 được "giả trang" thành IP của chính eth0
$ iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

Cấu hình DNAT (port forwarding) — cho phép truy cập từ ngoài vào một web server nội bộ:

```bash
$ iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 8080 -j DNAT --to-destination 192.168.1.50:80
```

Xem bảng NAT hiện tại (**output minh hoạ**, cần quyền root thật trên máy có NAT thật):

```bash
$ iptables -t nat -L -n -v
Chain POSTROUTING (policy ACCEPT 12 packets, 960 bytes)
 pkts bytes target      prot opt in     out     source       destination
   48  3840 MASQUERADE  all  --  *      eth0    0.0.0.0/0    0.0.0.0/0
```

(Cờ `-v` thêm cột `pkts`/`bytes` — số gói/byte đã khớp rule — và `in`/`out` — interface vào/ra
— so với `-L -n` không có `-v`, chỉ hiện `target/prot/opt/source/destination`.)

## 5. Lỗi thường gặp và cách chẩn đoán

**Bật MASQUERADE xong, máy nội bộ vẫn không ra Internet được**
- Nguyên nhân phổ biến nhất: quên bật `ip_forward` (mục 4) — NAT rule có đúng cũng vô dụng nếu
  kernel không forward packet giữa hai interface.
- Cách xác nhận: `cat /proc/sys/net/ipv4/ip_forward` trả `0`.
- Cách xử lý: `echo 1 > /proc/sys/net/ipv4/ip_forward` (tạm, mất khi reboot) hoặc set vĩnh viễn
  qua `/etc/sysctl.conf` (`net.ipv4.ip_forward=1`).

**Cấu hình DNAT port forwarding xong, vẫn không truy cập được từ ngoài**
- Nguyên nhân phổ biến: thiếu RULE FILTER (bảng `filter`, chain `FORWARD`) cho phép traffic đã
  DNAT đi qua — DNAT chỉ ĐỔI ĐỊA CHỈ ĐÍCH, không tự động "cho phép" traffic đó đi qua firewall;
  nếu chain `FORWARD` có policy `DROP` mặc định, traffic vẫn bị chặn SAU KHI đã NAT đúng.
- Cách xác nhận: traffic tới ĐÚNG địa chỉ nội bộ sau NAT (xác nhận bằng `tcpdump` trên interface
  nội bộ — bài `networking.diagnostic-tools.tcpdump-wireshark`) nhưng không có phản hồi.
- Cách xử lý: thêm rule `ACCEPT` tương ứng trong chain `FORWARD` cho traffic đã DNAT, không chỉ
  dựa vào rule NAT.

**Nhầm "PAT chặn kết nối đến" là một TÍNH NĂNG BẢO MẬT đáng tin cậy, bỏ qua firewall riêng**
- Nguyên nhân: PAT "tình cờ" chặn kết nối đến không mời (đúng hành vi mục 3), nhưng đây KHÔNG
  phải thiết kế CHÍNH cho bảo mật — một rule DNAT/port forwarding (dù chỉ 1 dòng) có thể MỞ
  TOÀN BỘ bảo vệ "tự nhiên" đó cho đúng port được forward.
- Cách xác nhận: kiểm tra TOÀN BỘ rule DNAT đang có, không chỉ tin "có NAT là an toàn".
- Cách xử lý: luôn có firewall riêng (bài tiếp theo trong module) kiểm soát CHÍNH XÁC traffic
  nào được phép, không dựa vào hiệu ứng phụ của NAT làm lớp bảo vệ duy nhất.

## 6. Tình huống thực tế

Team cần cho phép một đối tác bên ngoài truy cập một API nội bộ chạy trên server
`192.168.10.20:3000`, server này chỉ có IP private, gateway công ty có 1 IP public
`203.0.113.5`.

1. Xác nhận: không thể cho đối tác kết nối trực tiếp tới `192.168.10.20` (IP private, không
   định tuyến được từ Internet) — cần DNAT từ IP public của gateway.
2. Chọn port public để forward: `203.0.113.5:8443` (tránh dùng port chuẩn 443 vì gateway có
   thể đã dùng cho dịch vụ khác) → map tới `192.168.10.20:3000`.
3. Thêm rule DNAT trên gateway: `iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 8443 -j
   DNAT --to-destination 192.168.10.20:3000`.
4. Nhớ thêm rule FORWARD cho phép traffic này (bài học từ mục 5): `iptables -A FORWARD -p tcp
   -d 192.168.10.20 --dport 3000 -j ACCEPT`.
5. Test từ mạng ngoài: kết nối tới `203.0.113.5:8443` — xác nhận tới đúng API nội bộ.
6. Đánh giá bảo mật thêm: giới hạn rule DNAT/FORWARD chỉ cho phép ĐÚNG IP nguồn của đối tác
   (`-s <ip-đối-tác>`), không mở cho TOÀN BỘ Internet — port forwarding không giới hạn nguồn là
   rủi ro không cần thiết khi biết rõ ai cần truy cập.
7. Ghi vào runbook: mọi rule DNAT/port-forwarding PHẢI kèm rule FORWARD tương ứng VÀ giới hạn
   nguồn nếu biết trước đối tượng truy cập — không chỉ mở port rồi để mặc định `ACCEPT` cho mọi
   nguồn.

## 7. Tự kiểm tra

1. Một máy trong mạng nhà (IP private) có thể truy cập Google.com bình thường, nhưng không ai
   từ ngoài kết nối trực tiếp được vào máy đó. Đây có phải lỗi cấu hình không?
   <details><summary>Đáp án</summary>Không. Đây là hành vi THIẾT KẾ của PAT/Masquerade (loại
   NAT phổ biến nhất) — không có ánh xạ cố định cho kết nối ĐẾN, router không biết chuyển cho
   máy nội bộ nào nên mặc định drop, trừ khi có rule DNAT tường minh.</details>

2. Phân biệt SNAT và DNAT dựa trên CHIỀU của traffic.
   <details><summary>Đáp án</summary>SNAT đổi địa chỉ NGUỒN, dùng cho traffic đi RA (nội bộ →
   Internet). DNAT đổi địa chỉ ĐÍCH, dùng cho traffic đi VÀO (Internet → server nội bộ, ví dụ
   port forwarding).</details>

3. Vì sao MASQUERADE phù hợp hơn SNAT tĩnh khi IP public của gateway là IP ĐỘNG (do ISP cấp lại
   mỗi lần kết nối)?
   <details><summary>Đáp án</summary>MASQUERADE tự động lấy IP HIỆN TẠI của interface mỗi khi
   cần NAT, không cần khai báo cứng một IP cụ thể như SNAT tĩnh — phù hợp khi IP có thể đổi mà
   không cần sửa lại rule.</details>

4. Đã thêm đúng rule DNAT port forwarding nhưng vẫn không kết nối được từ ngoài. Nguyên nhân
   khả năng cao thứ hai (sau khi xác nhận DNAT rule đúng) là gì?
   <details><summary>Đáp án</summary>Thiếu rule ACCEPT trong chain FORWARD cho traffic đã được
   DNAT — DNAT chỉ đổi địa chỉ đích, không tự động cho phép traffic đó đi qua firewall nếu
   chain FORWARD có policy DROP mặc định.</details>

5. Vì sao không nên coi "PAT tự động chặn kết nối đến" là lớp bảo mật DUY NHẤT cần có cho một
   mạng nội bộ?
   <details><summary>Đáp án</summary>Vì đây chỉ là hiệu ứng PHỤ của cách PAT hoạt động, không
   phải thiết kế bảo mật chính thức — một rule DNAT/port-forwarding (có thể chỉ 1 dòng, thêm
   bởi bất kỳ ai có quyền) có thể mở toàn bộ bảo vệ đó cho đúng port được forward. Cần firewall
   riêng kiểm soát rõ ràng traffic nào được phép.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.nat-firewall.firewall-concepts` — kiểm soát traffic SAU khi đã NAT, bổ sung
  cho rule FORWARD đã nhắc ở bài này.

**Bài liên quan ngoài module:**
- `networking.tcpip.ipv4-subnetting` — khái niệm IP private, nền tảng cho lý do cần NAT.
- `networking.diagnostic-tools.tcpdump-wireshark` — xác nhận traffic THẬT đã NAT đúng chưa.

**Nguồn tham khảo:**
- [Netfilter NAT HOWTO](https://www.netfilter.org/documentation/HOWTO/NAT-HOWTO.txt) — đặc tả
  chính thức SNAT/DNAT/MASQUERADE.
- [iptables(8) — man7.org](https://man7.org/linux/man-pages/man8/iptables.8.html) — cú pháp
  bảng `nat`, các chain PREROUTING/POSTROUTING.
