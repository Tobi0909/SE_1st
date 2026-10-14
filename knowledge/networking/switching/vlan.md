---
id: networking.switching.vlan
title: "VLAN: trunk, access port, 802.1Q tagging"
domain: networking
module: networking.switching
level: "vận hành"
prerequisites: ["networking.switching.basics"]
applies_to:
  - "IEEE 802.1Q — chuẩn chung; minh họa bằng Linux (iproute2) và CLI kiểu Cisco IOS"
status: verified
sources:
  - "https://docs.kernel.org/networking/8021q.html"
  - "https://man7.org/linux/man-pages/man8/bridge.8.html"
  - "https://man7.org/linux/man-pages/man8/ip-link.8.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5.5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

VLAN là cách chia một switch vật lý thành nhiều mạng L2 tách biệt (server, người dùng, quản
trị, khách...). Hầu hết sự cố khi triển khai máy ảo, hypervisor, K8s node đều liên quan:
sai VLAN trên access port, trunk không cho phép VLAN cần thiết, native VLAN không khớp. Nắm
VLAN và 802.1Q giúp chẩn đoán nhanh kiểu "ping được cùng host nhưng không ra ngoài".

## 2. Khái niệm cốt lõi

- **VLAN**: một broadcast domain logic, định danh bằng VLAN ID 12 bit (1–4094 dùng được; 0 và 4095 dành riêng).
- **Access port**: port thuộc đúng 1 VLAN, frame ra/vào không mang tag (thiết bị đầu cuối không biết VLAN).
- **Trunk port**: port mang nhiều VLAN, frame được gắn tag 802.1Q (4 byte: TPID `0x8100` + PCP/DEI + VLAN ID) để phân biệt.
- **Native VLAN** (Cisco; tương đương PVID untagged ở Linux bridge): VLAN mà frame đi trên trunk KHÔNG gắn tag. Hai đầu trunk phải thống nhất.
- Giao tiếp giữa 2 VLAN khác nhau cần thiết bị L3 (router, L3 switch, SVI) — xem module routing.

```mermaid
flowchart LR
    PC10["PC (VLAN 10)"] -- access --> SW1[Switch 1]
    PC20["PC (VLAN 20)"] -- access --> SW1
    SW1 -- "trunk (tag 10,20)" --> SW2[Switch 2]
    SW2 -- access --> SRV10["Server (VLAN 10)"]
```

## 3. Cách nó hoạt động

**Tag chỉ tồn tại trên link trunk.** Switch nhận frame trên access port VLAN 10 → coi nó thuộc
VLAN 10 → khi ra trunk, chèn tag `VID=10` vào header Ethernet → switch đầu kia đọc tag, bỏ
tag, chỉ chuyển frame tới port thuộc VLAN 10. MAC table, flood và broadcast đều theo VLAN: một
broadcast VLAN 10 không bao giờ tới port VLAN 20.

**Trunk chỉ chuyển VLAN được phép (allowed list).** VLAN không có trong allowed list của trunk
sẽ bị rớt im lặng — nguyên nhân hàng đầu của "VLAN mới không thông qua switch kia".

**Native VLAN lệch là lỗi nguy hiểm**: nếu 2 đầu trunk khai native VLAN khác nhau, frame
untagged sẽ chui sang VLAN khác (rò VLAN); Cisco phát hiện qua CDP/STP và báo cảnh báo.

**MTU**: tag 802.1Q thêm 4 byte, khung tối đa 1522 byte thay vì 1518; phần lớn thiết bị hiện đại xử lý sẵn, nhưng cần lưu ý khi dùng jumbo frame.

## 4. Thực hành

Trên Linux: tạo sub-interface VLAN 10 (thao tác thật, cần root; output minh họa):

```bash
ip link add link eth0 name eth0.10 type vlan id 10
ip addr add 10.10.10.5/24 dev eth0.10
ip link set eth0.10 up
ip -d link show eth0.10
```

```
5: eth0.10@eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 ... state UP
    vlan protocol 802.1Q id 10 <REORDER_HDR>
```

Linux bridge có VLAN filtering (tương đương trunk/access):

```bash
ip link add br0 type bridge vlan_filtering 1
bridge vlan add dev eth1 vid 10 pvid untagged   # access VLAN 10
bridge vlan add dev eth0 vid 10                  # trunk mang VLAN 10 (tagged)
bridge vlan add dev eth0 vid 20
bridge vlan show
```

Cisco IOS (minh họa):

