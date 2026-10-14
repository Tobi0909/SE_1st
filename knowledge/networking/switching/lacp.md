---
id: networking.switching.lacp
title: "LACP/port-channel: gộp link tăng băng thông và dự phòng"
domain: networking
module: networking.switching
level: "vận hành"
prerequisites: ["networking.switching.vlan"]
applies_to:
  - "IEEE 802.1AX (trước đây 802.3ad) — Linux bonding mode 802.3ad và CLI kiểu Cisco IOS"
status: verified
sources:
  - "https://docs.kernel.org/networking/bonding.html"
  - "https://man7.org/linux/man-pages/man8/ip-link.8.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5.5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Server production thường nối vào switch bằng 2 link trở lên để chịu được đứt cáp/NIC và tăng
băng thông. Nếu chỉ cắm 2 cáp vào cùng mạng L2, STP sẽ chặn một cáp. Link aggregation
(port-channel / bond / LAG) gộp nhiều link vật lý thành 1 link logic, và LACP là giao thức
thoả thuận việc gộp đó một cách an toàn. Cấu hình lệch giữa 2 đầu là nguyên nhân thường gặp
của "mạng chập chờn" trên server mới.

## 2. Khái niệm cốt lõi

- **Port-channel / LAG / bond**: 1 interface logic gồm nhiều link thành viên.
- **LACP**: giao thức điều khiển (LACPDU) để 2 đầu thoả thuận thành viên. Chế độ `active` (chủ động gửi LACPDU) và `passive` (chỉ trả lời); ít nhất một đầu phải active.
- **Static / "on"**: gộp không thoả thuận — dễ lỗi vì không phát hiện cấu hình lệch.
- **Hash**: cách chọn link cho mỗi luồng (dựa trên MAC, IP, port L4). Một luồng (flow) đơn luôn đi 1 link, nên 1 kết nối TCP không vượt băng thông 1 link thành viên.
- LACPDU gửi mỗi 1 giây (fast) hoặc 30 giây (slow).
- Giới hạn thường gặp: tối đa 8 link active cho 1 bundle trên nhiều switch Cisco (có thể thêm standby) — TODO-VERIFY theo model cụ thể.

## 3. Cách nó hoạt động

Hai đầu trao đổi LACPDU gồm system priority/MAC, key, port ID. Link chỉ vào bundle khi cả hai
đầu đồng ý (cùng speed/duplex/VLAN/trunk config). Link nào mất LACPDU sẽ bị loại khỏi bundle
sau timeout và lưu lượng dồn sang link còn lại — failover trong vài giây (fast rate) hoặc lâu
hơn (slow).

**Phân phối theo hash, không theo gói.** Để tránh đảo thứ tự gói trong 1 flow, switch/host băm
các trường header để gắn mỗi flow vào 1 link. Cân bằng chỉ tốt khi có nhiều flow đa dạng. Tuỳ
chọn Linux `xmit_hash_policy` (`layer2`, `layer2+3`, `layer3+4`) quyết định hash.

**Cân nhắc nhiều switch:** LACP chuẩn chỉ gộp link tới MỘT switch logic. Nối 2 switch khác nhau
cần MLAG/vPC/stack (bài `networking.switching.vpc-advanced`).

## 4. Thực hành

Linux bonding 802.3ad (cần root; output minh họa):

```bash
ip link add bond0 type bond mode 802.3ad miimon 100 lacp_rate fast xmit_hash_policy layer3+4
ip link set eth0 down; ip link set eth0 master bond0
ip link set eth1 down; ip link set eth1 master bond0
ip link set bond0 up
cat /proc/net/bonding/bond0
```

```
Bonding Mode: IEEE 802.3ad Dynamic link aggregation
Transmit Hash Policy: layer3+4 (1)
LACP rate: fast
Aggregator ID: 1
Slave Interface: eth0
MII Status: up
Slave Interface: eth1
MII Status: up
```

Cisco IOS (minh họa):

```
interface range GigabitEthernet0/1 - 2
 channel-group 1 mode active
!
interface Port-channel1
 switchport mode trunk
```

Kiểm tra: `show etherchannel summary` — cờ `P` (bundled in port-channel) là tốt; `I` (stand-alone), `s` (suspended), `D` (down) là có vấn đề.

