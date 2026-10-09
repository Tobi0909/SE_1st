---
id: security.os-hardening.checklist
title: "Checklist hardening Linux thực tế: SSH, service không cần thiết, patch"
domain: security
module: security.os-hardening
level: "vận hành"
prerequisites: ["security.os-hardening.principles"]
applies_to:
  - "Ubuntu/Debian server; kernel params và SSH directive tương đương trên RHEL/Rocky Linux"
  - "OpenSSH 8.x+ — giá trị default PermitRootLogin thay đổi qua các phiên bản"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man5/sshd_config.5.html"
  - "https://www.cisecurity.org/cis-benchmarks"
  - "https://csrc.nist.gov/publications/detail/sp/800-123/final"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Biết nguyên lý (bài trước) là cần, nhưng khi đứng trước một server mới, câu hỏi thực tế là:
"Chạy lệnh gì, sửa dòng nào, theo thứ tự nào?" Bài này là checklist 5 nhóm có thể thực hiện
tuần tự, với lý do cho từng bước — để tự đánh giá được rủi ro khi môi trường có ràng buộc (không
thể tắt một service nào đó vì lý do vận hành).

## 2. Khái niệm cốt lõi

Checklist chia 5 nhóm theo attack vector:

| Nhóm | Attack vector cần giảm |
|------|----------------------|
| **1. Tài khoản và xác thực** | Brute-force SSH, đăng nhập root trực tiếp |
| **2. SSH hardening** | Lateral movement, session chiếm đoạt |
| **3. Service và port** | Exploit service không dùng, recon |
| **4. Kernel security params** | SYN flood, ASLR bypass, info leak |
| **5. Filesystem và quyền** | Privilege escalation qua SUID, world-writable |

Patch management (nhóm 6) là việc liên tục, không phải một lần.

## 3. Cách nó hoạt động

### Nhóm 1: Tài khoản và xác thực

**Kiểm tra tài khoản:**

```bash
# Liệt kê user có UID 0 (root-equivalent) — phải chỉ có root
awk -F: '($3 == 0) { print $1 }' /etc/passwd

# Kiểm tra tài khoản nào có shell login nhưng không dùng
awk -F: '($7 != "/usr/sbin/nologin" && $7 != "/bin/false") { print $1, $7 }' /etc/passwd
```

**Vô hiệu hóa tài khoản không dùng** (output minh họa — cần sudo):

```
# sudo passwd -l <username>   # lock tài khoản (không xóa, phòng khi cần)
# sudo usermod -s /usr/sbin/nologin <username>   # bỏ shell login
```

**Mật khẩu mạnh và chính sách:**

```
# /etc/security/pwquality.conf (pam_pwquality)
minlen = 12
dcredit = -1    # ít nhất 1 chữ số
ucredit = -1    # ít nhất 1 chữ hoa
lcredit = -1    # ít nhất 1 chữ thường
ocredit = -1    # ít nhất 1 ký tự đặc biệt
```

> **Output minh họa** — thay đổi PAM cần quyền root và kiểm tra kỹ trước khi áp dụng; cấu hình
> sai có thể khóa tài khoản admin.

### Nhóm 2: SSH hardening

SSH thường là cửa vào duy nhất của server — đây là nhóm quan trọng nhất.

Mở `/etc/ssh/sshd_config` và đặt (hoặc kiểm tra đã có chưa):

```
# Tắt đăng nhập root trực tiếp
PermitRootLogin no

# Tắt xác thực bằng password — chỉ dùng key
PasswordAuthentication no
PubkeyAuthentication yes

# Giảm thời gian chờ xác thực (mặc định 120s — quá dài)
LoginGraceTime 30

# Giảm số lần thử tối đa (mặc định 6)
MaxAuthTries 3

# Chỉ cho phép user cụ thể (thay username bằng danh sách thực)
AllowUsers deploy ops-user

# Tắt tính năng không cần
X11Forwarding no
AllowTcpForwarding no
PermitEmptyPasswords no

# Tắt banner thông tin hệ thống (tránh fingerprinting)
DebianBanner no
```

Sau khi sửa, **test trước khi reload** để không tự khóa:

```bash
# Kiểm tra cú pháp cấu hình (không reload service)
sudo sshd -t

# Nếu không có lỗi, reload
sudo systemctl reload sshd
```

> **Output minh họa** — cần sudo. Luôn giữ terminal session hiện tại mở khi test cấu hình SSH
> mới; đừng đóng session trước khi xác nhận session mới kết nối được.

