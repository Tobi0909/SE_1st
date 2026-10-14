---
id: networking.routing.ospf
title: "OSPF cơ bản: area, cost, DR/BDR"
domain: networking
module: networking.routing
level: "vận hành"
prerequisites: ["networking.routing.static"]
applies_to:
  - "OSPFv2 (RFC 2328) — chuẩn chung; minh họa CLI bằng FRR (Linux routing suite) và Cisco IOS"
status: verified
sources:
  - "https://www.rfc-editor.org/rfc/rfc2328"
  - "https://docs.frrouting.org/en/latest/ospfd.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Routing tĩnh (bài trước) không tự cập nhật khi mạng thay đổi — admin phải sửa tay mọi router
liên quan, không thực tế khi có hơn vài router. OSPF là routing protocol động phổ biến nhất
trong mạng doanh nghiệp/datacenter nội bộ (link-state, open standard, không như EIGRP của
Cisco): mỗi router tự học toàn bộ topology trong area của nó và tự tính lại route khi có thay
đổi (link đứt, router mới). Hiểu area, cost, DR/BDR giúp chẩn đoán vì sao 2 router không lên
được "neighbor" hoặc vì sao route tối ưu không như kỳ vọng.

## 2. Khái niệm cốt lõi

- **Link-state protocol**: mỗi router gửi LSA (Link-State Advertisement) mô tả các link của
  chính nó cho MỌI router khác trong area (không gửi cả bảng routing như protocol distance-vector).
  Mọi router xây dựng cùng 1 "bản đồ" topology (LSDB) rồi tự chạy thuật toán Dijkstra (SPF —
  Shortest Path First) để tính route tối ưu.
- **Area**: OSPF chia mạng thành các area để giới hạn phạm vi LSA (tránh LSDB quá lớn). Area 0
  (backbone) là bắt buộc, mọi area khác phải nối trực tiếp hoặc qua virtual-link tới area 0.
- **Cost**: metric OSPF, mặc định tỉ lệ nghịch băng thông (`cost = reference-bandwidth / bandwidth`,
  reference-bandwidth mặc định Cisco IOS là 100 Mbps nên link ≥100 Mbps mặc định cùng cost 1 — cần
  chỉnh `auto-cost reference-bandwidth` cho mạng tốc độ cao hơn, nếu không mọi link 1G/10G trông
  "ngang giá" với link 100M).
- **Router ID**: định danh 32-bit duy nhất của router trong OSPF, thường lấy IP loopback cao nhất
  (nên đặt cố định bằng loopback, tránh để OSPF tự chọn theo IP interface vật lý có thể đổi).
- **DR/BDR (Designated/Backup Designated Router)**: trên mạng multi-access (Ethernet), mọi router
  không bầu neighbor đầy đủ với NHAU mà chỉ với DR và BDR — giảm số lượng adjacency cần đồng bộ
  từ O(n²) xuống O(n). Bầu theo priority (mặc định 1 trên nhiều nền tảng; cao hơn thắng), hoà thì
  Router ID cao hơn thắng.

## 3. Cách nó hoạt động

**Hai router chỉ thành "neighbor" (rồi "adjacency") khi khớp các tham số cơ bản**: cùng area
ID cho interface đó, cùng subnet, cùng hello/dead interval, cùng loại xác thực (nếu có), và
(với mạng broadcast) không bị lệch MTU. Sai 1 trong các tham số này là nguyên nhân hàng đầu
khiến OSPF "không lên neighbor" — không có cơ chế tự dò sai lệch, chỉ im lặng không hình
thành adjacency (hoặc dừng ở state `2-Way` thay vì `Full` nếu không cần Full, như trường hợp 2
router DROTHER với nhau).

**DR/BDR chỉ áp dụng cho mạng multi-access (Ethernet), KHÔNG áp dụng cho point-to-point
(ví dụ link WAN nối trực tiếp 2 router)** — point-to-point luôn hình thành Full adjacency với
nhau, không cần bầu DR. Trên Ethernet: mọi router DROTHER (không phải DR/BDR) chỉ Full với DR
và BDR, còn lại ở trạng thái 2-Way với nhau — đây là hành vi ĐÚNG, không phải lỗi.

**SPF chạy lại toàn bộ khi LSDB đổi** — mỗi lần 1 link lên/xuống trong area, LSA lan ra, mọi
router trong area (không phải toàn mạng, nhờ chia area) chạy lại Dijkstra. Hội tụ nhanh hơn
nhiều so với distance-vector cũ (RIP) nhưng vẫn có thể gây spike CPU nếu mạng quá lớn/không
chia area hợp lý — đây là lý do chính để chia nhiều area thay vì 1 area 0 khổng lồ.

## 4. Thực hành

Môi trường soạn bài không có router/FRR chạy thật (cần tối thiểu 2 node để có neighbor) —
**các output dưới đây là minh họa**, dựa theo cấu trúc lệnh thật của FRR (`vtysh`) và Cisco
IOS, cần đối chiếu khi áp dụng:

```
# FRR (vtysh) — ospfd.conf tương đương
router ospf
 ospf router-id 10.0.0.1
 network 192.168.10.0/24 area 0
!
interface eth0
 ip ospf cost 10
```

```
router# show ip ospf neighbor
Neighbor ID  Pri  State       Dead Time  Address       Interface
10.0.0.2       1  Full/DR       00:00:38  192.168.10.2  eth0:192.168.10.1
```

Cisco IOS (minh họa):

```
Router(config)# router ospf 1
Router(config-router)# router-id 10.0.0.1
Router(config-router)# network 192.168.10.0 0.0.0.255 area 0
Router# show ip ospf neighbor
Router# show ip ospf interface eth0
```

Đọc output: cột `State` — `Full` là adjacency hoàn chỉnh (đã đồng bộ LSDB); `2-Way` là bình
thường giữa 2 DROTHER; `Init`/`ExStart` kéo dài bất thường là dấu hiệu cấu hình sai (area,
hello timer, MTU).

**Mạng nhiều area** — router nối cả area 0 và area 1 (ABR, Area Border Router) cần khai `network`
riêng cho từng interface theo đúng area của nó; LSA loại 1/2 (nội bộ area) không vượt ra ngoài
area, chỉ LSA tổng hợp loại 3 (summary, do ABR tạo) đi giữa các area — đây là lý do LSDB của
router trong area 1 KHÔNG thấy chi tiết topology area 2, chỉ thấy route tổng hợp:

```
router ospf
 ospf router-id 10.0.0.1
 network 192.168.10.0/24 area 0     ! interface nối về backbone
 network 10.1.1.0/24 area 1         ! interface nối vào area 1
```

Xem toàn bộ LSDB mà router đang giữ (hữu ích khi nghi SPF tính sai do thiếu/lệch LSA):

```
router# show ip ospf database

            OSPF Router with ID (10.0.0.1)

                Router Link States (Area 0)
Link ID         ADV Router      Age         Seq#       Link count
10.0.0.1        10.0.0.1        45          0x80000003 2
10.0.0.2        10.0.0.2        50          0x80000005 3

                Summary Net Link States (Area 0)
Link ID         ADV Router      Age         Seq#
10.1.1.0        10.0.0.1        45          0x80000002
```

"Router Link States" là LSA loại 1 (mỗi router tự quảng bá link của mình, chỉ trong area);
"Summary Net Link States" là LSA loại 3 do ABR tạo để đưa route của area 1 (`10.1.1.0`) vào
area 0 — dạng tổng hợp, không mang chi tiết topology bên trong area 1.

## 5. Lỗi thường gặp và cách chẩn đoán

**Neighbor không bao giờ lên Full, kẹt ở `Init` hoặc `2-Way`**
- Nguyên nhân: sai area ID trên 1 trong 2 interface, lệch hello/dead interval, lệch MTU, hoặc (với mạng broadcast) cả hai đều không phải DR/BDR nên chủ ý ở 2-Way — cần kiểm tra có đúng là 2 DROTHER không trước khi coi là lỗi.
- Xác nhận: `show ip ospf interface` trên cả 2 bên — so khớp area, timer, MTU; `show ip ospf neighbor` xem Role (DR/BDR/DROTHER).

**Route không đi qua link có vẻ "nhanh hơn"**
- Nguyên nhân: cost không phản ánh đúng băng thông thật (ví dụ link 10G và 1G cùng cost do chưa chỉnh `reference-bandwidth`, hoặc cost bị gán tay sai).
- Xác nhận: `show ip ospf interface` xem cost từng interface; tính lại cost kỳ vọng.

**DR không ổn định, hay đổi**
- Nguyên nhân: priority không được gán cố định, Router ID thay đổi theo IP interface vật lý (không dùng loopback cố định).
- Xử lý: luôn đặt Router ID bằng loopback, gán priority rõ ràng cho router muốn làm DR.

## 6. Tình huống thực tế

2 router mới thêm vào mạng OSPF area 0 nhưng không bao giờ thấy nhau trong `show ip ospf neighbor`.

1. `show ip ospf interface` trên router A: area 0, hello 10s. Trên router B: area 1 — sai ngay từ đầu (lệch area trên cùng 1 subnet là lỗi, không được phép).
2. Sửa area B về 0, kiểm tra lại — vẫn chưa lên, lần này do MTU: A dùng MTU 1500, B dùng 1400 (cấu hình jumbo không nhất quán) — OSPF kẹt ở ExStart (DB exchange thất bại vì MTU mismatch).
3. Đồng bộ MTU 2 interface, neighbor lên Full ngay.
4. Ghi runbook: checklist OSPF neighbor fail — kiểm tra theo thứ tự area → subnet → hello/dead timer → MTU → auth, trước khi nghi ngờ lỗi phần cứng.

## 7. Tự kiểm tra

**Câu 1**: OSPF là link-state hay distance-vector? Khác biệt chính là gì?

a) Link-state — mỗi router gửi thông tin link của chính nó cho cả area, mọi router tự tính SPF trên cùng một bản đồ topology, khác distance-vector
b) Distance-vector — mỗi router chỉ gửi bảng route đã tính sẵn cho hàng xóm, không có khái niệm
   topology chung
