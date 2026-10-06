---
id: monitoring.zabbix.items-triggers
title: "Item, trigger, template trong Zabbix"
domain: monitoring
module: monitoring.zabbix
level: "vận hành"
prerequisites: ["monitoring.zabbix.architecture"]
applies_to:
  - "Zabbix 6.x/7.x — item keys, trigger expression syntax, template export/import"
status: draft
sources:
  - "https://www.zabbix.com/documentation/current/en/manual/config/items"
  - "https://www.zabbix.com/documentation/current/en/manual/config/triggers"
  - "https://www.zabbix.com/documentation/current/en/manual/config/templates"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

> **Lưu ý:** Môi trường lab Zabbix không có sẵn. Toàn bộ output trong bài là **output minh hoạ**
> theo Zabbix documentation chính thức.

Item, trigger, và template là 3 thành phần cốt lõi của Zabbix monitoring. Item là "đơn vị đo
lường", trigger là "điều kiện cảnh báo", template là "tập hợp tái sử dụng". Biết cấu hình Item
đúng key format giúp tránh "Not supported" error; hiểu trigger expression giúp viết condition
cảnh báo chính xác (không quá nhạy, không bỏ sót); hiểu template giúp apply monitoring đồng
nhất cho hàng trăm host mà không phải cấu hình từng host thủ công.

## 2. Khái niệm cốt lõi

**Item**: đơn vị thu thập một metric cụ thể từ host. Mỗi Item có:
- **Key**: định danh metric theo cú pháp `key.name[param1,param2]` (ví dụ:
  `vm.memory.size[available]`, `net.if.in[eth0]`, `proc.num[nginx]`)
- **Type**: Zabbix Agent (passive), Zabbix Agent (active), SNMP, IPMI, JMX, HTTP agent...
- **Update interval**: tần suất collect (ví dụ `60s`, `5m`, `1h`)
- **History / Trend storage period**: bao lâu giữ raw data / aggregated data
- **Value type**: Numeric (float/int), Character, Text, Log

**Trigger**: điều kiện Boolean dựa trên giá trị Item — khi điều kiện TRUE thì trigger PROBLEM,
khi FALSE thì RECOVERY. Mỗi trigger có:
- **Expression**: điều kiện dùng function + threshold (ví dụ: `last(/host/agent.ping)=0` hay
  `avg(/host/vm.memory.size[available],5m)<524288000`)
- **Severity**: Not classified, Information, Warning, Average, High, Disaster
- **Dependencies**: trigger A chỉ fire khi trigger B không active — tránh storm alert khi node
  bị down toàn bộ service trên đó fire cùng lúc

**Template**: tập hợp Item + Trigger + Graph + Dashboard + Discovery rules có thể được link
vào nhiều host. Template là cách chính để deploy monitoring đồng nhất. Zabbix cung cấp sẵn
template chuẩn cho Linux, Windows, MySQL, Nginx, Docker... có thể import ngay.

**Low-level Discovery (LLD)**: cơ chế tự động tạo Item/Trigger dựa trên discovery rule —
ví dụ: phát hiện tất cả network interface trên host rồi tự tạo Item `net.if.in[{#IFNAME}]`
và `net.if.out[{#IFNAME}]` cho từng interface. Tránh phải tạo Item thủ công cho mỗi interface.

**Macros**: placeholder `{$MACRO_NAME}` trong Item key / Trigger expression, được resolve khi
runtime. Dùng để parametrize template theo host (ví dụ: `{$MEMORY_WARN_THRESHOLD}` = 20% hay
10% tùy host). Macro có thể đặt ở template, host, hoặc global scope.

## 3. Cách nó hoạt động

**Item key syntax**: `<key>[<parameter1>,<parameter2>,...]`
- Tham số trong `[]` là positional, một số optional
- Tham số bắt buộc không được để trống: `net.if.in[eth0,bytes]` — tên interface phải chỉ định rõ
- Tham số có khoảng trắng phải được bọc trong `"`: `proc.num["my process"]`
- Built-in keys: `system.cpu.util`, `vm.memory.size[available]`, `vfs.fs.size[/,pfree]`,
  `net.if.in[eth0,bytes]`, `agent.ping`, `log[/var/log/syslog,ERROR]`...

**Trigger function syntax** (Zabbix 6+ expression syntax):
```
last(/Zabbix server/agent.ping)=0
```
Format: `function(/hostname/item.key,timeperiod)<operator><threshold>`
- `last()`: giá trị mới nhất
- `avg(,5m)`: trung bình 5 phút gần nhất
- `max(,1h)`: giá trị lớn nhất trong 1h
- `min(,5m)`: giá trị nhỏ nhất trong 5 phút
- `count(,5m,"gt","100")`: số lần giá trị > 100 trong 5 phút
- `change()`: giá trị thay đổi so với lần trước
- `nodata(,5m)`: TRUE nếu không có data trong 5 phút

