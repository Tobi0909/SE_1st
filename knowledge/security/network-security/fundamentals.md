---
id: security.network-security.fundamentals
title: "Bảo mật mạng: defense in depth, segmentation"
domain: security
module: security.network-security
level: "vận hành"
prerequisites: ["networking.nat-firewall.firewall-concepts"]
applies_to:
  - "Nguyên lý chung; ví dụ dùng Linux iptables/nftables và mô hình cloud security group"
status: verified
sources:
  - "https://csrc.nist.gov/publications/detail/sp/800-207/final"
  - "https://csrc.nist.gov/publications/detail/sp/800-41/rev-1/final"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Mô hình bảo mật cũ đặt tường lửa ở vành đai (perimeter) và tin tưởng mọi thứ bên trong: "trusted
inside, untrusted outside." Mô hình này thất bại khi:
- Attacker đã vào được bên trong (phishing email, USB, VPN credential bị lộ)
- Insider threat — người có tài khoản hợp lệ làm điều không được phép
- Cloud và remote work xóa nhòa ranh giới "trong" và "ngoài"

Kết quả: một thiết bị bị compromise bên trong → **lateral movement** tự do khắp mạng nội bộ.

Bảo mật mạng hiện đại xây dựng trên hai nguyên lý: **defense in depth** (nhiều lớp, không tin vào
một lớp duy nhất) và **segmentation** (chia nhỏ mạng để giới hạn blast radius khi một phần bị
compromise).

## 2. Khái niệm cốt lõi

### Defense in depth

Không có layer nào là "đủ an toàn." Mỗi layer chặn một phần mối đe dọa; kết hợp nhiều layer thì
attacker phải vượt qua tất cả:

```
Internet
   │
[Perimeter firewall] ← lọc traffic vào/ra từ internet
   │
[DMZ] ← web server, reverse proxy, load balancer (public-facing)
   │
[Internal firewall] ← lọc traffic giữa DMZ và mạng nội bộ
   │
[Internal network] ← database, app server, internal services
   │
[Host firewall] ← iptables/nftables trên từng server
   │
[Application-level controls] ← auth, rate limiting, WAF
```

### Network segmentation

Chia mạng thành **zones** với chính sách khác nhau. Traffic giữa zones đi qua firewall/ACL:

| Zone | Chứa gì | Chính sách mặc định |
|------|---------|---------------------|
| **Internet/Untrusted** | Traffic từ internet | Deny mọi thứ trừ whitelist |
| **DMZ** | Web server, reverse proxy, mail MX | Cho phép 80/443 vào, restrict ra |
| **Internal/Trusted** | App server, internal tools | Deny từ internet, cho phép nội bộ |
| **Data zone** | Database, file storage | Chỉ accept từ app server zone |
| **Management zone** | Bastion host, monitoring | Chỉ admin có quyền truy cập |

**East-west traffic** (internal-to-internal) vs **north-south traffic** (external-to-internal):
Mô hình perimeter truyền thống chỉ kiểm soát north-south. Attacker đã vào trong dùng east-west
để lateral move. Micro-segmentation kiểm soát cả east-west.

### Zero Trust (NIST SP 800-207)

NIST định nghĩa: **"Zero trust assumes there is no implicit trust granted to assets or user accounts
based solely on their physical or network location."** Không có vùng nào được tin tưởng mặc định
chỉ vì nằm trong mạng nội bộ.

Nguyên lý cốt lõi:
- Verify mọi request, dù từ bên trong hay ngoài
- Least privilege — chỉ cấp quyền tối thiểu cần thiết
- Assume breach — thiết kế như thể attacker đã bên trong rồi

Zero trust là triết lý, không phải sản phẩm. Triển khai phổ biến:
- Micro-segmentation (segment từng workload, không phải cả VLAN)
- Identity-aware proxy (mọi request xác thực danh tính, không tin IP)
- Software-defined perimeter

### DMZ architecture

DMZ (De-Militarized Zone) đặt public-facing service giữa hai firewall:

