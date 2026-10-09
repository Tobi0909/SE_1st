---
id: networking.routing.static
title: "Routing tĩnh: routing table, default gateway, longest prefix match"
domain: networking
module: networking.routing
level: "nền tảng"
prerequisites: ["networking.tcpip.ipv4-subnetting"]
applies_to:
  - "IPv4 routing — chuẩn chung; minh họa lệnh bằng Linux (iproute2) và CLI kiểu Cisco IOS"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man8/ip-route.8.html"
  - "https://www.rfc-editor.org/rfc/rfc1812"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Router (hoặc bất kỳ máy Linux có nhiều interface) chuyển gói IP dựa trên MỘT bảng duy nhất:
routing table. Không hiểu đúng cách tra bảng này (longest prefix match) thì không thể chẩn
đoán được những lỗi rất phổ biến: "ping được IP này nhưng không ping được IP khác cùng mạng",
"default gateway đúng nhưng vẫn không ra Internet", hay "thêm 1 route tĩnh làm hỏng route cũ".
Routing tĩnh là nền tảng bắt buộc trước khi học OSPF/BGP (routing động, bài sau trong module).

## 2. Khái niệm cốt lõi

| Khái niệm | Ý nghĩa |
|---|---|
| Routing table | Bảng các entry `prefix/mask → next-hop (+ interface)` dùng để quyết định gói đi đâu |
| Default gateway (default route) | Entry đặc biệt `0.0.0.0/0` — "nếu không khớp route nào cụ thể hơn, gửi tới đây" |
| Next-hop | Địa chỉ IP của router kế tiếp (hoặc chính interface, nếu đích nằm cùng mạng — "connected route") |
| Longest Prefix Match (LPM) | Khi NHIỀU route cùng khớp một đích, router LUÔN chọn route có prefix (subnet mask) DÀI NHẤT, không phải route thêm trước/sau |
| Metric | Giá trị dùng để chọn khi có nhiều route CÙNG prefix tới cùng đích; nhỏ hơn = ưu tiên hơn |
| Static route | Route admin tự khai tay, không tự cập nhật khi mạng thay đổi (khác route động ở OSPF/BGP) |

## 3. Cách nó hoạt động

**Mọi quyết định định tuyến chỉ dựa vào 1 câu hỏi: "route nào khớp địa chỉ đích, và trong số
đó route nào có prefix dài nhất?"** Router duyệt toàn bộ bảng, tìm MỌI entry mà địa chỉ đích
nằm trong dải đó, rồi chọn đúng 1 entry — cái có subnet mask dài nhất (cụ thể nhất). Ví dụ có 2
route tới cùng đích `10.1.2.3`:

```
10.0.0.0/8      via 192.168.1.1
10.1.2.0/24     via 192.168.1.2
```

Cả hai đều khớp, nhưng `/24` dài hơn `/8` → router LUÔN chọn route qua `192.168.1.2`, bất kể
route nào được khai trước. Default route `0.0.0.0/0` có prefix dài 0 — luôn khớp mọi đích,
nên LUÔN bị các route cụ thể hơn "thắng" nếu có; nó chỉ được dùng khi KHÔNG route nào khác
khớp.

**"Connected route" tự sinh khi gán IP cho interface** — không cần khai tay. Nếu đích nằm
cùng subnet với 1 interface, router gửi trực tiếp (ARP tới đích), không cần qua next-hop nào.
Route tĩnh chỉ cần khai cho các mạng KHÔNG trực tiếp kết nối.

**Metric chỉ phân định khi prefix bằng nhau.** Hai route cùng `0.0.0.0/0` nhưng metric khác
nhau (ví dụ 1 qua Wi-Fi, 1 qua dây mạng) — route metric thấp hơn được dùng, route kia làm dự
phòng (dùng khi route chính mất, ví dụ do interface down).

## 4. Thực hành

Xem bảng routing hiện tại (lệnh thật, chạy trong container này):

```bash
$ ip route show
default via 192.0.2.1 dev eth0
192.0.2.0/24 dev eth0 proto kernel scope link src 192.0.2.2
```

Dòng 2 là connected route (tự sinh khi gán IP `192.0.2.2/24` cho `eth0`, `proto kernel`).
Dòng 1 là default route — mọi đích không khớp dòng 2 sẽ đi qua `192.0.2.1`.

`ip route get` cho thấy chính xác route nào SẼ được chọn cho một đích cụ thể — công cụ chẩn
đoán LPM hữu ích nhất:

```bash
$ ip route get 8.8.8.8
8.8.8.8 via 192.0.2.1 dev eth0 src 192.0.2.2 uid 0
    cache
```

Thêm 1 static route cụ thể hơn (minh họa LPM — cần quyền root, giả định đã có gateway
`192.0.2.1` trong mạng `192.0.2.0/24`):

```bash
ip route add 203.0.113.0/24 via 192.0.2.1 metric 100
ip route show
```

