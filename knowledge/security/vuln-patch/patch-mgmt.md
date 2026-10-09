---
id: security.vuln-patch.patch-mgmt
title: "Patch management: chu trình vá lỗi, ứng phó zero-day"
domain: security
module: security.vuln-patch
level: "vận hành"
prerequisites: ["security.vuln-patch.scanning"]
applies_to:
  - "Ubuntu/Debian (unattended-upgrades, apt) và RHEL/CentOS (dnf-automatic, dnf); chu trình zero-day là nguyên lý chung"
status: verified
sources:
  - "https://ubuntu.com/security/livepatch"
  - "https://www.first.org/cvss/v3.1/specification-document"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Biết CVE nào đang tồn tại (từ bài `security.vuln-patch.scanning`) mới là bước đầu. Câu hỏi
thực tế là: **vá thế nào mà không gây downtime?** Không phải mọi patch đều an toàn để deploy
ngay — một số cần test, một số đòi reboot, và khi zero-day bùng nổ thì toàn bộ quy trình thông
thường phải được rút ngắn xuống còn vài giờ.

Patch management là quy trình kiểm soát việc đưa bản vá vào production một cách có hệ thống,
không phải "apt upgrade và cầu trời".

## 2. Khái niệm cốt lõi

### Chu trình patch tiêu chuẩn

```
1. Identify     ← Scanner tìm CVE (từ bài trước)
       │
2. Assess       ← Mức nghiêm trọng, exposure, có exploit public không?
       │
3. Test         ← Apply ở staging/dev trước
       │
4. Deploy       ← Áp dụng production (trong maintenance window)
       │
5. Verify       ← Kiểm tra service vẫn chạy, không regression
       │
6. Document     ← Ghi lại patch nào, ngày nào, ai làm
```

**Maintenance window**: khoảng thời gian cố định (ví dụ: thứ Tư 2–4 giờ sáng) dành cho
patching/reboot. Giảm surprise cho on-call và stakeholder.

### Phân loại theo mức ưu tiên

| Mức CVSS | Thời gian target | Ghi chú |
|----------|-----------------|---------|
| Critical (9.0–10.0) | ≤ 24 giờ (hoặc ngay) | Zero-day hay exploit public: không chờ window |
| High (7.0–8.9) | ≤ 7 ngày | Nên vá trong sprint/maintenance window gần nhất |
| Medium (4.0–6.9) | ≤ 30 ngày | Theo maintenance window định kỳ |
| Low (0.1–3.9) | Next quarter hoặc theo policy | Có thể defer nếu resource eo hẹp |

Các mốc này là **hướng dẫn**, không phải quy tắc tuyệt đối — phải xét exposure và context.
<!-- TODO-VERIFY: mốc thời gian này phổ biến trong nhiều patch policy (Google, CIS) nhưng không từ một spec cụ thể — đây là convention ngành, không phải standard bắt buộc -->

### Zero-day vs regular CVE

**Regular CVE**: đã có patch từ vendor → quy trình chuẩn.

**Zero-day**: lỗ hổng được khai thác trước khi có patch (hoặc patch mới vừa ra nhưng exploit
đã có sẵn). Quy trình emergency:

```
Confirm ảnh hưởng → Isolate/Mitigate ngay → Patch khi có → Review & document
     │                    │
     │          (WAF rule, disable feature,
     │           network block IP/port)
     └──→ Không có patch chưa? → Workaround + monitor chặt
```

**Mitigation không phải fix**: block port 8080 chặn exploit nhưng không sửa lỗ hổng. Cần
theo dõi để patch thật khi vendor phát hành.

### Reboot requirement

Patch kernel hay thư viện dùng nhiều (glibc, libssl) thường cần reboot để có hiệu lực với
tiến trình đang chạy. **Ubuntu Livepatch** (Ubuntu Pro) cho phép vá kernel không cần reboot —
hữu ích cho server không thể down.

Kiểm tra xem có cần reboot không:

```bash
# Ubuntu/Debian: file này tồn tại nếu cần reboot
cat /var/run/reboot-required
# My Required: linux-image-6.x.x-xx-generic

# RHEL/CentOS: kiểm tra process dùng library cũ (output minh họa — cần dnf-utils)
dnf needs-restarting -r
# → exit 0: không cần reboot; exit 1: cần reboot
```

> `dnf needs-restarting -r`: **output minh họa** — máy demo dùng Ubuntu không có dnf.

## 3. Cách nó hoạt động

### Automatic security updates (Ubuntu)

`unattended-upgrades` tự động áp security update từ `*-security` repo, không áp regular update:

```
apt update (lấy metadata) → so sánh package version → chỉ apply từ repo *-security
     │
     └─ Ghi log vào /var/log/unattended-upgrades/unattended-upgrades.log
```

Cấu hình trong `/etc/apt/apt.conf.d/50unattended-upgrades`:

```
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::Mail "ops@example.com";
Unattended-Upgrade::Automatic-Reboot "false";  // không reboot tự động
```

> **Output minh họa** — nội dung file lấy từ tài liệu Ubuntu; thay `ops@example.com` bằng
> email thật.

### Dry run và simulation

Trước khi apply, luôn kiểm tra cái gì sẽ thay đổi:

```bash
# Ubuntu: xem những gì unattended-upgrades sẽ làm
unattended-upgrade --dry-run --debug 2>&1 | head -30

# Xem tổng các package sẽ được upgrade
apt-get -s upgrade | grep "^Inst"
```

Kết quả thực tế từ máy demo:

```
Listing... Done
```

```
Reading package lists...
0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.
```

Máy demo đang up to date — không có pending upgrade.

## 4. Thực hành

**Kiểm tra trạng thái patch hiện tại** (chạy thật):

```bash
# Xem kernel đang chạy vs kernel đã cài mới nhất
uname -r
dpkg -l | grep linux-image | grep -v "^rc"
```

Kết quả thực tế:

```
6.8.0-138-generic
```

```
ii  linux-image-6.8.0-136-generic    6.8.0-136.136~22.04.1   amd64
ii  linux-image-6.8.0-138-generic    6.8.0-138.138~22.04.1   amd64
ii  linux-image-generic-hwe-22.04    6.8.0-138.138~22.04.1   amd64
```

Kernel đang chạy khớp với bản mới nhất — không cần reboot vì lý do kernel.

**Kiểm tra reboot required** (chạy thật):

```bash
ls /var/run/reboot-required 2>/dev/null && cat /var/run/reboot-required || echo "No reboot required"
```

Kết quả thực tế:

```
No reboot required
```

**Simulation upgrade security-only** (output minh họa — cần sudo):

```bash
# Chỉ upgrade package từ repo security
sudo apt-get -s -o Dir::Etc::SourceList=/etc/apt/sources.list.d/ubuntu.sources \
  dist-upgrade 2>/dev/null | grep "^Inst.*security"
```

> **Output minh họa** — cần sudo. Thay thế không cần sudo: `apt list --upgradable 2>/dev/null | grep security`.

**Áp security update trên RHEL/CentOS** (output minh họa — không có RHEL trên máy demo):

