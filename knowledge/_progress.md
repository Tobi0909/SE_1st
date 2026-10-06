# Tiến độ kho tri thức SE Dojo

> Đọc file này đầu mỗi phiên làm việc để biết tiếp tục đúng chỗ. Cập nhật mỗi khi hoàn thành
> một module (xem quy trình ở CLAUDE.md task spec "Xây dựng kho tri thức cho SE Dojo").

## Trạng thái tổng quan

- Giai đoạn 0 (taxonomy): **xong, đã được chủ dự án duyệt** — `knowledge/_taxonomy.yaml`
  (9 domain, 56 module, 146 bài).
- Tổng số bài đã viết: **48 / 146** (`draft`, chưa `verified`).
- Tổng số `TODO-VERIFY` còn tồn đọng trong toàn kho: **0** (kiểm tra bằng `pnpm kb:lint`).
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

## Module tiếp theo (chưa bắt đầu)

Còn trong domain `linux`: `linux.network-stack`, `linux.package-management`,
`linux.kernel-troubleshooting` (ưu tiên "cao", nhiều lệnh thật chạy được — `apt`/`dpkg` có sẵn
trên máy, chỉ `rpm`/`dnf` cần minh hoạ vì máy chạy Ubuntu). Domain `networking` còn
`networking.switching` (ưu tiên "cao" nhưng cần thiết bị mạng vật lý — hầu như toàn bộ sẽ là
output minh hoạ, nên để sau các module `linux` còn lại).

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
