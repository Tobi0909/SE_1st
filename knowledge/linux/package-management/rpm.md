---
id: linux.package-management.rpm
title: "Quản lý gói RHEL/CentOS: dnf/yum, rpm"
domain: linux
module: linux.package-management
level: "vận hành"
prerequisites: []
applies_to:
  - "RHEL 9/CentOS Stream 9/Rocky Linux 9/Fedora — dnf là công cụ hiện đại, yum vẫn còn trên RHEL 7/8 (alias trỏ sang dnf từ RHEL 8)"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man8/dnf.8.html"
  - "https://man7.org/linux/man-pages/man8/rpm.8.html"
  - "https://docs.rockylinux.org/books/admin_guide/13-softwares/"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Họ RHEL (RHEL, CentOS Stream, Rocky Linux, Fedora, Oracle Linux) dùng định dạng gói `.rpm` và
kiến trúc 2 tầng TƯƠNG TỰ về nguyên lý với Debian/Ubuntu (`linux.package-management.deb`) —
`rpm` ở tầng thấp, `dnf` (hoặc `yum` trên bản cũ hơn) ở tầng cao. Một System Engineer vận hành
hạ tầng hỗn hợp (một số máy Ubuntu, một số máy RHEL/CentOS — phổ biến trong môi trường doanh
nghiệp dùng RHEL cho hệ thống quan trọng) cần nhận diện ĐÚNG công cụ tương ứng trên từng distro,
tránh áp dụng nhầm lệnh `apt`/`dpkg` lên máy RHEL hoặc ngược lại.

> **Lưu ý về nguồn dữ liệu bài này:** máy viết bài chạy Ubuntu 22.04 LTS (họ Debian), không có
> `rpm`/`dnf`/`yum` cài sẵn và không có máy RHEL/CentOS nào trong môi trường để chạy thật. TOÀN
> BỘ lệnh trong bài này là **output minh hoạ**, lấy đúng cú pháp và định dạng output từ man page
> chính thức (`dnf.8`, `rpm.8`) và tài liệu Rocky Linux — không phải lệnh tự chạy trên máy demo.

## 2. Khái niệm cốt lõi

**`rpm`**: làm việc trực tiếp với file `.rpm` hoặc package ĐÃ CÀI — tương đương vai trò của
`dpkg` bên Debian: không tự tải dependency, chỉ báo lỗi nếu thiếu.

| Lệnh | Tác dụng | Tương đương bên Debian |
|---|---|---|
| `rpm -qa [pattern]` | Liệt kê package đã cài | `dpkg -l` |
| `rpm -ql <package>` | Liệt kê file package đã cài | `dpkg -L` |
| `rpm -qf <đường-dẫn-file>` | Tìm package sở hữu một file | `dpkg -S` |
| `rpm -ivh <file.rpm>` | Cài trực tiếp file `.rpm` (`-i` install, `-v` verbose, `-h` hash
  progress) | `dpkg -i` |
| `rpm -qi <package>` | Xem thông tin chi tiết package đã cài | `dpkg -s` |

**`dnf`** (Dandified YUM — thay thế `yum` từ RHEL 8/Fedora 22): tầng CAO, biết repository (định
nghĩa ở `/etc/yum.repos.d/*.repo`), tự giải quyết dependency.

| Lệnh | Tác dụng | Tương đương bên Debian |
|---|---|---|
| `dnf update` (không tham số) | Nâng cấp TẤT CẢ package có bản mới — **khác `apt update`** | `apt upgrade` |
| `dnf check-update` | CHỈ kiểm tra có bản mới, không cài gì | `apt update` |
| `dnf install <package>` | Cài, tự giải quyết dependency | `apt install` |
| `dnf list installed` | Liệt kê package đã cài | `apt list --installed` |
| `dnf info <package>` | Xem thông tin chi tiết | `apt show` |
| `dnf repolist` | Liệt kê repository đang cấu hình | (không có lệnh 1-dòng tương đương chuẩn) |

**`yum`**: công cụ tiền nhiệm của `dnf`, vẫn dùng trên RHEL 7 và các bản cũ hơn. Từ RHEL 8 trở
đi, `yum` thường là MỘT ALIAS/symlink trỏ thẳng tới `dnf` — gõ `yum install ...` trên RHEL 8+
thực chất đang chạy `dnf` với cùng cú pháp tương thích ngược.

## 3. Cách nó hoạt động

**Khác biệt quan trọng nhất so với Debian: `dnf update` (không tham số) KHÔNG giống `apt
update`** — đây là cạm bẫy đặt tên dễ gây lỗi nguy hiểm khi chuyển qua lại giữa 2 hệ: bên
Debian, `apt update` CHỈ tải metadata (an toàn, không đổi gì); bên RHEL, `dnf update` (không
tham số) THỰC SỰ nâng cấp mọi package có bản mới — tương đương `apt upgrade`, không phải `apt
update`. Muốn CHỈ kiểm tra (an toàn, không đổi gì) trên RHEL phải dùng `dnf check-update`.

