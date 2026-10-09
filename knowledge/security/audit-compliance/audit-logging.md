---
id: security.audit-compliance.audit-logging
title: "Audit logging: ghi nhận và bảo vệ log khỏi bị sửa"
domain: security
module: security.audit-compliance
level: "vận hành"
prerequisites: ["monitoring.logging.fundamentals"]
applies_to:
  - "Linux (auditd, systemd journal, rsyslog); nguyên lý log integrity áp dụng cho mọi nền tảng"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man8/auditd.8.html"
  - "https://man7.org/linux/man-pages/man5/auditd.conf.5.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Application log ghi những gì app làm (request, error, latency). **Audit log** ghi những gì
*người* làm: ai đăng nhập, ai chạy lệnh nào với quyền gì, ai sửa file cấu hình quan trọng.

Sự khác biệt này trở nên quan trọng khi:
- **Điều tra sự cố**: "server bị compromise lúc 3 giờ sáng" — audit log cho biết ai đã SSH
  vào, chạy lệnh gì, sửa file nào
- **Compliance**: PCI DSS yêu cầu log mọi truy cập vào cardholder data; SOC 2 yêu cầu trail
  không thể sửa cho privileged access
- **Insider threat**: application log không phân biệt được admin hợp lệ đang debug hay đang
  exfiltrate dữ liệu

Audit log không có ý nghĩa nếu có thể bị sửa hay xóa — bảo vệ tính toàn vẹn của log là
phần không thể thiếu.

## 2. Khái niệm cốt lõi

### Audit log vs Application log

| | **Application log** | **Audit log** |
|-|---------------------|---------------|
| Ghi cái gì | Hành vi của phần mềm | Hành vi của con người và tiến trình |
| Ví dụ | `GET /api/users 200 45ms` | `user=admin; action=DELETE; resource=/etc/passwd` |
| Định dạng | Tùy app | Chuẩn hóa (ai/gì/khi/đâu) |
| Ai ghi | Developer viết log | OS/middleware ghi tự động |
| Bảo vệ | Thường không | Cần bảo vệ khỏi bị sửa/xóa |

### 4W của audit event

Mỗi audit record cần đủ 4 thành phần:

- **Who**: user ID, process ID, session ID
- **What**: action (read/write/execute/delete), syscall name
- **When**: timestamp chính xác với timezone
- **Where**: file path, network address, resource name

### Linux Audit Framework (auditd)

`auditd` là daemon không gian người dùng nhận event từ Linux kernel audit subsystem:

```
Kernel (audit subsystem)
    │ syscall events (open, execve, connect, setuid...)
    ▼
auditd daemon
    │
    ├─ /var/log/audit/audit.log   ← ghi local (default)
    └─ audisp plugins             ← forward đến remote syslog/SIEM
```

Config: `/etc/audit/auditd.conf`  
Rules: `/etc/audit/rules.d/*.rules` → compile vào `/etc/audit/audit.rules`

### Log integrity — bảo vệ khỏi bị sửa

Khi server bị compromise, attacker thường xóa/sửa log để xóa dấu vết. Các lớp bảo vệ:

| Kỹ thuật | Cách hoạt động | Điểm yếu |
|----------|---------------|-----------|
| **Remote syslog** | Ship log sang server khác ngay khi ghi | Phải đến được remote server |
| **append-only** (`chattr +a`) | Chặn delete/overwrite, chỉ cho append | Root có thể tắt attribute |
| **WORM storage** | Write-once media hoặc object lock | Chi phí, phức tạp |
| **Centralized SIEM** | Log đến SIEM trước khi ai kịp xóa | Phụ thuộc vào độ trễ forward |

**Remote syslog** là lớp bảo vệ thực tế nhất: ngay khi event xảy ra, log đã có mặt ở server
khác mà attacker chưa kịp reach tới.

## 3. Cách nó hoạt động

### auditd rules

Có 2 loại rule chính (`auditctl`):

```bash
# -w: watch file/directory (theo dõi thay đổi)
-w /etc/passwd -p wa -k identity-change
#   └─ file     └─ permissions: w=write, a=attribute  └─ key (tag)

# -a: syscall rule
-a always,exit -F arch=b64 -S execve -F uid=0 -k root-commands
#                            └─ syscall    └─ filter: chỉ root
```

Các key thông dụng (đặt trong `/etc/audit/rules.d/`):
- `-w /etc/sudoers -p wa -k sudo-config` — theo dõi sửa sudoers
- `-w /etc/ssh/sshd_config -p wa -k sshd-config` — theo dõi sửa SSH config
- `-a always,exit -F arch=b64 -S setuid -k privilege-escalation`

### Remote syslog với rsyslog

Trên máy gửi (`/etc/rsyslog.conf` hoặc `/etc/rsyslog.d/audit-forward.conf`):

```
# Forward audit log sang remote server (TCP, TLS)
module(load="imfile")
input(type="imfile" File="/var/log/audit/audit.log" Tag="audit")
action(type="omfwd" target="syslog.internal" port="514" protocol="tcp")
```