```
default via 192.0.2.1 dev eth0
203.0.113.0/24 via 192.0.2.1 metric 100
192.0.2.0/24 dev eth0 proto kernel scope link src 192.0.2.2
```

Xoá route tĩnh: `ip route del 203.0.113.0/24`.

Cisco IOS (minh họa — cú pháp, không chạy thật trong môi trường này):

```
Router(config)# ip route 203.0.113.0 255.255.255.0 192.0.2.1
Router# show ip route
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Thêm static route nhưng traffic vẫn đi route cũ**
- Nguyên nhân: route mới có prefix NGẮN hơn hoặc BẰNG route đã có — LPM vẫn chọn route cụ thể hơn hoặc route có metric thấp hơn.
- Xác nhận: `ip route get <đích>` — xem chính xác route nào được áp dụng, so với kỳ vọng.
- Xử lý: khai route với prefix đúng mức cụ thể cần, hoặc hạ metric nếu 2 route cùng prefix.

**"Ping được gateway nhưng không ra Internet"**
- Nguyên nhân: default route bị thiếu, sai next-hop, hoặc đúng route nhưng gateway không NAT/forward được (lỗi tầng khác — xem `networking.nat-firewall`).
- Xác nhận: `ip route show` có dòng `default via ...` không; `ip route get 8.8.8.8` trỏ đúng gateway không.

**Route tới mạng không trực tiếp kết nối nhưng quên khai next-hop đúng subnet**
- Nguyên nhân: next-hop IP không nằm trong subnet của interface ra — kernel từ chối thêm route (`Error: Nexthop has invalid gateway`).
- Xử lý: kiểm tra next-hop phải là IP router kế tiếp, nằm trong 1 subnet có connected route.

**Route "biến mất" sau khi interface down**
- Nguyên nhân: route tĩnh qua interface đó bị kernel gỡ khi link down (hành vi bình thường, không phải bug).
- Xử lý: thêm route dự phòng qua interface khác với metric cao hơn, hoặc dùng `ip route replace` khi cấu hình lại.

## 6. Tình huống thực tế

Server có 2 NIC: `eth0` (mạng văn phòng `192.168.10.0/24`), `eth1` (mạng lưu trữ
`10.50.0.0/24`). Sau khi thêm `eth1`, các kết nối SSH từ xa tới server qua `eth0` bị chập
chờn.

1. `ip route show` thấy 2 default route — 1 qua `eth0`, 1 qua `eth1` (do DHCP/cấu hình tự thêm default route trên cả 2 interface) — cả hai cùng prefix `0.0.0.0/0`, kernel chọn theo metric, có lúc đổi path trả về không cùng path đi, gây lỗi ở một số firewall stateful.
2. `ip route get <IP máy SSH đang kết nối>` xác nhận: route đi ra đang chọn `eth1` (metric thấp hơn do thứ tự cấu hình), sai mạng.
3. Sửa: xoá default route trên `eth1` (mạng lưu trữ không cần ra Internet), chỉ giữ 1 default route duy nhất qua `eth0`; thêm static route cụ thể `10.50.0.0/24` chỉ nội bộ (đã là connected route, không cần thêm) — đảm bảo mạng lưu trữ không tranh default route.
4. Ghi runbook: mỗi server production chỉ nên có ĐÚNG 1 default route; các mạng phụ cần route cụ thể, không dựa vào DHCP tự thêm default trên mọi interface.

## 7. Tự kiểm tra

1. Có 2 route `10.0.0.0/8` và `10.1.0.0/16` tới cùng đích `10.1.2.3`. Route nào được chọn?
   <details><summary>Đáp án</summary>`10.1.0.0/16` — prefix dài hơn (longest prefix match), bất kể thứ tự khai.</details>

2. Default route `0.0.0.0/0` được dùng khi nào?
   <details><summary>Đáp án</summary>Chỉ khi KHÔNG có route nào khác (cụ thể hơn) khớp địa chỉ đích.</details>

3. Vì sao không cần khai static route cho mạng trực tiếp kết nối với interface?
   <details><summary>Đáp án</summary>Kernel tự sinh "connected route" khi gán IP/subnet cho interface.</details>

4. Hai route cùng prefix, khác metric — route nào được dùng?
   <details><summary>Đáp án</summary>Route có metric THẤP hơn; route metric cao làm dự phòng.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.routing.ospf` — routing động, tự cập nhật bảng khi mạng thay đổi.

**Bài liên quan ngoài module:**
- `networking.tcpip.ipv4-subnetting` — tiền đề để hiểu prefix/mask.
- `networking.nat-firewall.firewall-concepts` — vì sao "route đúng" chưa chắc "ra được Internet".

**Nguồn tham khảo:**
- [ip-route(8) — man7.org](https://man7.org/linux/man-pages/man8/ip-route.8.html)
- [RFC 1812 — Requirements for IP Version 4 Routers](https://www.rfc-editor.org/rfc/rfc1812)