**Output đầy đủ `show etherchannel summary`** — cách đọc nhanh 1 link có vào bundle thật không:

```
Switch# show etherchannel summary
Flags:  D - down   P - bundled in port-channel   I - stand-alone
        s - suspended   R - Layer3   S - Layer2   U - in use

Group  Port-channel  Protocol    Ports
------+-------------+-----------+-----------------------------------------
1      Po1(SU)       LACP        Gi0/1(P)  Gi0/2(P)
2      Po2(SD)       LACP        Gi0/3(s)  Gi0/4(D)
```

`Po1` lành mạnh: cả `Gi0/1`/`Gi0/2` đều `(P)` — bundled thật, port-channel ở trạng thái `SU`
(Layer2, in Use). `Po2` có vấn đề: `(s)` là suspended (đối tác không chạy LACP hoặc config
lệch) và `(D)` là down — port-channel `SD` (down), toàn bộ bundle 2 KHÔNG chuyển được traffic
dù interface vật lý có thể vẫn "up/up" ở lớp dưới.

**Chi tiết từng thành viên qua `show lacp neighbor`** — dùng khi `show etherchannel summary`
đã báo nghi vấn nhưng cần xem đối tác (switch kia) khai báo gì:

```
Switch# show lacp neighbor
Flags:  S - Device is requesting Slow LACPDUs
        A - Device is in Active mode    P - Device is in Passive mode

Channel group 1 neighbors
Port      Flags  State        Port Priority  Port Number  Age   Key
Gi0/1     SA     bndl         32768           5            12s   0x1
Gi0/2     SA     bndl         32768           6            9s    0x1
```

`State: bndl` = đã vào bundle thành công. Nếu thấy `State: indep` (independent) hoặc không có
dòng nào cho một port — đối tác chưa thoả thuận LACP cho port đó, kiểm tra lại `channel-group`
và chế độ active/passive ở phía kia.

## 5. Lỗi thường gặp và cách chẩn đoán

**Một link thành viên ở trạng thái suspended/stand-alone**
- Nguyên nhân: cấu hình thành viên không đồng nhất (speed, duplex, native VLAN, allowed VLAN) hoặc đầu kia không chạy LACP.
- Xác nhận: `show etherchannel summary`, `show lacp neighbor`; Linux: `/proc/net/bonding/bond0` (Partner Mac = 00:00:00:00:00:00 nghĩa là chưa có đối tác).
- Xử lý: đồng bộ cấu hình, bật LACP cả hai đầu.

**Mất kết nối khi switch/server khởi động**
- Nguyên nhân: 2 đầu không cùng chế độ (một đầu static `on`, đầu kia LACP) hoặc LACPDU chưa kịp thoả thuận. Xử lý: dùng LACP đồng nhất và cân nhắc `lacp_rate fast`.

**Throughput không tăng gấp đôi**
- Nguyên nhân: ít flow hoặc hash policy không phân tán (ví dụ `layer2` với 1 cặp MAC). Xác nhận: counter từng link. Xử lý: đổi `xmit_hash_policy` (`layer3+4`) hoặc chấp nhận giới hạn theo flow.

## 6. Tình huống thực tế

Server database mới nối 2×10G vào switch, nhưng backup chỉ đạt khoảng 10G dù đã bond.

1. `cat /proc/net/bonding/bond0`: cả hai slave up, cùng Aggregator ID — LACP hoạt động.
2. Counter từng NIC: toàn bộ lưu lượng đi qua eth0, eth1 gần như rỗi.
3. Backup là 1 kết nối TCP duy nhất tới 1 IP; hash `layer2` cho cùng 1 link. Đổi hash chỉ giúp khi có nhiều flow.
4. Giải pháp: chạy backup đa luồng (nhiều kết nối song song) và đặt `layer3+4`. Ghi runbook: bond tăng băng thông tổng, KHÔNG tăng băng thông 1 flow.

## 7. Tự kiểm tra

**Câu 1**: Một kết nối TCP có thể dùng băng thông cộng của cả 2 link trong bundle không?

a) Không. Hash gắn mỗi flow (kết nối) vào một link cố định
b) Có, LACP tự động chia byte của một kết nối TCP ra đều hai link theo round-robin
c) Có, nhưng chỉ nếu bật chế độ "active-active" trên cả hai switch đầu cuối
d) Không, vì LACP giới hạn mỗi server chỉ được dùng 1 link bất kể cấu hình bundle

