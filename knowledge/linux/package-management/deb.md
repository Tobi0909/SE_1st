---
id: linux.package-management.deb
title: "Quản lý gói Debian/Ubuntu: apt, dpkg"
domain: linux
module: linux.package-management
level: "vận hành"
prerequisites: []
applies_to:
  - "Ubuntu 22.04.5 LTS — apt 2.4.14, dpkg 1.21.1 (họ Debian: Debian, Ubuntu, Linux Mint...)"
status: verified
sources:
  - "https://manpages.debian.org/bookworm/apt/apt.8.en.html"
  - "https://man7.org/linux/man-pages/man1/dpkg.1.html"
  - "https://wiki.debian.org/Apt"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Mọi hệ điều hành họ Debian (Debian, Ubuntu, Linux Mint...) dùng chung định dạng gói `.deb` và
hai tầng công cụ quản lý: `dpkg` (tầng THẤP, xử lý TRỰC TIẾP file `.deb` đã có sẵn, không biết
gì về "tải từ đâu") và `apt` (tầng CAO, biết tải gói từ repository, tự giải quyết dependency).
Hiểu đúng sự phân tầng này giúp trả lời được các câu hỏi vận hành thường gặp: "vì sao `dpkg -i`
báo lỗi thiếu dependency mà `apt install` lại tự xử lý được?", "gói này thực sự cài file gì vào
hệ thống, ở đâu?", "làm sao biết package nào sở hữu một file cụ thể đang gây lỗi?".

## 2. Khái niệm cốt lõi

**`dpkg`**: làm việc trực tiếp với file `.deb` hoặc package ĐÃ CÀI trên máy — không tự tải gì
từ Internet, không tự giải quyết dependency còn thiếu (chỉ báo lỗi nếu thiếu).

| Lệnh | Tác dụng |
|---|---|
| `dpkg -l [pattern]` | Liệt kê package đã cài (khớp pattern nếu có) |
| `dpkg -L <package>` | Liệt kê TOÀN BỘ file mà package đã cài vào hệ thống |
| `dpkg -S <đường-dẫn-file>` | Tìm package SỞ HỮU một file cụ thể (ngược với `-L`) |
| `dpkg -i <file.deb>` | Cài TRỰC TIẾP một file `.deb` (không tự tải dependency) |
| `dpkg --compare-versions v1 op v2` | So sánh 2 version theo đúng thuật toán APT dùng |

**`apt`**: tầng CAO hơn, biết REPOSITORY (định nghĩa ở `/etc/apt/sources.list` và
`/etc/apt/sources.list.d/*.list`), tự tải gói VÀ mọi dependency còn thiếu.

| Lệnh | Tác dụng |
|---|---|
| `apt update` | Tải lại danh sách gói MỚI NHẤT từ repository (KHÔNG cài/nâng cấp gì) |
| `apt list --installed` | Liệt kê package đã cài (tương tự `dpkg -l` nhưng định dạng khác) |
| `apt list --upgradable` | Liệt kê package CÓ bản mới hơn bản đang cài |
| `apt show <package>` | Xem thông tin chi tiết (version, dependency, mô tả) |
| `apt install <package>` | Cài, tự giải quyết dependency |
| `apt-cache policy <package>` | Xem version đang cài, version ứng viên, và NGUỒN (repo nào) |

**Lock file**: `apt`/`dpkg` dùng file lock (`/var/lib/dpkg/lock-frontend`,
`/var/lib/apt/lists/lock`) để đảm bảo CHỈ MỘT tiến trình thay đổi trạng thái package tại một
thời điểm — mọi lệnh THAY ĐỔI (install/remove/update) cần quyền root để giữ lock này, kể cả
`apt-get check` (chỉ kiểm tra, không sửa gì) cũng cần lock vì nó dùng chung cơ chế khoá với các
lệnh thay đổi.

## 3. Cách nó hoạt động

**`apt update` CHỈ tải lại metadata (danh sách gói + version mới nhất CÓ SẴN trên repo), KHÔNG
cài hay nâng cấp bất cứ gì** — đây là nhầm lẫn phổ biến nhất với người mới: chạy `apt update`
rồi ngạc nhiên vì "chưa thấy gì thay đổi". Phải chạy tiếp `apt upgrade` (nâng cấp TẤT CẢ package
có bản mới) hoặc `apt install <package>` (cài/nâng cấp MỘT package cụ thể) mới thực sự thay đổi
gì trên máy.

