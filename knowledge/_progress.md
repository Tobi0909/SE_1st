# Tiến độ kho tri thức SE Dojo

> Đọc file này đầu mỗi phiên làm việc để biết tiếp tục đúng chỗ. Cập nhật mỗi khi hoàn thành
> một module (xem quy trình ở CLAUDE.md task spec "Xây dựng kho tri thức cho SE Dojo").

## Trạng thái tổng quan

- Giai đoạn 0 (taxonomy): **xong, đã được chủ dự án duyệt** — `knowledge/_taxonomy.yaml`
  (9 domain, 56 module, 146 bài).
- Tổng số bài đã viết: **113 / 146** (`draft`, chưa `verified`).
- Tổng số `TODO-VERIFY` còn tồn đọng trong toàn kho: **4** (3 từ module `networking.switching`
  liên quan tới chi tiết vPC/LACP phụ thuộc hãng/model cụ thể; 1 từ `devops.terraform.modules-state`
  về định dạng key prefix S3 backend khi dùng workspace — kiểm tra bằng `pnpm kb:lint`).

> **Ghi chú đếm bài (2026-10-07):** `find knowledge/ -name "*.md" ! -name "_*" | wc -l` trả về
> 111 — khớp với progress này. Trước đây progress ghi 111 nhưng thực tế có 109 file (đếm lệch 2
> từ sớm); hai bài `security.os-hardening` vừa thêm đưa con số thực tế lên đúng 111.
- `pnpm kb:lint`: **pass**, không lỗi.
- Chủ dự án đã duyệt văn phong/độ sâu của module đầu tiên ("cứ tiếp tục xây dựng tiếp đi") —
  từ nay tự làm tiếp từng module theo đúng khuôn mẫu, chỉ dừng khi gặp vấn đề cần quyết định.

## Module đã hoàn thành (viết + tự review bằng subagent + lint pass)

### 1. `linux.boot-systemd` — Boot và systemd (5/5 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `linux.boot-systemd.boot-process` | `knowledge/linux/boot-systemd/boot-process.md` | draft |
| `linux.boot-systemd.units` | `knowledge/linux/boot-systemd/units.md` | draft |
| `linux.boot-systemd.service-mgmt` | `knowledge/linux/boot-systemd/service-mgmt.md` | draft |
| `linux.boot-systemd.timers` | `knowledge/linux/boot-systemd/timers.md` | draft |
| `linux.boot-systemd.advanced` | `knowledge/linux/boot-systemd/advanced.md` | draft |

### 2. `linux.process-signals` — Process và tín hiệu (5/5 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `linux.process-signals.lifecycle` | `knowledge/linux/process-signals/lifecycle.md` | draft |
| `linux.process-signals.signals` | `knowledge/linux/process-signals/signals.md` | draft |
| `linux.process-signals.job-control` | `knowledge/linux/process-signals/job-control.md` | draft |
| `linux.process-signals.monitoring` | `knowledge/linux/process-signals/monitoring.md` | draft |
| `linux.process-signals.zombie-orphan` | `knowledge/linux/process-signals/zombie-orphan.md` | draft |

**Phát hiện đáng chú ý khi review module này (ghi lại để tránh lặp lại ở module sau):**
- Reviewer phát hiện 1 lỗi kỹ thuật thật ở tình huống thực tế của `zombie-orphan.md`: ví dụ
  gốc dùng Node.js `child_process.spawn()` không lắng nghe event `'exit'` để giải thích zombie
  tích tụ — SAI, vì Node.js (qua libuv) tự `waitpid()` mọi child bất kể JS có listener hay
  không. Đã sửa sang ví dụ Python `subprocess.Popen()` không gọi `.wait()`/`.poll()`/
  `.communicate()` — đã tự verify bằng thực nghiệm thật (tạo 5 child, thấy 5 zombie xuất hiện,
  gọi `.wait()` thì về 0) trước khi đưa vào bài. **Bài học: hành vi tự-reap-child khác nhau
  giữa runtime/ngôn ngữ, không suy diễn từ ngôn ngữ này sang ngôn ngữ khác — luôn verify bằng
  thực nghiệm hoặc tài liệu chính thức của ĐÚNG runtime được nhắc tới trong bài, không dùng
  kiến thức chung chung.**
- Reviewer phát hiện 1 mâu thuẫn nội tại ở `job-control.md`: giải thích sai cơ chế SIGHUP khi
  đóng terminal (ban đầu viết "kernel gửi SIGHUP tới mọi process gắn với terminal", đúng ra là
  kernel chỉ gửi tới session leader/shell, rồi CHÍNH SHELL tự forward lại cho các job nó quản
  lý trước khi thoát — theo Bash Reference Manual). Đã sửa thống nhất trong toàn bài + thêm
  nguồn `gnu.org/software/bash/manual`.
- Đã bổ sung nguồn còn thiếu theo góp ý reviewer: `fork(2)`, `execve(2)` cho `lifecycle.md`;
  `proc_loadavg(5)` cho `monitoring.md` (xác nhận load average tính cả trạng thái `D`).

**Ghi chú về cách viết (áp dụng cho các module sau, để nhất quán):**
- Lệnh thực hành chạy THẬT trên máy desktop Ubuntu 22.04.5 LTS của người dùng (không phải
  Docker — máy đã có systemd PID 1, phù hợp trực tiếp cho module này). KHÔNG chạy lệnh đổi
  trạng thái lên service hệ thống thật (không start/stop/enable bất kỳ service hệ thống nào
  đang phục vụ máy) — khi cần minh hoạ `start`/`stop`/`enable`/`disable`, tạo một unit DEMO ở
  scope `systemctl --user` (ví dụ `se-dojo-demo.service`), dùng xong `stop` + `disable` + xoá
  file + `daemon-reload` ngay, xác nhận đã dọn sạch bằng `systemctl --user list-units`.
- Nguồn kiểm chứng: man page thật qua `man7.org` (`bootup.7`, `systemd.service.5`,
  `systemd.timer.5`, `systemd.socket.5`, `journald.conf.5`) + `docs.rockylinux.org` cho phần
  firmware/GRUB2 — lấy qua `WebFetch`, không viết từ trí nhớ.
- Review: dùng subagent "Code Reviewer" đọc cả 5 bài + taxonomy, tự chạy lại các lệnh ĐỌC
  (read-only) trên máy để đối chiếu byte-for-byte, kiểm tra mâu thuẫn chéo giữa các bài. Kết
  quả: không có lỗi nghiêm trọng; 2 vấn đề "nên sửa" đã được fix (mô tả exit code
  `systemctl status` khi unit `failed` ở `service-mgmt.md`, và cắt `boot-process.md` từ ~2490
  xuống ~2050 từ cho gần khung 800-2000 từ).
- Độ dài 5 bài (ước lượng, không tính frontmatter/code block): boot-process ~2050,
  units ~1711, service-mgmt ~1750, timers ~1769, advanced ~1876 từ.

### 3. `linux.filesystem-storage` — Filesystem, LVM, RAID (6/6 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `linux.filesystem-storage.fhs-permissions` | `knowledge/linux/filesystem-storage/fhs-permissions.md` | draft |
| `linux.filesystem-storage.partitioning` | `knowledge/linux/filesystem-storage/partitioning.md` | draft |
| `linux.filesystem-storage.lvm-basics` | `knowledge/linux/filesystem-storage/lvm-basics.md` | draft |
| `linux.filesystem-storage.lvm-advanced` | `knowledge/linux/filesystem-storage/lvm-advanced.md` | draft |
| `linux.filesystem-storage.raid-mdadm` | `knowledge/linux/filesystem-storage/raid-mdadm.md` | draft |
| `linux.filesystem-storage.troubleshooting` | `knowledge/linux/filesystem-storage/troubleshooting.md` | draft |

**Quyết định quan trọng của chủ dự án cho module này (áp dụng cho MỌI module sau có thao tác
đĩa/block device nguy hiểm tương tự):** máy viết bài không có sudo không-mật-khẩu và không cài
`lvm2`/`mdadm`. Được hỏi, chủ dự án chọn: **KHÔNG cài thêm gói/dùng sudo để chạy thật** — 4 bài
`partitioning`/`lvm-basics`/`lvm-advanced`/`raid-mdadm` dùng **"output minh hoạ"** lấy cú pháp
từ man page chính thức (man7.org: `fdisk.8`, `pvcreate.8`, `vgcreate.8`, `lvextend.8`,
`lvcreate.8`, `mdadm.8`), đánh dấu rõ ràng bằng blockquote cảnh báo ngay đầu mỗi bài. 2 bài còn
lại (`fhs-permissions`, `troubleshooting`) KHÔNG đụng block device nên vẫn chạy lệnh thật bình
thường (ls/stat/umask/df/du/lsof). **Áp dụng cho tương lai**: domain `virt-storage` (VMware/
Ceph/SAN) và các module liên quan tới thiết bị không có trong sandbox sẽ theo đúng mẫu này —
không tự ý quyết định, hỏi lại nếu gặp tình huống tương tự chưa có tiền lệ rõ ràng.

**Phát hiện khi review module này:**
- Reviewer phát hiện output ở `fhs-permissions.md` mục 4 ghi nhãn "chạy thật" nhưng định dạng
  bị đơn giản hoá (chỉ số octal + tên) không khớp output thật của `ls -la`/`ls -l`/`ls -ld` —
  hoá ra do một lớp proxy cục bộ trên máy (rtk, xem ghi chú RTK.md) âm thầm rút gọn output
  `ls` khi gọi qua Bash tool. Đã phát hiện cách bypass (`\ls` hoặc `/usr/bin/ls` trực tiếp) để
  lấy output GNU coreutils chuẩn thật, dùng lại trong bài. **Bài học: khi một lệnh quen thuộc
  cho ra định dạng output "lạ" so với kiến thức chuẩn, nghi ngờ có lớp can thiệp cục bộ
  (alias/proxy/wrapper) trước khi đưa vào bài — kiểm tra bằng `type <lệnh>` và thử gọi binary
  trực tiếp.**
- Reviewer phát hiện cú pháp tạo thin LV ở `lvm-advanced.md` dùng `-V` kèm `--size` không khớp
  `lvcreate(8)` thật (trộn nhầm với cú pháp tạo sparse LV) — đã sửa đúng thành
  `lvcreate -T <vg>/<pool> -V <size-ảo> -n <tên>`.
- Bổ sung ghi chú RAID10 trong `mdadm` linh hoạt hơn mô hình 4-đĩa cổ điển (hỗ trợ tối thiểu 2
  đĩa qua layout near/far/offset).