```
interface GigabitEthernet0/1
 switchport mode access
 switchport access vlan 10
!
interface GigabitEthernet0/24
 switchport mode trunk
 switchport trunk allowed vlan 10,20
 switchport trunk native vlan 99
```

Kiểm tra: `show vlan brief`, `show interfaces trunk`.

**Output đầy đủ của `show interfaces trunk`** — đây là lệnh quan trọng nhất khi debug VLAN
không qua được trunk, vì nó cho biết VLAN nào thực sự "active" trên link, không chỉ VLAN nào
được khai trong config:

```
Switch# show interfaces trunk

Port        Mode             Encapsulation  Status        Native vlan
Gi0/24      on               802.1q         trunking      99

Port        Vlans allowed on trunk
Gi0/24      10,20,30

Port        Vlans allowed and active in management domain
Gi0/24      10,20

Port        Vlans in spanning tree forwarding state and not pruned
Gi0/24      10,20
```

Ở ví dụ trên, VLAN 30 có trong "allowed" nhưng KHÔNG có trong "active in management domain" —
nghĩa là VLAN 30 được phép đi qua trunk này nhưng **chưa tồn tại** trên switch đó (chưa `vlan
30` trong VLAN database) hoặc không có port nào thuộc VLAN 30, nên switch không gửi/nhận tag
30 thật dù config allowed list đã đúng. Đây chính là bẫy phổ biến nhất khi mở rộng VLAN mới.

**Router-on-a-stick (inter-VLAN routing bằng sub-interface)** — một router/L3 switch có thể
định tuyến giữa các VLAN qua 1 trunk duy nhất, mỗi VLAN một sub-interface mang địa chỉ IP là
gateway của VLAN đó:

```
interface GigabitEthernet0/0.10
 encapsulation dot1Q 10
 ip address 10.0.10.1 255.255.255.0
!
interface GigabitEthernet0/0.20
 encapsulation dot1Q 20
 ip address 10.0.20.1 255.255.255.0
```

Linux tương đương (dùng chính 2 sub-interface VLAN tạo ở trên, bật forwarding):

```bash
sysctl -w net.ipv4.ip_forward=1
ip addr add 10.0.10.1/24 dev eth0.10
ip addr add 10.0.20.1/24 dev eth0.20
```

## 5. Lỗi thường gặp và cách chẩn đoán

**VLAN mới không thông qua trunk**
- Nguyên nhân: VLAN chưa có trong `allowed vlan` của trunk ở 1 trong các switch trung gian, hoặc VLAN chưa được tạo trên switch đó.
- Xác nhận: `show interfaces trunk` — cột "allowed and active in management domain".
- Xử lý: thêm VLAN (`switchport trunk allowed vlan add 30`) — nhớ dùng `add`, tránh ghi đè danh sách.

**Máy cắm vào mà không lấy được DHCP/ping gateway**
- Nguyên nhân: access port sai VLAN, hoặc port đang là trunk trong khi máy không gửi tag.
- Xác nhận: `show interfaces <port> switchport`, so với VLAN của gateway.

**Native VLAN mismatch**
- Nguyên nhân: 2 đầu khai khác nhau. Xác nhận bằng log `%CDP-4-NATIVE_VLAN_MISMATCH`. Xử lý: thống nhất, và không dùng VLAN 1 làm native/VLAN dữ liệu.

**Máy ảo trên hypervisor không ra mạng**
- Nguyên nhân: port switch nối host là access thay vì trunk, hoặc VLAN của port group không nằm trong allowed list. Xử lý: cấu hình trunk đúng và khớp tag.

## 6. Tình huống thực tế

Team tạo VLAN 30 cho cụm máy ảo mới; VM trên host A ping được nhau nhưng VM ở host B không thấy gateway.

1. Host B nối vào switch 2; gateway nằm sau switch lõi. `show vlan brief` trên switch 2: VLAN 30 chưa tồn tại.
2. `show interfaces trunk` trên uplink: VLAN 30 không "active in management domain".
3. Tạo VLAN 30 trên switch 2 và thêm vào allowed list trunk uplink.
4. VM ở host B nhận DHCP và ping được gateway. Ghi runbook: tạo VLAN mới phải kiểm tra thủ công
   mọi switch trên đường đi (trừ khi có công cụ đồng bộ VLAN tự động, nằm ngoài phạm vi bài này).

## 7. Tự kiểm tra

**Câu 1**: Khác biệt giữa access port và trunk port?