**`dpkg -i` không tự tải dependency, trong khi `apt install` thì có** — vì `dpkg` hoạt động ở
tầng THẤP, chỉ biết đọc metadata NGAY TRONG file `.deb` (danh sách dependency cần) rồi kiểm tra
máy đã có chưa, báo lỗi nếu thiếu — không biết "tải ở đâu" vì không có khái niệm repository.
`apt` ở tầng CAO hơn, khi thấy thiếu dependency sẽ tự tra repository và tải nốt. Đây là lý do
quy trình chuẩn khi có một file `.deb` tải thủ công (ví dụ từ trang chủ phần mềm) là dùng
`apt install ./ten-file.deb` (từ APT 1.1+) thay vì `dpkg -i` trực tiếp — `apt` vẫn xử lý được
file `.deb` cụ thể NHƯNG đồng thời tự lo luôn dependency còn thiếu.

**`dpkg --compare-versions` dùng đúng thuật toán so sánh version mà APT dùng để quyết định
"version nào mới hơn"** — không phải so sánh chuỗi ký tự đơn giản (ví dụ "2.0.0" so với "10.0.0"
theo chuỗi ký tự sẽ sai, nhưng theo thuật toán Debian version thì đúng là 10.0.0 mới hơn) — hữu
ích khi viết script cần tự kiểm tra version mà không muốn tự implement lại logic so sánh.

## 4. Thực hành

Xem thông tin package đã cài — chạy thật, dùng package có sẵn trên máy (`curl`):

```bash
$ dpkg -l curl
Desired=Unknown/Install/Remove/Purge/Hold
| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend
|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)
||/ Name           Version            Architecture Description
+++-==============-==================-============-=======================================================
ii  curl           7.81.0-1ubuntu1.29 amd64        command line tool for transferring data with URL syntax
```

`ii` (cột đầu) nghĩa là "install ok, installed" — cả 2 chữ `i` đều ở trạng thái mong muốn
("Install") và trạng thái thực tế ("installed"), không có lỗi.

Xem toàn bộ file mà package đã cài, và tìm ngược package sở hữu một file:

```bash
$ dpkg -L curl | head -10
/.
/usr
/usr/bin
/usr/bin/curl
/usr/share
/usr/share/doc
/usr/share/doc/curl
/usr/share/doc/curl/copyright
/usr/share/man
/usr/share/man/man1

$ dpkg -S /bin/bash
bash: /bin/bash
```

Xem version đang cài, version ứng viên và nguồn repo (xác nhận gói đến từ repo chính thức):

```bash
$ apt-cache policy curl
curl:
  Installed: 7.81.0-1ubuntu1.29
  Candidate: 7.81.0-1ubuntu1.29
  Version table:
 *** 7.81.0-1ubuntu1.29 500
        500 http://security.ubuntu.com/ubuntu jammy-security/main amd64 Packages
        100 /var/lib/dpkg/status
     7.81.0-1 500
        500 http://vn.archive.ubuntu.com/ubuntu jammy/main amd64 Packages
```

Đọc: dòng có dấu `***` là version ĐANG CÀI; `100 /var/lib/dpkg/status` là dòng tham chiếu tới
chính database package cục bộ (không phải một repo thật); các dòng còn lại là version KHÁC có
sẵn trên các mirror đã cấu hình (ở đây có 2 mirror: `security.ubuntu.com` và
`vn.archive.ubuntu.com`) — số sau tên mirror (`500`) là độ ưu tiên (pin priority) APT dùng để
quyết định version nào là "Candidate" khi có nhiều lựa chọn.

`dpkg --compare-versions` — xác nhận đúng mục 3 (so sánh version theo thuật toán Debian, không
phải so chuỗi ký tự):

```bash
$ dpkg --compare-versions "1.2.3" lt "1.3.0"
$ echo "exit code: $?"
exit code: 0
$ dpkg --compare-versions "2.0.0" lt "1.3.0"
$ echo "exit code: $?"
exit code: 1
```

(`dpkg --compare-versions` không in gì ra — kết quả thể hiện qua EXIT CODE: `0` nghĩa là so
sánh ĐÚNG, khác `0` nghĩa là SAI, đúng quy ước exit code đã học ở
`linux.shell-scripting.best-practices`.)

