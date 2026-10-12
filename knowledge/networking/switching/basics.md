---
id: networking.switching.basics
title: "Switching cơ bản: MAC table, broadcast domain, collision domain"
domain: networking
module: networking.switching
level: "nền tảng"
prerequisites: ["networking.tcpip.osi-tcpip-model"]
applies_to:
  - "Ethernet switch (L2) — chuẩn chung; minh họa lệnh bằng Linux bridge (iproute2) và CLI kiểu Cisco IOS"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man8/bridge.8.html"
  - "https://docs.kernel.org/networking/bridge.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5.5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Switch là thiết bị mạng phổ biến nhất trong datacenter và văn phòng, nhưng nhiều sự cố "mạng
chập chờn" thực chất là chuyện của tầng 2: MAC table đầy, MAC "nhảy" giữa các port, broadcast
quá nhiều. Hiểu switch học địa chỉ và chuyển frame thế nào, và khái niệm broadcast domain, giúp
bạn biết khi nào vấn đề nằm ở L2 (switch) thay vì L3 (routing) — và vì sao cần VLAN, router để
chia nhỏ mạng (các bài sau trong module).

## 2. Khái niệm cốt lõi

| Khái niệm | Ý nghĩa |
|---|---|
| MAC address | Địa chỉ 48 bit của card mạng, dùng trong header Ethernet (tầng 2) |
| MAC table (CAM table / FDB) | Bảng `MAC → port` (kèm VLAN) mà switch tự học |
| Collision domain | Vùng mà các thiết bị chia sẻ cùng môi trường truyền và có thể đụng nhau. Mỗi port switch full-duplex là 1 collision domain riêng (gần như không còn collision) |
| Broadcast domain | Vùng mà frame broadcast (`ff:ff:ff:ff:ff:ff`) lan tới. Switch KHÔNG chia nhỏ broadcast domain — chỉ router (hoặc VLAN) mới chia |

Hub (cổ xưa) = 1 collision domain + 1 broadcast domain cho mọi port. Switch = mỗi port 1
collision domain, nhưng toàn bộ vẫn chung 1 broadcast domain (mặc định, khi chưa chia VLAN).

## 3. Cách nó hoạt động

**Switch học theo địa chỉ NGUỒN, chuyển theo địa chỉ ĐÍCH.** Với mỗi frame vào port P:

1. Đọc MAC nguồn → ghi/cập nhật `MAC nguồn → P` vào MAC table (kèm thời gian).
2. Đọc MAC đích:
   - Có trong bảng → chuyển (forward) ra đúng port đó (nếu đích ở chính port vào thì bỏ frame — filter).
   - Chưa có trong bảng (**unknown unicast**) → gửi ra MỌI port khác (flood).
   - Là broadcast/multicast (mặc định) → flood ra mọi port khác trong cùng broadcast domain.
3. Entry không được làm mới sẽ bị xoá sau thời gian **aging** (mặc định thường 300 giây,
   cả Cisco lẫn Linux bridge — `ageing_time` mặc định 300 s; có thể chỉnh).

Hệ quả: MAC table chỉ chứa thiết bị ĐÃ phát frame gần đây; máy im lặng sẽ bị flood tới khi
nó gửi gì đó. Switch không hề đọc IP — việc "IP nào ↔ MAC nào" là của ARP (broadcast, vì thế
ARP lan trong cả broadcast domain).

## 4. Thực hành

Linux bridge hoạt động như một switch phần mềm. Lệnh sau là thao tác thật (cần quyền root và
`iproute2`) — **output bên dưới là minh họa**, MAC/port của bạn sẽ khác:

```bash
ip link add br0 type bridge
ip link set br0 up
bridge fdb show br br0          # xem MAC table (forwarding database)
```

Output minh họa:

```
52:54:00:aa:bb:01 dev vnet0 master br0
52:54:00:aa:bb:02 dev vnet1 master br0
33:33:00:00:00:01 dev br0 self permanent
```

Trên switch Cisco IOS, tương đương:

```
Switch# show mac address-table
Switch# show mac address-table address 5254.00aa.bb01
```

Chỉnh thời gian aging trên Linux bridge (đơn vị 1/100 giây trong sysfs/`ip link`, ví dụ
30000 = 300 s):

```bash
ip link set br0 type bridge ageing_time 30000
```

## 5. Lỗi thường gặp và cách chẩn đoán

**MAC "flapping" — cùng 1 MAC xuất hiện luân phiên ở 2 port**
- Nguyên nhân: loop L2 (cáp cắm vòng, thiếu STP), hoặc máy ảo/VIP di chuyển, hoặc 2 thiết bị trùng MAC.
- Xác nhận: `show mac address-table` lặp lại nhiều lần; log switch báo `MACFLAP`/`host moving`.
- Xử lý: tìm và gỡ loop (xem bài `networking.switching.stp`); sửa trùng MAC.

**Máy không vào được mạng nhưng link đèn sáng, ARP không trả lời**
- Nguyên nhân: sai VLAN trên access port, port bị `shutdown`/err-disable, port security.
- Xác nhận: kiểm tra VLAN của port và MAC table — MAC của máy có xuất hiện ở đúng port/VLAN không.

**Mạng chậm, CPU switch cao, nhiều broadcast/unknown unicast**
- Nguyên nhân: broadcast domain quá lớn, hoặc MAC table bị tràn (tấn công MAC flooding) làm switch flood mọi thứ.
- Xử lý: chia VLAN, bật port security/giới hạn số MAC mỗi port.

