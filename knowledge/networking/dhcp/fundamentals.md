---
id: networking.dhcp.fundamentals
title: "DHCP: DORA process, lease, relay"
domain: networking
module: networking.dhcp
level: "vận hành"
prerequisites: ["networking.tcpip.ipv4-subnetting"]
applies_to:
  - "DHCPv4 (RFC 2131/2132) — chuẩn chung; minh họa bằng ISC DHCP (dhcpd/dhclient) trên Linux"
status: draft
sources:
  - "https://www.rfc-editor.org/rfc/rfc2131"
  - "https://man7.org/linux/man-pages/man8/dhcpd.8.html"
  - "https://man7.org/linux/man-pages/man8/dhclient.8.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Trước khi có IP, một máy mới cắm vào mạng không biết gì cả — không IP, không gateway, không
DNS. DHCP giải quyết bài toán "con trứng và con gà" này bằng broadcast (không cần biết IP ai
trước). Phần lớn sự cố "máy không vào được mạng" ở văn phòng/datacenter nội bộ là do DHCP:
hết pool, lease xung đột, hoặc router không relay được DHCP qua VLAN khác. Hiểu đúng quy trình
DORA và vai trò relay giúp chẩn đoán nhanh thay vì đoán mò.

## 2. Khái niệm cốt lõi

- **DORA**: 4 bước trao đổi DHCP — **D**iscover (client hỏi "có DHCP server nào không") →
  **O**ffer (server đề xuất 1 IP) → **R**equest (client xác nhận muốn lấy IP đó) → **A**ck
  (server xác nhận, cấp chính thức).
- **Lease**: thời gian IP được cấp CÓ HẠN, không vĩnh viễn — client phải renew trước khi hết
  hạn, nếu không IP có thể bị cấp cho máy khác.
- **DHCP relay (relay agent)**: khi client và server không cùng broadcast domain (khác subnet/
  VLAN), cần 1 thiết bị (thường là router/switch L3) nghe broadcast DHCP và CHUYỂN TIẾP dạng
  unicast sang server ở subnet khác — nếu không có relay, broadcast DHCP không bao giờ vượt
  qua router.
- **Scope/pool**: dải IP mà server được phép cấp cho 1 subnet, cộng các option (gateway, DNS,
  domain...).

## 3. Cách nó hoạt động

**Toàn bộ DORA ban đầu dùng BROADCAST vì client chưa có IP.** Client gửi `DHCPDISCOVER` tới
địa chỉ broadcast `255.255.255.255` cổng UDP 67 (nguồn `0.0.0.0` cổng 68) — mọi server trong
cùng broadcast domain nhận được. Server(s) trả lời `DHCPOFFER` (unicast hoặc broadcast tuỳ
cấu hình) đề xuất 1 IP còn trống trong pool. Client CHƯA dùng IP đó ngay — nó gửi tiếp
`DHCPREQUEST` (vẫn broadcast, để MỌI server trong mạng — kể cả server không được chọn — biết
IP nào đã được nhận, tránh 2 server cùng offer trùng 1 IP) xác nhận muốn lấy đúng offer đó.
Server xác nhận lại bằng `DHCPACK` — tới đây client mới thực sự cấu hình IP.

**Lease có đồng hồ hết hạn, client tự renew âm thầm ở giữa vòng đời lease** (thường ở mốc
T1 = 50% lease time), KHÔNG chờ tới khi hết hạn mới làm lại toàn bộ DORA — renew chỉ cần 1
`DHCPREQUEST`/`DHCPACK` unicast trực tiếp tới server đã cấp, nhanh hơn nhiều so với DORA đầy đủ.
Chỉ khi renew thất bại (server không trả lời) tới gần hết lease, client mới quay lại
broadcast DISCOVER để tìm server khác.

**Relay chuyển broadcast thành unicast để vượt router.** Router/switch L3 chạy DHCP relay
lắng nghe broadcast DHCP trên subnet client, rồi gửi UNICAST gói đó tới địa chỉ IP của DHCP
server (có thể ở subnet/VLAN khác hẳn), kèm thêm trường `giaddr` (gateway IP address) để
server biết trả lời ngược lại đúng subnet nào — đây là lý do 1 DHCP server tập trung có thể
phục vụ nhiều VLAN mà không cần đặt 1 server riêng mỗi VLAN.

## 4. Thực hành

Dựng DHCP server + client THẬT bằng network namespace + veth pair + ISC DHCP (chạy được
trong container, cần `CAP_NET_ADMIN`; `isc-dhcp-server`/`isc-dhcp-client`/`tcpdump` cài qua
`apt-get`). Tạo cặp veth, 1 đầu ở host đóng vai server, 1 đầu trong namespace đóng vai client:

```bash
ip link add veth-dhcp type veth peer name veth-dhcp-c
ip netns add dhcpsrv
ip link set veth-dhcp-c netns dhcpsrv
ip addr add 192.168.77.1/24 dev veth-dhcp
ip link set veth-dhcp up
ip netns exec dhcpsrv ip link set veth-dhcp-c up
ip netns exec dhcpsrv ip link set lo up
```

Cấu hình `dhcpd.conf` tối giản và chạy server trên `veth-dhcp` (phía host = 192.168.77.1):

```bash
cat > dhcpd.conf <<'EOF'
default-lease-time 600;
max-lease-time 7200;
subnet 192.168.77.0 netmask 255.255.255.0 {
  range 192.168.77.100 192.168.77.110;
  option routers 192.168.77.1;
  option domain-name-servers 8.8.8.8;
}
EOF
touch dhcpd.leases
dhcpd -cf dhcpd.conf -lf dhcpd.leases -pf dhcpd.pid veth-dhcp
```

Chạy client THẬT trong namespace (`veth-dhcp-c` không có IP tĩnh, để `dhclient` tự xin):

```bash
$ ip netns exec dhcpsrv dhclient -v -lf client.leases -pf client.pid veth-dhcp-c
DHCPDISCOVER on veth-dhcp-c to 255.255.255.255 port 67 interval 3 (xid=0x44110a2e)
DHCPOFFER of 192.168.77.100 from 192.168.77.1
DHCPREQUEST for 192.168.77.100 on veth-dhcp-c to 255.255.255.255 port 67 (xid=0x2e0a1144)
DHCPACK of 192.168.77.100 from 192.168.77.1 (xid=0x44110a2e)
bound to 192.168.77.100 -- renewal in 258 seconds.
```

Đúng 4 dòng DORA như lý thuyết mục 3. Xác nhận IP đã được gán thật:

```bash
$ ip netns exec dhcpsrv ip addr show veth-dhcp-c
5: veth-dhcp-c@if6: <BROADCAST,MULTICAST,UP,LOWER_UP> ...
    inet 192.168.77.100/24 brd 192.168.77.255 scope global dynamic veth-dhcp-c
       valid_lft 599sec preferred_lft 599sec
```

Bắt gói thật bằng `tcpdump` trên phía server, lặp lại DORA (release rồi request lại) để xem
đúng 4 gói UDP 67/68:

```bash
$ tcpdump -i veth-dhcp -n -tttt port 67 or port 68
2026-10-07 01:26:00.932220 IP 0.0.0.0.68 > 255.255.255.255.67: BOOTP/DHCP, Request ...
2026-10-07 01:26:00.932375 IP 192.168.77.1.67 > 192.168.77.100.68: BOOTP/DHCP, Reply ...
2026-10-07 01:26:00.932482 IP 0.0.0.0.68 > 255.255.255.255.67: BOOTP/DHCP, Request ...
2026-10-07 01:26:00.932953 IP 192.168.77.1.67 > 192.168.77.100.68: BOOTP/DHCP, Reply ...
4 packets captured
```

(`tcpdump` nhận diện cả 4 gói DORA chỉ là "Request"/"Reply" ở mức BOOTP — muốn phân biệt rõ
DISCOVER/OFFER/REQUEST/ACK cần `-v` hoặc đọc trực tiếp log `dhclient -v` như ở trên.)

Server ghi lease thật vào file (`dhcpd.leases`):