**Template link**: khi link template vào host, tất cả Item/Trigger trong template được áp dụng
vào host đó. Nếu template được cập nhật (thêm item mới, sửa trigger), tất cả host đã link tự
động nhận thay đổi.

## 4. Thực hành

> Tất cả output sau là **output minh hoạ** theo Zabbix documentation.

**Item keys phổ biến cho Linux**:

```
# CPU
system.cpu.util[,user]        → CPU usage % (user space)
system.cpu.util[,iowait]      → I/O wait %
system.cpu.load[,avg1]        → load average 1 phút

# Memory
vm.memory.size[available]     → RAM available (bytes)
vm.memory.size[pavailable]    → RAM available (%)

# Disk I/O
vfs.dev.read[sda,ops]         → tổng read ops (counter; rate qua preprocessing)
vfs.dev.write[sda,ops]        → tổng write ops (counter; rate qua preprocessing)

# Filesystem
vfs.fs.size[/,pfree]          → % free trên /
vfs.fs.size[/var/log,pfree]   → % free trên /var/log

# Network (key trả về counter tích lũy — rate/sec tính qua preprocessing "Delta speed per second")
net.if.in[eth0,bytes]         → tổng bytes received (counter)
net.if.out[eth0,bytes]        → tổng bytes sent (counter)

# Process
proc.num[nginx]               → số nginx process đang chạy
proc.num[,,,zombie]           → số zombie process

# System
system.uptime                 → uptime (seconds)
agent.ping                    → 1 nếu agent reachable
```

**Trigger expression examples**:

```
# Agent không phản hồi (Not supported hoặc timeout)
last(/web-server-01/agent.ping)=0

# CPU iowait cao kéo dài (Warning: >20% trong 5 phút)
avg(/web-server-01/system.cpu.util[,iowait],5m)>20

# RAM available dưới 10% (High severity)
last(/web-server-01/vm.memory.size[pavailable])<10

# Disk / sắp đầy (Warning <20%, Average <10%)
last(/web-server-01/vfs.fs.size[/,pfree])<20

# Không nhận data từ host trong 5 phút (agent down?)
nodata(/web-server-01/agent.ping,5m)=1

# Nginx không còn process nào
last(/web-server-01/proc.num[nginx])=0
```

**Trigger với dependency** — tránh alert storm:

```
# Scenario: DB server down → App server không kết nối được DB
# Nếu không set dependency, cả 2 trigger đều fire

Trigger A (host: app-server): "DB connection failed"
  → Dependencies: Trigger B phải RESOLVED trước mới fire

Trigger B (host: db-server): "Agent không phản hồi"
  → Không có dependency

# Kết quả: khi DB down, chỉ Trigger B fire (root cause) —
# Trigger A không fire dù condition đúng (noise reduction)
```

**Template management** — import template chuẩn:

```
Zabbix Frontend → Configuration → Templates → Import
→ Chọn file XML/YAML (download từ zabbix.com/integrations)

Templates phổ biến có sẵn:
- "Linux by Zabbix agent" — CPU, memory, disk, network, process
- "MySQL by Zabbix agent 2" — connections, queries/s, replication lag
- "Nginx by HTTP" — requests/s, active connections, 5xx rate
- "Docker by Zabbix agent 2" — container CPU/memory/network
```

**Link template vào host**:

```
Configuration → Hosts → [chọn host] → Templates tab
→ Link new templates → gõ tên template → Select
→ Apply template (item/trigger tự động tạo theo template)
```

**Macro trong template** — ví dụ `{$MEMORY.AVAILABLE.MIN}`:

```
Template "Linux by Zabbix agent" định nghĩa trigger:
  last(/Linux by Zabbix agent/vm.memory.size[available]) < {$MEMORY.AVAILABLE.MIN}

Default macro value: 20M (20MB)

Override cho host cụ thể có RAM ít:
Configuration → Hosts → [host] → Macros tab
→ {$MEMORY.AVAILABLE.MIN} = 10M

→ Trigger trên host này cảnh báo khi < 10MB thay vì 20MB
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Item luôn "Not supported" — `NOTSUPPORTED: No such key`**
- Nguyên nhân: key không tồn tại trong agent, plugin chưa cài (Agent 2), hoặc tham số sai.
- Cách debug: `zabbix_get -s <host> -k "<key>"` — thấy error message cụ thể. Kiểm tra agent
  log: `/var/log/zabbix/zabbix_agent2.log` có dòng "Got error from active checks: unknown
  metric key" không.

**Trigger fire liên tục dù vấn đề đã hết (flapping)**
- Nguyên nhân: metric oscillate quanh ngưỡng trigger (ví dụ CPU iowait lên/xuống 20% liên tục).
- Cách xử lý: thay `last()` bằng `avg(,5m)` hoặc `min(,3m)` để làm mượt; hoặc dùng
  Hysteresis — trigger PROBLEM khi > 20%, RECOVERY khi < 15% (tránh flip liên tục).
  Zabbix hỗ trợ Recovery expression riêng biệt với Trigger expression (có từ Zabbix 3.2). Trong
  Zabbix 6+ với cú pháp mới, Recovery expression cũng dùng format `/hostname/key`.

**Trigger không fire dù metric đã vượt ngưỡng**
- Nguyên nhân phổ biến: (1) trigger disabled; (2) host maintenance mode đang active
  (trigger fire nhưng không gửi alert); (3) trigger có dependency và dependency trigger đang
  active; (4) item type sai (ví dụ dùng passive item key nhưng agent config active-only).

**Low-level Discovery không tạo Item mới**
- Nguyên nhân: discovery rule filter quá strict, hoặc discovery protocol sai (SNMP OID sai,
  SSH command không trả đúng JSON format).
- Cách debug: Configuration → Hosts → Discovery → xem "Last discovery" timestamp và "Error" field.

## 6. Tình huống thực tế

Cài monitoring cho web server mới chạy Nginx, cần cảnh báo khi Nginx down hoặc 5xx rate cao:

```
1. Link template "Nginx by HTTP" vào host
   → Tự tạo Item: nginx.requests, nginx.connections.active, nginx.responses.5xx...
   → Tự tạo Trigger: "Nginx is down" (no data 5 phút), "High 5xx rate"