### 4. `linux.users-permissions` — User và phân quyền (5/5 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `linux.users-permissions.users-groups` | `knowledge/linux/users-permissions/users-groups.md` | draft |
| `linux.users-permissions.chmod-chown` | `knowledge/linux/users-permissions/chmod-chown.md` | draft |
| `linux.users-permissions.sudo-pam` | `knowledge/linux/users-permissions/sudo-pam.md` | draft |
| `linux.users-permissions.acl-xattr` | `knowledge/linux/users-permissions/acl-xattr.md` | draft |
| `linux.users-permissions.selinux-apparmor` | `knowledge/linux/users-permissions/selinux-apparmor.md` | draft |

**Quyết định áp dụng (theo đúng tiền lệ module 3):** không tạo user/group hệ thống thật, không
sửa `/etc/sudoers`/PAM thật, không đổi SELinux/AppArmor mode thật trên máy cá nhân — các phần
này dùng "output minh hoạ" từ man page chính thức. Mọi lệnh ĐỌC an toàn (`id`, `getent`,
`chmod`/`chown`/`getfacl`/`setfacl` trên file tạm `/tmp`, `chattr +i` thử và nhận lỗi quyền
thật, `systemctl status apparmor`) chạy thật. Máy dùng AppArmor (không có SELinux — RHEL-family
mới có), nên phần SELinux toàn bộ là minh hoạ, đánh dấu rõ từ đầu bài.

**Phát hiện khi review module này:** không có lỗi kỹ thuật nghiêm trọng. Đã sửa: `sudo-pam.md`
vượt khung độ dài (~2120 từ, cắt xuống ~1970); bổ sung nguồn còn thiếu ở 4/5 bài (`usermod(8)`/
`shadow(5)` cho `users-groups.md`, `chown(1)` cho `chmod-chown.md`, `pam.conf(5)` cho
`sudo-pam.md`, `acl(5)` cho `acl-xattr.md`); sửa giải thích ký tự `X` trong ACL/chmod (bỏ sót
trường hợp file đã có execute sẵn, không chỉ áp dụng cho thư mục); thêm caveat cho claim
"AppArmor dễ bị lách qua hard link" (vẫn cần quyền DAC trước, không phải lỗ hổng miễn phí).

### 5. `networking.tcpip` — Mô hình TCP/IP (4/4 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `networking.tcpip.osi-tcpip-model` | `knowledge/networking/tcpip/osi-tcpip-model.md` | draft |
| `networking.tcpip.ipv4-subnetting` | `knowledge/networking/tcpip/ipv4-subnetting.md` | draft |
| `networking.tcpip.ipv6-basics` | `knowledge/networking/tcpip/ipv6-basics.md` | draft |
| `networking.tcpip.tcp-udp` | `knowledge/networking/tcpip/tcp-udp.md` | draft |

Module đầu tiên của domain `networking`. Lệnh đọc mạng an toàn (`ip addr`, `ip route`,
`ss -tn`/`-un`/`-tln`, `ping`, `dig`) chạy thật trên máy, dùng chính địa chỉ IP/route thật của
máy (`192.168.25.227/23`, route qua `enp1s0`) xuyên suốt cả 4 bài để nhất quán. Dùng thêm
Python `ipaddress` module để verify số liệu subnet (network/broadcast address) chính xác
trước khi đưa vào bài.

**Phát hiện khi review module này:** reviewer phát hiện 1 lỗi phải sửa ngay — bài
`osi-tcpip-model.md` viết sai trình tự lịch sử (nói OSI ra đời trước TCP/IP) khi giải thích vì
sao TCP/IP không tách tầng Presentation/Session; thực tế TCP/IP triển khai thật từ đầu 1970s/
1983, OSI là khung lý thuyết công bố SAU (1984) và chưa bao giờ được triển khai rộng thành giao
thức thật. Đã sửa đúng trình tự. Cũng sửa 1 chỗ suy luận quá đà (khẳng định UDP port 443 "là"
QUIC chỉ từ `ss`, không có cách xác nhận chắc chắn giao thức tầng ứng dụng qua `ss` — tự vi
phạm chính nguyên tắc "xác nhận đừng đoán" mà bài kia dạy) — đã sửa thành "nhiều khả năng,
cần tcpdump để xác nhận chắc". **Bài học: cẩn thận với các khẳng định dựa trên suy luận gián
tiếp (port quen dùng, quy ước) khi công cụ đang dùng không thực sự xác nhận được điều đó.**

### 6. `networking.dns` — DNS (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `networking.dns.fundamentals` | `knowledge/networking/dns/fundamentals.md` | draft |
| `networking.dns.operations` | `knowledge/networking/dns/operations.md` | draft |

Dùng systemd-resolved thật trên máy (stub `127.0.0.53` → upstream `192.168.24.1`) và domain
công khai (`example.com`, `google.com`, `github.com`) để lấy output thật qua `dig`/`nslookup`/
`host`/`resolvectl status`/`dig +trace`.

**Phát hiện khi review module này:** reviewer phát hiện 1 lỗi khái niệm có khả năng LAN VÀO
nội dung sinh tự động nếu không sửa — bảng SOA ở `operations.md` mô tả tham số `minimum` vừa
là "TTL mặc định" vừa là "TTL negative caching", pha trộn RFC 1035 (gốc, 1987) với RFC 2308
(1998, chuẩn hiện hành). Đã sửa: tách rõ `$TTL` (TTL mặc định, theo RFC 2308) khỏi SOA
`minimum` (CHỈ còn vai trò negative caching), bổ sung nguồn RFC 2308. **Bài học: với các khái
niệm đã qua nhiều lần chuẩn hoá lại theo thời gian (RFC cũ bị RFC mới redefine một phần), chỉ
trích đúng 1 RFC gốc có thể dẫn tới mô tả lỗi thời — cần kiểm tra RFC có "update/obsolete" bởi
RFC nào mới hơn không trước khi chốt nội dung.** Cũng đã thêm ghi chú "đã rút gọn" cho 2 đoạn
output dài (`resolvectl status`, `dig +trace`) từng bị trình bày như verbatim đầy đủ.

### 7. `networking.diagnostic-tools` — Công cụ chẩn đoán (3/3 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `networking.diagnostic-tools.ss-netstat` | `knowledge/networking/diagnostic-tools/ss-netstat.md` | draft |
| `networking.diagnostic-tools.tcpdump-wireshark` | `knowledge/networking/diagnostic-tools/tcpdump-wireshark.md` | draft |
| `networking.diagnostic-tools.mtr-traceroute` | `knowledge/networking/diagnostic-tools/mtr-traceroute.md` | draft |

**Giới hạn môi trường mới gặp lần này:** máy không có quyền root/`CAP_NET_RAW` — xác nhận thật
bằng cách thử (`tcpdump` báo "Operation not permitted", `mtr` treo không phản hồi,
`traceroute` không cài sẵn). Áp dụng đúng quy tắc đã có (giống LVM/RAID ở module 3): `ss`/
`netstat` chạy THẬT (không cần quyền đặc biệt); `tcpdump`/`mtr`/`traceroute` dùng **output
minh hoạ** từ man page chính thức, đánh dấu rõ. Không cần hỏi lại chủ dự án vì đây chỉ là giới
hạn công cụ/quyền, không phải quyết định an toàn mới (quy tắc chung đã đủ bao quát).

**Phát hiện khi review module này:** reviewer phát hiện 1 lỗi phải sửa ngay — ví dụ output
minh hoạ `tcpdump` ở `tcpdump-wireshark.md` ghi sai cú pháp cờ TCP cho gói ACK cuối của 3-way
handshake (`Flags [S.ack]`, vừa sai cờ SYN còn sót lại vừa sai cú pháp — `tcpdump` thật không
bao giờ in chữ "ack" trong dấu `[]`, ACK thuần chỉ là `Flags [.]`). Lỗi này còn bị đóng gói vào
luôn 1 câu hỏi tự kiểm tra, nghĩa là sẽ dạy sai nếu không bắt kịp. Đã sửa cả 3 vị trí lặp lại
lỗi này trong cùng bài. **Bài học: với output minh hoạ dựng tay (không copy trực tiếp từ tài
liệu), cú pháp ký hiệu đặc thù của từng tool (ví dụ cách `tcpdump` viết TCP flags) dễ bị lẫn
với cách diễn đạt thông thường (viết "ack" như một từ) — nên đối chiếu từng ký tự với ví dụ
thật trong man page/tài liệu gốc, không tự suy diễn cú pháp dù nắm đúng khái niệm.**

### 8. `networking.nat-firewall` — NAT và firewall (3/3 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `networking.nat-firewall.nat-types` | `knowledge/networking/nat-firewall/nat-types.md` | draft |
| `networking.nat-firewall.firewall-concepts` | `knowledge/networking/nat-firewall/firewall-concepts.md` | draft |
| `networking.nat-firewall.acl-security-groups` | `knowledge/networking/nat-firewall/acl-security-groups.md` | draft |

SNAT/DNAT/MASQUERADE, lý do PAT "chặn" kết nối đến (conntrack), stateful vs stateless,
nguyên tắc thứ tự rule (first-match-wins), zone firewalld, và Security Group vs Network ACL
(mô hình AWS — stateful/allow-only/instance-level vs stateless/allow+deny/subnet-level, thứ
tự traffic qua 2 lớp ĐẢO NGƯỢC theo chiều inbound/outbound). Máy không có sudo không-mật-khẩu
— lệnh THAY ĐỔI rule (iptables/nft add, set ip_forward) dùng output minh hoạ theo
netfilter.org/AWS VPC Docs; lệnh ĐỌC kernel state (`ip_forward`, `lsmod`) chạy thật.

**Phát hiện khi review module này:** chỉ các vấn đề mức "nên sửa", không có lỗi nghiêm trọng —
đã sửa: output `iptables -L -n -v` thiếu cột `pkts/bytes/in/out` mà chính cờ `-v` tạo ra; lệnh
`lsmod | grep nf_tables` không thể chứng minh được tuyên bố "`nf_conntrack` chưa load" (pattern
không khớp thì đương nhiên không hiện, không phải do thật sự kiểm tra) — sửa thành
`grep -E 'nf_tables|nf_conntrack'`; bổ sung blockquote cảnh báo "output minh hoạ" còn thiếu ở
`acl-security-groups.md` cho nhất quán với 2 bài khác; bổ sung chiều traffic cho đúng thứ tự
SG/NACL (inbound: NACL→SG, outbound: SG→NACL — ban đầu chỉ nói đúng 1 chiều).

### 9. `networking.http-lb` — HTTP và load balancing (3/3 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `networking.http-lb.http-fundamentals` | `knowledge/networking/http-lb/http-fundamentals.md` | draft |
| `networking.http-lb.reverse-proxy` | `knowledge/networking/http-lb/reverse-proxy.md` | draft |
| `networking.http-lb.lb-algorithms` | `knowledge/networking/http-lb/lb-algorithms.md` | draft |