```
lease 192.168.77.100 {
  starts 3 2026/10/07 01:26:00;
  ends 3 2026/10/07 01:36:00;
  binding state active;
  hardware ethernet 92:e7:08:69:bc:03;
}
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Máy mới cắm không lấy được IP, log client chỉ có `DHCPDISCOVER` lặp lại, không có `OFFER`**
- Nguyên nhân: không có DHCP server trong broadcast domain đó, hoặc pool đã hết IP, hoặc
  firewall/switch chặn UDP 67/68.
- Xác nhận: trên server, `tcpdump port 67 or port 68` xem có nhận được Discover không; kiểm
  tra scope/pool còn trống IP không.

**Một số máy nhận được IP, máy khác trong CÙNG VLAN thì không**
- Nguyên nhân: pool hết dải (nhiều lease active hơn số IP cấu hình), hoặc MAC bị chặn/
  reservation xung đột.
- Xác nhận: đếm số lease `active` trong `dhcpd.leases` so với kích thước range đã khai.

**Máy ở VLAN khác (qua router) không lấy được IP dù VLAN gốc bình thường**
- Nguyên nhân: router/switch L3 chưa cấu hình DHCP relay (`ip helper-address` kiểu Cisco),
  nên broadcast DHCP không bao giờ vượt khỏi VLAN đó để tới server.
- Xác nhận: `tcpdump` ngay trên server — nếu không thấy packet nào có `giaddr` khác 0 từ VLAN
  đó, nghĩa là relay chưa chuyển tiếp gì tới.

**2 DHCP server cùng cấp IP trong 1 mạng, gây xung đột IP (rogue DHCP)**
- Nguyên nhân: ai đó cắm thêm 1 router/AP có DHCP server bật sẵn vào mạng chung.
- Xác nhận: `tcpdump` thấy 2 nguồn IP khác nhau trả `DHCPOFFER` cho cùng 1 `DHCPDISCOVER`.
- Xử lý: tắt DHCP server lạ; với switch quản lý được, bật DHCP snooping để chặn OFFER từ port
  không tin cậy.

## 6. Tình huống thực tế

Phòng máy mới có 15 máy, DHCP server cấu hình pool 10 IP (`192.168.50.100`–`192.168.50.109`).
Buổi sáng, 5 máy cuối cùng cắm vào không lấy được IP.

1. Trên máy không lấy được IP: log hiển thị `DHCPDISCOVER` lặp lại nhiều lần, không có `DHCPOFFER` — xác nhận đã gửi đúng nhưng không có ai trả lời.
2. Trên server: kiểm tra `dhcpd.leases` — đủ 10 lease `active`, đúng bằng kích thước pool đã khai → server còn sống nhưng ĐÃ HẾT IP để cấp, không phải lỗi mạng.
3. Mở rộng tạm: sửa `range` trong `dhcpd.conf` thành dải lớn hơn (ví dụ đến `.120`), restart `dhcpd`.
4. 5 máy còn lại lấy IP ngay (DORA chạy lại bình thường). Ghi runbook: pool DHCP phải có margin dự phòng (ví dụ +30-50% so với số máy dự kiến), và giảm lease time ở mạng nhiều máy vãng lai để IP cũ giải phóng nhanh hơn khi máy rời mạng.

## 7. Tự kiểm tra

1. Vì sao `DHCPDISCOVER` phải gửi broadcast, không thể unicast?
   <details><summary>Đáp án</summary>Vì client chưa có IP và chưa biết IP của DHCP server — broadcast là cách duy nhất để "hỏi cả mạng" khi chưa biết địa chỉ ai.</details>

2. Vì sao `DHCPREQUEST` (bước xác nhận offer) vẫn gửi broadcast dù client đã biết IP server đề xuất?
   <details><summary>Đáp án</summary>Để MỌI DHCP server khác trong mạng (nếu có nhiều server) cũng biết IP đó đã được client chọn, tránh 2 server cùng cấp trùng 1 IP cho 2 client khác nhau.</details>

3. DHCP relay làm gì, và vì sao cần nó khi server ở VLAN khác client?
   <details><summary>Đáp án</summary>Relay nghe broadcast DHCP trên subnet client và chuyển tiếp dạng UNICAST sang DHCP server ở subnet/VLAN khác (kèm `giaddr`) — nếu không có relay, broadcast không vượt qua được router.</details>

4. Khi lease gần hết hạn, client renew bằng cách nào — chạy lại toàn bộ DORA hay chỉ 1 bước?
   <details><summary>Đáp án</summary>Chỉ cần unicast REQUEST/ACK trực tiếp với server đã cấp (ở mốc T1, thường 50% lease time); chỉ quay lại DISCOVER broadcast đầy đủ nếu renew thất bại.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan ngoài module:**
- `networking.tcpip.ipv4-subnetting` — tiền đề để hiểu scope/subnet DHCP.
- `networking.switching.vlan` — vì sao DHCP relay cần thiết khi chia VLAN.
- `networking.diagnostic-tools.tcpdump-wireshark` — kỹ thuật bắt gói dùng ở mục 4.

**Nguồn tham khảo:**
- [RFC 2131 — Dynamic Host Configuration Protocol](https://www.rfc-editor.org/rfc/rfc2131)
- [dhcpd(8) — man7.org](https://man7.org/linux/man-pages/man8/dhcpd.8.html)
- [dhclient(8) — man7.org](https://man7.org/linux/man-pages/man8/dhclient.8.html)