**`rpm -ivh` không tự tải dependency, giống `dpkg -i`, vì cùng lý do kiến trúc 2 tầng** — `rpm`
chỉ đọc metadata trong chính file `.rpm`, kiểm tra máy đã có dependency chưa, báo lỗi nếu thiếu.
Cách xử lý tương đương `apt install ./file.deb` bên Debian là `dnf install ./file.rpm` — `dnf`
vẫn xử lý được file cụ thể nhưng tự tra và tải dependency còn thiếu từ repository đã cấu hình.

**`dnf` giữ lịch sử giao dịch (transaction history), có thể ROLLBACK** — khác với `apt` (không
có cơ chế rollback tích hợp tương đương, phải tự quản lý qua snapshot filesystem hoặc giữ file
`.deb` cũ), `dnf history` liệt kê các lần cài/nâng cấp/xoá gần đây kèm số ID, `dnf history undo
<ID>` có thể hoàn tác một giao dịch cụ thể — tiện khi một lần `dnf update` gây lỗi và cần quay
lại NHANH mà không cần biết chính xác version cũ là gì.

## 4. Thực hành (output minh họa)

Xem thông tin package đã cài, liệt kê file, tìm ngược package sở hữu file — cú pháp/định dạng
theo `rpm(8)`:

```
$ rpm -qa | grep httpd
httpd-2.4.57-2.el9.x86_64

$ rpm -qi httpd
Name        : httpd
Version     : 2.4.57
Release     : 2.el9
Architecture: x86_64
Install Date: Mon 15 Sep 2025 09:12:33 AM UTC
Group       : Unspecified
Size        : 1578421
License     : ASL 2.0
Summary     : Apache HTTP Server

$ rpm -ql httpd | head -5
/etc/httpd/conf/httpd.conf
/etc/httpd/conf.d
/etc/httpd/conf.modules.d
/usr/sbin/httpd
/usr/sbin/httpd.worker

$ rpm -qf /usr/sbin/httpd
httpd-2.4.57-2.el9.x86_64
```

Kiểm tra bản mới (an toàn, KHÔNG đổi gì — tương đương `apt update`) và nâng cấp thật (tương
đương `apt upgrade`) — cú pháp theo `dnf(8)`:

```
$ dnf check-update
Last metadata expiration check: 0:12:45 ago.

httpd.x86_64            2.4.58-1.el9       updates
openssl.x86_64           3.0.9-2.el9        updates

$ sudo dnf update
Dependencies resolved.
================================================================================
 Package     Arch       Version          Repository      Size
================================================================================
Upgrading:
 httpd        x86_64     2.4.58-1.el9     updates         1.5 M
 openssl      x86_64     3.0.9-2.el9      updates         2.1 M

Transaction Summary
================================================================================
Upgrade  2 Packages

Is this ok [y/N]: y
Complete!
```

Cài một file `.rpm` tải thủ công, để `dnf` tự lo dependency (tương đương `apt install
./file.deb`):

```
$ sudo dnf install ./tool-internal-1.2.0.x86_64.rpm
Dependencies resolved.
================================================================================
 Package           Arch       Version        Repository       Size
================================================================================
Installing:
 tool-internal      x86_64     1.2.0-1        @commandline     45 k
Installing dependencies:
 libfoo2             x86_64     2.1.0-1        rhel9-appstream  120 k

Transaction Summary
================================================================================
Install  2 Packages

Complete!
```

Xem lịch sử giao dịch và rollback một lần cài gây lỗi (tính năng KHÔNG CÓ tương đương trực tiếp
bên `apt`):