HTTP method/idempotent, 5 nhóm status code (đặc biệt phân biệt 502 vs 504), redirect 301/302
vs 307/308; reverse proxy (TCP mới, X-Forwarded-For, rủi ro giả mạo); 4 thuật toán load
balancing (round-robin, least_conn, ip_hash + vấn đề PAT, weighted, health check). Bài 1 dùng
`curl` thật tới domain công khai. Bài 2-3 không cài Nginx/HAProxy — **tự viết script Python
tối giản (~15-20 dòng, http.server+urllib+itertools.cycle) làm backend/proxy/load-balancer
THẬT, chạy trên 127.0.0.1**, lấy output THẬT (header injection, round-robin A/B/A/B) thay vì
minh hoạ hoàn toàn — chỉ phần cấu hình `nginx.conf` cụ thể mới là output minh hoạ. **Kỹ thuật
mới đáng ghi nhớ cho các module sau**: khi không cài được phần mềm đích (Nginx/HAProxy/...)
nhưng CƠ CHẾ cốt lõi có thể dựng lại bằng vài dòng script, ưu tiên cách này hơn thuần minh hoạ
— cho output thật, đáng tin hơn nhiều.

**Phát hiện khi review:** không có lỗi nghiêm trọng. Đã sửa vài điểm nhỏ: thiếu header
`Accept-Encoding` thực tế trong output "thật" của demo proxy Python; gộp mơ hồ vai trò
`Cache-Control` (freshness, không cần hỏi lại) với `ETag` (validation có điều kiện khi đã
stale); dùng từ "NAT" chung thay vì "PAT" (thuật ngữ cụ thể hơn, đã định nghĩa ở module
`nat-firewall`) khi giải thích vấn đề `ip_hash`.

### 10. `networking.tls-pki` — TLS và PKI (3/3 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `networking.tls-pki.handshake` | `knowledge/networking/tls-pki/handshake.md` | draft |
| `networking.tls-pki.pki-cert-mgmt` | `knowledge/networking/tls-pki/pki-cert-mgmt.md` | draft |
| `networking.tls-pki.troubleshooting` | `knowledge/networking/tls-pki/troubleshooting.md` | draft |

TLS 1.3 handshake (1-RTT, CertificateVerify, chain of trust) qua `curl -v`/`openssl s_client`
tới example.com; quy trình PKI đầy đủ (CA tự ký → CSR → ký → verify) tự dựng thật bằng
`openssl req`/`x509`/`verify` trong thư mục tạm; 2 lỗi TLS kinh điển (chain — error 20, hostname
mismatch — error 62) minh hoạ bằng chính PKI tự tạo. **Toàn bộ 3 bài KHÔNG có output minh hoạ
nào** — mọi lệnh đều chạy thật (khác các module trước vẫn cần minh hoạ một phần do thiếu quyền/
công cụ).

**Phát hiện khi review:** không có lỗi kỹ thuật, output đã được reviewer tự chạy lại và khớp
gần như tuyệt đối (kể cả số liệu "động" như ngày hết hạn cert thật, số cert trong chain). Chỉ
1 lỗi "nên sửa": cross-reference sai ở `troubleshooting.md` mục 8 (mô tả sai nội dung bài
`networking.http-lb.lb-algorithms.md`, bài đó không có gì về TLS) — đã sửa lại đúng.

### 11. `networking.vpn` — VPN (1/1 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `networking.vpn.types` | `knowledge/networking/vpn/types.md` | draft |

Site-to-site vs remote access; IPsec (Transport vs Tunnel mode, AH vs ESP — ESP MUST/AH MAY
theo đúng RFC 4301, đã verify nguyên văn); SSL VPN (dễ qua NAT/firewall vì chạy trên port 443)
vs WireGuard (key-based như SSH, không cần PKI). `nmcli connection show` chạy thật để liệt kê
profile VPN (không kết nối); OpenVPN/WireGuard config là output minh hoạ.

**🔴 Sự cố đáng ghi nhớ khi review module này — RÒ RỈ THÔNG TIN NHẠY CẢM THẬT:** output
`nmcli` ban đầu copy TRỰC TIẾP từ máy thật, vô tình chứa domain công ty thật
(`sapo.vn`) và username công việc thật (`tuantm5`) ngay trong tên profile VPN
(`sslvpn-tuantm5@sapo.vn-...`) — dù lệnh CHẠY (chỉ liệt kê, không kết nối) hoàn toàn an toàn,
chính NỘI DUNG output lại không nên đưa vào tài liệu dùng chung. Reviewer bắt được trước khi
bài này được coi là xong. Đã ẩn danh hoá thành `work-remote-ssl-primary`/`-backup`. **Đã lưu
thành memory (feedback) để không lặp lại**: trước khi dán BẤT KỲ output lệnh thật nào (dù lệnh
an toàn) vào nội dung dùng để chia sẻ/sinh quiz-lab, phải tự kiểm tra output đó có lẫn domain/
username/hostname thật của tổ chức không, không chỉ xét độ an toàn của CHÍNH LỆNH.

### 12. `linux.performance` — Chẩn đoán hiệu năng CPU/Memory/I-O (4/4 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `linux.performance.cpu-load` | `knowledge/linux/performance/cpu-load.md` | draft |
| `linux.performance.memory-swap` | `knowledge/linux/performance/memory-swap.md` | draft |
| `linux.performance.io` | `knowledge/linux/performance/io.md` | draft |
| `linux.performance.case-study` | `knowledge/linux/performance/case-study.md` | draft |

Bộ ba chẩn đoán hiệu năng CPU (load average, nice/renice, CFS "gợi ý không phải đảm bảo",
context switch cost qua `vmstat`) → Memory/swap (`MemAvailable` vs `MemFree`, buffer/cache có
thể thu hồi, swap một lần vs thrashing, `oom_score`/`oom_score_adj`, PID 1 được bảo vệ) → I/O
(`%util` KHÔNG đáng tin trên SSD/RAID phục vụ song song — chỉ `await` mới đáng tin, IOPS vs
throughput, `/proc/diskstats`) rồi gộp lại thành 1 case study end-to-end dùng `strace -c`
(summary, an toàn) / `strace -p` (attach, bị chặn bởi Yama LSM `ptrace_scope`) + `lsof -p`
(không bị ptrace_scope chặn vì chỉ đọc metadata, không dùng syscall ptrace thật). Lệnh thật:
`cat /proc/loadavg`, `nproc`, `vmstat 1 3`, `renice` trên tiến trình nền tự tạo (`tail -f
/dev/null &`, đã dọn sạch sau), `free -h`, `/proc/meminfo`, `/proc/self/oom_score`,
`/proc/diskstats`, `strace -c -o ... ls /tmp`, `strace -p`/`lsof -p` trên tiến trình nền.
Minh hoạ (đánh dấu rõ, có lý do): `iostat -x` (sysstat không cài, không có sudo) — 2 kịch bản
đối chiếu SSD (util cao/await thấp = chưa nghẽn) vs HDD (cả hai cao = nghẽn thật) lấy theo cú
pháp man page chính thức.

**🔴 Lỗi kỹ thuật nghiêm trọng phát hiện khi review module này:** `case-study.md` mô tả sai
Yama LSM `ptrace_scope=1` — viết là chỉ cho phép ptrace giữa cha-con TRỰC TIẾP. Reviewer
WebFetch lại ĐÚNG nguồn kernel.org mà bài tự trích dẫn và phát hiện nguồn đó nói ngược lại:
mức 1 cho phép ptrace với TOÀN BỘ descendant (con, cháu, chắt... ở mọi cấp), không chỉ con
trực tiếp. Lỗi này đặc biệt nặng vì được nhắc lại 3 lần như một "khái niệm lõi", và còn dùng
sai để giải thích vì sao demo `strace -p` thất bại (lý do thật: tiến trình nền bị re-parent
sang tiến trình khác giữa 2 lần gọi Bash tool riêng biệt — không còn là descendant của shell
gốc — chứ không phải "không phải con trực tiếp"). Đã sửa cả 3 vị trí (thêm bảng 4 mức
`ptrace_scope` 0-3 ở mục 2, viết lại mục 3 gắn đúng với cơ chế re-parenting/subreaper đã học ở
`linux.process-signals.lifecycle`, viết lại mục 4 giải thích đúng nguyên nhân demo thất bại).
**Bài học: khi một bài tự trích dẫn một nguồn, reviewer phải tự fetch lại ĐÚNG nguồn đó và đối
chiếu từng câu — lỗi này được phát hiện chính xác bằng cách đó, không phải bằng kiến thức
chung.** Các góp ý nhỏ khác (🟡): bổ sung nguồn thiếu cho cả 4 bài (`renice(1)`,
`proc_meminfo(5)`, kernel.org `iostats.txt`, `strace(1)`) — đã thêm vào cả frontmatter
`sources:` và mục "Nguồn tham khảo".

### 13. `linux.shell-scripting` — Shell scripting (4/4 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `linux.shell-scripting.bash-basics` | `knowledge/linux/shell-scripting/bash-basics.md` | draft |
| `linux.shell-scripting.text-processing` | `knowledge/linux/shell-scripting/text-processing.md` | draft |
| `linux.shell-scripting.bash-advanced` | `knowledge/linux/shell-scripting/bash-advanced.md` | draft |
| `linux.shell-scripting.best-practices` | `knowledge/linux/shell-scripting/best-practices.md` | draft |

Biến/điều kiện/vòng lặp/tham số dòng lệnh (bash-basics) → `grep`/`sed`/`awk`/`xargs` xử lý văn
bản theo pipeline Unix (text-processing) → hàm/`trap`/`set -e`/`set -u`/`pipefail` (bash-advanced)
→ idempotent/logging có timestamp/exit code chuẩn cho script vận hành (best-practices). **100%
lệnh/script chạy THẬT** trên máy (không có ràng buộc root/thiết bị nào ở module này) — mọi
script test được viết ra file `.sh` riêng và chạy qua `/bin/bash` trực tiếp (không qua alias),
đúng kỹ thuật phòng tránh lớp proxy cục bộ đã phát hiện ở module 3.

