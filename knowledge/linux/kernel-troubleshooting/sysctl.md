---
id: linux.kernel-troubleshooting.sysctl
title: "Tuning kernel qua sysctl: tham số mạng và bộ nhớ phổ biến"
domain: linux
module: linux.kernel-troubleshooting
level: "chuyên sâu"
prerequisites: ["linux.kernel-troubleshooting.modules"]
applies_to:
  - "Ubuntu 22.04 LTS — kernel 6.8.0-138-generic; không gian tham số sysctl (namespace net.*, vm.*, kernel.*) là chuẩn chung mọi distro Linux hiện đại với cùng kernel version"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man8/sysctl.8.html"
  - "https://man7.org/linux/man-pages/man5/sysctl.d.5.html"
  - "https://www.kernel.org/doc/html/latest/admin-guide/sysctl/net.html"
  - "https://www.kernel.org/doc/html/latest/admin-guide/sysctl/vm.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Kernel Linux có hàng nghìn tham số có thể điều chỉnh NGAY KHI ĐANG CHẠY mà không cần compile lại
hay reboot — đây là cơ chế `sysctl`. Mỗi tham số là một nút trong cây `procfs` (`/proc/sys/`), có
thể đọc/ghi trực tiếp bằng `cat`/`echo`, hoặc qua lệnh `sysctl` (gọn hơn). Một SE cần biết nhóm
tham số nào ảnh hưởng tới hiệu năng mạng và bộ nhớ trong các kịch bản vận hành thực tế: server bị
"SYN flood" cần `tcp_syncookies`, ứng dụng nhiều connection cần tăng `somaxconn`, máy chủ database
cần giảm `swappiness`. Quan trọng hơn: phân biệt được thay đổi TẠM THỜI (mất sau reboot) với VĨNH
VIỄN (qua `/etc/sysctl.d/`) để không vô tình để lại cấu hình lơ lửng trên server production.

## 2. Khái niệm cốt lõi

**`/proc/sys/`**: cây thư mục giả trong procfs, MỖI tham số sysctl là một FILE trong cây này —
`net/ipv4/ip_forward` tương ứng với tham số `net.ipv4.ip_forward` (dấu `.` ↔ dấu `/`). Đọc/ghi
file này là cách trực tiếp nhất; `sysctl` chỉ là wrapper tiện lợi hơn.

**`sysctl -w <key>=<value>`** (cần root): thay đổi TẠM THỜI, có hiệu lực ngay, MẤT khi reboot.

**Cấu hình vĩnh viễn**: tạo file `.conf` trong `/etc/sysctl.d/` (hoặc `/etc/sysctl.conf`), rồi
chạy `sysctl -p /etc/sysctl.d/<file>` để áp dụng (không cần reboot); cấu hình này được đọc lại mỗi
lần boot.

**Ba namespace chính:**
- `net.*` — tham số mạng: TCP backlog, keepalive, IP forwarding, buffer sizes.
- `vm.*` — quản lý bộ nhớ ảo: swappiness, dirty page ratio, OOM behavior.
- `kernel.*` — tham số nhân: giới hạn PID, panic behavior, dmesg restriction.

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `net.ipv4.ip_forward` | `0` | Cho phép chuyển tiếp packet giữa interface (cần để làm router/NAT) |
| `net.core.somaxconn` | `4096` | Độ dài tối đa hàng đợi kết nối đang LISTEN |
| `net.ipv4.tcp_max_syn_backlog` | `1024` | Số kết nối TCP đang chờ hoàn thành 3-way handshake |
| `net.ipv4.tcp_syncookies` | `1` | Chống SYN flood bằng cách sinh cookie, không cần slot backlog |
| `net.ipv4.tcp_tw_reuse` | `2` | Tái dùng socket `TIME_WAIT` cho kết nối mới (an toàn ở mode `2`) |
| `vm.swappiness` | `60` | Mức độ tích cực dùng swap (0=chỉ swap khi thật sự cần, 100=swap aggressively) |
| `vm.overcommit_memory` | `0` | Chính sách cấp phát bộ nhớ (0=heuristic, 1=luôn cho, 2=giới hạn chặt) |

## 3. Cách nó hoạt động

**`somaxconn` và `tcp_max_syn_backlog` là HAI backlog queue KHÁC NHAU trong quá trình 3-way
handshake TCP** — `tcp_max_syn_backlog` giới hạn hàng đợi SYN đã nhận nhưng CHƯA hoàn thành
handshake (half-open); `somaxconn` giới hạn hàng đợi đã hoàn thành handshake nhưng ỨNG DỤNG CHƯA
`accept()` kịp (fully established). Khi một trong hai đầy, kernel bắt đầu drop/reject kết nối mới.
Với server nhận nhiều kết nối đồng thời (web server, database proxy), tăng CẢ HAI là thao tác tuning
thường gặp nhất.

