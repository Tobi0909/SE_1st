---
id: security.network-security.ids-ips
title: "IDS/IPS cơ bản: phát hiện và ngăn chặn xâm nhập"
domain: security
module: security.network-security
level: "chuyên sâu"
prerequisites: ["security.network-security.fundamentals"]
applies_to:
  - "Suricata (NIDS/NIPS open-source) và OSSEC/Wazuh (HIDS); nguyên lý chung áp dụng cho mọi IDS/IPS"
status: verified
sources:
  - "https://csrc.nist.gov/publications/detail/sp/800-94/final"
  - "https://docs.suricata.io/en/latest/"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Firewall (đã học ở `security.network-security.fundamentals`) kiểm soát traffic theo port, IP,
và trạng thái kết nối — nhưng không đọc nội dung. Attacker biết điều này: mọi cuộc tấn công
phổ biến (SQL injection, exploit, command-and-control) đều đi qua các port đã được firewall
cho phép (80, 443, 22).

**IDS/IPS** lấp đầy khoảng trống đó bằng cách phân tích nội dung gói tin (deep packet
inspection) và hành vi: phát hiện scan, brute force, payload exploit, hay traffic bất thường
ngay cả khi đã qua firewall.

Trong mô hình defense in depth, IDS/IPS là lớp ngay sau firewall — không thay thế firewall
mà phát hiện những gì firewall bỏ qua.

## 2. Khái niệm cốt lõi

### IDS vs IPS

| | **IDS** (Intrusion Detection System) | **IPS** (Intrusion Prevention System) |
|-|--------------------------------------|----------------------------------------|
| Vị trí | Passive — xem bản sao traffic | Inline — nằm trên đường đi của traffic |
| Khi phát hiện | Tạo alert, ghi log | Drop/reject packet ngay lập tức |
| Rủi ro | Không thể block (chỉ cảnh báo) | False positive → drop traffic hợp lệ |
| Use case | Monitor, forensics, tuning giai đoạn đầu | Production sau khi đã tune xong rule |

Trong thực tế, một công cụ (ví dụ Suricata) có thể chạy cả hai mode — khởi đầu ở IDS mode
để quan sát, sau đó chuyển sang IPS mode khi đã hiệu chỉnh xong.

### NIDS vs HIDS

**NIDS** (Network-based IDS) đặt ở tầng network, quan sát traffic giữa các host:

```
Internet → [Firewall] → [Switch SPAN port] → [NIDS/Suricata]
                    ↓
              Internal network
```

- Công cụ phổ biến: **Suricata**, Snort
- Thấy được mọi traffic qua segment đó, không cần cài agent trên từng server
- Mù với traffic trong cùng host (localhost → localhost)

**HIDS** (Host-based IDS) cài agent trực tiếp trên từng server, giám sát:
- File integrity (ai sửa `/etc/passwd`?)
- Log system (authentication failure, sudo)
- Process bất thường

- Công cụ phổ biến: **OSSEC**, **Wazuh** (fork của OSSEC, có dashboard)
- Thấy được hoạt động trong host, kể cả encrypted traffic đã được decrypt

### Signature-based vs Anomaly-based

**Signature-based**: so sánh traffic với database chữ ký đã biết.

```
Packet → Extract fields → Match signatures → Alert/Drop
```

- Ưu điểm: ít false positive, xác định chính xác loại tấn công
- Nhược điểm: không phát hiện được zero-day (chưa có chữ ký)

**Anomaly-based**: xây dựng baseline hành vi bình thường, cảnh báo khi lệch.

```
Học baseline (1-2 tuần) → Detect deviation → Alert
Ví dụ: server thường chỉ nhận 100 connection/phút, đột nhiên nhận 10,000/phút
```

- Ưu điểm: có thể phát hiện zero-day và tấn công mới
- Nhược điểm: false positive cao trong môi trường có traffic không đồng đều

### Deployment mode: Passive vs Inline

**Passive (IDS mode)**: nhận bản sao traffic qua SPAN port hoặc network TAP.

```
Traffic: Client → Switch → Server
                    │
               [SPAN port]
                    │
               [Suricata IDS]  ← chỉ xem, không can thiệp
```

**Inline (IPS mode)**: nằm trên đường đi, có thể drop.

```
Traffic: Client → [Suricata IPS] → Server
                        │
                    [Drop nếu match rule]
```