**🔴 Lỗi kỹ thuật phát hiện khi review module này:** `bash-basics.md` mục 6 giải thích sai toán
tử `<` trong `[ ]` — viết là "so sánh chuỗi theo thứ tự ký tự", thực ra đặc tính so sánh chuỗi
bằng `<` CHỈ thuộc về `[[ ]]`; trong `[ ]`/`test`, `<` KHÔNG BAO GIỜ được hiểu là toán tử so
sánh — shell luôn nuốt nó làm REDIRECT đầu vào trước khi `test` kịp thấy, bất kể quote biến
đúng cách hay không. Reviewer tự chạy thật để xác nhận: không có file tên trùng ngưỡng số thì
báo lỗi redirect ra stderr (`bash: line 1: 20: No such file or directory`, exit `1`); nếu TÌNH
CỜ có file trùng tên, điều kiện LUÔN đúng một cách vô nghĩa (exit `0`), không hề so sánh giá
trị — cả hai hành vi đều KHÁC với mô tả gốc ("chạy sai không báo lỗi gì" / "thiếu tham số"). Đã
viết lại toàn bộ đoạn mục 6 cho khớp đúng hành vi thật đã verify. **Bài học: toán tử giống nhau
(`<`, `>`, `=`) có Ý NGHĨA KHÁC NHAU hoàn toàn giữa `[ ]` (POSIX `test`) và `[[ ]]` (Bash mở
rộng) — không thể mô tả chung cho cả hai, phải tự chạy thật để xác nhận hành vi của ĐÚNG cú
pháp đang viết, không suy diễn từ cú pháp "tương tự".**

🟡 đã sửa thêm: cross-reference ở `best-practices.md` mục 8 tới `linux.boot-systemd.service-mgmt`
ban đầu giải thích sai nội dung bài được link (gán nhầm khái niệm "seed dùng upsert" từ
CLAUDE.md, không phải nội dung thật của bài) — đã sửa lại đúng nội dung thật (unit
`systemctl --user` demo cần tạo/dọn idempotent).

### 14. `linux.package-management` — Quản lý gói (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `linux.package-management.deb` | `knowledge/linux/package-management/deb.md` | draft |
| `linux.package-management.rpm` | `knowledge/linux/package-management/rpm.md` | draft |

Kiến trúc 2 tầng chung cho cả 2 hệ sinh thái: công cụ tầng THẤP làm việc trực tiếp với file gói
(`dpkg`/`rpm` — không tự tải dependency) vs tầng CAO biết repository, tự giải quyết dependency
(`apt`/`dnf`). `deb.md`: mọi lệnh ĐỌC (`dpkg -l/-L/-S`, `apt-cache policy`,
`dpkg --compare-versions`) chạy THẬT trên máy (Ubuntu 22.04.5, apt 2.4.14, dpkg 1.21.1); lệnh
THAY ĐỔI (`apt update`/`install`/`upgrade`, cần sudo không có trên máy demo) dùng **output minh
hoạ** theo `apt(8)`, đánh dấu rõ ràng và tách biệt khỏi phần chạy thật. `rpm.md` **100% minh
hoạ** (máy chạy Ubuntu, không có `rpm`/`dnf`/không có máy RHEL nào trong môi trường) — đánh dấu
ngay đầu bài, lấy cú pháp/output từ `dnf(8)`/`rpm(8)`/docs.rockylinux.org.

**Phát hiện cốt lõi của module này — và đã được reviewer xác nhận ĐÚNG qua fetch man page
thật:** `dnf update` (không tham số) **KHÔNG** giống `apt update` — `dnf update` thực sự NÂNG
CẤP ngay (tương đương `apt upgrade`), trong khi `apt update` chỉ tải lại metadata (an toàn,
không đổi gì). Tương đương an toàn của `apt update` bên RHEL là `dnf check-update`. Đây là cạm
bẫy đặt tên nguy hiểm nhất khi một SE quen Debian chuyển sang vận hành RHEL — nếu dạy sai chiều
ngược lại sẽ hướng dẫn người học vô tình nâng cấp production ngoài ý muốn, nên được kiểm chứng
kỹ bằng cách fetch `dnf(8)` thật trước khi chốt nội dung, không suy diễn từ tên lệnh.

🟡 đã sửa theo reviewer: 2 URL nguồn chết (`man7.org/.../apt.8.html` trả 404 — `apt(8)` không
thuộc Linux man-pages project nên man7.org không mirror, đã đổi sang
`manpages.debian.org/bookworm/apt/apt.8.en.html`; `docs.rockylinux.org/guides/.../intro_to_rpm/`
trả 404 do đổi cấu trúc doc, đã đổi sang `docs.rockylinux.org/books/admin_guide/13-softwares/`);
bổ sung đầy đủ output `apt-cache policy curl` (bản gốc trong bài bị rút gọn thiếu 2 dòng so với
chạy thật, dù được dán nhãn "chạy thật" — đã dán lại nguyên văn kèm giải thích ý nghĩa từng
dòng). **Bài học: với nguồn tham khảo, không giả định mọi man page đều có trên man7.org — một
số công cụ (như `apt`, khác với `dpkg`) thuộc project riêng (Debian/APT), không nằm trong Linux
man-pages project mà man7.org mirror, cần tìm đúng nguồn gốc (`manpages.debian.org`/
`manpages.ubuntu.com`) thay vì đoán URL theo khuôn mẫu đã dùng quen cho các man page khác.**

### 15. `linux.network-stack` — Network stack trên Linux (4/4 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `linux.network-stack.tools` | `knowledge/linux/network-stack/tools.md` | draft |
| `linux.network-stack.dns-resolution` | `knowledge/linux/network-stack/dns-resolution.md` | draft |
| `linux.network-stack.firewall` | `knowledge/linux/network-stack/firewall.md` | draft |
| `linux.network-stack.troubleshooting` | `knowledge/linux/network-stack/troubleshooting.md` | draft |

`ip addr`/`ip route`/`ip link`/`ss` (tools) → stub resolver systemd-resolved, resolv.conf symlink,
nsswitch.conf (dns-resolution) → nf_tables/iptables-nft/ufw xếp tầng, ip_forward, policy deny-by-default
(firewall) → MTU path discovery ping -M do (kết quả thật: MTU hiệu dụng 1492), bonding active-backup vs
802.3ad (troubleshooting). Lệnh THẬT: `ip addr show enp1s0`, `ip route`, `ss -tln`/`-tn state
established`/`-s`, `cat /etc/resolv.conf`, `resolvectl status`, `grep hosts /etc/nsswitch.conf`,
`ss -tln | grep 53`, `cat /proc/sys/net/ipv4/ip_forward`, `lsmod | grep nf_tables`, `cat
/etc/default/ufw`, quyền sudo thật bị từ chối (`nft list ruleset`, `sudo -n ufw status`),
`ping -M do -s 1464/1465/1472 8.8.8.8` (xác định ngưỡng MTU=1492 chính xác). Minh hoạ (có lý do):
`ufw allow`/`status verbose`, `nft list ruleset` (cần root), `cat /proc/net/bonding/bond0` (không có
bonding interface trên máy desktop đơn).

**Phát hiện khi review module này (🟡, không có 🔴):**
- `resolvectl` thuộc man section **1** (không phải 8) — URL đúng
  `man7.org/linux/man-pages/man1/resolvectl.1.html`; `resolvectl.8` trả 404.
- `nft(8)` và `ufw(8)` **không có trên man7.org** (không thuộc Linux man-pages project) — đã đổi sang
  `manpages.debian.org/bookworm/nftables/nft.8.en.html` và
  `manpages.ubuntu.com/manpages/jammy/en/man8/ufw.8.html`.
- Cross-reference "đã học ở `networking.routing.static`" và "đã học ở `networking.switching.lacp`"
  dùng sai thì (bài đó chưa được viết) — đã đổi sang "sẽ học ở".
- `tools.md` mục 8 thiếu cross-reference tới `networking.diagnostic-tools.ss-netstat` — đã bổ sung.
**Bài học: không giả định mọi man section đều là section 8 cho admin tools — `resolvectl` là section 1
(user command) dù thường chạy bằng root; kiểm tra URL trước khi đưa vào `sources:`. Các tool không thuộc
Linux man-pages project (apt, nft, ufw, resolvectl section 1) cần tìm đúng nguồn gốc của project đó.**

### 16. `linux.kernel-troubleshooting` — Kernel và troubleshooting (4/4 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `linux.kernel-troubleshooting.modules` | `knowledge/linux/kernel-troubleshooting/modules.md` | draft |
| `linux.kernel-troubleshooting.sysctl` | `knowledge/linux/kernel-troubleshooting/sysctl.md` | draft |
| `linux.kernel-troubleshooting.kernel-logs` | `knowledge/linux/kernel-troubleshooting/kernel-logs.md` | draft |
| `linux.kernel-troubleshooting.methodology` | `knowledge/linux/kernel-troubleshooting/methodology.md` | draft |

Module cuối của domain `linux`. `modules.md`: `lsmod`/`modinfo`/`cat /proc/modules`/`ls /sys/module/<name>/`
(100% lệnh thật). `sysctl.md`: đọc tham số `net.*`/`vm.*`/`kernel.*` thật; thay đổi và cấu hình vĩnh viễn
là output minh hoạ (cần root). `kernel-logs.md`: `journalctl -k` chạy thật (user thuộc group `adm`);
`dmesg` bị restrict (`kernel.dmesg_restrict=1`) — phần minh hoạ và note rõ lý do. `methodology.md`:
capstone — khung USE, quy trình 4 bước, 3 kịch bản debug thật trên máy.

**Phát hiện khi review module này (0 🔴, 5 🟡):**
- `sysctl.md` mục 7 câu 2: `sysctl -w somaxconn=65535` sai — tên ngắn không hợp lệ, đúng là
  `sysctl -w net.core.somaxconn=65535`. Đã sửa.
- `modules.md` mục 4: output `ls /sys/module/nf_tables/` thiếu `coresize` và `initsize`. Đã thêm.
- `modules.md` mục 4: `sctp Used by = 15` là snapshot cũ, thực tế là `13`. Đã sửa + thêm ghi chú
  giá trị thay đổi theo connection.
- `sysctl.md` mục 6: "(đã học ở `linux.performance.io`)" với bài không trong prerequisites — đổi sang
  "xem thêm". Đã sửa.
- `kernel-logs.md` mục 4: "(đã học ở `linux.performance.case-study`)" tương tự — đổi sang "xem thêm".
  Đã sửa.
**Bài học: snapshot runtime (số connection, refcnt) thay đổi theo thời gian — nên thêm ghi chú giá trị
mang tính thời điểm hoặc dùng giá trị mang tính minh hoạ cố định khi số đó không quan trọng về độ chính
xác. Với cross-reference, "đã học ở" chỉ dùng khi bài kia NẰM TRONG prerequisites; nếu chỉ "xem thêm"
thì dùng ngôn ngữ optional.**

### 17. `container-k8s.docker-internals` — Cơ chế bên trong Docker (5/5 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `container-k8s.docker-internals.namespaces-cgroups` | `knowledge/container-k8s/docker-internals/namespaces-cgroups.md` | draft |
| `container-k8s.docker-internals.images` | `knowledge/container-k8s/docker-internals/images.md` | draft |
| `container-k8s.docker-internals.networking` | `knowledge/container-k8s/docker-internals/networking.md` | draft |
| `container-k8s.docker-internals.storage` | `knowledge/container-k8s/docker-internals/storage.md` | draft |
| `container-k8s.docker-internals.compose` | `knowledge/container-k8s/docker-internals/compose.md` | draft |

