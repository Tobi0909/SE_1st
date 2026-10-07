---
id: security.os-hardening.principles
title: "Nguyên lý hardening OS: giảm attack surface, least privilege"
domain: security
module: security.os-hardening
level: "nền tảng"
prerequisites: []
applies_to:
  - "Linux server/desktop chung — các nguyên lý này áp dụng bất kể distro"
status: draft
sources:
  - "https://csrc.nist.gov/publications/detail/sp/800-123/final"
  - "https://www.cisecurity.org/cis-benchmarks"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Mọi hệ thống Linux đều được cài đặt với cấu hình mặc định — cấu hình được thiết kế để **dễ dùng
ngay**, không phải để **an toàn nhất có thể**. SSH cho phép đăng nhập bằng mật khẩu, nhiều service
chạy dù không ai dùng, daemon chạy với quyền root dù không cần. Mỗi thứ như vậy là một cơ hội
cho kẻ tấn công.

Hardening là quá trình giảm số lượng cơ hội đó về mức tối thiểu cần thiết. Bài này xây dựng 3
nguyên lý nền tảng — hiểu nguyên lý thì checklist trong bài tiếp theo sẽ có lý do, không chỉ
là danh sách làm theo mù quáng.

## 2. Khái niệm cốt lõi

**Attack surface** là toàn bộ điểm vào mà kẻ tấn công có thể tương tác với hệ thống: port đang
lắng nghe, service đang chạy, tài khoản người dùng, tập tin có thể ghi, binary có quyền SUID.
Mỗi thứ là một bề mặt tiềm năng để khai thác lỗ hổng.

Nguyên tắc cốt lõi:

```
Attack surface = (Dịch vụ đang chạy) × (Quyền hạn của từng dịch vụ)
              × (Cách có thể tiếp cận) × (Khả năng khai thác)
```

Không thể đưa con số nào về 0, nhưng có thể giảm từng thừa số.

**3 nguyên lý trụ cột:**

### Nguyên lý 1: Least Privilege (đặc quyền tối thiểu)

Mỗi tiến trình, người dùng, và service chỉ được có đúng quyền hạn cần thiết để thực hiện chức
năng của mình, không hơn. Nếu một web server chỉ cần đọc file tĩnh, nó không cần quyền ghi vào
hệ thống. Nếu một script backup chỉ cần đọc `/var/log`, nó không cần chạy bằng root.

Lý do quan trọng: khi một tiến trình bị khai thác, kẻ tấn công chỉ có quyền của tiến trình đó.
Nginx bị compromise với quyền `www-data` gây hại ít hơn nhiều so với Nginx bị compromise với
quyền `root`.

### Nguyên lý 2: Reduce Attack Surface (giảm bề mặt tấn công)

Loại bỏ những gì không cần thiết:
- Service không dùng → tắt hoặc gỡ cài đặt
- Port không cần → đóng bằng firewall hoặc không chạy service đó
- Package không cần → gỡ cài đặt
- User account không dùng → vô hiệu hóa hoặc xóa

Mỗi thứ bạn loại khỏi hệ thống là một lỗ hổng tiềm năng bạn không cần vá.

### Nguyên lý 3: Defense in Depth (bảo vệ theo tầng)

Không đặt cược tất cả vào một lớp bảo vệ. Nếu kẻ tấn công vượt qua firewall, vẫn còn xác thực
SSH. Nếu vượt qua SSH, vẫn còn user không có sudo. Nếu vượt được sudo trên một account, vẫn còn
audit log để phát hiện. Nếu phát hiện muộn, vẫn còn backup để khôi phục.

## 3. Cách nó hoạt động

**Các lớp hardening trên thực tế:**

```
┌─────────────────────────────────────────────┐
│  Lớp 1: Network perimeter                  │
│  (firewall, port hạn chế, VPN)              │
├─────────────────────────────────────────────┤
│  Lớp 2: Xác thực và phân quyền             │
│  (SSH key only, MFA, sudo granular)         │
├─────────────────────────────────────────────┤
│  Lớp 3: OS hardening                        │
│  (service tối thiểu, kernel params, SUID)  │
├─────────────────────────────────────────────┤
│  Lớp 4: Application security               │
│  (chạy non-root, read-only fs, seccomp)    │
├─────────────────────────────────────────────┤
│  Lớp 5: Phát hiện và ứng phó              │
│  (audit log, IDS, alert)                   │
└─────────────────────────────────────────────┘
```

Hardening OS chủ yếu là lớp 2 và 3. Hai lớp còn lại (1 và 4, 5) bổ trợ, không thay thế.

**Phân loại attack surface theo loại:**