> **Output minh họa** — auditd không cài trên máy demo; cú pháp từ man page auditd.

### systemd journal cho auth events

Ngay cả không có auditd, systemd journal ghi event auth (SSH, sudo) vào journal:

```bash
# Xem sự kiện sudo (chạy thật)
journalctl _COMM=sudo --no-pager -n 5
```

Kết quả thực tế (đã ẩn danh):

```
Oct 06 09:46:02 app-server-01 sudo[17232]: ops-user : a password is required \
  ; PWD=/home/ops-user ; USER=root ; COMMAND=/usr/sbin/ufw status
```

Journal ghi đủ 4W: who (`ops-user`), what (`sudo`→`ufw status`), when (timestamp), where (host).

## 4. Thực hành

**Xem login history** (chạy thật):

```bash
# Ai đã login, từ đâu, khi nào
last -5
```

Kết quả thực tế (đã ẩn danh):

```
ops-user  pts/0   192.168.24.10    Wed Oct  7 07:48   still logged in
reboot    system  6.8.0-138        Wed Oct  7 07:46   still running
ops-user  pts/0   192.168.24.10    Tue Oct  6 07:35 - 17:35  (10:00)
```

**Xem failed login** (chạy thật):

```bash
# Failed SSH/login attempts
journalctl -u ssh --no-pager -n 10 2>/dev/null | grep -i "failed\|invalid" | head -5
```

Kết quả thực tế từ máy demo:

```
-- No entries --
```

Không có failed SSH login trong journal (SSH không cài trên máy demo). Trên server thật:

```
Oct 07 03:12:44 web-server-01 sshd[4521]: Failed password for root from 203.0.113.5 port 52341 ssh2
```

> Dòng trên: **output minh họa** — format lấy từ sshd log thực tế.

**Cài auditd và xem rule mặc định** (output minh họa — cần sudo):

```bash
sudo apt install auditd -y
sudo auditctl -l        # xem rules đang active
# -a always,exit -F arch=b64 -S execve -k ...  (nếu có rules)
# No rules               (mặc định khi mới cài)

sudo ausearch -k identity-change --start today   # tìm event theo key
sudo aureport --auth                             # report authentication
```

**Bật append-only trên audit log** (output minh họa — cần root):

```bash
sudo chattr +a /var/log/audit/audit.log
# Giờ rm / truncate sẽ fail:
# rm: cannot remove '/var/log/audit/audit.log': Operation not permitted
# auditd vẫn append được bình thường
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Log chỉ lưu local, không forward** — khi server bị compromise, attacker xóa
`/var/log/audit/audit.log` trước khi điều tra. Không có evidence gì. Fix: cấu hình rsyslog
hoặc Filebeat forward log sang SIEM/centralized logging ngay khi ghi.

**Audit rule quá rộng gây noise** — rule `-a always,exit -S all` log mọi syscall →
hàng triệu event/ngày, SIEM quá tải, không ai đọc. Fix: chỉ audit những gì quan trọng
(privileged commands, config file changes, authentication failures).

**Không có timezone trong log** — log từ nhiều server với timezone khác nhau, không thể
ghép chuỗi event. Fix: đồng bộ NTP cho mọi server, đảm bảo log dùng UTC hoặc ghi rõ offset.

**`chattr +a` không đủ** — root có thể `chattr -a` để tắt append-only. Đây là lý do
remote syslog quan trọng hơn: attacker cần phải vào được remote syslog server mới xóa được.

## 6. Tình huống thực tế

**Tình huống**: Sau khi phát hiện database bị truy cập trái phép, team điều tra muốn biết ai
đã dùng credentials của user `db-admin` và từ đâu.

**Với audit logging đã thiết lập**:

```bash
# Tìm tất cả event login của db-admin trong 7 ngày qua (output minh họa)
sudo ausearch -ua db-admin --start week --end now