Docker không cài trên máy demo — toàn bộ `docker` command là output minh hoạ; cơ chế kernel
(namespace, cgroup, bridge, iptables) dùng lệnh thật. `namespaces-cgroups.md`: `readlink
/proc/self/ns/*` (10 symlink thật), `cat /proc/self/cgroup` (cgroup v2 unified path), `cat
/sys/fs/cgroup/cgroup.controllers` — tất cả chạy thật. Images, networking, storage, compose: 100%
minh hoạ theo Docker Engine documentation.

**Phát hiện khi review module này (0 🔴, 4 🟡):**
- `images.md` prose dòng 137: mô tả ngược layer số (`RUN chmod` rebuild vs `RUN apt-get` cached).
  Đã sửa thành layer 3/4 (`COPY`) và layer 4/4 (`RUN chmod`) rebuild; layer 2/4 (`RUN apt-get`)
  được cache.
- `storage.md` + `compose.md`: 3 vị trí mô tả sai anonymous volume bị xoá bởi `docker compose
  down` mặc định (Compose v2 KHÔNG xoá volume trừ khi thêm flag `--volumes`). Đã sửa cả 3 vị trí.
- `namespaces-cgroups.md` dòng 163: "đã học ở `linux.performance.memory-swap`" không nằm trong
  prerequisites — đổi sang "xem thêm". Đã sửa.
- `networking.md` dòng 38: "đã học ở `networking.nat-firewall.nat-types`" tương tự — đổi sang
  "xem thêm". Đã sửa.
- `storage.md` dòng 59-63: claim sai rằng `--mount` và `--volume` có hành vi volume initialization
  khác nhau (thực ra chỉ khác nhau với BIND MOUNT, không phải volume). Đã bỏ phần nhầm lẫn.
- `compose.md` scale example: port mapping trong ví dụ scale mâu thuẫn với service có `ports:`
  cố định. Đã sửa — giải thích cần dùng port không cố định (`"3000"` thay vì `"3000:3000"`) và
  cập nhật ví dụ output dùng ephemeral port ngẫu nhiên.

**Bài học mới từ module này:**
- Compose v2 khác v1 quan trọng ở volume lifecycle: v1 standalone binary (`docker-compose`) xoá
  anonymous volume khi `down`, v2 plugin (`docker compose`) giữ nguyên mọi volume trừ khi dùng
  `--volumes`. Luôn kiểm tra behaviour theo đúng phiên bản, không suy diễn từ hành vi Compose v1.
- Tất cả cross-reference trong module này vẫn theo đúng quy tắc đã thiết lập: "đã học ở" chỉ
  dùng cho ID trong `prerequisites:`, còn lại dùng "xem thêm".

### 23. `container-k8s.k8s-troubleshooting` — Troubleshooting K8s (3/3 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `container-k8s.k8s-troubleshooting.pod-errors` | `knowledge/container-k8s/k8s-troubleshooting/pod-errors.md` | draft |
| `container-k8s.k8s-troubleshooting.oom-resource` | `knowledge/container-k8s/k8s-troubleshooting/oom-resource.md` | draft |
| `container-k8s.k8s-troubleshooting.logs-events` | `knowledge/container-k8s/k8s-troubleshooting/logs-events.md` | draft |

K8s không cài trên máy demo — 100% output minh hoạ theo K8s documentation. `pod-errors.md`: Pod
lifecycle phases, CrashLoopBackOff/Pending/ImagePullBackOff/OOMKilled/ContainerCreating, backoff
exponential (10s→20s→...→5min), 3-step triage workflow (get→describe→logs), ephemeral debug
container `kubectl debug` stable K8s 1.25. `oom-resource.md`: requests vs limits (scheduler vs
kernel), OOMKill (SIGKILL exit 137), container OOMKill vs node pressure OOMKill, QoS classes
(Guaranteed/Burstable/BestEffort), CPU throttle ≠ OOMKill, sizing rules (P50 requests/P99+30%
limits). `logs-events.md`: kubectl logs mechanics (stdout/stderr/node-file), Events TTL 1h/etcd
cost, `--previous`/`--since`/`--tail`/`--prefix`/`--max-log-requests`, `get events
--field-selector type=Warning`, triage nhanh với 5 bước.

**Phát hiện khi review module này (0 🔴, 0 🟡):**
- Không có lỗi kỹ thuật nghiêm trọng hoặc đáng sửa.

### 22. `container-k8s.k8s-rbac-security` — RBAC và bảo mật K8s (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `container-k8s.k8s-rbac-security.rbac` | `knowledge/container-k8s/k8s-rbac-security/rbac.md` | draft |
| `container-k8s.k8s-rbac-security.security-context` | `knowledge/container-k8s/k8s-rbac-security/security-context.md` | draft |

K8s không cài trên máy demo — 100% output minh hoạ. `rbac.md`: Subject (User/Group/ServiceAccount),
Role vs ClusterRole (namespace vs cluster scope), RoleBinding + ClusterRoleBinding (4 kết hợp), allow-only
model, `cluster-admin` standalone wildcard role (không dùng aggregation), `admin`/`edit`/`view`
aggregate, `kubectl auth can-i`, `automountServiceAccountToken: false`. `security-context.md`: Pod vs
container SecurityContext, runAsUser/runAsNonRoot/allowPrivilegeEscalation/readOnlyRootFilesystem/
capabilities (drop ALL + add back), seccompProfile RuntimeDefault; Pod Security Standards 3 mức
(privileged/baseline/restricted); PSA namespace labels (enforce/audit/warn); PSP removed K8s 1.25.

**Phát hiện khi review module này (0 🔴, 2 🟡, 1 nit):**
- `rbac.md` dòng 78-79: `cluster-admin` mô tả sai là aggregated ClusterRole — thực ra là standalone
  ClusterRole với wildcard rules. Chỉ `admin`/`edit`/`view` dùng aggregation. Đã sửa: tách thành
  2 đoạn riêng biệt.
- `rbac.md` dòng 211-212: "cần restart Pod để mount token mới" sai — RBAC change có hiệu lực ngay
  lập tức (token SA chỉ là credential định danh, không nhúng permission). Đã sửa.
- `rbac.md` dòng 135: `kubectl apply -f file1 file2 file3` cú pháp sai — phải dùng nhiều `-f` hoặc
  comma-separated. Đã sửa thành `-f sa.yaml -f role.yaml -f rolebinding.yaml`.

### 21. `container-k8s.k8s-storage` — Kubernetes Storage (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `container-k8s.k8s-storage.pv-pvc` | `knowledge/container-k8s/k8s-storage/pv-pvc.md` | draft |
| `container-k8s.k8s-storage.storageclass` | `knowledge/container-k8s/k8s-storage/storageclass.md` | draft |

K8s không cài trên máy demo — 100% output minh hoạ. `pv-pvc.md`: PV lifecycle (Available/Bound/Released),
accessModes (RWO/ROX/RWX/RWOP — RWOP beta K8s 1.27, GA 1.29), reclaimPolicy (Retain/Delete/Recycle
deprecated), smallest-fit binding, static vs dynamic provisioning, rebind Released PV qua xoá claimRef.
`storageclass.md`: provisioner, parameters (EBS CSI dùng `iops` tuyệt đối, không phải `iopsPerGB` của
in-tree plugin), WaitForFirstConsumer vs Immediate (AZ affinity), default StorageClass (multiple default
→ admission error, không phải Pending), CSI vs in-tree, allowVolumeExpansion.

**Phát hiện khi review module này (1 🔴, 2 🟡, 1 nit):**
- `storageclass.md` dòng 106: `iopsPerGB` là parameter của in-tree plugin `kubernetes.io/aws-ebs`, KHÔNG
  phải EBS CSI driver `ebs.csi.aws.com` (CSI dùng `iops` tuyệt đối). Đã sửa thành `iops: "4000"`.
- `storageclass.md` dòng 45-46, 192-193: multiple default StorageClass → PVC bị admission error (không
  tạo được), không phải Pending; K8s 1.25+ DefaultStorageClass admission; 1.26+ thêm warning event.
  Đã sửa phân biệt rõ hai trường hợp.
- `pv-pvc.md` dòng 39: RWOP "K8s 1.22+" thiếu maturity stage — đã sửa thành "beta K8s 1.27, GA 1.29".
- `storageclass.md` dòng 181: "bắt buộc" → "cần thiết thực tế" (spec validation không chặn).

### 20. `container-k8s.k8s-networking` — Kubernetes Networking (3/3 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `container-k8s.k8s-networking.service` | `knowledge/container-k8s/k8s-networking/service.md` | draft |
| `container-k8s.k8s-networking.ingress` | `knowledge/container-k8s/k8s-networking/ingress.md` | draft |
| `container-k8s.k8s-networking.network-policy` | `knowledge/container-k8s/k8s-networking/network-policy.md` | draft |

K8s không cài trên máy demo — 100% output minh hoạ. `service.md`: ClusterIP/NodePort/LoadBalancer/
ExternalName, headless Service (clusterIP:None), kube-proxy iptables/ipvs DNAT, Endpoints vs
EndpointSlice, DNS `<svc>.<ns>.svc.cluster.local`. `ingress.md`: Ingress resource vs controller
(phải cài riêng), ingressClassName, PathType Prefix/Exact (longest-match wins), TLS termination,
`kubernetes.io/ingress.class` annotation deprecated. `network-policy.md`: default allow-all, additive
policy (OR), AND vs OR cho namespaceSelector+podSelector, policyTypes no-rules = deny-all, CNI
requirement, DNS port 53 egress caveat, connection tracking là CNI-specific.

**Phát hiện khi review module này (0 🔴, 2 🟡, 3 nit):**
- `service.md` dòng 73: "K8s 1.21+" sai — kube-proxy mặc định consume EndpointSlice từ K8s 1.22
  (API GA từ 1.21, kube-proxy default từ 1.22). Đã sửa + thêm ghi chú phân biệt 2 milestone.
- `network-policy.md` dòng 65-66: connection tracking stateful được trình bày như đặc tính của K8s
  spec — thực ra là CNI implementation detail, không phải K8s guarantee. Đã sửa thành "phần lớn CNI
  (Calico, Cilium) dùng conntrack... đây là hành vi của CNI, không phải K8s spec".
- `ingress.md` frontmatter/section 2: thêm note về `kubernetes.io/ingress.class` annotation deprecated
  (trước K8s 1.18) cho người đọc manifest cũ.