**Đáp án: a** — Không. Hash gắn mỗi flow vào 1 link; chỉ tổng nhiều flow mới tận dụng cả 2.
LACP không chia byte của một flow theo round-robin — làm vậy sẽ gây mất thứ tự gói tin (loại
b); không có chế độ "active-active" nào thay đổi cơ chế hash theo flow (loại c); server vẫn
dùng được cả hai link trong bundle, chỉ là MỘT flow không tự chia ra cả hai, không phải giới
hạn 1 link cho cả server (loại d).

---

**Câu 2**: LACP active/passive khác nhau thế nào, cặp nào không hình thành bundle?

a) Active chỉ gửi dữ liệu thật, passive chỉ gửi gói điều khiển LACPDU; cả hai active thì không
   hình thành bundle
b) Active chủ động gửi LACPDU, passive chỉ trả lời khi được hỏi; cả hai đầu đều passive thì
   không đầu nào bắt đầu — không hình thành bundle
c) Active và passive chỉ khác ở tốc độ gửi LACPDU (nhanh/chậm); mọi cặp đều hình thành bundle
   được
d) Active luôn ưu tiên làm master của bundle, passive làm backup; cặp active-active không hình
   thành bundle

**Đáp án: b** — Active chủ động gửi LACPDU, passive chỉ trả lời. Cả hai passive thì không đầu
nào bắt đầu → không có bundle. Active vẫn gửi cả dữ liệu thật và LACPDU, không phải chỉ một
trong hai (loại a); đây không phải khác biệt về tốc độ, mà về việc có chủ động khởi xướng trao
đổi LACPDU hay không (loại c); active-active hoàn toàn hình thành bundle bình thường — chính
passive-passive mới là cặp KHÔNG hình thành bundle (loại d, đảo ngược kết luận).

---

**Câu 3**: Vì sao ưu tiên LACP hơn gộp tĩnh?

a) Vì LACP cho tổng băng thông cao hơn gộp tĩnh với cùng số link vật lý
b) Vì gộp tĩnh chỉ hoạt động được với cáp quang, không hỗ trợ cáp đồng
c) LACP phát hiện cấu hình lệch và link hỏng qua trao đổi LACPDU liên tục
d) Vì LACP không cần cấu hình gì ở cả hai đầu, tự động dò và gộp link

**Đáp án: c** — LACP phát hiện cấu hình lệch và link hỏng; gộp tĩnh không thoả thuận nên dễ gây
loop/blackhole. Với cùng số link vật lý, băng thông tối đa lý thuyết là như nhau, LACP không
tự tăng băng thông (loại a); gộp tĩnh hoạt động được với cả cáp đồng và cáp quang (loại b);
LACP vẫn cần cấu hình cả hai đầu (bật LACP, chọn active/passive), không phải "không cần cấu
hình gì" (loại d).

---

**Câu 4**: LACP chuẩn có nối 1 server vào 2 switch độc lập được không?

a) Có, LACP chuẩn hỗ trợ sẵn việc nối tới nhiều switch độc lập mà không cần cấu hình gì thêm
b) Có, nhưng chỉ khi cả hai switch dùng chung VLAN quản trị
c) Không, và tuyệt đối không có cách nào (kể cả MLAG/vPC) để làm điều này
d) Không — LACP chuẩn chỉ hoạt động với một đối tác logic duy nhất

**Đáp án: d** — Không, trừ khi 2 switch tạo thành 1 hệ logic (MLAG/vPC/stack). LACP chuẩn không
hỗ trợ sẵn nối tới nhiều switch độc lập theo cách đó (loại a); VLAN quản trị chung không đủ để
hai switch hoạt động như một đối tác LACP (loại b); MLAG/vPC chính là cách làm được điều này,
không phải "tuyệt đối không có cách nào" (loại c).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:** `networking.switching.vlan`, `networking.switching.vpc-advanced`

**Nguồn tham khảo:**
- [Linux Ethernet Bonding Driver HOWTO — kernel docs](https://docs.kernel.org/networking/bonding.html)
- [ip-link(8) — man7.org](https://man7.org/linux/man-pages/man8/ip-link.8.html) — `type bond`.