## 6. Tình huống thực tế

Nhóm vừa cắm thêm 1 switch nhỏ vào phòng họp; 5 phút sau cả tầng mất mạng chập chờn.

1. `ping` gateway từ máy bất kỳ: mất gói ngẫu nhiên, latency nhảy lung tung.
2. Vào switch lõi: `show mac address-table` — thấy MAC của gateway liên tục đổi giữa 2 port.
3. Kết luận: có loop L2 — switch mini nhận 2 sợi cáp cùng về switch lõi, STP bị tắt/không hoạt động.
4. Rút 1 sợi cáp → mạng ổn định ngay. Sau đó bật STP/BPDU guard trên các port người dùng (bài `networking.switching.stp`) và ghi vào quy ước: thiết bị mini switch phải đi qua yêu cầu thay đổi.

## 7. Tự kiểm tra

**Câu 1**: Switch học địa chỉ MAC dựa trên MAC nguồn hay MAC đích của frame?

a) MAC nguồn (gắn với port vào) — MAC đích chỉ dùng để tra bảng và quyết định chuyển ra đâu
b) MAC đích, vì switch cần biết frame đi đâu để lưu vào bảng định tuyến
c) Cả MAC nguồn và đích đều được học cùng lúc vào bảng, gắn chung với port vào
d) Switch không học MAC nào cả, chỉ router mới học MAC qua ARP

**Đáp án: a** — MAC NGUỒN (gắn với port vào). MAC đích chỉ dùng để tra bảng và quyết định
chuyển ra đâu. Switch không học theo MAC đích (loại b); chỉ MAC nguồn được ghi vào bảng, MAC
đích chỉ dùng để tra cứu, không được học (loại c); switch (không phải chỉ router) chính là
thiết bị học MAC để xây MAC table (loại d).

---

**Câu 2**: Frame gửi tới MAC đích chưa có trong MAC table thì switch làm gì?

a) Switch sẽ drop frame đó ngay vì không xác định được đích
b) Flood: gửi ra mọi port khác (cùng broadcast domain/VLAN) trừ port vào, cho tới khi học được
   MAC đó
c) Switch gửi ngược lại đúng port vào để nguồn tự xử lý
d) Switch gửi broadcast ARP request thay cho frame gốc để tìm MAC đích

**Đáp án: b** — Flood: gửi ra mọi port khác (cùng broadcast domain/VLAN) trừ port vào, cho tới
khi học được MAC đó. Switch không drop frame chưa biết đích (loại a); gửi ngược lại port vào là
vô nghĩa, nguồn không cần nhận lại frame của chính nó (loại c); switch hoạt động ở Layer 2,
không tự tạo ARP request thay cho frame gốc (loại d, đó là việc của tầng IP/ARP, khác cơ chế
flood MAC).

---

**Câu 3**: Một switch 24 port, chưa cấu hình VLAN, có bao nhiêu collision domain và broadcast
domain?

a) 1 collision domain (toàn switch chia sẻ chung), 24 broadcast domain (mỗi port riêng)
b) 24 collision domain, 24 broadcast domain (mỗi port đều riêng biệt hoàn toàn)
c) 24 collision domain (mỗi port full-duplex 1 cái) và 1 broadcast domain
d) 1 collision domain, 1 broadcast domain (switch không tách collision domain theo port)

**Đáp án: c** — 24 collision domain (mỗi port full-duplex 1 cái) và 1 broadcast domain. Mỗi
port switch là một collision domain riêng (không chia sẻ chung — loại a, d); broadcast domain
chỉ bị chia khi có VLAN, chưa cấu hình VLAN thì toàn switch là 1 broadcast domain duy nhất
(loại b, a).

---

**Câu 4**: Vì sao thêm switch không làm giảm lượng broadcast?

a) Vì switch mới luôn đồng bộ bảng MAC với switch cũ qua STP, nên broadcast domain tự động hợp
   nhất
b) Vì thêm switch chỉ tăng số collision domain, không liên quan gì tới broadcast domain theo
   định nghĩa
c) Vì broadcast chỉ giảm khi tăng số lượng port trên switch, không liên quan tới số switch
d) Switch chuyển broadcast ra mọi port nên không chia broadcast domain; cần VLAN hoặc router
   (L3) để chia nhỏ

**Đáp án: d** — Switch chuyển broadcast ra mọi port nên không chia broadcast domain; cần VLAN
hoặc router (L3). STP chỉ chống loop, không liên quan tới việc hợp nhất broadcast domain theo
cách đó (loại a); thêm switch có làm tăng collision domain, nhưng câu hỏi hỏi về LÝ DO broadcast
domain không giảm, không phải phủ nhận liên quan — bản chất switch vẫn flood broadcast xuyên
qua mọi switch nối tiếp (loại b); số port không quyết định việc chia broadcast domain, VLAN/
router mới làm được điều đó (loại c).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.switching.vlan` — chia broadcast domain bằng VLAN.
- `networking.switching.stp` — chống loop L2.

**Bài liên quan ngoài module:**
- `networking.tcpip.osi-tcpip-model` — tầng 2 so với tầng 3.

**Nguồn tham khảo:**
- [bridge(8) — man7.org](https://man7.org/linux/man-pages/man8/bridge.8.html) — `bridge fdb`.
- [Linux Ethernet Bridging — kernel docs](https://docs.kernel.org/networking/bridge.html)