- `service.md` dòng 246: "iptables/nftables" không nhất quán với "iptables/ipvs" trong body bài.
  Đã sửa thành "iptables/ipvs".
- `network-policy.md` frontmatter: "CNI mặc định (flannel)" không chính xác — K8s vanilla không có
  CNI default, Flannel chỉ là CNI phổ biến. Đã sửa.

**Xác nhận đúng từ reviewer:**
- nginx-ingress dùng longest-prefix-match (path dài hơn được ưu tiên) — correct.
- NetworkPolicy AND/OR YAML examples (`namespaceSelector` + `podSelector` cùng item vs 2 item riêng)
  — structurally correct theo K8s documentation style.
- `policyTypes: [Egress]` không có rules = deny-all egress — correct.
- DNS port 53 (UDP+TCP) mở đến namespace `kube-system` với label `kubernetes.io/metadata.name` — correct.

### 19. `container-k8s.k8s-workload` — Kubernetes Workloads (4/4 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `container-k8s.k8s-workload.pods-deployments` | `knowledge/container-k8s/k8s-workload/pods-deployments.md` | draft |
| `container-k8s.k8s-workload.statefulset-daemonset` | `knowledge/container-k8s/k8s-workload/statefulset-daemonset.md` | draft |
| `container-k8s.k8s-workload.configmap-secret` | `knowledge/container-k8s/k8s-workload/configmap-secret.md` | draft |
| `container-k8s.k8s-workload.hpa-scaling` | `knowledge/container-k8s/k8s-workload/hpa-scaling.md` | draft |

K8s không cài trên máy demo — 100% output minh hoạ theo K8s documentation chính thức.
`pods-deployments.md`: Deployment, ReplicaSet, rolling update (maxUnavailable/maxSurge), readiness
probe, rollback. `statefulset-daemonset.md`: StatefulSet (ordered names, PVC per Pod, headless
Service stable DNS), DaemonSet (tolerations, hostNetwork). `configmap-secret.md`: ConfigMap/Secret,
env var vs volume mount (auto-update vs manual restart), base64 NOT encryption, immutable, subPath
caveat. `hpa-scaling.md`: HPA v2 (autoscaling/v2), formula ceil(currentReplicas × ratio), scale-up
no stabilization window (rate-limited max(4,100%)/15s), scale-down 5-min window, resources.requests
bắt buộc, VPA conflict.

**Phát hiện khi review module này (1 🔴, 3 🟡):**
- `hpa-scaling.md` dòng 46: mô tả sai scale-up cooldown là "3 phút" — đây là hành vi HPA v1 cũ.
  HPA v2 mặc định `stabilizationWindowSeconds: 0` cho scale-up (không có stabilization delay, có
  thể scale up ngay chu kỳ tiếp theo 15s sau khi vượt ngưỡng). Rate limit default:
  max(4 pods, 100% replica hiện tại) mỗi 15s. Đã sửa toàn bộ đoạn section "Cooling period".
- `pods-deployments.md` dòng 215: `--record` flag deprecated K8s 1.22, removed 1.30 — đã sửa thành
  annotation thủ công `kubectl annotate ... kubernetes.io/change-cause=...`.
- `statefulset-daemonset.md` dòng 263: "đã được trình bày ở đó" cho `k8s-networking.service` không
  trong prerequisites — đổi sang "xem thêm". Đã sửa.
- `configmap-secret.md`: thiếu caveat subPath — volume mount dùng `subPath` KHÔNG auto-update (cần
  restart Pod như env var). Đã thêm ngoại lệ vào đoạn mô tả volume mount.

**Bài học từ module này:**
- Kiểm tra kỹ version-specific behavior khi viết về K8s: HPA v2 vs v1 có hành vi scale-up rất
  khác nhau (v1 dùng flag `--horizontal-pod-autoscaler-upscale-delay` = 3 phút, v2 dùng
  `behavior.scaleUp.stabilizationWindowSeconds` default = 0). Không suy diễn từ HPA v1 sang v2.
- Flag deprecation/removal: luôn kiểm tra flag còn tồn tại trong phiên bản K8s target
  (1.28+) — `--record` đã bị remove, không còn là option hợp lệ.

### 18. `container-k8s.k8s-architecture` — Kiến trúc Kubernetes (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `container-k8s.k8s-architecture.control-plane` | `knowledge/container-k8s/k8s-architecture/control-plane.md` | draft |
| `container-k8s.k8s-architecture.api-objects` | `knowledge/container-k8s/k8s-architecture/api-objects.md` | draft |

K8s và kubectl không cài trên máy demo — 100% output minh hoạ theo K8s documentation. `control-plane.md`:
4 thành phần control plane (apiserver, etcd, scheduler, controller-manager) + 3 thành phần node
(kubelet, kube-proxy, container runtime CRI); reconciliation loop; watch mechanism. `api-objects.md`:
4 trường bắt buộc của object; Pod, Namespace, label/selector; apply vs create (idempotent); kubectl
get/describe/logs/exec/port-forward; resource requests vs limits (scheduler vs kernel).

**Phát hiện khi review module này (2 🔴→🟡, 1 🟡, 1 nit):**
- `control-plane.md` dòng 242: "như đã học" với `namespaces-cgroups` không trong prerequisites —
  đổi sang "xem thêm". Đã sửa.
- `api-objects.md` dòng 57: "đã học ở bài trước" về Linux namespace không trong prerequisites —
  đổi sang "xem thêm". Đã sửa.
- `control-plane.md` dòng 191: flag `--pod-eviction-timeout` đã bị loại bỏ từ K8s 1.24 — sửa
  thành giải thích cơ chế đúng (default toleration `tolerationSeconds=300`). Đã sửa.
- `api-objects.md` dòng 73: "1.18+" không chính xác — server-side apply beta từ 1.16, GA từ
  1.22. Đã sửa.

## Module đã hoàn thành (tiếp)

### 26. `monitoring.prometheus-grafana` — Prometheus & Grafana (3/3 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `monitoring.prometheus-grafana.fundamentals` | `knowledge/monitoring/prometheus-grafana/fundamentals.md` | draft |
| `monitoring.prometheus-grafana.grafana-dashboards` | `knowledge/monitoring/prometheus-grafana/grafana-dashboards.md` | draft |
| `monitoring.prometheus-grafana.alertmanager` | `knowledge/monitoring/prometheus-grafana/alertmanager.md` | draft |

Lab không có. `fundamentals.md`: pull model vs push, 4 metric types (Counter/Gauge/Histogram/
Summary), cardinality problem, exporter, scrape config, TSDB retention, PromQL (rate/increase/
sum by/histogram_quantile), recording rules. `grafana-dashboards.md`: data source config, panel
types, variable (Query type với label_values), multi-value + regex match, import community
dashboard, export JSON vào git, dashboard-as-code. `alertmanager.md`: alert rule (expr/for/labels/
annotations), grouping (group_wait/interval/repeat_interval), routing tree (first-match-wins,
continue), receiver config, inhibition rule, silence (amtool CLI), notification template.

**Phát hiện khi review module này (0 🔴, 3 🟡, 1 💭):**
- `fundamentals.md` dòng 213-233: `--` không phải comment syntax hợp lệ trong PromQL — PromQL
  không có comment syntax. Đã sửa: tách thành nhiều code block riêng, mỗi block có Markdown
  heading mô tả thay vì comment inline.
- `fundamentals.md` dòng 226-230: `avg by (instance)` trên mode!=idle cho kết quả sai (collapse
  cả cpu × mode combinations bằng avg). Đã sửa thành `(1 - avg by (instance) (rate(...{mode="idle"}[5m]))) * 100`.
- `alertmanager.md` dòng 32-34: bỏ qua PENDING state; dùng "RESOLVED" không đúng tên Prometheus
  state (đúng là INACTIVE). Đã sửa: mô tả đủ 3 Prometheus alert state (INACTIVE/PENDING/FIRING).
- `grafana-dashboards.md` dòng 139-140: multi-value wrap chỉ hoạt động khi query dùng `=~`, nếu
  dùng `=` thì không tự chuyển sang regex. Đã thêm clarifying sentence.

### 27. `monitoring.logging` — Centralized Logging (3/3 bài — chờ review)

| Lesson id | File | Trạng thái |
|---|---|---|
| `monitoring.logging.fundamentals` | `knowledge/monitoring/logging/fundamentals.md` | draft |
| `monitoring.logging.elk-stack` | `knowledge/monitoring/logging/elk-stack.md` | draft |
| `monitoring.logging.splunk-basics` | `knowledge/monitoring/logging/splunk-basics.md` | draft |

ELK và Splunk không cài trên máy demo — 100% output minh hoạ. `fundamentals.md`: distributed
logging challenge, unstructured vs structured (JSON) log, log levels (RFC 5424), retention tiers
(hot/warm/cold), 12-Factor App stdout principle, trace ID propagation, log pipeline architecture,
Python/Node.js structured log examples, logrotate. `elk-stack.md`: thành phần Elastic Stack
(Elasticsearch/Kibana/Filebeat/Logstash/Beats), schema-on-read vs schema-on-write, index ILM
lifecycle (hot→warm→cold→frozen→delete), shard/replica, Filebeat config YAML, Logstash grok
pipeline, Kibana KQL search, cluster health API. `splunk-basics.md`: Splunk index, schema-on-read,
SPL pipe model, Universal vs Heavy Forwarder, bucket lifecycle, SPL search/aggregation (stats/
timechart/sort/head/dc/perc95), alert config, `inputs.conf`.

**Phát hiện khi review module này (1 🔴, 3 🟡):**
- `splunk-basics.md` dòng 75-76: hot bucket defaults sai cả hai — 75GB (đúng là ~750MB/bucket
  theo `maxDataSize=auto`) và 30 ngày (đúng là 90 ngày theo `maxHotSpanSecs` default). Đã sửa.
- `fundamentals.md` dòng 40-46: gán nhầm tên framework ("INFO", "CRITICAL") cho "RFC 5424" — RFC
  5424 thực tế có 8 mức khác tên (Emergency/Alert/Critical/Error/Warning/Notice/Informational/Debug).
  Đã sửa: đổi label thành "convention phổ biến của logging framework", thêm giải thích 8 mức RFC 5424.
- `elk-stack.md` dòng 254: Elasticsearch watermark 90% KHÔNG từ chối ghi — chỉ relocate shard;
  flood stage 95% mới enforce read-only block. Đã sửa thành 3 ngưỡng (85%/90%/95%) đầy đủ.
- `splunk-basics.md` nhiều dòng: dùng `*` làm comment trong SPL code block — `*` là wildcard
  operator trong SPL, không phải comment. Đã tách chú thích ra ngoài code block dưới dạng prose.