2. Kiểm tra item data sau vài phút:
   Monitoring → Hosts → [host] → Latest data → filter "nginx"
   → Xem value có cập nhật không

3. Custom trigger cho business SLA:
   avg(/web-server-01/nginx.responses.5xx,5m) > 10
   Severity: High, Name: "5xx response rate exceeds 10/min"

4. Dependency: link "Nginx is down" phụ thuộc "Agent không phản hồi"
   → Khi server down, chỉ 1 alert thay vì cascade

5. Test trigger: Monitoring → Triggers → [trigger] → "Test expression"
   → Nhập value giả để verify expression logic đúng
```

## 7. Tự kiểm tra

1. Trigger dùng `last(/host/vm.memory.size[pavailable])<10` vs
   `min(/host/vm.memory.size[pavailable],5m)<10`. Cái nào tốt hơn và tại sao?
   <details><summary>Đáp án</summary>`min(,5m)<10` tốt hơn cho alert có ý nghĩa. `last()<10`
   fire ngay khi MỘT giá trị dưới 10% — có thể là spike tạm thời. `min(,5m)<10` chỉ fire khi
   giá trị THẤP NHẤT trong 5 phút cũng dưới 10% — nghĩa là memory đã thực sự thấp liên tục 5
   phút, không phải spike ngắn. Trong thực tế vận hành, spike 1-2 phút ít quan trọng; memory
   thấp liên tục mới cần alert.</details>

2. Template "Linux by Zabbix agent" được link vào 50 host. Cần thêm 1 item mới giám sát
   `/var/log/app.log` chứa từ "CRITICAL". Cần làm gì?
   <details><summary>Đáp án</summary>Sửa template (Configuration → Templates → [template] →
   Items → Create Item), không thêm vào từng host. Khi template được update, tất cả 50 host đã
   link sẽ tự động nhận item mới. Nếu thêm trực tiếp vào host, phải lặp lại 50 lần VÀ không
   được quản lý tập trung — khi cần sửa expression, phải sửa 50 chỗ. Item cho log dùng key
   `log[/var/log/app.log,CRITICAL]` với type "Zabbix agent (active)".</details>

3. Zabbix gửi alert cho trigger "nginx.process.count=0" nhưng ngay sau đó gửi thêm alert cho
   "web health check fail" và "5xx rate spike" trên cùng host. Cách nào giảm thiểu noise?
   <details><summary>Đáp án</summary>Trigger dependencies: set "web health check fail" và "5xx
   rate spike" phụ thuộc (depend on) trigger "nginx.process.count=0". Khi Nginx down, trigger
   root cause fire trước; 2 trigger còn lại bị suppress vì dependency đang active. Chỉ có 1
   alert được gửi. Khi Nginx up lại và trigger root cause RESOLVED, 2 trigger phụ thuộc mới
   được phép fire (nếu condition của chúng vẫn còn true).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `monitoring.zabbix.architecture` — Agent passive/active, Server/Proxy: cần hiểu data flow
  để cấu hình item type đúng (passive vs active).

**Bài liên quan ngoài module (xem thêm):**
- `monitoring.alerting-design.principles` — nguyên tắc thiết kế alert không gây fatigue:
  Zabbix trigger severity và dependency là implementation của những nguyên tắc đó.

**Nguồn tham khảo:**
- [Items — zabbix.com](https://www.zabbix.com/documentation/current/en/manual/config/items)
  — item types, key syntax, supported item keys, low-level discovery.
- [Triggers — zabbix.com](https://www.zabbix.com/documentation/current/en/manual/config/triggers)
  — trigger expression syntax, functions, dependencies, hysteresis.
- [Templates — zabbix.com](https://www.zabbix.com/documentation/current/en/manual/config/templates)
  — template linking, macros, import/export.