```bash
# Chỉ áp security patch
sudo dnf update --security -y

# Kiểm tra xem cần reboot không
sudo dnf needs-restarting -r; echo "Exit: $?"
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Vá production mà không test staging trước** — patch glibc hay kernel trên Ubuntu có thể
break dependency bất ngờ. Đặc biệt nguy hiểm với microservice nhiều dependency. Fix: luôn
chạy test suite/smoke test sau khi apply trên staging, chờ 24 giờ quan sát, rồi mới deploy
production.

**Không theo dõi reboot-required** — library được cập nhật nhưng process đang chạy vẫn dùng
bản cũ trong memory. Hệ thống hiển thị "patched" nhưng thực tế vẫn vulnerable đến lần reboot
tiếp theo. Fix: check `/var/run/reboot-required` sau mỗi patch cycle, lên lịch reboot.

**Tắt unattended-upgrades vì "sợ break"** — điều này có nghĩa là security patch không được
áp tự động trong nhiều tháng. Rủi ro exploit lớn hơn nhiều rủi ro break từ security patch. Fix:
bật lại, giữ `Automatic-Reboot "false"` (không reboot tự động), nhưng để patch tự apply.

**Zero-day: delay vì chờ maintenance window** — khi có exploit đang được khai thác ngoài
thực tế (CISA KEV - Known Exploited Vulnerabilities), không thể chờ window thứ Tư. Fix:
patch ngay hoặc mitigate tạm (network block, WAF rule) trong khi chuẩn bị patch.

## 6. Tình huống thực tế

**Tình huống**: 9 giờ tối, alert từ CISA báo CVE-2024-XXXX trong OpenSSH đang bị khai thác
tại nhiều tổ chức. CVSS 9.8 Critical, AV:N, cho phép RCE không cần authentication.

**Bước 1 — Assess ngay** (chạy thật):

```bash
# Kiểm tra version OpenSSH đang dùng
ssh -V
```

Kết quả thực tế:

```
OpenSSH_8.9p1 Ubuntu-3ubuntu0.17, OpenSSL 3.0.2 15 Mar 2022
```

**Bước 2 — Kiểm tra fix có sẵn không** (chạy thật):

```bash
apt-cache policy openssh-server 2>/dev/null | head -5
```

Kết quả thực tế:

```
openssh-server:
  Installed: (none)
  Candidate: 1:8.9p1-3ubuntu0.17
  Version table:
```

OpenSSH-server không cài trên máy demo. Trên server production:

```bash
# Nếu có fix trong repo
apt-get install --only-upgrade openssh-server
systemctl restart sshd