## 3. Cách nó hoạt động

### Signature rule format (Suricata/Snort)

Suricata dùng rule format tương thích Snort:

```
action  proto  src_ip  src_port  ->  dst_ip  dst_port  (options)
```

Ví dụ rule phát hiện SSH brute force:

```
alert tcp any any -> $HOME_NET 22 \
  (msg:"SSH Brute Force Attempt"; \
   flow:to_server; \
   threshold:type both, track by_src, count 5, seconds 60; \
   classtype:attempted-admin; \
   sid:9000001; rev:1;)
```

- `$HOME_NET`: biến định nghĩa trong `suricata.yaml`, thường là dải IP nội bộ
- `threshold`: trigger khi cùng src IP gửi ≥ 5 packet đến port 22 trong 60 giây
- `sid`: signature ID, phải unique

### Tradeoff false positive / false negative

Hai loại lỗi trái chiều nhau:

- **False positive (FP)**: traffic hợp lệ bị nhầm là tấn công → alert fatigue, block nhầm
- **False negative (FN)**: tấn công thật không bị phát hiện → bỏ lọt

Minh họa bằng số thực tế (1 triệu sự kiện/ngày, 100 cuộc tấn công thật — **chạy thật**):

```python
total, attacks, benign = 1_000_000, 100, 999_900

# Signature-based tuned chặt
tp1, fp1, fn1 = 80, 500, 20
# Anomaly-based ngưỡng thấp
tp2, fp2, fn2 = 97, 50_000, 3
```

Kết quả:

```
Signature-based (strict):
  Sensitivity (Detection rate): 80.0%
  False Positive Rate: 0.050%
  Precision: 13.79%
  Alerts/ngày tổng: 580 (trong đó 80 là attack thật)

Anomaly-based (sensitive):
  Sensitivity (Detection rate): 97.0%
  False Positive Rate: 5.001%
  Precision: 0.19%
  Alerts/ngày tổng: 50,097 (trong đó 97 là attack thật)
```

Anomaly-based bắt nhiều hơn (97 vs 80) nhưng sinh 50,000 alert/ngày thay vì 580 — team SOC
không thể xử lý. Đây là lý do IDS thực tế thường bắt đầu với signature-based và chỉ thêm
anomaly-based khi đã có hạ tầng triage tốt.

### Suricata log output (EVE JSON)

Suricata ghi alert ra `/var/log/suricata/eve.json` (EVE — Extensible Event Format):

```json
{
  "timestamp": "2026-10-07T10:23:45.123456+0700",
  "event_type": "alert",
  "src_ip": "203.0.113.45",
  "dest_ip": "10.0.1.10",
  "dest_port": 22,
  "proto": "TCP",
  "alert": {
    "action": "alert",
    "signature_id": 9000001,
    "signature": "SSH Brute Force Attempt",
    "category": "Attempted Administrator Privilege Gain",
    "severity": 1
  }
}
```

> **Output minh họa** — Suricata không cài trên máy demo; format JSON lấy từ tài liệu
> chính thức docs.suricata.io.

## 4. Thực hành

**Kiểm tra Suricata đang chạy ở mode nào** (output minh họa — cần Suricata đã cài):

```bash
# Xem process và tham số khởi động
ps aux | grep suricata
# IDS passive:  suricata -i eth0 -c /etc/suricata/suricata.yaml -D
# IPS inline:   suricata -q 0 -c /etc/suricata/suricata.yaml -D
```

**Theo dõi alert realtime**:

```bash
# Đọc EVE JSON, lọc chỉ alert (output minh họa — cần file log thật)
tail -f /var/log/suricata/eve.json | python3 -c "
import sys, json
for line in sys.stdin:
    e = json.loads(line)
    if e.get('event_type') == 'alert':
        print(f\"{e['timestamp']} {e['src_ip']} -> {e['dest_ip']}:{e.get('dest_port','')} | {e['alert']['signature']}\")
"
```

> **Output minh họa** — cần `/var/log/suricata/eve.json` thật.

**Bật IPS inline qua NFQueue** (output minh họa — cần root):

```bash
# 1. Redirect traffic vào queue 0
iptables -I FORWARD -j NFQUEUE --queue-num 0

# 2. Chạy Suricata ở IPS mode đọc từ queue 0
suricata -q 0 -c /etc/suricata/suricata.yaml -D

# 3. Đổi action trong rule từ "alert" sang "drop" để chặn thật
```

