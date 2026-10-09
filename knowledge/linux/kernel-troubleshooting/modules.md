---
id: linux.kernel-troubleshooting.modules
title: "Kernel module: lsmod, modprobe, /proc/modules, /sys/module"
domain: linux
module: linux.kernel-troubleshooting
level: "chuyên sâu"
prerequisites: []
applies_to:
  - "Ubuntu 22.04 LTS — kernel 6.8.0-138-generic; cấu trúc /proc/modules và /sys/module là chuẩn chung mọi distro Linux hiện đại"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man8/lsmod.8.html"
  - "https://man7.org/linux/man-pages/man8/modinfo.8.html"
  - "https://man7.org/linux/man-pages/man8/modprobe.8.html"
  - "https://man7.org/linux/man-pages/man5/modules.dep.5.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Kernel Linux được thiết kế theo kiến trúc MONOLITHIC CÓ MODULE HOÁ — nhân cốt lõi chạy trong
không gian kernel, nhưng phần lớn chức năng (driver thiết bị, filesystem, giao thức mạng, security
framework...) được đóng gói thành MODULE, có thể LOAD/UNLOAD động khi cần mà không cần reboot hay
compile lại toàn bộ kernel. Một SE cần biết cách tra cứu module nào đang load, tại sao, và chúng
phụ thuộc vào nhau như thế nào — đây là bước đầu tiên khi debug "tính năng X không hoạt động" (ví
dụ nftables chặn không đúng, bonding không tạo được, filesystem không mount được) trước khi đi vào
từng công cụ cụ thể.

## 2. Khái niệm cốt lõi

**Kernel module (`.ko` file)**: đoạn code kernel biên dịch riêng, nằm trong thư mục
`/lib/modules/<kernel-version>/`, có thể được load vào kernel đang chạy để thêm chức năng mà KHÔNG
cần reboot. Module được load xong trở thành MỘT PHẦN CỦA KERNEL — chạy trong kernel space, có đầy
đủ quyền kernel, KHÔNG bị giám sát bởi hệ thống bảo vệ bộ nhớ như user-space process.

**Load/Unload**: `modprobe <module>` load module (và tự động load các dependency nếu cần);
`modprobe -r <module>` unload (chỉ được nếu module có `Used by` = 0). `insmod`/`rmmod` là công cụ
cấp thấp, KHÔNG tự xử lý dependency — dùng `modprobe` trong thực tế.

**`/proc/modules`**: file giả (virtual file) liệt kê TẤT CẢ module đang load trong kernel — cùng
thông tin với `lsmod` nhưng định dạng thô hơn. Đây là NGUỒN GỐC thật sự mà `lsmod` đọc.

**`/sys/module/<tên>/`**: thư mục giả trong sysfs, một thư mục con cho MỖI module đang load, chứa
metadata chi tiết (refcnt, initstate, parameters, sections, holders). Đây là cách xem trạng thái
module theo thời gian thực mà không cần lệnh đặc biệt.

| Lệnh | Tác dụng |
|---|---|
| `lsmod` | Liệt kê module đang load, kích thước, số lần dùng và ai dùng |
| `modinfo <module>` | Thông tin chi tiết một module: file, mô tả, tác giả, tham số |
| `modprobe <module>` | Load module (cần root, tự xử lý dependency) |
| `modprobe -r <module>` | Unload module nếu không còn ai dùng (cần root) |
| `cat /proc/modules` | Nguồn gốc thô của `lsmod` |
| `ls /sys/module/<tên>/` | Metadata chi tiết module đang load |

## 3. Cách nó hoạt động

**`Used by` trong `lsmod` là cơ chế an toàn ngăn unload "đang bận"** — giá trị này (cột thứ ba,
số nguyên) cho biết có BAO NHIÊU thực thể khác đang giữ reference tới module: module khác đang
dùng nó như một dependency, file system đang mount, thiết bị đang mở... Module có `Used by > 0`
KHÔNG thể unload (kernel từ chối với "Module is in use"). Khi gặp không unload được, bước đầu tiên
là xem AI đang giữ reference (cột "Used by" in ra danh sách module phụ thuộc).

**Dependency giữa module được quản lý bởi file `modules.dep`** — khi `modprobe` được gọi, nó đọc
`/lib/modules/<kernel>/modules.dep` (sinh bởi `depmod`) để biết một module cần load các module
khác theo thứ tự nào trước. Đây là lý do `modprobe` tự động load dependency mà `insmod` không làm
được — `insmod` chỉ load ĐÚNG file `.ko` được chỉ định, không biết dependency.