**Giá trị mặc định đáng chú ý** (từ `sshd_config(5)`, OpenSSH 9.x):
- `PermitRootLogin`: mặc định `prohibit-password` (chỉ block password, vẫn cho key) — cần đổi sang `no` nếu muốn tắt hoàn toàn
- `PasswordAuthentication`: mặc định `yes` — **phải đổi thành `no`**
- `MaxAuthTries`: mặc định `6`
- `LoginGraceTime`: mặc định `120` giây
- `AllowTcpForwarding`: mặc định `yes`

### Nhóm 3: Tắt service không cần thiết

**Kiểm tra service đang chạy:**

```bash
systemctl list-units --type=service --state=running
```

Các service thường an toàn để tắt trên server thuần vận hành:

| Service | Mục đích | Lệnh tắt (minh họa) |
|---------|----------|---------------------|
| `avahi-daemon` | mDNS/Bonjour, dùng cho LAN discovery | `sudo systemctl disable --now avahi-daemon` |
| `cups` | Máy in | `sudo systemctl disable --now cups cups-browsed` |
| `bluetooth` | Bluetooth | `sudo systemctl disable --now bluetooth` |
| `ModemManager` | Modem di động | `sudo systemctl disable --now ModemManager` |

> **Output minh họa** — cần sudo. Trước khi tắt, xác nhận service không được dùng bởi ứng dụng
> hoặc quy trình vận hành nào khác (ví dụ: một số script monitoring dùng avahi để tự discover).

**Kiểm tra port sau khi tắt:**

```
$ ss -tlnp
State  Recv-Q  Local Address:Port
LISTEN 0       0.0.0.0:22          # SSH — cần
LISTEN 0       127.0.0.53%lo:53    # systemd-resolved — cần
```

Port 631 (CUPS) đã biến mất sau khi tắt cups.service — đúng kỳ vọng.

### Nhóm 4: Kernel security parameters

Kiểm tra các tham số hiện tại (chạy được, không cần sudo):

```bash
# ASLR: 0=tắt, 1=stack/heap randomize, 2=đầy đủ (recommended)
cat /proc/sys/kernel/randomize_va_space
# → 2   (đã tốt trên Ubuntu 22.04 mặc định)

# SYN cookie — phòng SYN flood
cat /proc/sys/net/ipv4/tcp_syncookies
# → 1   (đã bật mặc định)

# Chặn hardlink/symlink exploit
cat /proc/sys/fs/protected_hardlinks
# → 1
cat /proc/sys/fs/protected_symlinks
# → 1

# Hạn chế dmesg với non-root (kernel log không lộ địa chỉ)
cat /proc/sys/kernel/dmesg_restrict
# → 1

# Ẩn kernel pointer trong /proc
cat /proc/sys/kernel/kptr_restrict
# → 1
```

Trên Ubuntu 22.04 LTS, tất cả 6 tham số này đã ở giá trị tốt theo mặc định. Trên RHEL/CentOS
cũ hoặc kernel tùy biến, cần kiểm tra và đặt thủ công qua `/etc/sysctl.d/99-hardening.conf`:

```
# /etc/sysctl.d/99-hardening.conf  (output minh họa — cần sudo để áp dụng)
kernel.randomize_va_space = 2
net.ipv4.tcp_syncookies = 1
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 1
```

Áp dụng: `sudo sysctl -p /etc/sysctl.d/99-hardening.conf`

### Nhóm 5: Filesystem và quyền

**Kiểm tra SUID binary:**

```bash
find /usr/bin /usr/sbin /bin /sbin -perm -4000 -type f
```

Kết quả thực tế trên Ubuntu 22.04:

```
/usr/bin/sudo
/usr/bin/passwd
/usr/bin/su
/usr/bin/mount
/usr/bin/umount
/usr/bin/newgrp
/usr/bin/gpasswd
/usr/bin/chfn
/usr/bin/chsh
/usr/bin/fusermount3
/usr/bin/pkexec
/usr/sbin/pppd
/usr/sbin/vmware-authd
```

Đánh giá từng binary:
- `sudo`, `passwd`, `su`, `mount`, `umount`, `newgrp`, `gpasswd`, `chsh`, `chfn`: cần thiết cho
  vận hành thông thường — **giữ lại**.
- `fusermount3`: cần cho FUSE filesystem (ví dụ sshfs) — giữ nếu dùng, gỡ nếu không.
- `pkexec` (PolicyKit): cần cho GUI admin tools. Nếu server headless, có thể xem xét — nhưng
  kiểm tra dependency trước (`apt-get remove --dry-run policykit-1`).