### 25. `monitoring.zabbix` — Zabbix (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `monitoring.zabbix.architecture` | `knowledge/monitoring/zabbix/architecture.md` | draft |
| `monitoring.zabbix.items-triggers` | `knowledge/monitoring/zabbix/items-triggers.md` | draft |

Môi trường lab không có. `architecture.md`: Server/Agent/Proxy/Frontend, passive vs active check
(port 10050/10051), Agent vs Agent 2 (Go, plugins, từ 5.4+), data flow Proxy buffer, history vs
trends. `items-triggers.md`: item key syntax (`vm.memory.size[pavailable]`, `vfs.fs.size[/,pfree]`...),
trigger expression Zabbix 6+ (`last()/avg()/min()/nodata()`), trigger dependency (suppress cascade),
LLD, macros `{$NAME}`, template link.

**Phát hiện khi review module này (0 🔴, 2 🟡, 1 💭):**
- `items-triggers.md` dòng 209: "Zabbix 6.2+ hỗ trợ Recovery expression" sai phiên bản —
  tính năng có từ Zabbix 3.2. Đã sửa bỏ version qualifier + clarify cú pháp mới 6+.
- `items-triggers.md` dòng 64: `net.if.in[,bytes]` (empty interface) không hợp lệ — interface
  phải chỉ định rõ. Đã sửa thành `net.if.in[eth0,bytes]` + note "phải explicit".
- `items-triggers.md` dòng 111-112: comment "bytes received/sec" sai — key trả về counter
  tích lũy, rate tính qua preprocessing. Đã sửa comment.

### 24. `container-k8s.helm` — Helm (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `container-k8s.helm.basics` | `knowledge/container-k8s/helm/basics.md` | draft |
| `container-k8s.helm.chart-authoring` | `knowledge/container-k8s/helm/chart-authoring.md` | draft |

Helm không cài trên máy demo — 100% output minh hoạ. `basics.md`: chart/release/values, Helm 3
(no Tiller, release state = K8s Secret), install/upgrade/rollback/uninstall, --dry-run, upgrade
--install cho CI/CD. `chart-authoring.md`: chart structure, Go template syntax (Values/Release/
Chart, nindent/toYaml/range/include, $ root context), _helpers.tpl, hooks (pre-upgrade migration
Job), hook-delete-policy, helm lint/template/package/push OCI.

**Phát hiện khi review module này (0 🔴, 2 🟡, 2 💭):**
- `basics.md` "idempotent" cho `helm upgrade --install`: không chính xác — mỗi lần gọi tạo
  revision mới. Đúng hơn là "an toàn gọi vô điều kiện". Đã sửa cả body lẫn Q&A.
- `chart-authoring.md` Q&A hook failure: mô tả sai `before-hook-creation` xoá ngay sau failure.
  Đúng ra: `before-hook-creation` xoá trước lần upgrade tiếp, `hook-failed` mới xoá ngay. Đã sửa.
- Nit: `--generate-name` + tên explicit trong dry-run example — bỏ flag thừa. Đã sửa.
- Nit: `$.Values` scope note mở rộng thêm `$.Release.Name` etc. Đã thêm.

### 28. `networking.switching` — Switching (5/5 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `networking.switching.basics` | `knowledge/networking/switching/basics.md` | draft |
| `networking.switching.vlan` | `knowledge/networking/switching/vlan.md` | draft |
| `networking.switching.stp` | `knowledge/networking/switching/stp.md` | draft |
| `networking.switching.lacp` | `knowledge/networking/switching/lacp.md` | draft |
| `networking.switching.vpc-advanced` | `knowledge/networking/switching/vpc-advanced.md` | draft |

Không có switch vật lý/Nexus trong sandbox. `basics.md`/`vlan.md`/`stp.md`/`lacp.md` minh hoạ
song song 2 phía: lệnh Linux bridge/bonding thật chạy được trong container (`bridge fdb`,
`ip link type vlan`, `bridge vlan`, `type bond mode 802.3ad`), và CLI kiểu Cisco IOS làm ví dụ
minh hoạ (nhãn rõ "minh họa" ở output không chạy thật). `vpc-advanced.md` (priority thấp theo
taxonomy) là khái niệm MLAG/vPC chung — không có thiết bị Nexus để xác minh cú pháp, đã gắn
`TODO-VERIFY` ở 2 chỗ (giới hạn 8 link active của LACP theo model, và cú pháp NX-OS/tài liệu
hãng) thay vì bịa số liệu.

**Tự rà lại (không dùng subagent, theo yêu cầu phiên này):** kiểm tra path 802.1Q (4 byte,
TPID `0x8100`), path cost STP chuẩn 802.1D-1998 (10M=100/100M=19/1G=4/10G=2), port state STP
cổ điển (Blocking→Listening 15s→Learning 15s→Forwarding), `ageing_time` mặc định Linux bridge
300s (đơn vị `ip link` là 1/100 giây nên giá trị truyền là 30000) — khớp man page/kernel docs
đã dẫn trong `sources`. Không phát hiện sai số liệu nào cần sửa sau khi đối chiếu nguồn.

### 29. `networking.routing` — Routing (3/3 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `networking.routing.static` | `knowledge/networking/routing/static.md` | draft |
| `networking.routing.ospf` | `knowledge/networking/routing/ospf.md` | draft |
| `networking.routing.bgp` | `knowledge/networking/routing/bgp.md` | draft |

`static.md`: cài thêm `iproute2` trong sandbox (chưa có sẵn) để chạy lệnh THẬT — `ip route
show`, `ip route get` (chẩn đoán longest prefix match), `ip route add/del`. CLI Cisco IOS chỉ
làm ví dụ minh hoạ cú pháp. `ospf.md`/`bgp.md`: không có ≥2 router/FRR chạy thật trong sandbox
để hình thành neighbor/peer thật (OSPF DR/BDR và BGP cần topology nhiều node mới có ý nghĩa) —
100% output CLI (FRR `vtysh` + Cisco IOS) là **minh họa**, nhãn rõ trong bài; nội dung khái
niệm (area/cost/DR-BDR, AS/eBGP-iBGP/path selection) dựa trực tiếp theo RFC 2328/RFC 4271 +
docs FRR dẫn trong `sources`.

**Tự rà lại (không dùng subagent):** kiểm tra lại các claim về LPM (route cụ thể hơn luôn
thắng bất kể thứ tự khai — đúng theo `ip-route(8)`), OSPF reference-bandwidth mặc định 100
Mbps (nên link ≥100M mặc định cùng cost 1 nếu không chỉnh `auto-cost reference-bandwidth`),
luật chống loop iBGP (route học từ iBGP không re-advertise sang iBGP peer khác) và thứ tự BGP
path selection (đã ghi rõ "rút gọn, không đầy đủ 100%, phụ thuộc vendor" để tránh khẳng định
quá tay) — không phát hiện sai cần sửa; không thêm TODO-VERIFY mới cho module này.

### 30. `networking.dhcp` — DHCP (1/1 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `networking.dhcp.fundamentals` | `knowledge/networking/dhcp/fundamentals.md` | draft |

Module cuối còn thiếu trong domain `networking`. Khác các bài routing động trước (OSPF/BGP,
phải minh họa vì cần ≥2 node), bài này DỰNG ĐƯỢC DHCP THẬT trong sandbox 1 container: cài
`isc-dhcp-server`/`isc-dhcp-client` qua `apt-get`, tạo `ip netns` + cặp `veth`, chạy `dhcpd`
thật ở 1 đầu, `dhclient` thật ở đầu kia (trong netns) — thu được đúng 4 dòng DORA log thật
(`DHCPDISCOVER`→`DHCPOFFER`→`DHCPREQUEST`→`DHCPACK`), file `dhcpd.leases` thật, và bắt gói
`tcpdump` thật thấy đúng 4 packet UDP 67/68. Toàn bộ output "Thực hành" trong bài là THẬT,
không phải minh họa. Đã dọn sạch network namespace/veth/process sau khi lấy output (không để
lại tài nguyên mạng tạm trong container).

**Tự rà lại (không dùng subagent):** T1 renewal ở mốc 50% lease time (RFC 2131 mục 4.4.5:
T1 default = 0.5 × lease time) — đúng; broadcast ở DISCOVER và REQUEST (không phải chỉ
DISCOVER) — đúng theo RFC 2131 (REQUEST vẫn broadcast để các server khác biết IP đã bị nhận).
Không thêm TODO-VERIFY.

### 31. `monitoring.alerting-design` — Thiết kế cảnh báo (1/1 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `monitoring.alerting-design.principles` | `knowledge/monitoring/alerting-design/principles.md` | draft |

Platform-agnostic. 4 tiêu chí alert tốt (Google SRE Book), severity tiers (P1/P2/P3), symptom-based vs
cause-based, `for` clause, runbook annotation, burn rate alert kết hợp SLO. Toàn bộ Prometheus rule là
minh hoạ (không có Prometheus thật).

**Tự rà lại (không dùng subagent):** phát hiện 1 lỗi số liệu — dòng 147 mô tả sai "14.4× = detect vấn đề
trong 2 giờ"; thực tế 30/14.4 = 2.08 ngày ≈ 50 giờ. Đã sửa. Cross-reference "đã học ở" chỉ dùng cho ID
trong prerequisites (`monitoring.prometheus-grafana.alertmanager` đúng) — không phát hiện vi phạm quy ước.

### 32. `monitoring.sli-slo` — SLI/SLO/Error budget (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `monitoring.sli-slo.fundamentals` | `knowledge/monitoring/sli-slo/fundamentals.md` | draft |
| `monitoring.sli-slo.error-budget` | `knowledge/monitoring/sli-slo/error-budget.md` | draft |

Platform-agnostic (ví dụ Prometheus). `fundamentals.md`: SLI/SLO/SLA definitions, measurement window
rolling vs calendar, 6 loại SLI (availability/latency/throughput/correctness/freshness/durability), chọn
SLI theo user journey. `error-budget.md`: burn rate formula, multi-window alerting (detect + confirm window),
deploy decision framework, PromQL tính SLO compliance + burn rate.

**Tự rà lại (không dùng subagent):** phát hiện 3 lỗi số liệu:
1. `fundamentals.md`: "43.8 phút" → "43.2 phút" (0.1% × 30×24×60 = 43.2).
2. `error-budget.md`: "2 giờ" → "~50 giờ (~2 ngày)" cho burn rate 14.4× (30 ngày / 14.4 = 2.08 ngày).
3. `error-budget.md`: "5 giờ" → "5 ngày" cho burn rate 6× (30 / 6 = 5 ngày). Burn rate 3× "10 ngày" đúng.
4. `error-budget.md` table: cột "Window ngắn"/"Window dài" bị hoán vị — đã sửa thành
   "Window dài (detect)" và "Window ngắn (confirm)" với giá trị đúng chiều. Tất cả đã sửa + lint pass.