**Module load theo hai con đường**: (1) tự động khi kernel detect hardware/filesystem (`udev` gọi
`modprobe` theo alias thiết bị — xem `modinfo`'s `alias:` field) hoặc (2) thủ công bởi admin/
script. Cấu hình load-at-boot lưu trong `/etc/modules-load.d/*.conf`; cấu hình blacklist (cấm load)
lưu trong `/etc/modprobe.d/blacklist*.conf`.

## 4. Thực hành

Xem danh sách module đang load — 169 module trên máy này (chỉ hiện phần đầu):

```bash
$ lsmod
Module                  Size  Used by
mptcp_diag             12288  0
vsock_diag             12288  0
sctp_diag              16384  0
raw_diag               12288  0
unix_diag              12288  0
sctp                  495616  15 sctp_diag
ip6_udp_tunnel         16384  1 sctp
...
nf_tables             380928  0
libcrc32c              12288  1 nf_tables
nfnetlink              20480  1 nf_tables
```

Đọc: `sctp` có `Used by` = `13 sctp_diag` — 13 SCTP connection đang hoạt động lúc chạy lệnh (giá
trị này thay đổi theo số connection SCTP hiện hoạt) và `sctp_diag` là module đang giữ dependency. `nf_tables` có `Used by` = `0` — không ai đang dùng trực tiếp, nhưng module vẫn
load (load lúc boot theo cấu hình hệ thống hoặc vì được load trước khi các rule được xoá).

Xem thông tin chi tiết module `nf_tables`:

```bash
$ modinfo nf_tables
filename:       /lib/modules/6.8.0-138-generic/kernel/net/netfilter/nf_tables.ko
alias:          nfnetlink-subsys-10
description:    Framework for packet filtering and classification
author:         Patrick McHardy <kaber@trash.net>
license:        GPL
srcversion:     C184BDBE2AAB61715969D91
depends:        nfnetlink,libcrc32c
retpoline:      Y
intree:         Y
name:           nf_tables
vermagic:       6.8.0-138-generic SMP preempt mod_unload modversions
```

`depends: nfnetlink,libcrc32c` — đây là lý do `lsmod` hiện cả `nfnetlink` và `libcrc32c` với
`Used by` trỏ về `nf_tables`: chúng là dependency bắt buộc, `modprobe nf_tables` sẽ tự load chúng
trước.

Nguồn gốc thô `/proc/modules` — cùng thông tin nhưng định dạng phân cách bằng space:

```bash
$ cat /proc/modules | head -6
mptcp_diag 12288 0 - Live 0x0000000000000000
vsock_diag 12288 0 - Live 0x0000000000000000
sctp_diag 16384 0 - Live 0x0000000000000000
raw_diag 12288 0 - Live 0x0000000000000000
unix_diag 12288 0 - Live 0x0000000000000000
sctp 495616 13 sctp_diag, Live 0x0000000000000000
```

Xem sysfs entry của module `nf_tables` (không cần sudo):

```bash
$ ls /sys/module/nf_tables/
coresize  holders/  initsize  initstate  notes/  refcnt  sections/  srcversion  taint  uevent
$ cat /sys/module/nf_tables/refcnt
0
$ cat /sys/module/nf_tables/initstate
live
```

`refcnt = 0` khớp với `Used by` = 0 trong `lsmod`; `initstate = live` nghĩa là module đã init xong
và đang hoạt động bình thường (trạng thái khác: `going` = đang unload).

## 5. Lỗi thường gặp và cách chẩn đoán

**`modprobe -r <module>` báo "Module is in use", không unload được**
- Nguyên nhân: module đang có `refcnt > 0` — một hoặc nhiều thực thể khác đang giữ reference (có
  thể là module khác, file system đang mount, thiết bị đang mở, hay connection đang active).
- Cách xác nhận: `lsmod | grep <tên>` xem cột "Used by" — liệt kê rõ TÊN các module/thực thể đang
  giữ reference.
- Cách xử lý: lần lượt unload (hoặc đóng/ngắt kết nối) từng thực thể trong "Used by" trước, rồi
  mới unload module gốc. Hoặc, nếu không cần unload ngay, reboot sẽ tự dọn sạch.

**Một tính năng (ví dụ bonding, overlay filesystem) không hoạt động dù đã cài đặt đúng**
- Nguyên nhân khả năng cao: module tương ứng chưa được load. Module không phải tự động load trong
  mọi trường hợp — một số cần load thủ công hoặc phải có device file/trigger phù hợp để `udev` tự
  load.
- Cách xác nhận: `lsmod | grep <tên-module>` — nếu không thấy, module chưa load.
- Cách xử lý: `sudo modprobe <tên-module>` để load tạm thời; thêm tên module vào
  `/etc/modules-load.d/` để load cố định qua mỗi boot.

## 6. Tình huống thực tế

Server mới dựng báo "bonding interface `bond0` không thể tạo được" dù đã làm đúng theo tài liệu
cấu hình:

1. `lsmod | grep bonding` — KHÔNG thấy module `bonding` trong danh sách → xác nhận ngay: module
   chưa load, không phải lỗi cấu hình.
2. `modinfo bonding | grep filename` — xác nhận file `.ko` có tồn tại trong
   `/lib/modules/<kernel>/` (nếu không tìm thấy, kernel/distro không có module này, cần cài package
   tương ứng hoặc build từ nguồn).
3. `sudo modprobe bonding` — load module, sau đó `lsmod | grep bonding` xác nhận đã load thành
   công.
4. Tạo lại `bond0` theo đúng cấu hình — lần này thành công.
5. Để load cố định qua reboot: thêm `bonding` vào `/etc/modules-load.d/bonding.conf` (hoặc cấu hình
   netplan/NetworkManager để tự khai báo interface bond, cách này cũng tự load module).
6. Ghi nhận: khi một tính năng kernel không hoạt động, LUÔN kiểm tra `lsmod | grep <module>` TRƯỚC
   khi đi vào debug cấu hình — thiếu module là nguyên nhân đơn giản nhất và dễ bỏ qua nhất.

## 7. Tự kiểm tra

1. `modprobe -r nf_tables` thất bại với "Module is in use". Bước đầu tiên để tìm nguyên nhân là gì?
   <details><summary>Đáp án</summary>Chạy <code>lsmod | grep nf_tables</code> xem cột "Used by" —
   liệt kê tên các module/thực thể đang giữ reference. Lần lượt unload chúng trước, rồi mới unload
   <code>nf_tables</code>.</details>

2. Khác biệt chính giữa `modprobe` và `insmod` khi load module là gì?
   <details><summary>Đáp án</summary><code>modprobe</code> đọc <code>modules.dep</code> và tự động
   load tất cả dependency theo đúng thứ tự trước khi load module đích. <code>insmod</code> chỉ load
   ĐÚNG file <code>.ko</code> được chỉ định, không biết dependency — nếu thiếu dependency thì
   thất bại.</details>

3. Module có `Used by = 0` trong `lsmod`. Điều này có đảm bảo module có thể unload ngay không?
   <details><summary>Đáp án</summary>Thường là có — <code>Used by = 0</code> nghĩa là không có
   thực thể nào đang giữ reference, <code>modprobe -r</code> thường thành công. Ngoại lệ: một số
   module được đánh dấu "permanent" (ví dụ module cốt lõi không thể unload dù refcnt 0) hoặc đang
   trong quá trình init/teardown (<code>initstate = going</code>).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.kernel-troubleshooting.sysctl` — tham số module (đọc qua `/sys/module/<tên>/parameters/`)
  là một phần của không gian tham số kernel, có thể đọc/ghi qua sysfs.
- `linux.kernel-troubleshooting.kernel-logs` — khi `modprobe` thất bại hoặc module gặp lỗi khởi tạo,
  thông báo lỗi chi tiết xuất hiện trong kernel log (`dmesg`/`journalctl -k`).

**Bài liên quan ngoài module:**
- `linux.network-stack.firewall` — `lsmod | grep nf_tables` xác nhận framework nftables đã load,
  bước cơ bản khi debug firewall.
- `linux.network-stack.troubleshooting` — bonding cần module `bonding` load trước khi có thể cấu
  hình interface.

**Nguồn tham khảo:**
- [lsmod(8) — man7.org](https://man7.org/linux/man-pages/man8/lsmod.8.html) — đọc `/proc/modules`.
- [modinfo(8) — man7.org](https://man7.org/linux/man-pages/man8/modinfo.8.html) — metadata module
  (`depends`, `alias`, `parm`...).
- [modprobe(8) — man7.org](https://man7.org/linux/man-pages/man8/modprobe.8.html) — load/unload với
  dependency resolution.
- [modules.dep(5) — man7.org](https://man7.org/linux/man-pages/man5/modules.dep.5.html) — định dạng
  file dependency map sinh bởi `depmod`.