```
Internet → [Firewall ngoài] → DMZ → [Firewall trong] → Internal network
```

- **Firewall ngoài**: cho phép 80/443 vào DMZ, block mọi thứ khác
- **DMZ**: web server, reverse proxy — có thể bị compromise, phải thiết kế như vậy
- **Firewall trong**: chặt hơn; chỉ cho DMZ gọi database theo port cụ thể
- Nếu web server bị compromise: attacker còn phải vượt qua firewall trong trước khi đến database

## 3. Cách nó hoạt động

### Lập bản đồ attack surface hiện tại

Bước đầu tiên của segmentation là biết **cái gì đang lắng nghe ở đâu**:

```bash
# Xem tất cả service đang lắng nghe (chạy thật)
ss -tlnp
```

Kết quả thực tế từ máy demo:

```
State  Recv-Q  Local Address:Port  Process
LISTEN 0       127.0.0.1:631       # CUPS printer daemon (localhost only)
LISTEN 0       0.0.0.0:7070        # service lắng nghe mọi interface!
LISTEN 0       127.0.0.1:902       # VMware authd (localhost only)
LISTEN 0       127.0.0.53%lo:53    # systemd-resolved (localhost only)
LISTEN 0       *:3389              # RDP (lắng nghe IPv4+IPv6)
```

Nhìn output này, câu hỏi segmentation:
- Port 7070 lắng nghe `0.0.0.0` — cần không? Nên restrict về localhost nếu chỉ dùng nội bộ
- Port 3389 (RDP) lắng nghe mọi interface — nên đặt sau VPN hoặc restrict IP

### Định nghĩa zone bằng iptables (Linux host firewall)

Trên từng server Linux, host firewall là lớp cuối cùng (defense in depth):

```bash
# Xem routing table để hiểu interface nào ứng với zone nào (chạy thật)
ip route show
```

Kết quả thực tế (IPs đã là private/RFC-1918, an toàn hiển thị):

```
default via 192.168.24.1 dev enp1s0
172.16.1.0/24 dev vmnet1 src 172.16.1.1   # VMware host-only (internal)
172.16.73.0/24 dev vmnet8 src 172.16.73.1  # VMware NAT (internal)
192.168.24.0/23 dev enp1s0 src 192.168.25.227
```

Ví dụ rule iptables cho web server trong DMZ (output minh họa — cần root):

```bash
# Cho phép inbound 80/443 từ mọi nơi
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Cho phép outbound đến database zone (10.0.2.0/24) chỉ port 5432
iptables -A OUTPUT -d 10.0.2.0/24 -p tcp --dport 5432 -j ACCEPT

# Block mọi outbound khác ra internet từ DMZ server
iptables -A OUTPUT -d 0.0.0.0/0 ! -d 10.0.0.0/8 -j DROP

# Default deny tất cả inbound trừ những gì được allow
iptables -P INPUT DROP
iptables -P FORWARD DROP
```

> **Output minh họa** — lệnh iptables cần root. Trên production dùng `iptables-save` để persist.

### Security Group trong cloud (AWS/GCP tương tự)

Cloud security group hoạt động như firewall stateful ở tầng network:

```
App server security group:
  Inbound:  TCP 8080 from load-balancer-sg (chỉ từ LB, không phải 0.0.0.0)
  Outbound: TCP 5432 to database-sg

Database security group:
  Inbound:  TCP 5432 from app-server-sg only
  Outbound: (deny all — database không cần gọi ra ngoài)
```

Dùng **security group reference** (tham chiếu theo group ID, không phải IP) vì IP có thể thay
đổi khi scale — group reference tự cập nhật.

## 4. Thực hành

**Kiểm tra nhanh exposure của server**:

```bash
# Cổng nào đang mở ra ngoài (0.0.0.0 hoặc *) — chạy thật
ss -tlnp | grep -v "127.0.0\|::1"
```

Kết quả thực tế:

```
LISTEN 0    10   0.0.0.0:7070   0.0.0.0:*
LISTEN 0     2         *:3389         *:*
LISTEN 0     2     [::1]:3350      [::]:*
```

Từ output: port 7070 và 3389 đang exposed ra ngoài. Nếu đây là server production, cần hỏi: cả hai
có thực sự cần public access không? 3389 (RDP) hầu như không bao giờ nên public — nên đặt sau VPN.

**Kiểm tra connectivity giữa zones** (chạy thật):

```bash
# Test có thể reach database từ app server không (output minh họa — thay IP thực tế)
nc -zv 10.0.2.10 5432 2>&1
# Nếu được phép:  Connection to 10.0.2.10 5432 port [tcp/postgresql] succeeded!
# Nếu bị block:   nc: connect to 10.0.2.10 port 5432 failed: Connection refused
```

> **Output minh họa** — cần có target host thật với IP tương ứng.

## 5. Lỗi thường gặp và cách chẩn đoán

**Flat network — không có segmentation** — một máy bị compromise, attacker có thể reach tất cả
database, internal service, backup server từ cùng một mạng. Không có lớp chặn lateral movement.
Dấu hiệu: mọi server cùng subnet /16 hoặc /8, không có firewall nội bộ.

**Security group "allow 0.0.0.0/0"** — mở port cho toàn internet thay vì chỉ từ load balancer hay
internal IP. Thường là "tạm thời debug" rồi quên không xóa. Kiểm tra định kỳ: `aws ec2 describe-security-groups --filters "Name=ip-permission.cidr,Values=0.0.0.0/0"`.

**DMZ nhưng không có firewall trong** — web server trong "DMZ" nhưng có thể kết nối thẳng đến
database. DMZ chỉ là tên, không có giá trị nếu không có firewall kiểm soát traffic DMZ→Internal.

**Quá nhiều rule, không ai hiểu** — firewall rule tích lũy qua nhiều năm, rule cũ không xóa, không
ai dám xóa vì "sợ hỏng gì đó." Hệ quả: security audit fail, rule mâu thuẫn nhau. Định kỳ review
và cleanup rule.

## 6. Tình huống thực tế

**Tình huống**: Công ty có web app đang chạy, toàn bộ server (web, app, database) cùng một subnet
192.168.1.0/24. Không có segmentation.

**Vấn đề xảy ra**: Web server bị exploit qua SQL injection, attacker có shell trên web server.
Từ đó attacker chạy `nmap 192.168.1.0/24` → thấy database server 192.168.1.50:5432 không cần
auth thêm → dump toàn bộ bảng user.

**Sau khi áp dụng segmentation**:
```
Web server (DMZ): 10.0.1.10/24
App server (Internal): 10.0.2.10/24
Database (Data zone): 10.0.3.10/24

Firewall rules:
- Internet → Web: chỉ 80/443
- Web → App: chỉ 8080
- App → DB: chỉ 5432
- Không có rule nào cho Web → DB trực tiếp
```

Cùng exploit đó → attacker có shell trên web server → thử kết nối database → bị firewall block (web
→ data zone không có rule). Lateral movement bị ngăn tại đây.

## 7. Tự kiểm tra

**Câu 1**: Mô hình "perimeter security" (tường lửa vành đai) thất bại với mối đe dọa nào?

a) DDoS từ internet nhắm vào web server  
b) Brute force SSH từ internet  
c) Lateral movement sau khi attacker đã vào được bên trong mạng nội bộ  
d) SQL injection vào ứng dụng web public

**Đáp án: c** — Perimeter security chỉ kiểm soát north-south (vào/ra internet). Khi attacker đã
vào được bên trong (qua phishing, VPN credential bị lộ, insider), perimeter không còn hiệu quả.
Attacker di chuyển tự do (lateral movement) trong mạng "tin cậy" nội bộ. Defense in depth và
segmentation giải quyết điều này bằng cách không tin tưởng mặc định ngay cả traffic nội bộ.

---

**Câu 2**: DMZ (De-Militarized Zone) hoạt động theo nguyên lý nào?

