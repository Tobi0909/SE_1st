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

1. Một kết nối TCP có thể dùng băng thông cộng của cả 2 link trong bundle không?
   <details><summary>Đáp án</summary>Không. Hash gắn mỗi flow vào 1 link; chỉ tổng nhiều flow mới tận dụng cả 2.</details>

2. LACP active/passive khác nhau thế nào, cặp nào không hình thành bundle?
   <details><summary>Đáp án</summary>Active chủ động gửi LACPDU, passive chỉ trả lời. Cả hai passive thì không đầu nào bắt đầu → không có bundle.</details>

3. Vì sao ưu tiên LACP hơn gộp tĩnh?
   <details><summary>Đáp án</summary>LACP phát hiện cấu hình lệch và link hỏng; gộp tĩnh không thoả thuận nên dễ gây loop/blackhole.</details>

4. LACP chuẩn có nối 1 server vào 2 switch độc lập được không?
   <details><summary>Đáp án</summary>Không, trừ khi 2 switch tạo thành 1 hệ logic (MLAG/vPC/stack).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:** `networking.switching.vlan`, `networking.switching.vpc-advanced`

**Nguồn tham khảo:**
- [Linux Ethernet Bonding Driver HOWTO — kernel docs](https://docs.kernel.org/networking/bonding.html)
- [ip-link(8) — man7.org](https://man7.org/linux/man-pages/man8/ip-link.8.html) — `type bond`.
