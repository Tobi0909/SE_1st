---
id: networking.routing.bgp
title: "BGP cơ bản: AS, eBGP/iBGP, path selection"
domain: networking
module: networking.routing
level: "chuyên sâu"
prerequisites: ["networking.routing.ospf"]
applies_to:
  - "BGP-4 (RFC 4271) — chuẩn chung; minh họa CLI bằng FRR (Linux routing suite) và Cisco IOS"
status: draft
sources:
  - "https://www.rfc-editor.org/rfc/rfc4271"
  - "https://docs.frrouting.org/en/latest/bgp.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

BGP là protocol giữ cho Internet hoạt động — kết nối hàng trăm nghìn AS (tổ chức độc lập) với
nhau. Một SE nội bộ ít khi vận hành BGP hàng ngày, nhưng cần hiểu khái niệm để: đọc đúng log
khi ISP/datacenter thông báo sự cố BGP, làm việc với multi-homing (2 ISP), hoặc hiểu vì sao
"route tốt nhất theo băng thông" không phải lúc nào cũng là route BGP chọn (BGP ưu tiên chính
sách, không ưu tiên tốc độ như OSPF).

## 2. Khái niệm cốt lõi

- **AS (Autonomous System)**: một vùng quản trị định tuyến độc lập, định danh bằng AS number
  (16-bit cũ 1–65535, hoặc 32-bit mở rộng từ khi dải cũ gần hết — xem RFC 6793). Mỗi ISP lớn,
  mỗi tổ chức có BGP riêng thường có AS number riêng.
- **eBGP (external BGP)**: phiên BGP giữa 2 AS khác nhau (ví dụ công ty bạn ↔ ISP).
- **iBGP (internal BGP)**: phiên BGP giữa router CÙNG 1 AS — dùng để phân phối route học từ
  eBGP ra toàn bộ AS mà không làm mất thuộc tính AS-path (khác việc "redistribute" sang OSPF).
- **Path attribute** quan trọng: `AS-PATH` (danh sách AS đã đi qua — dùng để tránh loop và so
  độ dài), `NEXT-HOP`, `LOCAL-PREF` (ưu tiên nội bộ, chỉ dùng trong iBGP), `MED` (gợi ý từ AS
  hàng xóm, ưu tiên thấp hơn LOCAL-PREF).
- **Path selection**: BGP không chọn route theo "nhanh nhất" — chọn theo một CHUỖI tiêu chí ưu
  tiên chính sách trước, độ dài đường đi sau cùng.

## 3. Cách nó hoạt động

**BGP là path-vector, ưu tiên CHÍNH SÁCH hơn hiệu năng thô.** Khi có nhiều route tới cùng
prefix, BGP so sánh tuần tự theo thứ tự (rút gọn các bước phổ biến nhất, không đầy đủ 100% —
thứ tự đầy đủ phụ thuộc cả cấu hình vendor):

1. Weight (chỉ Cisco, cục bộ router, không truyền đi) cao hơn thắng.
2. LOCAL_PREF cao hơn thắng (ý chí của AS mình, áp dụng toàn AS qua iBGP).
3. Route tự nguồn gốc nội bộ (locally originated) được ưu tiên.
4. AS-PATH NGẮN hơn thắng.
5. Origin code thấp hơn thắng (IGP < EGP < Incomplete).
6. MED thấp hơn thắng (gợi ý từ AS hàng xóm).
7. eBGP được ưu tiên hơn iBGP (ở bước này).
8. IGP metric tới next-hop thấp hơn thắng; cuối cùng mới tới các tie-break như Router ID thấp hơn.

Vì "nhanh" không nằm trong danh sách trên (trừ gián tiếp qua MED, mà MED chỉ xét rất muộn),
2 route BGP có AS-PATH dài khác nhau — BGP chọn route NGẮN HƠN dù đường đó băng thông thấp
hơn, trừ khi admin chủ động chỉnh LOCAL_PREF/weight để ép hướng khác.

**iBGP cần full-mesh (hoặc route-reflector/confederation) vì route học qua iBGP KHÔNG được
advertise tiếp cho peer iBGP khác** (luật chống loop: "không re-advertise route học từ iBGP
sang 1 iBGP peer khác") — khác eBGP (route học từ 1 AS được advertise tiếp cho AS khác bình
thường). Đây là lý do mạng nhiều router iBGP cần route-reflector, không chỉ đơn giản nối dây
là xong.

## 4. Thực hành

Không có hạ tầng nhiều AS trong môi trường soạn bài — **các output dưới đây là minh họa**,
theo cấu trúc lệnh thật FRR/Cisco IOS:

```
# FRR (vtysh)
router bgp 65001
 neighbor 203.0.113.1 remote-as 65002
 network 198.51.100.0/24
```

```
router# show ip bgp summary
Neighbor        V   AS  MsgRcvd  MsgSent  Up/Down  State/PfxRcd
203.0.113.1     4 65002     120      118  00:15:22        3
```

```
router# show ip bgp 198.51.100.0/24
BGP routing table entry for 198.51.100.0/24
Paths: (1 available, best)
  65002 65003
    203.0.113.1 from 203.0.113.1
      Origin IGP, metric 0, localpref 100, valid, external, best
```

