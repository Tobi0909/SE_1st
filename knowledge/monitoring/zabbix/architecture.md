---
id: monitoring.zabbix.architecture
title: "Kiến trúc Zabbix: server, agent, proxy"
domain: monitoring
module: monitoring.zabbix
level: "nền tảng"
prerequisites: []
applies_to:
  - "Zabbix 6.x/7.x — khái niệm cốt lõi về architecture tương thích cả 2 phiên bản; UI thay đổi nhỏ giữa phiên bản"
status: verified
sources:
  - "https://www.zabbix.com/documentation/current/en/manual/concepts"
  - "https://www.zabbix.com/documentation/current/en/manual/introduction/overview"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Môi trường lab Zabbix không có sẵn. Toàn bộ output trong bài là **output minh hoạ**
> theo Zabbix documentation chính thức.

Zabbix là hệ thống monitoring phổ biến trong môi trường on-premises — đặc biệt ở các tổ chức
không dùng cloud-native stack (Prometheus/Grafana). Hiểu kiến trúc là nền tảng để cài đặt đúng,
cấu hình agent đúng cách, và thiết kế topology monitoring cho môi trường nhiều site hoặc nhiều
network segment (DMZ, production, internal). Không hiểu Zabbix Server vs Zabbix Proxy khác nhau
gì = không thể monitor host trong vùng mạng khác nhau đúng cách.

## 2. Khái niệm cốt lõi

**Zabbix Server**: thành phần trung tâm — lưu trữ toàn bộ configuration (host, item, trigger,
action) và historical data trong database (MySQL/PostgreSQL). Xử lý alert, điều phối collection.
Mỗi Zabbix deployment có đúng 1 Server. Server tự collect data từ agent (active/passive) hoặc
nhận data từ Proxy.

**Zabbix Agent**: daemon nhỏ cài trên host cần monitor — thu thập metric hệ thống (CPU, memory,
disk, network, process, log...). Zabbix 2 loại agent:
- **Agent (legacy)**: binary C cũ, lightweight, chạy trên mọi OS; vẫn được hỗ trợ.
- **Agent 2**: binary Go, native support cho plugins (Docker, MySQL, PostgreSQL, Redis...) và
  scheduled checks. Khuyến nghị cho deployment mới từ Zabbix 5.4+.

**Zabbix Proxy**: thu thập data thay mặt Server từ một vùng mạng riêng biệt, sau đó forward
về Server. Dùng khi: (1) agent trong DMZ không thể kết nối trực tiếp Server nội bộ; (2) WAN
link chậm — Proxy buffer data local, giảm tải cho Server; (3) phân tán theo site địa lý. Proxy
có database riêng (buffer), không cần truy cập database Server.

**Zabbix Frontend**: web UI (PHP, chạy trên Apache/Nginx). Kết nối trực tiếp vào Zabbix Server
DB để hiển thị data và quản lý configuration. Có thể cài trên máy khác với Server.

**Active vs Passive check**:
- **Passive** (pull): Server/Proxy kết nối đến Agent (TCP port 10050) để lấy data theo schedule.
  Server phải reach được Agent.
- **Active** (push): Agent kết nối đến Server/Proxy (TCP port 10051) để nhận list item cần
  collect, rồi tự gửi data về. Agent phải reach được Server/Proxy. Hữu ích khi agent sau
  NAT/firewall không thể nhận inbound connection.

**IPMI, SNMP, JMX, HTTP checks**: Zabbix Server/Proxy cũng có thể monitor trực tiếp thiết bị
không cài được agent (network switch, printer, VMware host) qua các protocol này — không cần
agent.

## 3. Cách nó hoạt động

**Data flow cơ bản (passive check)**:
```
Host (Agent) ← TCP 10050 ← Zabbix Server → DB (MySQL/PostgreSQL)
                                    ↑
                              Zabbix Frontend (web UI)
```

**Data flow với Proxy (active check qua Proxy)**:
```
Host (Agent) → TCP 10051 → Zabbix Proxy → TCP 10051 → Zabbix Server → DB
                           (buffer data)
```

**Polling vs Trapping**:
- **Polling**: Server/Proxy chủ động gọi ra để lấy data (passive agent check, SNMP, IPMI).
  Mỗi item có `Update interval` riêng.
- **Trapping**: Agent/thiết bị chủ động gửi data đến Server port 10051 (`zabbix_sender`).
  Dùng cho script/batch job muốn push kết quả vào Zabbix.

**History và Trends**: Zabbix lưu raw data trong bảng `history_*` (mặc định giữ 90 ngày), và
tổng hợp theo giờ vào bảng `trends_*` (mặc định giữ 365 ngày). Historical data dùng cho graph
chi tiết; trends data cho graph dài hạn. Cần tune thời gian giữ theo khả năng lưu trữ DB.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Zabbix documentation.