### 33. `devops.git` — Git cơ bản và workflow (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `devops.git.fundamentals` | `knowledge/devops/git/fundamentals.md` | draft |
| `devops.git.workflows` | `knowledge/devops/git/workflows.md` | draft |

Module đầu tiên của domain `devops`. Lệnh git chạy THẬT (Git 2.34.1 trên Ubuntu 22.04): `git init`,
`add`, `commit`, `branch`, `checkout`, `merge --no-ff`, `stash push -u`, `stash pop`, `rebase`,
`log --oneline --all --graph`, `cat .git/HEAD`, `cat .git/refs/heads/master`. Output minh hoạ:
interactive rebase editor (`git rebase -i HEAD~3`), GitFlow/GitHub Flow so sánh — không cần tool
bên ngoài.

**Tự rà lại (không dùng subagent):** kiểm tra SHA-1 (Git 2.29+ hỗ trợ SHA-256 opt-in, mặc định
vẫn SHA-1 — đúng), `git diff HEAD` so sánh working dir+staged vs last commit (đúng, khác `git diff
--staged`), `--force-with-lease` so sánh remote tracking ref (đúng). Cross-reference chỉ dùng "xem
thêm" cho bài ngoài prerequisites — không vi phạm quy ước. Không có TODO-VERIFY.

### 34. `devops.cicd` — CI/CD khái niệm và công cụ (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `devops.cicd.concepts` | `knowledge/devops/cicd/concepts.md` | draft |
| `devops.cicd.tools` | `knowledge/devops/cicd/tools.md` | draft |

`concepts.md`: CI vs CD Delivery vs CD Deployment, pipeline anatomy (stage/job/runner/artifact/
environment), pipeline-as-code, fail-fast, artifact immutability, trigger types.
`tools.md`: GitHub Actions (workflow YAML, `needs:`, `environment:`), GitLab CI (`.gitlab-ci.yml`,
`stages:`, `when: manual`, `rules: changes:`), Jenkins Declarative Pipeline (`withCredentials`,
`when { branch }`, `post { failure }`). Toàn bộ YAML/Groovy là **minh hoạ** (không có CI system
chạy thật trong sandbox).

**Tự rà lại (không dùng subagent):** CI/CD Delivery vs Deployment — đúng định nghĩa (Delivery =
manual gate, Deployment = fully auto). GitHub Actions `${{ github.sha }}`, `${{ secrets.NAME }}`,
`needs:` — đúng. GitLab predefined variables `$CI_COMMIT_SHA`, `$CI_REGISTRY_IMAGE` — đúng.
Jenkins `${env.BUILD_NUMBER}`, `withCredentials`, `when { branch 'main' }` — đúng. `npm ci` vs
`npm install` — đúng (npm ci fail nếu lock file lỗi thời). Không có TODO-VERIFY.

### 35. `devops.ansible` — Ansible cơ bản và role (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `devops.ansible.fundamentals` | `knowledge/devops/ansible/fundamentals.md` | draft |
| `devops.ansible.roles` | `knowledge/devops/ansible/roles.md` | draft |

Ansible không cài trên máy demo — toàn bộ lệnh/playbook là **minh hoạ** theo tài liệu chính thức.
`fundamentals.md`: agentless (SSH + Python 3 trên managed node), inventory INI/YAML, group_vars/host_vars,
cấu trúc playbook (play/hosts/become/vars/tasks/handlers), ad-hoc command, 8 module chính (apt/yum/template/
service/file/copy/shell/user), variable/Jinja2 (`{{ var }}`), `when:`/`loop:`, task states (ok/changed/
failed/unreachable), `--check` dry-run.
`roles.md`: cấu trúc thư mục role, `defaults/` vs `vars/` (độ ưu tiên variable), handlers per-host,
`ansible-galaxy install`, `requirements.yml`, project structure chuẩn (`site.yml`/`import_playbook`),
`meta/main.yml` dependencies, tags (`--tags`/`--skip-tags`), `import_tasks` (tĩnh) vs `include_tasks`
(động). Không có TODO-VERIFY.

**Tự rà lại (không dùng subagent):** `defaults/main.yml` nằm dưới inventory/playbook vars trong thứ tự
ưu tiên (đúng — Ansible 22 mức, defaults gần đáy nhất); handler chạy 1 lần/host (không 1 lần toàn cụm);
`ansible-galaxy install` mặc định vào `~/.ansible/roles/` (đúng); `import_tasks` static parse-time,
`include_tasks` dynamic runtime (đúng theo docs). Không phát hiện lỗi cần sửa.

### 36. `devops.terraform` — Terraform provider, resource, state, module (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `devops.terraform.fundamentals` | `knowledge/devops/terraform/fundamentals.md` | draft |
| `devops.terraform.modules-state` | `knowledge/devops/terraform/modules-state.md` | draft |

Terraform không cài trên máy demo — toàn bộ output là **minh hoạ** theo HashiCorp docs.
`fundamentals.md`: IaC mental model, provider/resource/state, 3-step workflow (init/plan/apply),
tham chiếu implicit dependency, variables, outputs, import block Terraform 1.5+, migrate state
sang remote backend. `modules-state.md`: module local và registry, `count` vs `for_each`, S3
backend + DynamoDB state locking, workspace, `terraform_remote_state` data source.

**Tự rà lại (không dùng subagent):** `~> 5.0` = >=5.0 <6.0 (HCL version constraint) — đúng;
`cidrsubnet("10.0.0.0/16", 8, 0)` → `10.0.0.0/24` — đúng; DynamoDB lock key `LockID` —
đúng; `for_each` với `each.key/value` — đúng; `import` block Terraform 1.5+ — đúng.
1 TODO-VERIFY: định dạng key prefix khi dùng workspace với S3 backend.

### 37. `security.os-hardening` — Hardening OS (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `security.os-hardening.principles` | `knowledge/security/os-hardening/principles.md` | draft |
| `security.os-hardening.checklist` | `knowledge/security/os-hardening/checklist.md` | draft |

Module đầu tiên của domain `security`. `principles.md`: 3 nguyên lý trụ cột (least privilege,
reduce attack surface, defense in depth), phân loại attack surface theo 6 loại (network/auth/
service/filesystem/kernel/account). Lệnh THẬT: `ss -tlnp` (port thực của máy), `systemctl
list-units --state=running` (avahi/cups/bluetooth hiện diện), `find -perm -4000` (13 SUID binary
thực tế, gồm pkexec và vmware-authd), `cat /proc/sys/...` (tất cả kernel params thực).
`checklist.md`: 5 nhóm hardening: tài khoản, SSH (sshd_config directive với default chính thức
từ man7.org), service (tắt avahi/cups/bluetooth), kernel sysctl (giá trị thực từ máy), filesystem
(SUID audit, quyền `/etc/passwd|shadow|sudoers` thực). Thay đổi cấu hình cần sudo đều gắn nhãn
"output minh họa". Không có TODO-VERIFY.

**Tự rà soát (không dùng subagent, theo yêu cầu phiên này):** `PermitRootLogin prohibit-password`
là default từ OpenSSH 7.0+ (xác nhận từ `sshd_config(5)` man7.org); `MaxAuthTries 6` và
`LoginGraceTime 120` là default đúng (xác nhận từ cùng nguồn); tất cả kernel param giá trị đều
chạy thật từ `/proc/sys/`; SUID binary list là output thật từ `find`; permission `/etc/shadow`
0640 root:shadow đúng (chạy thật bằng `stat`). Câu hỏi Q2 bài checklist: "prohibit-password"
giải thích đúng (tắt password+keyboard-interactive, giữ key-based). Không phát hiện lỗi.

### 38. `security.identity-secrets` — Quản lý danh tính và secret (2/2 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `security.identity-secrets.identity` | `knowledge/security/identity-secrets/identity.md` | draft |
| `security.identity-secrets.secrets-mgmt` | `knowledge/security/identity-secrets/secrets-mgmt.md` | draft |

`identity.md`: SSO (SAML vs OIDC/OAuth2, luồng Authorization Code, JWT verify offline bằng JWKS),
MFA (TOTP RFC 6238 cơ chế thật — `HMAC-SHA1(secret, floor(unix_time/30))`, FIDO2 phishing-resistant
vì origin binding, SMS "restricted" theo NIST 800-63B-4), RBAC (gán qua role thay vì user trực tiếp,
JWT revoke vấn đề). Lệnh thật: `base64 -d` decode JWT payload, `date +%s` tính TOTP window.
`secrets-mgmt.md`: hardcode nguy hiểm (git history vĩnh viễn, `git show <sha>:file`), Vault kiến
trúc (Auth Methods, Secret Engines, Policies, Seal/Unseal Shamir), KMS envelope encryption (DEK +
master key), env var risk (subprocess thừa kế, Docker inspect, log dump). Lệnh thật:
`git log --diff-filter=A`, `tr '\0' '\n' < /proc/$$/environ` (đã ẩn danh hóa hostname/username).
Không có TODO-VERIFY. Output minh họa: Vault CLI, AWS CLI (không cài trên máy demo).

**Tự rà soát:** TOTP formula từ RFC 6238 (xác nhận qua OWASP source); Vault Seal/Unseal từ
HashiCorp docs đã fetch; JWT base64 decode chạy thật với chuỗi mẫu; `proc/$$/environ` chạy thật,
output ẩn danh hóa username trước khi đưa vào bài. Không phát hiện lỗi cần sửa.

## Vấn đề cần người quyết định (hiện tại: không có)

Đang tự làm tiếp từng module theo đúng khuôn mẫu đã được duyệt, chỉ dừng khi gặp vấn đề cần
chủ dự án quyết định (theo đúng quy trình đã thống nhất).

## Công cụ đã có / chưa có

- `scripts/kb-lint.ts` (`pnpm kb:lint`): **đã có** — kiểm tra frontmatter hợp lệ, id trùng,
  bài tiên quyết tồn tại trong taxonomy, đủ 8 mục bắt buộc (heading `## 1.` tới `## 8.`), link
  nội bộ hỏng, đếm `TODO-VERIFY` còn lại.
- `scripts/kb-import`: **chưa làm** — cần schema DB mới (bảng lưu bài kho tri thức, embedding
  pgvector, full-text index) nên đợi có nhiều module hơn và được duyệt hướng tích hợp trước khi
  thiết kế, tránh phải đổi schema nhiều lần.
- Trang "Kho tri thức" trong app, cập nhật `docs/ARCHITECTURE.md`/ADR-003: **chưa làm** — cùng
  lý do, đợi sau khi có đủ nội dung + hướng tích hợp DB rõ ràng để viết ADR một lần, tránh phải
  sửa lại.