- `pppd`: cần cho PPP (dial-up/VPN L2TP) — gỡ nếu không dùng.
- `vmware-authd`: VMware guest agent — để lại nếu đang chạy trên VMware, gỡ nếu không.

**Kiểm tra quyền file nhạy cảm:**

```bash
stat /etc/passwd /etc/shadow /etc/sudoers
```

Kết quả thực tế:

```
/etc/passwd:  0644 (root:root)   ← đúng: mọi người đọc được, root ghi
/etc/shadow:  0640 (root:shadow) ← đúng: chỉ root và group shadow
/etc/sudoers: 0440 (root:root)   ← đúng: chỉ đọc, không ai ghi được
```

**Kiểm tra world-writable directory (output minh họa):**

```
$ find / -xdev -type d -perm -0002 -not -path "/proc/*" -not -path "/sys/*"
/tmp
/var/tmp
/run/lock
```

`/tmp` và `/var/tmp` là world-writable theo thiết kế. Thư mục khác trong kết quả cần điều tra.

## 4. Thực hành

Quy trình đánh giá nhanh một server mới (toàn bộ read-only, không thay đổi gì):

```bash
# 1. Port đang mở
ss -tlnp

# 2. Service đang chạy
systemctl list-units --type=service --state=running

# 3. SUID binary
find /usr/bin /usr/sbin /bin /sbin -perm -4000 -type f

# 4. Kernel params
for p in kernel/randomize_va_space net/ipv4/tcp_syncookies fs/protected_hardlinks \
         fs/protected_symlinks kernel/dmesg_restrict kernel/kptr_restrict; do
  printf "%-40s %s\n" "$p" "$(cat /proc/sys/$p 2>/dev/null || echo N/A)"
done

# 5. Quyền file nhạy cảm
stat /etc/passwd /etc/shadow /etc/sudoers | grep -E "File:|Access:"
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Khóa SSH trước khi cấu hình key** — tắt `PasswordAuthentication` khi chưa upload SSH public key
lên server. Kết quả: không thể đăng nhập. Luôn test kết nối từ terminal mới trước khi đóng
session cũ.

**`sshd_config` có nhiều dòng trùng** — OpenSSH dùng giá trị ĐẦUNTIÊN của mỗi directive. Nếu file
có `PermitRootLogin yes` ở dòng 30 và `PermitRootLogin no` ở dòng 80, giá trị có hiệu lực là
`yes`. Luôn dùng `sudo sshd -T | grep permitrootlogin` để xem giá trị thực đang áp dụng.

**Tắt nhầm service quan trọng** — `avahi-daemon` đôi khi được dùng để tự động phát hiện dịch vụ
trong môi trường microservice nội bộ. Kiểm tra bằng `systemctl status avahi-daemon` để xem
"active" do ai khởi động.

## 6. Tình huống thực tế

**Tình huống**: phát hiện server bị brute-force SSH. Nhật ký `/var/log/auth.log` có hàng nghìn
dòng `Failed password for root from 1.2.3.4`.

Root cause: `PasswordAuthentication yes` + `PermitRootLogin prohibit-password` (mặc định OpenSSH)
để kẻ tấn công thử password root qua SSH. Vì `prohibit-password` chỉ block khi dùng password
method — nhưng vẫn accept password qua keyboard-interactive (tùy cấu hình).

Giải pháp áp dụng đúng thứ tự:

```
# Bước 1: Upload SSH public key cho admin user (TRƯỚC KHI làm gì khác)
# Bước 2: Cấu hình sshd_config
PermitRootLogin no
PasswordAuthentication no
MaxAuthTries 3