**`vm.swappiness` KHÔNG phải phần trăm RAM cần dùng trước khi swap** — đây là một trong những hiểu
lầm phổ biến nhất về tham số này. `swappiness` là TRỌNG SỐ (0-200) ảnh hưởng tới QUYẾT ĐỊNH của
kernel giữa thu hồi page cache (để cấp RAM mới) vs đẩy anonymous page vào swap. `swappiness=0`
không có nghĩa "không bao giờ swap" mà là "ưu tiên thu hồi page cache hết mức trước khi nghĩ tới
swap". Trên server database, `swappiness=10` thường được khuyến nghị để ưu tiên giữ dữ liệu thật
trong RAM thay vì swap.

**Thứ tự load cấu hình vĩnh viễn**: kernel đọc theo thứ tự `/etc/sysctl.d/` (tên file sắp xếp
lexicographically, `.conf` extension), sau đó `/etc/sysctl.conf`. File đứng SAU ghi đè file đứng
TRƯỚC nếu định nghĩa cùng key. Naming convention: `99-production.conf` > `10-network.conf` theo thứ
tự chữ cái, nên file `99-*` luôn thắng.

## 4. Thực hành

Đọc các tham số quan trọng — chạy thật, không cần sudo:

```bash
$ sysctl net.ipv4.ip_forward net.core.somaxconn vm.swappiness vm.overcommit_memory kernel.dmesg_restrict
net.ipv4.ip_forward = 0
net.core.somaxconn = 4096
vm.swappiness = 60
vm.overcommit_memory = 0
kernel.dmesg_restrict = 1
```

Đọc thêm tham số TCP liên quan tới kết nối và keepalive:

```bash
$ sysctl net.ipv4.tcp_max_syn_backlog net.ipv4.tcp_syncookies net.ipv4.tcp_tw_reuse net.ipv4.tcp_fin_timeout net.ipv4.tcp_keepalive_time
net.ipv4.tcp_max_syn_backlog = 1024
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_tw_reuse = 2
net.ipv4.tcp_fin_timeout = 60
net.ipv4.tcp_keepalive_time = 7200
```

`tcp_keepalive_time = 7200` — socket idle 2 tiếng mới bắt đầu gửi keepalive probe (quá cao cho
nhiều ứng dụng thực tế, thường được hạ xuống 300-600 giây cho service có nhiều connection).

Đọc thêm tham số bộ nhớ liên quan tới dirty page writeback:

```bash
$ sysctl vm.dirty_ratio vm.vfs_cache_pressure
vm.dirty_ratio = 20
vm.vfs_cache_pressure = 100
```

Đọc trực tiếp qua `/proc/sys/` — tương đương `sysctl`, không cần lệnh riêng:

```bash
$ cat /proc/sys/net/ipv4/ip_forward
0
$ cat /proc/sys/net/core/somaxconn
4096
```

> Các lệnh dưới đây cần root để thay đổi giá trị. Đây là **output minh hoạ** theo `sysctl(8)`,
> đánh dấu rõ — chạy trên máy demo sẽ báo "Permission denied".

Thay đổi tạm thời (có hiệu lực ngay, mất sau reboot):

```
$ sudo sysctl -w net.core.somaxconn=65535
net.core.somaxconn = 65535

$ sudo sysctl -w vm.swappiness=10
vm.swappiness = 10
```

Cấu hình vĩnh viễn — tạo file trong `/etc/sysctl.d/` (áp dụng ngay không cần reboot):

