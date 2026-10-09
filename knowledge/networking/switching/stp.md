---
id: networking.switching.stp
title: "Spanning Tree Protocol: ngăn loop, root bridge, port state"
domain: networking
module: networking.switching
level: "vận hành"
prerequisites: ["networking.switching.vlan"]
applies_to:
  - "IEEE 802.1D (STP), 802.1w (RSTP), 802.1s (MSTP) — Linux bridge và CLI kiểu Cisco IOS"
status: verified
sources:
  - "https://docs.kernel.org/networking/bridge.html"
  - "https://man7.org/linux/man-pages/man8/bridge.8.html"
  - "https://man7.org/linux/man-pages/man8/ip-link.8.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5.5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Ethernet frame không có TTL. Nếu mạng L2 có vòng (loop), broadcast quay vòng mãi, nhân lên
theo cấp số nhân (broadcast storm), CPU switch kịch trần, cả mạng sập chỉ vì 1 sợi cáp cắm
nhầm. STP cho phép thiết kế dự phòng vật lý (nhiều đường) nhưng chỉ dùng 1 đường logic không
vòng tại mỗi thời điểm. Hiểu STP giúp bạn không "tắt STP cho đỡ phiền" và đọc được vì sao 1
link đang bị block.

## 2. Khái niệm cốt lõi

- **Bridge ID** = priority (mặc định 32768, bước 4096; Cisco PVST+ cộng thêm VLAN ID) + MAC. Số nhỏ nhất thắng.
- **Root bridge**: switch có Bridge ID nhỏ nhất — gốc của cây; mọi switch khác tính đường tới nó.
- **Root port**: port có đường chi phí thấp nhất về root (mỗi switch không phải root có đúng 1).
- **Designated port**: port chuyển tiếp lưu lượng cho 1 segment (chọn theo chi phí thấp nhất về root).
- **Blocked/alternate port**: các port còn lại bị chặn để cắt loop.
- **BPDU**: gói điều khiển STP trao đổi định kỳ (hello mặc định 2 giây).
- **Path cost**: tỉ lệ nghịch với băng thông; ví dụ giá trị short (802.1D-1998): 10 Mb/s=100, 100 Mb/s=19, 1 Gb/s=4, 10 Gb/s=2. Giá trị long (802.1t / RSTP mặc định hiện đại) mở rộng, ví dụ 1 Gb/s=20000.

Biến thể: **STP** (802.1D) hội tụ 30–50 giây; **RSTP** (802.1w) hội tụ trong vài giây; **MSTP** (802.1s) gom nhiều VLAN vào vài instance.

## 3. Cách nó hoạt động

1. Mọi switch ban đầu tự cho mình là root, gửi BPDU chứa Bridge ID của mình.
2. Khi nhận BPDU có root ID tốt hơn, switch chấp nhận root mới và chuyển tiếp thông tin cùng chi phí cộng dồn.
3. Hội tụ: mỗi non-root chọn 1 root port; mỗi segment chọn 1 designated port; phần còn lại blocking.

**Port state (STP cổ điển)**: Blocking (~20 s max-age) → Listening (15 s forward delay) → Learning (15 s) → Forwarding. Do đó cắm cáp mới có thể mất ~30 s mới chuyển frame — lý do máy "không lấy được DHCP" ngay khi cắm. **RSTP** rút còn 3 trạng thái (discarding/learning/forwarding) và dùng handshake proposal/agreement thay vì chờ timer; port edge (nối end-host) lên forwarding ngay.

**Bảo vệ cần biết**: PortFast/edge port (end-host lên ngay), **BPDU Guard** (port edge nhận BPDU → err-disable, chống mini switch cắm lậu), **Root Guard** (không cho port nhận BPDU "tốt hơn" cướp root), Loop Guard.

**Đặt root có chủ ý**: nếu không, switch có MAC nhỏ nhất (thường là thiết bị cũ nhất) trở thành root và có thể nằm ở rìa mạng, làm lưu lượng đi vòng vèo. Hãy hạ priority của switch lõi.

## 4. Thực hành