```
$ dnf history
ID     | Command line             | Date and time    | Action(s)  | Altered
-------------------------------------------------------------------------------
    12 | update                   | 2026-10-05 09:00 | Upgrade     |    2
    11 | install tool-internal... | 2026-10-04 14:22 | Install     |    2

$ sudo dnf history undo 12
Transaction ID :12
Begin time     : 2026-10-05 09:00
...
Undoing transaction 12...
Complete!
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Chạy `dnf update` trên RHEL với kỳ vọng hành vi giống `apt update` (chỉ kiểm tra), vô tình
nâng cấp cả hệ thống ngoài ý muốn**
- Nguyên nhân: nhầm lẫn do TÊN LỆNH giống nhau giữa 2 hệ nhưng Ý NGHĨA khác nhau — đây là cạm
  bẫy quan trọng nhất khi chuyển đổi giữa Debian và RHEL.
- Cách xác nhận: xem `dnf history` ngay sau đó — nếu thấy một giao dịch Upgrade vừa xảy ra
  ngoài kế hoạch, xác nhận đúng nguyên nhân.
- Cách xử lý: luôn dùng `dnf check-update` khi CHỈ muốn kiểm tra trên RHEL; nếu đã nâng cấp
  ngoài ý muốn, dùng `dnf history undo <ID>` để rollback giao dịch đó.

**`rpm -ivh file.rpm` báo lỗi "Failed dependencies", package không cài được**
- Nguyên nhân: giống hệt lý do `dpkg -i` thiếu dependency bên Debian — `rpm` không tự tải gì.
- Cách xác nhận: đọc thông báo lỗi, liệt kê rõ tên package/version còn thiếu.
- Cách xử lý: dùng `sudo dnf install ./file.rpm` thay vì `rpm -ivh` trực tiếp.

## 6. Tình huống thực tế

Một SE quen thuộc với Ubuntu được giao quản lý thêm vài máy RHEL 9 mới, chạy theo thói quen cũ:

1. Gõ `sudo dnf update` nghĩ rằng đây chỉ là bước "kiểm tra xem có gì mới" (như `apt update`
   quen thuộc) trước khi quyết định có nâng cấp hay không — thực chất lệnh này đã NÂNG CẤP
   NGAY mọi package có bản mới trên máy production, không có bước xác nhận trước (ngoài prompt
   `y/N` mà có thể đã gõ `y` theo phản xạ).
2. Phát hiện vấn đề khi một dịch vụ quan trọng không khởi động lại được đúng cách sau khi
   `httpd` bị nâng cấp phiên bản mới có thay đổi cấu hình không tương thích.
3. Dùng `dnf history` xem lại giao dịch vừa thực hiện, xác nhận đúng ID giao dịch gây vấn đề.
4. `sudo dnf history undo <ID>` — rollback đúng giao dịch đó, quay máy về trạng thái TRƯỚC khi
   nâng cấp ngoài ý muốn.
5. Ghi vào runbook cá nhân/team: trên RHEL/CentOS, LUÔN dùng `dnf check-update` để kiểm tra
   trước (an toàn, không đổi gì), chỉ chạy `dnf update` khi THỰC SỰ đã quyết định nâng cấp —
   không áp dụng thói quen "update = kiểm tra an toàn" từ Debian sang RHEL.

## 7. Tự kiểm tra

1. `apt update` và `dnf update` (không tham số) có hành vi GIỐNG NHAU không? Nếu khác, khác ở
   điểm nào?
   <details><summary>Đáp án</summary>KHÔNG giống — đây là cạm bẫy quan trọng nhất của module
   này. <code>apt update</code> chỉ tải metadata, an toàn, không đổi gì trên máy. <code>dnf
   update</code> (không tham số) THỰC SỰ nâng cấp mọi package có bản mới — tương đương <code>apt
   upgrade</code>. Muốn chỉ kiểm tra trên RHEL phải dùng <code>dnf check-update</code>.</details>

2. `rpm -ivh file.rpm` báo lỗi thiếu dependency. Lệnh nào nên dùng thay thế để tự động xử lý
   dependency còn thiếu?
   <details><summary>Đáp án</summary><code>dnf install ./file.rpm</code> — giống nguyên lý
   <code>apt install ./file.deb</code> thay cho <code>dpkg -i</code> bên Debian: dùng công cụ
   tầng CAO (biết repository) để xử lý file cụ thể, tự tải dependency còn thiếu.</details>

3. `dnf` có tính năng nào giúp HOÀN TÁC một lần nâng cấp gây lỗi mà `apt` không có cơ chế tương
   đương tích hợp sẵn?
   <details><summary>Đáp án</summary><code>dnf history</code> (xem lịch sử giao dịch) kèm
   <code>dnf history undo &lt;ID&gt;</code> (rollback một giao dịch cụ thể theo ID) — <code>apt</code>
   không có cơ chế rollback tích hợp tương đương, phải tự quản lý qua công cụ khác (snapshot
   filesystem, giữ lại file <code>.deb</code> cũ...).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.package-management.deb` — kiến trúc 2 tầng tương tự (`rpm`↔`dpkg`, `dnf`↔`apt`), đọc
  trước để thấy rõ điểm GIỐNG và KHÁC giữa hai hệ sinh thái.

**Nguồn tham khảo:**
- [dnf(8) — man7.org](https://man7.org/linux/man-pages/man8/dnf.8.html) — `check-update`,
  `update`, `history`.
- [rpm(8) — man7.org](https://man7.org/linux/man-pages/man8/rpm.8.html) — `-q`/`-i`/`-l`/`-f`.
- [Rocky Linux Docs — Software Management](https://docs.rockylinux.org/books/admin_guide/13-softwares/)
  — tổng quan kiến trúc rpm/dnf trên bản phân phối họ RHEL hiện đại.