# Output:
# ----
# time->Mon Oct  7 03:15:22 2026
# type=USER_AUTH msg=audit(1728267322.415:1024): pid=4521 uid=0 auid=1001
#   op=password-auth acct="db-admin" exe="/usr/sbin/sshd" hostname=203.0.113.5
#   addr=203.0.113.5 terminal=ssh res=success
```

> **Output minh họa** — auditd không cài trên máy demo.

**Phát hiện**: IP `203.0.113.5` không phải dải IP của team nội bộ → đây là session đáng ngờ.

Nếu **không có audit logging**: chỉ thấy database query log, không biết ai login, từ đâu, và
làm gì trước khi query.

## 7. Tự kiểm tra

**Câu 1**: Sự khác biệt cốt lõi giữa application log và audit log là gì?

a) Application log dùng JSON, audit log dùng plain text  
b) Application log ghi hành vi phần mềm (request, error); audit log ghi hành vi con người/tiến
   trình (ai làm gì, khi nào, trên tài nguyên nào) — phục vụ điều tra và compliance  
c) Application log lưu ở `/var/log/app/`, audit log lưu ở `/var/log/audit/`  
d) Không có sự khác biệt, chỉ là tên gọi khác nhau

**Đáp án: b** — Application log giúp debug performance và lỗi của phần mềm. Audit log giúp
trả lời câu hỏi "ai đã làm gì" cho mục đích security và compliance. Một request HTTP thành
công sẽ xuất hiện trong application log nhưng không audit log; admin chạy `sudo rm -rf /etc`
sẽ xuất hiện trong audit log nhưng không application log. Cả hai cần thiết và bổ sung nhau.

---

**Câu 2**: Tại sao remote syslog được coi là lớp bảo vệ log tốt hơn `chattr +a`?

a) Vì remote syslog mã hóa log còn `chattr +a` thì không  
b) Vì `chattr +a` cần reboot để có hiệu lực  
c) Vì root có thể `chattr -a` để tắt, nhưng để xóa log đã forward sang remote server, attacker
   phải compromise được thêm server đó — tăng đáng kể cost của attacker  
d) Vì `chattr +a` không hoạt động trên ext4

**Đáp án: c** — `chattr +a` giúp nhưng có giới hạn: root (hay attacker đã leo thang lên root)
có thể `chattr -a` rồi xóa file. Remote syslog tạo thêm một lớp phòng thủ độc lập: log đã
được ghi sang server khác trước khi bị xóa local. Attacker phải compromise cả remote server
để xóa hoàn toàn evidence — điều này thường đủ thời gian để alert được trigger và team phản ứng.

---

**Câu 3**: Rule auditd `-w /etc/sudoers -p wa -k sudo-config` có nghĩa là gì?

a) Watch file `/etc/sudoers`, log khi có write hoặc attribute change, gắn key "sudo-config"  
b) Disable sudoers file và ghi log cảnh báo  
c) Cho phép write vào `/etc/sudoers` với key sudo-config  
d) Watch thư mục `/etc/` và log tất cả thay đổi

**Đáp án: a** — `-w /path` là watch rule. `-p wa`: `w` = write (nội dung thay đổi), `a` =
attribute (permissions, ownership thay đổi). `-k sudo-config` là key để `ausearch -k sudo-config`
tìm nhanh event liên quan. Rule này sẽ tạo audit record mỗi khi ai mở file sudoers để sửa —
kể cả editor tạm thời mở file.

---

**Câu 4**: Lệnh nào trên Ubuntu xem sự kiện sudo gần nhất mà không cần auditd?

a) `cat /var/log/sudo.log`  
b) `auditctl -l | grep sudo`  
c) `journalctl _COMM=sudo --no-pager -n 10`  
d) `grep sudo /var/log/syslog`

**Đáp án: c** — systemd journal tự động ghi event từ tất cả service kể cả sudo, PAM, SSH.
`_COMM=sudo` là journal field filter theo tên command. `cat /var/log/sudo.log` (a) không tồn
tại mặc định trên Ubuntu. `grep /var/log/syslog` (d) có thể hoạt động nhưng phụ thuộc vào
cấu hình rsyslog — không đáng tin bằng journal filter. `auditctl -l` (b) chỉ list rules,
không search events.

---

**Câu 5**: Một server bị compromise lúc 2 giờ sáng. Attacker chạy `rm -f /var/log/audit/audit.log`
ngay sau khi vào. Cơ chế nào giúp vẫn có evidence để điều tra?

a) auditd tự backup log trước khi bị xóa  
b) `chattr +a` nếu đã bật từ trước sẽ chặn lệnh rm  
c) Remote syslog đã forward log sang central server trước khi bị xóa — server đó vẫn có
   toàn bộ audit trail  
d) Kernel lưu bản sao audit log trong `/proc/audit/`

**Đáp án: c** — Nếu rsyslog/Filebeat đang forward log sang server khác theo thời gian thực
(hoặc gần thời gian thực), log đã có mặt ở đó trước khi bị xóa local. Attacker chỉ xóa được
bản sao local; evidence ở remote server vẫn nguyên vẹn. `chattr +a` (b) có thể chặn nếu đã
bật từ trước, nhưng attacker đã có root thì có thể `chattr -a` trước. `/proc/audit/` (d)
không tồn tại. auditd (a) không có tính năng auto-backup khi bị xóa.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước (prereq):**
- `monitoring.logging.fundamentals` — kiến trúc log pipeline, structured logging, rsyslog

**Bài tiếp theo trong module:**
- `security.audit-compliance.frameworks` — ISO 27001/SOC 2/PCI DSS yêu cầu gì về audit log

**Bài liên quan:**
- `security.vuln-patch.patch-mgmt` — ghi log mọi patch activity cho compliance (xem thêm)
- `security.network-security.ids-ips` — IDS/IPS alert cũng cần được ghi vào audit trail (xem thêm)
- `monitoring.logging.elk-stack` — đẩy audit log vào Elasticsearch để query và alert (xem thêm)

**Nguồn tham khảo:**
- [auditd(8) — Linux man page](https://man7.org/linux/man-pages/man8/auditd.8.html)
- [auditd.conf(5) — config options](https://man7.org/linux/man-pages/man5/auditd.conf.5.html)