c) Link-state, nhưng mỗi router chỉ biết link của hàng xóm trực tiếp, không có bản đồ toàn mạng
d) Cả link-state và distance-vector tùy theo phiên bản OSPFv2/OSPFv3 đang dùng

**Đáp án: a** — Link-state — mỗi router gửi thông tin link của chính nó cho cả area, mọi
router tự tính SPF trên cùng 1 bản đồ topology, khác distance-vector (gửi cả bảng route đã
tính sẵn). OSPF không phải distance-vector — đó là mô tả của RIP, không phải OSPF (loại b);
OSPF link-state cho mỗi router một bản đồ TOÀN area, không chỉ biết hàng xóm trực tiếp (loại
c); OSPFv2 (IPv4) và OSPFv3 (IPv6) đều là link-state, không đổi bản chất giao thức (loại d).

---

**Câu 2**: DR/BDR được bầu trên loại mạng nào, và vì sao cần?

a) Point-to-point links; để tránh hai router tranh giành vai trò master trên đường truyền trực
   tiếp
b) Mạng multi-access (Ethernet); để giảm số adjacency cần đồng bộ từ O(n²) xuống O(n)
c) Mạng multi-access; để tăng tốc hội tụ bằng cách DR tự chuyển tiếp mọi gói unicast giữa các
   router
d) Bất kỳ loại mạng nào có trên 2 router OSPF, không phân biệt point-to-point hay multi-access

**Đáp án: b** — Mạng multi-access (Ethernet); để giảm số adjacency cần đồng bộ từ O(n²) xuống
O(n). Point-to-point link chỉ có 2 router nên không cần bầu DR/BDR (loại a); DR không chuyển
tiếp gói dữ liệu unicast thay các router khác, nó chỉ tập trung việc đồng bộ LSA (loại c); việc
bầu DR/BDR gắn liền với đặc tính multi-access, không áp dụng cho point-to-point (loại d).

---

**Câu 3**: Hai router DROTHER (không phải DR/BDR) ở trạng thái 2-Way với nhau — đây có phải
lỗi?

a) Có, đây là lỗi nghiêm trọng vì mọi router OSPF phải đạt Full với nhau để hội tụ đúng
b) Không, nhưng chỉ vì cả hai đang trong quá trình bầu DR/BDR, trạng thái này sẽ biến mất khi
   bầu xong
c) Không, đây là hành vi bình thường — DROTHER chỉ Full với DR/BDR, không cần Full với DROTHER
   khác
d) Có, lỗi này thường do cấu hình sai area ID giữa hai router DROTHER

**Đáp án: c** — Không, đây là hành vi bình thường — DROTHER chỉ Full với DR/BDR. Trên mạng
multi-access, DROTHER với DROTHER chỉ cần 2-Way, không cần Full — đây là thiết kế OSPF để
giảm tải đồng bộ, không phải lỗi (loại a); trạng thái 2-Way giữa hai DROTHER là ổn định lâu
dài, không phải tạm thời trong lúc bầu DR/BDR (loại b); area ID sai sẽ khiến hai router không
hình thành adjacency gì cả (kẹt ở Down/Init), không dừng ở 2-Way (loại d).

---

**Câu 4**: Vì sao cần chỉnh `reference-bandwidth` khi mạng có link ≥ 1 Gbps?

a) Vì OSPF mặc định không hỗ trợ tính cost cho link trên 100 Mbps, bắt buộc phải cấu hình thủ
   công
b) Vì reference-bandwidth quyết định số lượng area tối đa OSPF có thể hỗ trợ
c) Vì các link tốc độ cao cần reference-bandwidth riêng để tính toán thời gian hội tụ SPF
d) Cost mặc định dựa trên reference-bandwidth 100 Mbps nên mọi link ≥100M mặc định cùng cost 1,
   không phản ánh đúng chênh lệch băng thông thật giữa 1G/10G

**Đáp án: d** — Cost mặc định dựa trên reference-bandwidth 100 Mbps nên mọi link ≥100M mặc
định cùng cost 1, không phản ánh đúng chênh lệch băng thông thật giữa 1G/10G. OSPF vẫn tính
được cost cho link trên 100 Mbps, chỉ là cost đó bị "bão hoà" ở giá trị 1, không phải không hỗ
trợ (loại a); reference-bandwidth không liên quan tới số lượng area (loại b); nó không ảnh
hưởng tới thời gian hội tụ SPF, chỉ ảnh hưởng tới giá trị cost dùng để SPF so sánh đường đi
(loại c).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.routing.static` — nền tảng routing table/LPM.
- `networking.routing.bgp` — routing giữa các AS, khác phạm vi với OSPF (nội bộ 1 tổ chức).

**Nguồn tham khảo:**
- [RFC 2328 — OSPF Version 2](https://www.rfc-editor.org/rfc/rfc2328)
- [FRR ospfd — docs.frrouting.org](https://docs.frrouting.org/en/latest/ospfd.html)