**Kiểm tra kết nối agent từ server** (passive check):

```bash
# Trên Zabbix Server — test lấy metric từ agent
zabbix_get -s 192.168.1.100 -p 10050 -k "system.uptime"
# 432789

zabbix_get -s 192.168.1.100 -p 10050 -k "agent.version"
# 6.4.0

zabbix_get -s 192.168.1.100 -p 10050 -k "vm.memory.size[available]"
# 2147483648
```

`zabbix_get` là công cụ debug đơn giản nhất: nếu trả về giá trị = agent chạy đúng và Server
reach được agent.

**Cấu hình agent** (`/etc/zabbix/zabbix_agent2.conf` cho Agent 2):

```ini
# Thông tin Server
Server=192.168.10.50          # IP của Zabbix Server (passive — Server kết nối đến agent)
ServerActive=192.168.10.50    # IP để agent gửi data (active check)
Hostname=web-server-01        # Phải khớp với hostname đăng ký trong Zabbix Frontend

# Port agent listen (passive)
ListenPort=10050

# Log
LogFile=/var/log/zabbix/zabbix_agent2.log
LogFileSize=10

# Timeout
Timeout=3

# Số kết nối đồng thời từ Server (passive)
StartAgents=3
```

**Kiểm tra trạng thái agent**:

```bash
# Xem agent có đang chạy không
systemctl status zabbix-agent2

# Xem log agent (tìm error/warning)
journalctl -u zabbix-agent2 --since "1 hour ago" | grep -i "error\|warn\|fail"

# Test active check — agent kết nối đến server
zabbix_agent2 -t agent.ping
# agent.ping                                    [t|1]
```

**Active vs Passive — chọn khi nào**:

```
Topology 1: Agent trong DMZ, Server trong internal network
→ DMZ firewall block inbound từ internal → Passive check KHÔNG hoạt động
→ Dùng Active check: agent kết nối outbound về Server (hoặc Proxy đặt trong DMZ)

Topology 2: Agent trong internal, Server reach được trực tiếp
→ Passive hoặc Active đều được
→ Passive đơn giản hơn (không cần agent biết IP Server trước khi đăng ký)

Topology 3: nhiều site địa lý, WAN link không ổn định
→ Đặt Proxy tại mỗi site → Agent chỉ cần kết nối Proxy local
→ Proxy buffer data khi WAN bị gián đoạn, sync lại khi up
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Agent trong Zabbix Frontend hiện "ZBX" đỏ (agent không phản hồi)**
- Nguyên nhân: (1) agent không chạy; (2) firewall block port 10050 từ Server đến Host;
  (3) hostname trong config agent không khớp với hostname trong Frontend; (4) IP Agent
  thay đổi (DHCP).
- Cách chẩn đoán: `zabbix_get -s <host-ip> -p 10050 -k agent.ping` từ Server — nếu timeout
  = firewall/network; nếu `ZBX_NOTSUPPORTED` = agent chạy nhưng item không hỗ trợ.

**Item luôn ở trạng thái "Not supported"**
- Nguyên nhân: agent không nhận ra key metric (typo trong item key, plugin chưa cài, tham số sai).
- Cách debug: `zabbix_get -s <ip> -p 10050 -k "<item-key>"` để xem lỗi cụ thể từ agent.
  Ví dụ: `zabbix_get ... -k "proc.num[nginx]"` trả về số process nginx đang chạy.

**Proxy không sync data về Server**
- Nguyên nhân: (1) Proxy DB đầy (buffer quá nhiều, không sync được); (2) firewall block port
  10051 từ Proxy đến Server; (3) Proxy config `Server=` trỏ sai IP.
- Cách chẩn đoán: xem log Proxy (`/var/log/zabbix/zabbix_proxy.log`) — có message "cannot
  send data to Zabbix server" không; kiểm tra `ProxyLocalBuffer` và `ProxyOfflineBuffer` config.

## 6. Tình huống thực tế

Thiết kế topology Zabbix cho công ty có 2 site: HQ (Hà Nội) và branch (TP.HCM), kết nối WAN:

```
[Site HCM]                          [Site HN]
Web-01 (Agent active) ─────────→ Proxy-HCM ─────→ Zabbix Server (HN)
DB-01  (Agent active) ─────────↗               ↗
                                               /
                         [DMZ-HN]             /
                         LB-01 (Agent active)→