| Loại | Ví dụ | Cách giảm |
|------|-------|-----------|
| **Network** | Port SSH mở từ internet | Firewall, VPN, port non-standard |
| **Auth** | Password yếu, root SSH | Key-only, MFA, `PermitRootLogin no` |
| **Service** | avahi, cups, bluetooth | Tắt nếu không dùng |
| **Filesystem** | Binary SUID thừa, file ghi được bởi mọi người | Audit SUID, kiểm tra world-writable |
| **Kernel** | TCP SYN flood, ASLR tắt | sysctl hardening |
| **Account** | Tài khoản mặc định không đổi mật khẩu | Kiểm tra, vô hiệu hóa, hoặc xóa |

## 4. Thực hành

Các lệnh đọc an toàn để đánh giá attack surface hiện tại (không thay đổi gì):

**Kiểm tra port đang lắng nghe:**

```
$ ss -tlnp
State  Recv-Q Send-Q  Local Address:Port  Peer Address:Port
LISTEN 0      128     127.0.0.1:631       0.0.0.0:*          # CUPS (in)
LISTEN 0      128     0.0.0.0:22          0.0.0.0:*          # SSH
LISTEN 0      4096    127.0.0.53%lo:53    0.0.0.0:*          # systemd-resolved
```

Port 631 (CUPS) lắng nghe trên `127.0.0.1` — tốt hơn 0.0.0.0, nhưng nếu server không in ấn thì nên tắt hẳn.

**Kiểm tra service đang chạy:**

```
$ systemctl list-units --type=service --state=running
avahi-daemon.service  loaded active running  Avahi mDNS/DNS-SD Stack
bluetooth.service     loaded active running  Bluetooth service
cups.service          loaded active running  CUPS Scheduler
```

Ba service này thường không cần thiết trên server vận hành.

**Kiểm tra binary SUID:**

```
$ find /usr/bin /usr/sbin /bin /sbin -perm -4000 -type f
/usr/bin/sudo
/usr/bin/passwd
/usr/bin/su
/usr/bin/mount
/usr/bin/pkexec
/usr/sbin/pppd
```

`pkexec` (PolicyKit) từng có lỗ hổng leo thang đặc quyền nghiêm trọng (CVE-2021-4034). Binary SUID
thừa là rủi ro thực tế, không chỉ lý thuyết.

**Kiểm tra kernel security params hiện tại:**