Linux bridge (minh họa; cần root, output minh họa):

```bash
ip link add br0 type bridge stp_state 1
ip link set br0 up
ip link set eth1 master br0
bridge link show
```

```
3: eth1 state forwarding priority 32 cost 100 master br0
```

Cisco IOS (minh họa):

```
Switch# show spanning-tree vlan 10
Switch(config)# spanning-tree mode rapid-pvst
Switch(config)# spanning-tree vlan 10 root primary
Switch(config-if)# spanning-tree portfast
Switch(config-if)# spanning-tree bpduguard enable
```

Đọc output `show spanning-tree`: dòng "This bridge is the root" xác nhận root; cột Role (Root/Desg/Altn) và Sts (FWD/BLK) cho biết port nào bị chặn.

## 5. Lỗi thường gặp và cách chẩn đoán

**Broadcast storm sau khi cắm cáp/switch mới**
- Nguyên nhân: loop mà STP không bảo vệ (STP tắt, BPDU bị lọc, BPDU Filter sai chỗ).
- Xác nhận: LED port nhấp nháy liên tục, CPU cao, MAC flapping, `show interfaces` có broadcast đột biến.
- Xử lý: rút cáp gây loop; kiểm tra STP bật trên mọi switch.

**Root bridge nằm sai chỗ**
- Nguyên nhân: để mặc định priority. Xác nhận: `show spanning-tree` ghi root là switch rìa. Xử lý: đặt priority thấp ở lõi (và backup root), bật Root Guard ở port xuống.

**Port err-disabled do BPDU Guard**
- Nguyên nhân: có switch/thiết bị phát BPDU trên port edge. Xử lý: gỡ thiết bị rồi bật lại port (`shutdown`/`no shutdown`), cân nhắc errdisable recovery.

**Topology change liên tục (mạng chập chờn)**
- Nguyên nhân: port flapping (cáp/SFP lỗi) hoặc port end-host chưa PortFast. Xác nhận: counter topology change tăng; `show spanning-tree detail`.

## 6. Tình huống thực tế

Sau khi thêm một switch cho phòng lab, toàn tầng mất mạng ngắt quãng.

1. Switch lõi: CPU 95%, `show mac address-table` thấy MAC gateway nhảy port.
2. `show spanning-tree vlan 10`: root bridge là switch lab mới (MAC nhỏ hơn, priority mặc định) — mạng bị tái hội tụ, các uplink lõi chuyển sang blocking.
3. Hạ priority lõi (`root primary`) → root trở về lõi; bật Root Guard trên port xuống switch lab và BPDU Guard trên port end-host.
4. Mạng ổn định. Ghi runbook: mọi switch mới phải ở chế độ không được là root (priority cao) trước khi nối.

## 7. Tự kiểm tra

1. Vì sao mạng L2 có vòng gây broadcast storm?
   <details><summary>Đáp án</summary>Ethernet không có TTL, broadcast bị flood và lặp mãi trong vòng, nhân lên.</details>

2. Root bridge được chọn thế nào?
   <details><summary>Đáp án</summary>Bridge ID nhỏ nhất = priority (mặc định 32768) rồi đến MAC nhỏ nhất.</details>

3. Vì sao cắm máy vào có thể mất ~30 giây mới có mạng ở STP cổ điển, và giải pháp?
   <details><summary>Đáp án</summary>Port đi qua Listening (15 s) + Learning (15 s). Dùng RSTP và PortFast/edge port.</details>

4. BPDU Guard bảo vệ điều gì?
   <details><summary>Đáp án</summary>Port edge nhận BPDU sẽ bị err-disable, ngăn switch lạ chen vào topology.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:** `networking.switching.vlan`, `networking.switching.lacp`

**Nguồn tham khảo:**
- [Linux Ethernet Bridging — kernel docs](https://docs.kernel.org/networking/bridge.html)
- [bridge(8) — man7.org](https://man7.org/linux/man-pages/man8/bridge.8.html)
- [ip-link(8) — man7.org](https://man7.org/linux/man-pages/man8/ip-link.8.html) — tham số `stp_state`.