```

**Quyết định thiết kế**:
1. Proxy tại HCM: buffer data local khi WAN gián đoạn; agent chỉ cần reach Proxy (local LAN,
   nhanh); Server không cần direct access vào LAN HCM.
2. Active check cho tất cả agent: agent tự kết nối outbound đến Proxy/Server — không cần
   mở inbound port từ Server/Proxy đến từng host.
3. Agent 2 thay vì Agent 1: HCM có MySQL — dùng native MySQL plugin của Agent 2, không cần
   UserParameter thủ công.

## 7. Tự kiểm tra

**Câu 1**: Tại sao Zabbix Proxy cần có database riêng, trong khi Zabbix Agent thì không?

a) Vì Proxy cần database để lưu cấu hình GUI riêng, không liên quan tới buffer data
b) Vì Agent thực ra cũng cần database riêng, chỉ là mặc định dùng SQLite ẩn không ai thấy
c) Vì Proxy database dùng để lưu log lỗi debug, không phục vụ mục đích buffer dữ liệu giám sát
d) Zabbix Proxy buffer data thu thập được LOCAL trước khi gửi về Server

**Đáp án: d** — Proxy buffer data LOCAL trước khi gửi về Server, cần database để lưu buffer
khi Server không reach được. Agent stateless, không cần lưu trữ. Database của Proxy phục vụ
BUFFER DATA GIÁM SÁT, không phải cấu hình GUI (Proxy không có Frontend riêng — loại a); Agent
KHÔNG cần database, kể cả ẩn — nó hoàn toàn stateless theo thiết kế (loại b); mục đích chính
của database Proxy là buffer dữ liệu giám sát thu thập được, không phải log debug (loại c).

---

**Câu 2**: Agent được cấu hình `Server=10.0.0.1` (passive) nhưng không có `ServerActive`. Có
sự kiện nào trong Zabbix Frontend sẽ không hoạt động không?

a) Active check sẽ không hoạt động — agent không gửi data chủ động, không nhận list active item từ Server
b) Passive check sẽ không hoạt động, vì thiếu ServerActive khiến Server không thể polling
   agent
c) Không có gì bị ảnh hưởng, ServerActive chỉ là tham số tùy chọn không ảnh hưởng chức năng nào
d) Toàn bộ agent sẽ crash ngay khi start vì thiếu ServerActive là tham số bắt buộc

**Đáp án: a** — Active check không hoạt động (thiếu `ServerActive`); passive check vẫn hoạt
động bình thường qua `Server=`. Nếu template có cả 2 loại item, active items hiện "No data".
`Server=` chính là tham số cho PASSIVE check (Server biết agent ở đâu để polling) — passive
vẫn hoạt động bình thường, không bị ảnh hưởng (loại b); thiếu `ServerActive` CÓ ảnh hưởng thật
tới active check — không phải "không ảnh hưởng gì" (loại c); agent không bắt buộc phải có
`ServerActive` để start — nó chỉ không chạy được active check, không crash (loại d).

---

**Câu 3**: Sự khác biệt giữa Zabbix Agent và Zabbix Agent 2?

a) Agent viết bằng Go có plugin framework; Agent 2 viết bằng C không có plugin framework
b) Agent (legacy) viết bằng C: nhẹ, tương thích rộng, không có plugin framework riêng — mở rộng qua UserParameter
c) Agent và Agent 2 hoàn toàn giống nhau về code, chỉ khác số version hiển thị
d) Agent 2 chỉ chạy được trên Windows, Agent legacy chỉ chạy được trên Linux

**Đáp án: b** — Agent (C) nhẹ, mở rộng qua UserParameter. Agent 2 (Go) có plugin framework
native, scheduled checks, concurrency tốt hơn. Vai trò ngôn ngữ/framework bị đảo ngược hoàn
toàn trong lựa chọn a (loại a); hai phiên bản có codebase khác hẳn (C vs Go), không giống
nhau (loại c); cả hai agent chạy được trên nhiều hệ điều hành (Linux, Windows...), không giới
hạn mỗi bên 1 OS (loại d).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `monitoring.zabbix.items-triggers` — Item key, trigger expression, action (alerting): dựa
  trên nền tảng architecture ở bài này.

**Bài liên quan ngoài module (xem thêm):**
- `monitoring.alerting-design.principles` — thiết kế alert không gây fatigue: áp dụng khi
  viết trigger Zabbix.

**Nguồn tham khảo:**
- [Zabbix Concepts — zabbix.com](https://www.zabbix.com/documentation/current/en/manual/concepts)
  — định nghĩa Server, Proxy, Agent, Frontend, database.
- [Zabbix Overview — zabbix.com](https://www.zabbix.com/documentation/current/en/manual/introduction/overview)
  — architecture diagram, data flow, polling/trapping.