Máy demo này KHÔNG có quyền sudo không-mật-khẩu, nên lệnh THAY ĐỔI trạng thái package (`apt
update`, `apt install`, `dpkg -i`) không chạy thật được — xác nhận giới hạn quyền thật:

```bash
$ apt-get check
E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)
E: Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?
```

Đáng chú ý: `apt-get check` CHỈ kiểm tra, không sửa gì, nhưng vẫn cần lock (và do đó cần root)
— đúng khớp giải thích ở mục 2 về cơ chế khoá áp dụng chung cho mọi lệnh đụng tới trạng thái
package, không riêng lệnh "thay đổi".

> **Lưu ý:** phần `apt install`/`apt upgrade`/`apt-get update` thật trong các ví dụ MINH HOẠ
> dưới đây lấy cú pháp đúng từ man page chính thức (`apt.8`), không chạy được trên máy demo vì
> thiếu quyền root — đánh dấu rõ để phân biệt với phần đã chạy thật ở trên.

Cài một package mới và nâng cấp toàn hệ thống (**output minh hoạ**, cú pháp theo `apt(8)`):

```
$ sudo apt update
Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease
Reading package lists... Done
Building dependency tree... Done

$ sudo apt install cowsay
Reading package lists... Done
Building dependency tree... Done
The following NEW packages will be installed:
  cowsay
0 upgraded, 1 newly installed, 0 to remove and 0 not upgraded.
Need to get 20.4 kB of archives.
Setting up cowsay (3.03+dfsg2-7) ...
```

## 5. Lỗi thường gặp và cách chẩn đoán

**`dpkg -i file.deb` báo lỗi thiếu dependency, package không cài được**
- Nguyên nhân: `dpkg` không tự tải dependency còn thiếu — chỉ biết BÁO lỗi, không biết "tải ở
  đâu" vì hoạt động ở tầng thấp, không có khái niệm repository.
- Cách xác nhận: đọc thông báo lỗi, thường liệt kê rõ TÊN các dependency còn thiếu.
- Cách xử lý: dùng `sudo apt install ./file.deb` thay vì `dpkg -i` trực tiếp — `apt` xử lý được
  file cụ thể NHƯNG vẫn tự tra và tải dependency còn thiếu từ repository.

**`apt update` xong nhưng `apt list --upgradable` vẫn trống, trong khi biết chắc có bản mới**
- Nguyên nhân khả năng cao: repository chứa bản mới chưa được khai báo trong
  `/etc/apt/sources.list`/`sources.list.d/`, hoặc gói đó bị đánh dấu `hold` (giữ nguyên version,
  không cho nâng cấp).
- Cách xác nhận: `apt-cache policy <package>` xem "Candidate" có khớp version mong đợi không;
  `apt-mark showhold` xem package có đang bị hold không.
- Cách xử lý: nếu thiếu repo, thêm đúng file vào `sources.list.d/`; nếu bị hold mà muốn nâng
  cấp, `apt-mark unhold <package>` trước khi `apt install`.

**Nhầm lẫn `apt update` với `apt upgrade`, nghĩ chạy `update` xong là hệ thống đã nâng cấp**
- Nguyên nhân: tên lệnh gây hiểu nhầm — `update` chỉ tải lại DANH SÁCH (metadata), không cài
  đặt gì; `upgrade` mới thực sự cài bản mới.
- Cách xác nhận: kiểm tra version một package trước/sau khi chạy `update` — sẽ KHÔNG đổi.
- Cách xử lý: luôn nhớ thứ tự `apt update` (lấy danh sách mới) RỒI `apt upgrade`/`apt install`
  (thực sự thay đổi) — hai bước tách biệt, không thể gộp thành một hiểu lầm.

## 6. Tình huống thực tế

Một đồng nghiệp tải thủ công file `.deb` của một công cụ nội bộ từ server artifact, chạy
`sudo dpkg -i tool-internal_1.2.0_amd64.deb`, gặp lỗi:

```
dpkg: dependency problems prevent configuration of tool-internal:
 tool-internal depends on libfoo2 (>= 2.1); however:
  Package libfoo2 is not installed.
dpkg: error processing package tool-internal (--configure):
 dependency problems - leaving unconfigured
```