# Bước 3: Test với sshd -t, reload, test kết nối mới
# Bước 4: Cân nhắc thêm fail2ban hoặc firewall rate-limit cho port 22
```

## 7. Tự kiểm tra

**Câu 1**: `PermitRootLogin prohibit-password` (mặc định OpenSSH 7.0+) có nghĩa là gì?

a) Root không thể đăng nhập SSH bằng bất kỳ cách nào  
b) Root chỉ có thể đăng nhập bằng public key, không thể dùng password  
c) Root có thể đăng nhập nhưng phải xác nhận bằng MFA  
d) Root có thể đăng nhập bằng password nếu từ localhost

**Đáp án: b** — `prohibit-password` tắt xác thực bằng password và keyboard-interactive cho root,
nhưng vẫn cho phép đăng nhập bằng public key. Để tắt hoàn toàn đăng nhập root qua SSH, cần đặt
`PermitRootLogin no`. Đây là cải thiện so với default cũ (`yes`) nhưng chưa phải mức hardening
tốt nhất.

---

**Câu 2**: Để kiểm tra giá trị SSH directive thực sự đang áp dụng (sau khi đã ghép nhiều file
`Include`), dùng lệnh nào?

a) `cat /etc/ssh/sshd_config | grep PermitRootLogin`  
b) `sudo sshd -T | grep permitrootlogin`  
c) `systemctl status sshd`  
d) `sudo sshd -t`

**Đáp án: b** — `sshd -T` (test với dump config) in ra toàn bộ cấu hình có hiệu lực sau khi
xử lý `Include`, `Match` block và giá trị mặc định, theo thứ tự ưu tiên. `sshd -t` chỉ kiểm tra
cú pháp và trả về exit code, không in cấu hình. `grep` trực tiếp vào file có thể bỏ sót
directive trùng hoặc trong file `Include`.

---

**Câu 3**: Lệnh `find /usr/bin -perm -4000 -type f` có tác dụng gì?

a) Tìm file có permission là chính xác 4000 (chỉ SUID bit)  
b) Tìm file có ít nhất SUID bit được bật  
c) Tìm file thuộc owner root  
d) Tìm file không có execute permission

**Đáp án: b** — Dấu `-` trước `4000` là bitmask: "có bật bit SUID (4000), bất kể các bit khác
là gì". Ví dụ file có permission `4755` (rwsr-xr-x) cũng được tìm thấy vì có bit 4000.
`-perm 4000` (không có `-`) chỉ tìm đúng file có permission là `4000` — thực tế không có
executable SUID nào chỉ có permission `4000`.

---

**Câu 4**: Kernel param `randomize_va_space = 2` bảo vệ chống lại kỹ thuật tấn công nào?

a) SYN flood tới TCP stack  
b) Khai thác buffer overflow cần biết địa chỉ cố định trong bộ nhớ (return-to-libc)  
c) SQL injection vào ứng dụng  
d) Brute-force mật khẩu SSH

**Đáp án: b** — ASLR (Address Space Layout Randomization) randomize địa chỉ bộ nhớ của stack,
heap, và library mỗi lần process khởi động. Khai thác buffer overflow thường cần biết địa chỉ
cụ thể để nhảy đến (ví dụ địa chỉ của `system()` trong libc). Với ASLR=2, địa chỉ thay đổi
ngẫu nhiên mỗi lần, làm kỹ thuật này trở nên unreliable. Giá trị `2` là "full ASLR" — cả
stack lẫn heap đều được randomize.

---

**Câu 5**: Tại sao không nên tắt `PasswordAuthentication` trước khi upload SSH public key?

a) OpenSSH sẽ báo lỗi cấu hình nếu không có key  
b) Nếu tắt password trước khi có key, không có cách nào đăng nhập SSH từ xa  
c) Key authentication mặc định bị tắt trên Linux  
d) Public key phải được upload bằng password authentication

**Đáp án: b** — Sau khi `PasswordAuthentication no` có hiệu lực (sau `reload sshd`), SSH chỉ
chấp nhận public key. Nếu chưa upload `~/.ssh/authorized_keys` với public key của bạn, mọi
kết nối SSH mới sẽ bị từ chối. Session đang mở hiện tại vẫn giữ được, nhưng sau khi đóng
không có cách đăng nhập lại — trừ khi có console/IPMI/VNC trực tiếp.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước trong module:**
- `security.os-hardening.principles` — nguyên lý nền tảng (attack surface, least privilege, defense in depth)

**Bài liên quan ngoài module (xem thêm):**
- `linux.users-permissions.sudo-pam` — cấu hình sudo granular, PAM
- `linux.kernel-troubleshooting.sysctl` — đọc và thay đổi kernel parameter
- `monitoring.logging.fundamentals` — audit log là lớp detect bổ sung cho hardening
- `security.identity-secrets.secrets-mgmt` — không hardcode credential, quản lý secret đúng cách

**Nguồn tham khảo:**
- [sshd_config(5) — OpenSSH manual](https://man7.org/linux/man-pages/man5/sshd_config.5.html)
- [CIS Benchmarks — Linux](https://www.cisecurity.org/cis-benchmarks)
- [NIST SP 800-123: Guide to General Server Security](https://csrc.nist.gov/publications/detail/sp/800-123/final)