> **Output minh họa** — NFQueue yêu cầu root và kernel module `nf_queue`.

**Kiểm tra Wazuh agent nhận log** (output minh họa):

```bash
# Xem agent kết nối đến Wazuh manager
/var/ossec/bin/agent_control -i 001
# Agent 001: active, last keepalive: 2026-10-07 10:23:40
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Alert fatigue từ false positive** — kích hoạt Suricata với toàn bộ ruleset mặc định mà
không tune: hàng chục nghìn alert/ngày, phần lớn là false positive. Dẫn đến team bỏ qua
alert. Fix: bắt đầu với ruleset nhỏ (chỉ các category quan trọng), suppress rule hay điều
chỉnh threshold cho traffic hợp lệ trước khi bật thêm.

**Bật IPS inline mà không test** — đổi từ IDS sang IPS mà không có giai đoạn shadow mode (IDS
giám sát song song IPS). Rule còn false positive → drop traffic sản xuất → downtime. Fix: chạy
IDS mode ít nhất 1-2 tuần, xem alert, suppress false positive, rồi mới bật IPS mode.

**$HOME_NET sai** — Suricata không biết đâu là "mạng nội bộ" nếu không cấu hình biến
`$HOME_NET` đúng trong `suricata.yaml`. Rule viết `-> $HOME_NET 22` sẽ không trigger nếu
`$HOME_NET` trỏ sai subnet. Kiểm tra: `grep HOME_NET /etc/suricata/suricata.yaml`.

**HIDS bật file integrity monitor trên thư mục log** — `/var/log` thay đổi liên tục → alert
tràn lan về file modification không phải intrusion. Cần loại trừ đường dẫn log, tmp, và cache
khỏi FIM, chỉ giám sát `/etc`, `/bin`, `/sbin`, `/usr/bin`.

## 6. Tình huống thực tế

**Tình huống**: Một server SSH 10.0.1.10 đột ngột nhận hàng trăm authentication failure từ
IP ngoài 203.0.113.45. Đây là brute force attack điển hình.

**Phát hiện qua Suricata (NIDS)**:

Rule bắt được vì `count 5, seconds 60` → 5 kết nối TCP đến port 22 trong 60 giây → alert.

```
10:23:45 | ALERT | 203.0.113.45 → 10.0.1.10:22 | SSH Brute Force Attempt [sid:9000001]
```

**Nếu chạy IPS mode**: action đổi thành `drop`, packet từ 203.0.113.45 bị drop tự động.

**Phát hiện song song qua Wazuh (HIDS)** trên chính server 10.0.1.10:

```
/var/log/auth.log: Failed password for root from 203.0.113.45 port 51234 ssh2
```

Wazuh nhận log auth, khớp rule "SSH authentication failure" với threshold → alert riêng biệt,
cũng gắn cờ IP này.

**Kết hợp**: NIDS thấy ở tầng network → block. HIDS thấy ở tầng host → alert kể cả khi IP
thay đổi hoặc tấn công đến từ bên trong.

## 7. Tự kiểm tra

**Câu 1**: Sự khác biệt chính giữa IDS và IPS là gì?

a) IDS dùng signature-based, IPS dùng anomaly-based  
b) IDS là open-source, IPS là thương mại  
c) IDS passive (chỉ alert/log), IPS inline (có thể drop/block traffic ngay lập tức)  
d) IDS giám sát host, IPS giám sát network

**Đáp án: c** — IDS và IPS có thể dùng cùng kỹ thuật phát hiện (signature hay anomaly). Sự
khác biệt nằm ở vị trí và khả năng phản ứng: IDS nhận bản sao traffic (passive/out-of-band),
chỉ tạo alert; IPS nằm inline trên đường đi của traffic, có thể drop packet theo thời gian
thực. Rủi ro của IPS: false positive → drop nhầm traffic hợp lệ → downtime.

---

**Câu 2**: Khi nào nên dùng HIDS thay vì (hoặc bổ sung) NIDS?

a) Khi cần giám sát file integrity, log authentication, và hoạt động trong host  
b) Khi mạng dùng HTTPS — NIDS không decrypt được  
c) Khi không có switch hỗ trợ SPAN port  
d) Cả a, b, và c

**Đáp án: d** — HIDS và NIDS bổ sung cho nhau. NIDS thấy traffic giữa các host nhưng không
thấy hoạt động bên trong host (file thay đổi, sudo, process lạ); và không decrypt HTTPS. HIDS
cài trực tiếp trên host nên thấy được tất cả — kể cả encrypted traffic đã decrypt ở application
layer. Khi switch không hỗ trợ SPAN (không thể mirror traffic), NIDS không đặt được, nhưng
HIDS vẫn hoạt động vì không cần mirror.

---

**Câu 3**: Anomaly-based IDS sinh 50,000 alert/ngày trong khi signature-based chỉ sinh 580.
Tuy nhiên anomaly-based phát hiện được 97/100 attack, còn signature-based chỉ 80/100. Đâu là
lý do tổ chức thường ưu tiên signature-based trước?

a) Signature-based rẻ hơn  
b) 50,000 alert/ngày không thể xử lý thủ công — team SOC bị quá tải, dẫn đến bỏ qua tất cả alert  
c) Anomaly-based không hoạt động trên Linux  
d) Signature-based phát hiện được zero-day tốt hơn

**Đáp án: b** — Alert fatigue là vấn đề thực tế: khi alert quá nhiều, team bắt đầu bỏ qua
alert "như một thói quen" — ngay cả alert thật cũng không được xử lý kịp. 50,000 alert/ngày
với precision 0.19% (chỉ 97 thật) là không khả thi vận hành. Signature-based với 580 alert và
precision 13.79% dễ triage hơn nhiều, mặc dù bỏ lọt 20/100 attack.

---

**Câu 4**: Suricata khởi động với lệnh `suricata -q 0 -c /etc/suricata/suricata.yaml`. Điều
này cho biết gì?

a) Suricata chạy ở IDS mode, passive, lắng nghe interface thứ 0  
b) Suricata chạy ở IPS mode, đọc packet từ NFQueue số 0  
c) Suricata chạy benchmark test queue số 0  
d) Suricata load config số 0 từ thư mục rules

**Đáp án: b** — Flag `-q 0` (queue 0) chỉ định NFQueue number. NFQueue là cơ chế Linux kernel
cho phép userspace application (Suricata) nhận packet từ netfilter và quyết định accept hay
drop. Flag `-i eth0` (interface) thì mới là passive IDS mode. Khi dùng NFQueue, cần kết hợp
iptables redirect traffic vào queue đó: `iptables -I FORWARD -j NFQUEUE --queue-num 0`.

---

**Câu 5**: Rule Suricata có `threshold:type both, track by_src, count 5, seconds 60`. Ý nghĩa là gì?

a) Rule trigger sau khi cùng một src IP gửi ≥ 5 packet đến dst trong 60 giây; sau đó một lần  
b) Rule chỉ trigger trong khoảng thời gian 5-60 giây sau khi Suricata khởi động  
c) Rule trigger tối đa 5 lần, mỗi lần cách nhau 60 giây  
d) Rule bị vô hiệu sau 60 giây nếu không có packet mới

**Đáp án: a** — `threshold:type both` = trigger khi đạt ngưỡng VÀ reset counter sau mỗi lần
trigger; `track by_src` = đếm theo source IP (mỗi IP riêng); `count 5, seconds 60` = cần ≥ 5
lần match trong 60 giây từ cùng src IP mới trigger. Dùng để lọc brute force (5 lần thất bại
trong 1 phút) mà không alert mỗi lần thử đơn lẻ — tránh false positive từ user gõ sai password
1 lần.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước (prereq):**
- `security.network-security.fundamentals` — defense in depth, segmentation, DMZ: IDS/IPS là
  lớp bổ sung sau firewall trong mô hình đó

**Bài liên quan:**
- `security.vuln-patch.scanning` — vulnerability scanner (Nessus, OpenVAS) khác IDS: scanner
  chủ động probe, IDS thụ động quan sát
- `security.audit-compliance.audit-logging` — log từ IDS/IPS là input cho audit trail và SIEM
- `monitoring.log-management.centralized` — đẩy EVE JSON của Suricata vào ELK/Loki để
  centralize và visualize

**Nguồn tham khảo:**
- [NIST SP 800-94 — Guide to Intrusion Detection and Prevention Systems](https://csrc.nist.gov/publications/detail/sp/800-94/final)
- [Suricata User Guide](https://docs.suricata.io/en/latest/)