```bash
cat /proc/sys/kernel/randomize_va_space   # ASLR: 0=tắt, 1=một phần, 2=đầy đủ
cat /proc/sys/net/ipv4/tcp_syncookies     # SYN flood protection: 0/1
cat /proc/sys/fs/protected_hardlinks      # hard link protection: 0/1
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Hardening quá mức** — tắt service cần thiết, khóa cấu hình sản xuất. Nguyên tắc: hardening
phải có **danh sách dịch vụ cần dùng** trước, sau đó mới tắt cái không có trong danh sách. Không
làm ngược lại (tắt hết rồi bật từng cái).

**Hardening không đồng bộ** — cấu hình SSH thủ công trên từng máy, rồi mất dấu máy nào đã làm.
Giải pháp: dùng IaC (Ansible/Puppet) để hardening trở thành code, kiểm soát được, reproducible.

**Không kiểm tra lại sau update** — `unattended-upgrades` hoặc manual upgrade có thể reset cấu hình
về mặc định. Kiểm tra lại cấu hình sau mỗi major update.

## 6. Tình huống thực tế

**Tình huống**: audit một server mới được cài Ubuntu 22.04 LTS trước khi đưa vào production.

Các câu hỏi cần trả lời theo đúng 3 nguyên lý:

1. **Attack surface** — `ss -tlnp` liệt kê port nào đang mở? Service nào đang chạy mà không cần
   (`avahi`, `cups`, `bluetooth`)? Có binary SUID thừa không?

2. **Least privilege** — Các service đang chạy với user nào (`ps aux`)? Daemon nào đang chạy bằng
   root mà không cần? File nào có world-writable permission?

3. **Defense in depth** — Có audit logging không? Đã cấu hình firewall chưa? SSH có dùng key-only
   không? Có alert khi có failed login không?

Từ câu trả lời cho 3 câu hỏi này, checklist hardening cụ thể cho từng server sẽ hiện ra — không
phải làm mọi thứ trong CIS Benchmark, mà làm đúng thứ phù hợp với rủi ro thực tế.

## 7. Tự kiểm tra

**Câu 1**: Least privilege có nghĩa là gì khi áp dụng cho web server?

a) Web server phải chạy bằng root để bind port 80  
b) Web server chỉ được có quyền cần thiết để phục vụ request, không có quyền thừa  
c) Web server không được đọc file nào ngoài document root  
d) Web server phải chạy trong container tách biệt với OS

**Đáp án: b** — Least privilege nghĩa là quyền tối thiểu cần thiết để thực hiện chức năng.
Web server thường chạy với user `www-data` không có sudo, không có shell, không có quyền ghi
ra ngoài document root và thư mục log. Bind port 80 không yêu cầu root nếu dùng `authbind`
hoặc `CAP_NET_BIND_SERVICE`.

---

**Câu 2**: Tại sao "giảm attack surface" lại quan trọng hơn "vá lỗi nhanh"?

a) Vì vá lỗi rất chậm, không kịp trước kẻ tấn công  
b) Vì service bị tắt không thể bị khai thác, dù có hay không có lỗ hổng  
c) Vì giảm attack surface tốn ít thời gian hơn  
d) Vì vá lỗi không hiệu quả với zero-day

**Đáp án: b** — Service không chạy không thể bị khai thác, ngay cả khi có lỗ hổng nghiêm trọng.
`avahi-daemon` tắt đi sẽ không bị ảnh hưởng bởi bất kỳ CVE nào của avahi. Cả hai việc (giảm
surface + vá lỗi) đều cần làm, nhưng giảm surface giải quyết được rủi ro của toàn bộ tương lai
của service đó.

---

**Câu 3**: Defense in depth giả định điều gì?

a) Bất kỳ lớp bảo vệ nào cũng có thể bị vượt qua  
b) Kẻ tấn công sẽ luôn tấn công từ bên ngoài mạng  
c) Mỗi lớp bảo vệ là hoàn hảo và không thể bị vượt qua  
d) Chỉ cần firewall tốt là đủ

**Đáp án: a** — Defense in depth bắt đầu từ giả định bi quan: *bất kỳ một lớp bảo vệ nào cũng
có thể thất bại*. Từ đó, mỗi lớp bên trong phải độc lập đủ để giảm thiệt hại khi lớp ngoài bị
qua. Nếu tin tưởng tuyệt đối vào một lớp duy nhất (thường là firewall), ta tạo ra "hard shell,
soft center" — vượt qua một lớp là làm chủ toàn hệ thống.

---

**Câu 4**: Binary SUID hoạt động như thế nào và tại sao nguy hiểm?

a) Binary SUID chạy với quyền của người gọi, không phải owner  
b) Binary SUID chạy với quyền của owner file, bất kể ai gọi nó  
c) Binary SUID chỉ cho phép root gọi  
d) Binary SUID tắt sandbox của kernel

**Đáp án: b** — SUID (Set User ID) bit khiến process chạy với UID của owner file (thường root),
bất kể user nào thực thi nó. `passwd` cần SUID root để ghi vào `/etc/shadow`. Nếu có lỗi buffer
overflow trong một binary SUID root bất kỳ, kẻ tấn công có thể leo thang lên quyền root —
đây là lý do cần kiểm tra và giảm số lượng SUID binary.

---

**Câu 5**: Lệnh nào liệt kê tất cả binary SUID trong `/usr/bin` và `/usr/sbin`?

a) `ls -la /usr/bin | grep s`  
b) `find /usr/bin /usr/sbin -perm -4000 -type f`  
c) `stat /usr/bin/* | grep SUID`  
d) `chmod -S /usr/bin/*`

**Đáp án: b** — `find -perm -4000` tìm file có bit SUID bật (octal 4000). Cờ `-` trước `4000`
nghĩa là "có bật ít nhất bit này" (bitmask), không phải "permission chính xác là 4000". `-type f`
lọc chỉ lấy file thường. Đáp án a dùng `ls | grep s` chỉ tìm ký tự `s` trong output, thiếu
chính xác — có thể bỏ sót hoặc false positive.

## 8. Bài liên quan và nguồn tham khảo

**Bài tiếp theo trong module:**
- `security.os-hardening.checklist` — áp dụng 3 nguyên lý trên vào checklist SSH, service, kernel

**Bài liên quan ngoài module (xem thêm):**
- `linux.users-permissions.sudo-pam` — least privilege qua sudo và PAM
- `linux.users-permissions.selinux-apparmor` — least privilege ở mức syscall (mandatory access control)
- `networking.nat-firewall.firewall-concepts` — defense in depth ở tầng network
- `security.network-security.fundamentals` — defense in depth ở tầng mạng rộng hơn

**Nguồn tham khảo:**
- [NIST SP 800-123: Guide to General Server Security](https://csrc.nist.gov/publications/detail/sp/800-123/final)
- [CIS Benchmarks (Linux)](https://www.cisecurity.org/cis-benchmarks)