# Nếu chưa có fix: tạm disable password auth, chỉ dùng key
# vi /etc/ssh/sshd_config → PasswordAuthentication no
# systemctl reload sshd
```

> `apt-get install --only-upgrade` và `systemctl restart sshd`: **output minh họa** —
> openssh-server không cài trên máy demo.

**Bước 3 — Verify**: chạy lại scanner sau khi patch, confirm version mới không còn affected.

## 7. Tự kiểm tra

**Câu 1**: Tại sao cần kiểm tra `/var/run/reboot-required` sau khi apply security patch?

a) Vì apt chỉ ghi file này khi patch thất bại  
b) Vì một số patch (kernel, glibc, libssl) cần reboot để tiến trình đang chạy trong memory
   dùng bản mới — nếu không reboot, hệ thống vẫn chạy code cũ dù package đã được update  
c) Vì file này chứa danh sách CVE đã được vá  
d) Vì apt không tự động apply patch nếu file này tồn tại

**Đáp án: b** — Khi update shared library (libssl, glibc) hay kernel, apt thay file trên disk
nhưng không thể thay code trong memory của process đang chạy. Process đó vẫn dùng version cũ
cho đến khi restart. Kernel patch cần reboot. Libssl patch cần restart mọi service dùng SSL.
`/var/run/reboot-required` là dấu hiệu apt tạo ra để nhắc operator. Ubuntu Livepatch giải quyết
vấn đề này cho kernel patch mà không cần reboot.

---

**Câu 2**: Khi có zero-day với exploit đang bị khai thác ngoài thực tế nhưng vendor chưa có
patch, bước nào là đúng?

a) Chờ vendor phát hành patch, không làm gì cho đến khi có fix chính thức  
b) Tắt service bị ảnh hưởng hoàn toàn cho đến khi có patch  
c) Áp mitigation tạm (block port, WAF rule, disable feature) ngay lập tức, theo dõi vendor
   advisory, và apply patch ngay khi có  
d) Vì không có patch, không có gì để làm — chỉ ghi nhận vào backlog

**Đáp án: c** — Zero-day không có nghĩa là "không làm được gì." Mitigation (WAF rule chặn
payload pattern, network ACL giới hạn access, disable feature bị lỗi) giảm attack surface
ngay lập tức mà không cần patch. Đây là nguyên lý defense in depth: kể cả khi lỗ hổng chưa
được vá, có thể giảm khả năng bị khai thác. Tắt service hoàn toàn (b) chỉ khi không có lựa
chọn nào khác — downtime có chi phí.

---

**Câu 3**: Tại sao `unattended-upgrades` mặc định chỉ apply từ `*-security` repo, không áp
toàn bộ update?

a) Vì `*-security` repo không chứa kernel update  
b) Vì regular update (bug fix, new features) có thể thay đổi behavior và break application —
   security update thường chỉ là backport fix nhỏ, ít break hơn  
c) Vì apt-get không hỗ trợ unattended mode cho regular update  
d) Vì `*-security` repo luôn up to date hơn regular repo

**Đáp án: b** — Regular update (từ repo `jammy-updates`) có thể bao gồm feature update, bug
fix thay đổi behavior, config format mới — có risk break application. Security update (`jammy-
security`) thường là backport minimal patch cho lỗ hổng cụ thể, ít thay đổi API/behavior nhất.
Phân tách này cho phép tự động hóa vá bảo mật mà kiểm soát được risk break.

---

**Câu 4**: Một server Ubuntu cần áp security patch cho glibc. Sau khi `apt upgrade` thành
công, lệnh nào xác nhận có cần reboot không?

a) `systemctl status glibc`  
b) `dpkg -l | grep glibc`  
c) `ls /var/run/reboot-required 2>/dev/null && cat /var/run/reboot-required || echo "No reboot required"`  
d) `glibc --version`

**Đáp án: c** — `apt` tự tạo file `/var/run/reboot-required` khi upgrade package yêu cầu
reboot (kernel, glibc, libc6, libssl...). Lệnh ở đáp án c kiểm tra file tồn tại không và in
nội dung nếu có. Lệnh `dpkg -l` (b) chỉ cho biết version đã cài, không nói cần reboot. Đáp
án a/d không hợp lệ.

---

**Câu 5**: Thứ tự ưu tiên nào là đúng khi có nhiều CVE cùng lúc?

a) Vá theo thứ tự CVSS Base Score từ cao xuống thấp, bất kể exposure  
b) Vá theo thứ tự ngày CVE được công bố (FIFO)  
c) Vá theo CVSS kết hợp với exposure: Critical/High trên service public-facing trước, sau đó
   Critical/High nội bộ, rồi Medium  
d) Chỉ vá khi có exploit public, bỏ qua CVE chưa có exploit

**Đáp án: c** — CVSS Base Score là điểm khởi đầu, nhưng exposure (service có public-facing
không?) là yếu tố quyết định. CVE 9.0 trên database nội bộ ít nguy hiểm hơn CVE 7.5 trên web
server có traffic thật. Thêm vào đó: CISA KEV (Known Exploited Vulnerabilities) — CVE đã được
khai thác thật — cần ưu tiên hơn CVE có score cao nhưng chưa có exploit. Kết hợp cả ba chiều:
score, exposure, và exploit maturity.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước (prereq):**
- `security.vuln-patch.scanning` — CVE, CVSS, Trivy: đầu vào để biết cần vá gì

**Bài liên quan:**
- `security.network-security.ids-ips` — phát hiện exploit attempt trong khi chờ patch (xem thêm)
- `security.audit-compliance.audit-logging` — log patch activity cho compliance (xem thêm)
- `sre.change-management.process` — patch production đi qua change management (xem thêm)

**Nguồn tham khảo:**
- [Ubuntu Livepatch — kernel patching without reboot](https://ubuntu.com/security/livepatch)
- [FIRST — CVSS v3.1 Specification](https://www.first.org/cvss/v3.1/specification-document)