Cisco IOS (minh họa):

```
Router(config)# router bgp 65001
Router(config-router)# neighbor 203.0.113.1 remote-as 65002
Router# show ip bgp summary
Router# show ip bgp neighbors 203.0.113.1
```

Đọc output `show ip bgp summary`: cột `State/PfxRcd` hiện SỐ (ví dụ `3`) nghĩa là đã lên
Established và nhận 3 prefix; nếu hiện tên trạng thái (`Active`, `Idle`, `Connect`) nghĩa là
CHƯA lên được phiên — cần chẩn đoán kết nối TCP port 179 trước khi nghi ngờ cấu hình route.

## 5. Lỗi thường gặp và cách chẩn đoán

**Phiên BGP không lên (`Idle`/`Active`, không phải số)**
- Nguyên nhân: sai AS number khai cho neighbor, không ping được IP neighbor (TCP 179 bị chặn), sai IP peer.
- Xác nhận: `show ip bgp summary` xem State; kiểm tra kết nối TCP 179 (`telnet <ip> 179` hoặc tương đương) và route tới IP peer.

**Nhận route nhưng không thấy trong routing table chính**
- Nguyên nhân: BGP table (`show ip bgp`) khác routing table tổng (`show ip route`/`ip route show`) — chỉ route "best" theo path selection mới được đẩy vào bảng routing, hoặc bị route-map/filter chặn.
- Xác nhận: so sánh `show ip bgp <prefix>` (xem có route, có "best" không) với `show ip route <prefix>`.

**Traffic ra Internet qua ISP "xa hơn" dù có 2 ISP**
- Nguyên nhân: AS-PATH qua ISP đó ngắn hơn, hoặc LOCAL_PREF bị đặt nhầm ưu tiên ISP đó. Đây là path selection đúng theo chính sách đang cấu hình, không phải lỗi, nhưng có thể không phải ý muốn — cần chỉnh LOCAL_PREF/weight nếu muốn ưu tiên ISP khác.

## 6. Tình huống thực tế

Công ty có 2 uplink tới 2 ISP khác nhau (multi-homing), nhưng toàn bộ traffic ra chỉ đi qua 1
ISP, ISP còn lại gần như không dùng dù đã lên BGP (`Established`).

1. `show ip bgp summary` cả 2 neighbor đều Established, đều nhận prefix đầy đủ — phiên BGP ổn, không phải lỗi kết nối.
2. `show ip bgp <default-prefix hoặc prefix đại diện>`: route qua ISP A có AS-PATH dài 2 AS, qua ISP B dài 1 AS (ISP B là AS gần hơn theo quảng cáo) — path selection đúng luật chọn AS-PATH ngắn hơn, nên luôn đi ISP B.
3. Đây đúng là hành vi thiết kế của BGP, không phải sự cố — nhưng công ty muốn cân bằng tải 2 ISP. Giải pháp: chỉnh LOCAL_PREF cao hơn cho 1 phần prefix qua ISP A (ví dụ theo khối IP đích) để chủ động chia tải, thay vì để BGP tự chọn theo AS-PATH.
4. Ghi runbook: multi-homing không tự cân bằng tải — cần chính sách LOCAL_PREF/weight rõ ràng nếu muốn kiểm soát phân luồng, nếu không BGP sẽ dồn vào đường có AS-PATH ngắn nhất.

## 7. Tự kiểm tra

1. Khác biệt chính giữa eBGP và iBGP?
   <details><summary>Đáp án</summary>eBGP giữa 2 AS khác nhau; iBGP giữa router cùng 1 AS, dùng để phân phối route học từ eBGP ra toàn AS.</details>

2. Vì sao BGP có thể chọn 1 route "chậm hơn" thay vì route băng thông cao hơn?
   <details><summary>Đáp án</summary>BGP path selection ưu tiên chính sách (weight, LOCAL_PREF) và AS-PATH ngắn nhất, không xét băng thông/tốc độ thực tế.</details>

3. Vì sao iBGP cần full-mesh hoặc route-reflector?
   <details><summary>Đáp án</summary>Route học qua iBGP không được re-advertise tiếp cho 1 iBGP peer khác (chống loop), nên cần mọi router iBGP nối trực tiếp nhau hoặc dùng route-reflector để route vẫn lan tới toàn AS.</details>

4. `show ip bgp summary` hiện trạng thái tên (`Active`) thay vì số ở cột PfxRcd — nghĩa là gì?
   <details><summary>Đáp án</summary>Phiên BGP CHƯA lên Established; cần chẩn đoán kết nối TCP 179 và cấu hình neighbor trước khi nghi route.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.routing.ospf` — routing động nội bộ 1 AS, khác phạm vi liên-AS của BGP.

**Nguồn tham khảo:**
- [RFC 4271 — A Border Gateway Protocol 4 (BGP-4)](https://www.rfc-editor.org/rfc/rfc4271)
- [FRR bgpd — docs.frrouting.org](https://docs.frrouting.org/en/latest/bgp.html)