a) Tất cả server public-facing được đặt trực tiếp trên internet, không qua firewall  
b) Zone chỉ dành cho dev/test, không dùng trong production  
c) Một vùng mạng không có firewall để tăng hiệu năng cho web traffic  
d) Public-facing service đặt giữa hai firewall; nếu bị compromise vẫn bị ngăn cách với internal network

**Đáp án: d** — DMZ đặt web server giữa firewall ngoài (lọc internet) và firewall trong (bảo vệ
internal). Nếu web server bị compromise, attacker vẫn phải vượt qua firewall trong mới đến được
database hay internal service. Thiết kế này giả định web server CÓ THỂ bị compromise và giới hạn
blast radius trong DMZ.

---

**Câu 3**: Theo NIST SP 800-207, điểm cốt lõi của Zero Trust là gì?

a) Không có implicit trust dựa trên vị trí mạng — kể cả traffic từ bên trong mạng nội bộ  
b) Dùng VPN cho tất cả remote access  
c) Chỉ cho phép HTTPS, block tất cả HTTP  
d) Mọi server phải đặt trong DMZ

**Đáp án: a** — NIST SP 800-207 định nghĩa: "Zero trust assumes there is no implicit trust granted
to assets or user accounts based solely on their physical or network location." Điểm khác biệt với
perimeter model: một máy nằm trong mạng nội bộ không tự động được tin tưởng. Mọi request đều cần
xác thực và ủy quyền, bất kể nguồn gốc.

---

**Câu 4**: Trong cloud, tại sao nên dùng "security group reference" thay vì IP cụ thể để cho phép traffic?

a) Vì cloud không hỗ trợ IP trong security group rule  
b) Vì IP rule tốn nhiều chi phí hơn group reference  
c) Vì security group reference cho phép nhiều port hơn IP rule  
d) Vì IP của instance có thể thay đổi khi scale/restart; group reference tự cập nhật theo

**Đáp án: d** — Trong auto-scaling, IP của instance thay đổi liên tục khi scale in/out hoặc
restart. Rule "allow từ 10.0.2.15" sẽ không còn chính xác sau khi instance đó replace. Security
group reference ("allow từ app-server-sg") tự động cover mọi instance mới trong group đó —
đúng với intent "chỉ app server mới được kết nối database."

---

**Câu 5**: `ss -tlnp` trả về một dòng `0.0.0.0:5432`. Điều này có nghĩa là gì với security?

a) Database chỉ lắng nghe localhost, an toàn  
b) Database đang exposed ra tất cả network interface, bao gồm có thể cả internet nếu không có firewall chặn  
c) Bình thường — database luôn lắng nghe mọi interface  
d) Port 5432 là default UDP, không nguy hiểm

**Đáp án: b** — `0.0.0.0` nghĩa là lắng nghe tất cả IPv4 interface — không chỉ localhost
(`127.0.0.1`). Nếu server có public IP và không có firewall chặn 5432, database expose ra
internet. Cách fix: bind database chỉ vào interface nội bộ (`listen_addresses = '10.0.2.10'`
trong postgresql.conf) và dùng firewall làm defense in depth thứ hai.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước (prereq):**
- `networking.nat-firewall.firewall-concepts` — stateful/stateless firewall, chain, rule

**Bài liên quan:**
- `security.os-hardening.principles` — host-level: least privilege, reduce attack surface
- `security.os-hardening.checklist` — iptables/sysctl trên từng host cụ thể
- `networking.nat-firewall.acl-security-groups` — ACL và security group chi tiết
- `security.network-security.ids-ips` — phát hiện xâm nhập sau khi segmentation đã có

**Nguồn tham khảo:**
- [NIST SP 800-207 — Zero Trust Architecture](https://csrc.nist.gov/publications/detail/sp/800-207/final)
- [NIST SP 800-41 Rev. 1 — Guidelines on Firewalls and Firewall Policy](https://csrc.nist.gov/publications/detail/sp/800-41/rev-1/final)