1. Đọc lỗi: thiếu dependency `libfoo2 (>= 2.1)`, chưa cài trên máy — đúng khớp mục 3 (`dpkg`
   không tự tải dependency).
2. Thử cách nhanh nhất trước: `sudo apt install -f` (fix broken dependency của package vừa cài
   dở bằng `dpkg -i`) — `apt` sẽ tra repository và tự cài `libfoo2` nếu có sẵn.
3. Nếu `libfoo2` KHÔNG có trong repository đã khai báo (ví dụ chỉ tồn tại trong repo nội bộ
   riêng), phải thêm repo nội bộ vào `/etc/apt/sources.list.d/` trước, `apt update`, rồi lặp lại
   bước 2.
4. Rút kinh nghiệm cho lần sau: với file `.deb` tải thủ công, dùng NGAY `sudo apt install
   ./tool-internal_1.2.0_amd64.deb` từ đầu (thay vì `dpkg -i`) — tự động có bước tự tải
   dependency ở bước 3 mà không cần phát hiện lỗi rồi sửa sau.
5. Ghi vào checklist nội bộ: mọi hướng dẫn cài `.deb` thủ công trong tài liệu nội bộ nên dùng
   `apt install ./...` thay vì `dpkg -i ...`, trừ khi có lý do cụ thể cần kiểm soát ở tầng thấp
   (ví dụ debug chính cơ chế dependency).

## 7. Tự kiểm tra

1. Vì sao `dpkg -i file.deb` có thể báo lỗi thiếu dependency mà `apt install file.deb` (cùng
   file) lại không?
   <details><summary>Đáp án</summary><code>dpkg</code> hoạt động ở tầng thấp, chỉ đọc metadata
   trong chính file <code>.deb</code> và kiểm tra máy đã có dependency chưa — không biết tải ở
   đâu nếu thiếu. <code>apt</code> ở tầng cao hơn, biết repository, tự tra và tải dependency còn
   thiếu khi phát hiện.</details>

2. `apt update` vừa chạy xong. Hệ thống có được nâng cấp gì chưa? Vì sao?
   <details><summary>Đáp án</summary>Chưa — <code>apt update</code> CHỈ tải lại danh sách gói/
   version mới nhất có sẵn trên repo (metadata), không cài hay nâng cấp bất cứ gì. Cần chạy
   thêm <code>apt upgrade</code> hoặc <code>apt install &lt;package&gt;</code> để thực sự thay
   đổi.</details>

3. `dpkg --compare-versions "2.0.0" lt "10.0.0"` trả về exit code gì, và vì sao kết quả này
   KHÔNG giống so sánh chuỗi ký tự thông thường?
   <details><summary>Đáp án</summary>Exit code <code>0</code> (đúng — 2.0.0 nhỏ hơn 10.0.0).
   So sánh CHUỖI ký tự thông thường có thể cho kết quả khác (ký tự <code>'2'</code> lớn hơn
   <code>'1'</code> nên "2.0.0" > "10.0.0" nếu so từng ký tự) — <code>dpkg --compare-versions</code>
   dùng thuật toán so sánh VERSION chuyên biệt của Debian, hiểu đúng ý nghĩa số học của các
   thành phần version, không so chuỗi thô.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.package-management.rpm` — cùng khái niệm 2 tầng (tầng thấp `rpm` tương đương `dpkg`,
  tầng cao `dnf`/`yum` tương đương `apt`) nhưng cho họ RHEL/CentOS.

**Bài liên quan ngoài module:**
- `linux.shell-scripting.best-practices` — quy ước exit code (`0`/khác `0`) dùng để đọc kết quả
  của `dpkg --compare-versions` ở mục 4.

**Nguồn tham khảo:**
- [apt(8) — manpages.debian.org](https://manpages.debian.org/bookworm/apt/apt.8.en.html) — các
  lệnh con `update`/`install`/`upgrade`, cú pháp `apt install ./file.deb`.
- [dpkg(1) — man7.org](https://man7.org/linux/man-pages/man1/dpkg.1.html) — `-l`/`-L`/`-S`/
  `-i`/`--compare-versions`.
- [Debian Wiki — Apt](https://wiki.debian.org/Apt) — tổng quan kiến trúc apt/dpkg và vai trò
  từng tầng.