```
$ sudo tee /etc/sysctl.d/99-se-dojo-tuning.conf <<'EOF'
# Tăng backlog cho server nhận nhiều kết nối đồng thời
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
# Ưu tiên giữ data trong RAM, swap ít hơn — phù hợp server database
vm.swappiness = 10
EOF

$ sudo sysctl -p /etc/sysctl.d/99-se-dojo-tuning.conf
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
vm.swappiness = 10
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Thay đổi `sysctl -w` thành công nhưng sau reboot mất hết**
- Nguyên nhân: `sysctl -w` chỉ thay đổi TẠM THỜI trong kernel đang chạy, không ghi vào file cấu
  hình nào. Reboot tải lại từ `0` (mặc định kernel) + chỉ đọc lại `/etc/sysctl.d/*.conf`.
- Cách xác nhận: sau reboot, `sysctl <key>` sẽ trả về giá trị MẶC ĐỊNH, không phải giá trị đã set.
- Cách xử lý: luôn kèm thay đổi vĩnh viễn vào `/etc/sysctl.d/` khi thay đổi có ý định dài hạn;
  dùng `sysctl -w` chỉ để test nhanh trước khi chốt cấu hình.

**Server web bị "connection reset/refused" khi traffic tăng đột ngột, dù CPU/RAM chưa đầy**
- Nguyên nhân khả năng cao: backlog queue tràn — `somaxconn` và/hoặc `tcp_max_syn_backlog` quá thấp
  so với lượng kết nối đến đồng thời.
- Cách xác nhận: `netstat -s | grep "SYNs to LISTEN"` hoặc `ss -s` xem số socket trạng thái
  `SYN_RECV` có cao bất thường không; trong kernel log (`dmesg`/`journalctl -k`) tìm dòng
  "TCP: request_sock_TCP: Possible SYN flooding" hoặc "possible SYN flood".
- Cách xử lý: tăng cả `somaxconn` và `tcp_max_syn_backlog` — tăng `somaxconn` mà không tăng
  `tcp_max_syn_backlog` chỉ giải quyết được một nửa vấn đề.

## 6. Tình huống thực tế

Database server PostgreSQL bắt đầu báo "connection refused" vào giờ cao điểm, dù tỉ lệ CPU/RAM
vẫn trong ngưỡng bình thường:

1. `sysctl net.core.somaxconn` — xác nhận giá trị mặc định `4096`; PostgreSQL config `max_connections`
   cũng là `100`. Vậy backlog không phải vấn đề ở đây.
2. `sysctl vm.swappiness` — `60` — phù hợp với desktop, CAO cho database server. Kiểm tra thêm
   `free -h` — xác nhận máy đang DÙNG swap khi vẫn còn RAM available → kernel đang đẩy buffer pool
   của PostgreSQL ra swap, gây I/O spike mỗi khi query cần data bị swap.
3. Quyết định: hạ `swappiness` xuống `10` — ưu tiên giữ anonymous page (buffer pool) trong RAM,
   thu hồi page cache (ít quan trọng hơn cho database với fsync) trước khi swap.
4. `sudo sysctl -w vm.swappiness=10` — test tạm thời, quan sát `vmstat 1 5` (xem thêm bài
   `linux.performance.io`): `si`/`so` (swap in/out) giảm đáng kể.
5. Xác nhận hiệu quả: query latency giảm, "connection refused" biến mất. Ghi vĩnh viễn vào
   `/etc/sysctl.d/99-postgres-tuning.conf`.
6. Ghi nhận vào runbook: với PostgreSQL/MySQL, `vm.swappiness=10` là baseline tuning khởi đầu hợp
   lý — không phải silver bullet nhưng thường giải quyết được class vấn đề "RAM còn nhưng vẫn
   swap", đặc biệt trên máy dùng cài nhiều service cùng lúc (như desktop).

## 7. Tự kiểm tra

1. `vm.swappiness=0` có nghĩa là kernel "không bao giờ dùng swap" không?
   <details><summary>Đáp án</summary>Không — <code>swappiness=0</code> có nghĩa là kernel ưu tiên
   thu hồi page cache hết mức trước khi nghĩ tới swap, nhưng NẾU không còn cách nào khác để cấp
   RAM mới (page cache đã hết, không thể thu hồi thêm), kernel VẪN SWAP. Không swap tuyệt đối
   chỉ xảy ra khi không có swap partition/file nào được bật (<code>swapoff -a</code>).</details>

2. `sysctl -w net.core.somaxconn=65535` chạy thành công, nhưng vấn đề connection vẫn còn sau khi tăng. Còn
   tham số nào khác cần kiểm tra?
   <details><summary>Đáp án</summary><code>net.ipv4.tcp_max_syn_backlog</code> — đây là backlog
   queue KHÁC (half-open connections đang chờ hoàn thành handshake). Tăng <code>somaxconn</code>
   mà không tăng <code>tcp_max_syn_backlog</code> chỉ giải quyết được bottleneck ở một trong hai
   hàng đợi.</details>

3. Tạo file `/etc/sysctl.d/99-tuning.conf` và `/etc/sysctl.d/10-network.conf` cùng define
   `net.core.somaxconn`. File nào thắng?
   <details><summary>Đáp án</summary><code>99-tuning.conf</code> — kernel đọc theo thứ tự
   lexicographic (số < chữ), <code>99-</code> đứng sau <code>10-</code> nên ghi đè. Naming
   convention <code>99-*</code> thường dùng cho "site-local override" để đảm bảo thắng mọi
   cấu hình mặc định của distro/package.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.kernel-troubleshooting.kernel-logs` — một số thay đổi sysctl (ví dụ `tcp_max_syn_backlog`
  đầy) sinh cảnh báo trong kernel log có thể thấy qua `dmesg`/`journalctl -k`.

**Bài liên quan ngoài module:**
- `linux.performance.memory-swap` — `vm.swappiness`, `vm.overcommit_memory` được giới thiệu ở bài đó
  ở mức tác dụng (nếu đã học), bài này đi vào cách đọc/thay đổi và persistence.
- `linux.network-stack.firewall` — `net.ipv4.ip_forward` cần bật để máy làm router/NAT, đã thấy ở
  bài đó, bài này giải thích cách thay đổi bền vững qua `sysctl.d`.

**Nguồn tham khảo:**
- [sysctl(8) — man7.org](https://man7.org/linux/man-pages/man8/sysctl.8.html) — cú pháp `-w`/`-p`,
  file cấu hình.
- [sysctl.d(5) — man7.org](https://man7.org/linux/man-pages/man5/sysctl.d.5.html) — thứ tự load
  file cấu hình, naming convention.
- [Kernel sysctl net — kernel.org](https://www.kernel.org/doc/html/latest/admin-guide/sysctl/net.html)
  — ý nghĩa từng tham số `net.*` chính thức.
- [Kernel sysctl vm — kernel.org](https://www.kernel.org/doc/html/latest/admin-guide/sysctl/vm.html)
  — ý nghĩa từng tham số `vm.*` chính thức.