a) Access: 1 VLAN, frame không tag. Trunk: nhiều VLAN, frame gắn tag 802.1Q (trừ native VLAN)
b) Access cho nhiều VLAN không tag, Trunk chỉ 1 VLAN có tag
c) Access và Trunk giống nhau về chức năng, chỉ khác tên gọi theo hãng thiết bị
d) Access tag mọi frame bằng 802.1Q, Trunk không cần tag vì switch tự nhận diện VLAN theo port

**Đáp án: a** — Access: 1 VLAN, frame không tag. Trunk: nhiều VLAN, frame gắn tag 802.1Q (trừ
native VLAN). Vai trò của access/trunk bị đảo ngược hoàn toàn (loại b); hai loại port có vai
trò và cấu hình khác nhau rõ rệt, không phải chỉ khác tên gọi (loại c); việc tag thuộc về trunk
(nhiều VLAN cần phân biệt), access không cần tag vì chỉ có 1 VLAN duy nhất (loại d).

---

**Câu 2**: Dải VLAN ID dùng được là bao nhiêu và vì sao?

a) 0–4095, toàn bộ 4096 giá trị đều dùng được vì VID không có giá trị dự trữ nào
b) 1–4094 (VID 12 bit = 0–4095; 0 và 4095 dành riêng, không gán cho VLAN thường)
c) 1–1000, vì chuẩn 802.1Q giới hạn số VLAN tối đa theo thiết kế phần cứng phổ biến
d) 1–4096, vì VID là trường 13 bit theo chuẩn 802.1Q

**Đáp án: b** — 1–4094 (VID 12 bit = 0–4095; 0 và 4095 dành riêng). VID 0 và 4095 có ý nghĩa đặc
biệt (không phải VLAN thường), không dùng được như hai đầu còn lại trong dải (loại a); giới hạn
thực tế là do chính trường VID 12 bit quy định (0–4095), không phải một con số tuỳ ý 1000 do
phần cứng (loại c); VID là trường 12 bit, không phải 13 bit (loại d).

---

**Câu 3**: Hai máy ở VLAN 10 và VLAN 20 trên cùng switch có ping được nhau không, cần gì?

a) Có, vì cùng switch vật lý nên Layer 2 vẫn chuyển được bất kể VLAN khác nhau
b) Có, nhưng chỉ khi cả hai VLAN cùng chung native VLAN trên trunk port
c) Không nếu chưa có L3 — cần router hoặc L3 switch (SVI/inter-VLAN routing) để định tuyến giữa
   hai VLAN
d) Không, và không có cách nào để hai VLAN này giao tiếp được trừ khi gộp lại thành 1 VLAN

**Đáp án: c** — Không nếu chưa có L3: cần router/L3 switch (SVI/inter-VLAN routing). VLAN khác
nhau là hai broadcast domain riêng ở Layer 2, switch vật lý chung không đủ để chuyển trực tiếp
giữa chúng (loại a); native VLAN chỉ liên quan tới frame không tag trên trunk, không giúp hai
VLAN khác nhau giao tiếp (loại b); inter-VLAN routing (qua router/L3 switch) chính là cách giải
quyết mà không cần gộp VLAN (loại d).

---

**Câu 4**: Tag 802.1Q chiếm bao nhiêu byte?

a) 2 byte, chỉ chứa VID vì TPID được tính riêng ngoài tag
b) 8 byte, vì tag còn chứa thêm checksum riêng cho VLAN
c) 1 byte, vì VID chỉ cần 12 bit làm tròn lên byte gần nhất
d) 4 byte (TPID 0x8100 + PCP/DEI + VID)

**Đáp án: d** — 4 byte (TPID 0x8100 + PCP/DEI + VID). TPID là một phần của tag, không tính
riêng ngoài 4 byte (loại a); 802.1Q không có trường checksum riêng cho VLAN (loại b); VID chỉ
chiếm 12 bit trong tổng 4 byte, cùng với TPID (16 bit) và PCP/DEI (4 bit), không phải 1 byte độc
lập (loại c).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.switching.basics`, `networking.switching.stp`, `networking.switching.lacp`

**Nguồn tham khảo:**
- [802.1q VLAN — kernel docs](https://docs.kernel.org/networking/8021q.html)
- [bridge(8) — man7.org](https://man7.org/linux/man-pages/man8/bridge.8.html) — `bridge vlan`.
- [ip-link(8) — man7.org](https://man7.org/linux/man-pages/man8/ip-link.8.html) — `type vlan`.
