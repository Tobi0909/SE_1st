---
id: linux.filesystem-storage.fhs-permissions
title: "Filesystem Hierarchy Standard (FHS) và permission cơ bản"
domain: linux
module: linux.filesystem-storage
level: "nền tảng"
prerequisites: []
applies_to:
  - "Ubuntu 22.04 LTS — cấu trúc thư mục tuân theo FHS, giống hầu hết distro Linux hiện đại"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man7/hier.7.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

"File cấu hình để ở đâu?", "log của service này nằm chỗ nào?", "sao thư mục này lại có quyền
lạ vậy?" — ba câu hỏi SE mới thường hỏi trong tuần đầu. Linux không đặt file tùy ý: có một quy
ước (FHS — Filesystem Hierarchy Standard) quyết định MỖI LOẠI dữ liệu nên nằm ở đâu, và một hệ
thống quyền (permission) xác định AI được làm gì với nó. Hiểu đúng cả hai giúp tìm đúng file
trong vài giây thay vì `find / -name` mò mẫm, và tránh những lỗi quyền truy cập ngớ ngẩn nhưng
tốn thời gian debug.

## 2. Khái niệm cốt lõi

FHS chia thư mục gốc thành các nhóm theo MỤC ĐÍCH SỬ DỤNG, không theo tên ứng dụng:

| Thư mục | Chứa gì |
|---|---|
| `/etc` | Cấu hình LOCAL của máy này (không phải file thực thi) |
| `/var` | Dữ liệu THAY ĐỔI kích thước theo thời gian — log, spool, cache |
| `/usr` | Dữ liệu CHIA SẺ được, chỉ đọc — ứng dụng, thư viện, tài liệu |
| `/opt` | Gói phần mềm ĐÓNG GÓI RIÊNG, tự chứa (add-on, không qua package manager hệ thống) |
| `/home` | Thư mục cá nhân của user |
| `/tmp` | File TẠM, có thể bị xoá bất cứ lúc nào không cần báo trước |
| `/boot` | Kernel, bootloader — cần cho quá trình boot |
| `/srv` | Dữ liệu phục vụ bởi chính máy này (ví dụ nội dung web server) |
| `/proc`, `/sys` | KHÔNG phải file thật trên đĩa — giao diện ảo tới thông tin kernel/process |

Permission cơ bản: mỗi file/thư mục có 3 nhóm quyền (owner/group/other), mỗi nhóm có 3 bit
(read/write/execute — `r`/`w`/`x`), biểu diễn bằng 3 chữ số octal (ví dụ `644`, `755`).

## 3. Cách nó hoạt động

**`/etc` vs `/usr` là ranh giới quan trọng nhất để nhớ**: `/usr` chứa chương trình/thư viện —
về lý thuyết có thể xoá sạch và cài lại từ package manager mà không mất dữ liệu riêng của máy.
`/etc` chứa CÁCH chương trình đó được cấu hình riêng cho máy này — xoá `/etc` là mất toàn bộ
tùy biến, dù chương trình vẫn còn. Đây là lý do backup luôn ưu tiên `/etc` và `/home`/`/var`
(dữ liệu KHÔNG tái tạo được từ package), không cần backup `/usr`/`/bin` (tái tạo được từ gói
cài đặt).

**`x` trên THƯ MỤC có ý nghĩa khác `x` trên FILE** — điểm hay gây nhầm cho người mới: với file,
`x` nghĩa là "được thực thi như chương trình". Với THƯ MỤC, `x` nghĩa là "được phép `cd` vào
và truy cập file BÊN TRONG theo tên" (không phải "thực thi thư mục"). Một thư mục có `r`
nhưng không có `x` cho phép LIỆT KÊ tên file bên trong (`ls`) nhưng KHÔNG cho phép truy cập nội
dung từng file cụ thể dù biết tên — ngược lại, có `x` nhưng không có `r` cho phép truy cập file
nếu biết CHÍNH XÁC tên, nhưng không liệt kê được danh sách.

**`umask` không "set permission trực tiếp" — nó TRỪ ĐI từ giá trị mặc định của hệ thống**:
giá trị mặc định khi tạo file mới là `666` (rw cho cả 3 nhóm, không bao giờ có `x` mặc định cho
file thường — tránh vô tình tạo ra executable), và `777` cho thư mục mới. `umask` là một mặt
nạ BIT bị TRỪ ĐI từ các giá trị đó. `umask 0002` (giá trị mặc định phổ biến trên nhiều distro,
bao gồm Ubuntu) nghĩa là bit "write cho other" luôn bị tắt khi tạo mới — file mới thành `664`
(666 - 002), thư mục mới thành `775` (777 - 002).

**Sticky bit trên thư mục (hiển thị bằng `t` cuối chuỗi quyền) giải quyết vấn đề thư mục chia
sẻ đa người dùng**: `/tmp` có quyền `1777` — số `1` ở đầu là sticky bit. Bình thường, có
quyền `w` trên một thư mục cho phép XOÁ bất kỳ file trong đó (bất kể ai sở hữu file đó) — nguy
hiểm cho thư mục công cộng như `/tmp` nơi mọi user đều có quyền viết. Sticky bit giới hạn lại:
chỉ OWNER của file (hoặc root) mới được xoá/rename file đó, dù thư mục cho phép write chung cho
mọi người.

## 4. Thực hành

Xem bảng phân quyền thật của các thư mục gốc theo đúng vai trò FHS (chạy trên Ubuntu 22.04.5
LTS thật):

```bash
$ ls -la / | head -10
total 2097256
drwxr-xr-x  20 root root     4096 Thg 5  25 07:52 .
drwxr-xr-x  20 root root     4096 Thg 5  25 07:52 ..
lrwxrwxrwx   1 root root        7 Thg 5  25 07:46 bin -> usr/bin
drwxr-xr-x   4 root root     4096 Thg 8  21 11:32 boot
drwxrwxr-x   2 root root     4096 Thg 5  25 07:52 cdrom
drwxr-xr-x  19 root root     4920 Thg 10  5 07:50 dev
drwxr-xr-x 146 root root    12288 Thg 10  2 07:48 etc
drwxr-xr-x   4 root root     4096 Thg 6  30 09:47 home
lrwxrwxrwx   1 root root        7 Thg 5  25 07:46 lib -> usr/lib
```

Đọc cột đầu (chuỗi quyền dạng `rwx`): `etc`/`home`/`boot` đều `rwxr-xr-x` (`755`) — owner toàn
quyền, group/other chỉ đọc+đi qua. Tự kiểm tra thêm `ls -ld /root` sẽ thấy `rwx------` (`700`,
chỉ chính root đọc/viết/vào được — hợp lý vì đây là home của superuser) và `ls -ld /proc` thấy
`dr-xr-xr-x` (`555`, chỉ đọc + đi qua được, không ai "viết" trực tiếp vào filesystem ảo này
theo nghĩa thông thường).

Xem umask thật đang áp dụng và tác động trực tiếp khi tạo file/thư mục mới:

```bash
$ umask
0002
$ touch /tmp/demo.txt && ls -l /tmp/demo.txt
-rw-rw-r-- 1 tuantm5 tuantm5 0 Thg 10  5 15:22 /tmp/demo.txt
$ mkdir /tmp/demo_dir && ls -ld /tmp/demo_dir
drwxrwxr-x 2 tuantm5 tuantm5 4096 Thg 10  5 15:22 /tmp/demo_dir
```

Khớp đúng công thức ở mục 3: `666 - 002 = 664` cho file, `777 - 002 = 775` cho thư mục — xác
nhận umask THỰC SỰ trừ đi từ mặc định, không phải một con số set cứng.

Xem đầy đủ thông tin một file qua `stat` (nhiều chi tiết hơn `ls -l`, gồm cả timestamp
access/modify/change/birth):

```bash
$ stat /etc/passwd
  File: /etc/passwd
  Size: 3135      	Blocks: 8          IO Block: 4096   regular file
Device: 10302h/66306d	Inode: 1574873     Links: 1
Access: (0644/-rw-r--r--)  Uid: (    0/    root)   Gid: (    0/    root)
Access: 2026-10-05 07:50:31.336999992 +0700
Modify: 2026-06-30 09:47:50.796163076 +0700
Change: 2026-06-30 09:47:50.797163118 +0700
 Birth: 2026-06-30 09:47:50.795163035 +0700
```

`Uid`/`Gid` đều là `root` — đúng vai trò `/etc/passwd` là file cấu hình hệ thống, user thường
chỉ đọc (`r--` ở nhóm other) không sửa được, dù AI cũng đọc được (cần đọc được để các lệnh như
`id`, `whoami` hoạt động).

## 5. Lỗi thường gặp và cách chẩn đoán

**Không `cd` vào được một thư mục dù `ls -l` cho thấy có quyền `r` ở nhóm liên quan**
- Nguyên nhân: nhầm `r` (list được tên file) với `x` (đi vào/truy cập được nội dung) — hai bit
  khác nhau, không suy ra lẫn nhau.
- Cách xác nhận: `ls -ld <thư mục>` xem kỹ cả 3 bit — thiếu `x` ở đúng nhóm (owner/group/
  other tương ứng với user đang thao tác) là nguyên nhân.
- Cách xử lý: thêm `x` cho nhóm phù hợp (`chmod +x` hoặc cụ thể hơn
  `chmod u+x`/`g+x`/`o+x` tuỳ nhóm cần), không thêm tràn lan cho mọi nhóm nếu không cần.

**Copy file cấu hình từ máy A sang máy B, ứng dụng không đọc được dù file "trông giống nhau"**
- Nguyên nhân: quyền file có thể không giữ nguyên qua một số cách copy (ví dụ qua trình quản lý
  file GUI, hoặc một số công cụ sync không mặc định giữ permission), hoặc owner/group đổi vì
  UID/GID của cùng tên user khác nhau giữa hai máy.
- Cách xác nhận: `stat <file>` trên cả hai máy, so sánh `Uid`/`Gid`/phần quyền — không chỉ tin
  vào việc "copy xong trông giống".
- Cách xử lý: dùng `rsync -a` (giữ nguyên permission/owner khi có quyền) hoặc set lại tay bằng
  `chmod`/`chown` sau khi copy, xác nhận UID/GID khớp ý định trên máy đích.

**Nhiều user cùng chia sẻ một thư mục ghi chung, file của người này bị người khác xoá nhầm**
- Nguyên nhân: thư mục chia sẻ không có sticky bit — quyền `w` trên thư mục mặc định cho phép
  XOÁ bất kỳ file bên trong, không phân biệt ai là owner của từng file.
- Cách xác nhận: `ls -ld <thư mục chia sẻ>` không thấy `t` ở cuối chuỗi quyền.
- Cách xử lý: thêm sticky bit (`chmod +t <thư mục>`) — từ đó chỉ owner của từng file (hoặc
  root) mới xoá/rename được nó, giống cách `/tmp` được bảo vệ.

## 6. Tình huống thực tế

Một ứng dụng nội bộ ghi log vào `/var/log/myapp/app.log`, chạy dưới user service riêng
(`myapp`), nhưng sau khi deploy lại trên server mới, ứng dụng báo lỗi
`PermissionError: [Errno 13] Permission denied: '/var/log/myapp/app.log'`.

1. `stat /var/log/myapp` — thấy thư mục có `Uid: (1001/olduser)`, không phải `myapp` như mong
   đợi — khả năng cao thư mục được tạo thủ công bởi một kỹ sư khác (dùng user cá nhân của họ,
   UID 1001) trong lần setup trước, chứ không phải do service tự tạo đúng owner.
2. Đối chiếu đúng vai trò FHS: `/var/log/<tên-app>/` là vị trí ĐÚNG theo FHS cho log của một
   ứng dụng cụ thể — vấn đề không phải vị trí sai, mà là OWNER sai.
3. `ls -ld /var/log/myapp` xác nhận thêm: quyền `750`, group không khớp group của user
   `myapp` — ứng dụng (chạy dưới `myapp`) không nằm trong owner/group được phép viết.
4. Sửa: `chown -R myapp:myapp /var/log/myapp` để owner khớp đúng user chạy service, giữ quyền
   `750` (chỉ owner viết được, group đọc được cho mục đích giám sát, other không truy cập được
   — hợp lý cho log có thể chứa thông tin nhạy cảm).
5. Restart service, xác nhận log ghi được bình thường.
6. Ghi vào checklist deploy: script/playbook tạo thư mục log PHẢI tự `chown` đúng user service
   ngay khi tạo (`mkdir -p` + `chown` trong cùng bước), không dựa vào việc kỹ sư nhớ làm tay —
   đây chính là nguyên nhân gốc khiến lỗi này xảy ra lại trên server mới.

## 7. Tự kiểm tra

1. Một thư mục có quyền `r-x------` cho owner. User chính là owner của thư mục đó có `ls` được
   danh sách file bên trong không? Có đọc được NỘI DUNG một file cụ thể bên trong (giả sử file
   đó có quyền `rw-------` và cùng owner) không?
   <details><summary>Đáp án</summary>Có thể <code>ls</code> (có <code>r</code> trên thư mục —
   liệt kê được tên). Có đọc được nội dung file (có <code>x</code> trên thư mục để truy cập
   được vào, và file đó có <code>r</code> cho owner) — cả hai hành động đều được phép với bộ
   quyền này.</details>

2. `umask` đang là `0022`. File mới tạo sẽ có quyền gì? Thư mục mới tạo sẽ có quyền gì?
   <details><summary>Đáp án</summary>File: <code>666 - 022 = 644</code> (<code>rw-r--r--</code>).
   Thư mục: <code>777 - 022 = 755</code> (<code>rwxr-xr-x</code>).</details>

3. Vì sao backup hệ thống thường ưu tiên `/etc`, `/home`, `/var` mà không cần backup
   `/usr`, `/bin`?
   <details><summary>Đáp án</summary><code>/usr</code>/<code>/bin</code> chứa chương trình/thư
   viện có thể TÁI TẠO LẠI hoàn toàn từ package manager (cài lại gói). <code>/etc</code>
   (cấu hình riêng của máy), <code>/home</code> (dữ liệu người dùng), <code>/var</code> (log,
   dữ liệu service) chứa thông tin KHÔNG tái tạo được từ bất kỳ đâu khác ngoài chính bản
   backup.</details>

4. Một thư mục chia sẻ cho nhiều user có quyền `drwxrwxrwt`. Ký tự `t` cuối cùng có ý nghĩa gì,
   và nó thay đổi hành vi xoá file như thế nào so với không có nó?
   <details><summary>Đáp án</summary><code>t</code> là sticky bit. Không có nó, bất kỳ ai có
   quyền <code>w</code> trên thư mục đều xoá được MỌI file bên trong, bất kể ai là owner của
   file đó. Có sticky bit, chỉ owner của TỪNG FILE (hoặc root) mới xoá/rename được file đó, dù
   thư mục vẫn cho phép mọi người viết file mới vào.</details>

5. Một service chạy dưới user `svc_app` báo lỗi "Permission denied" khi ghi vào một thư mục log
   vừa được tạo bằng `mkdir -p` bởi một kỹ sư dùng user cá nhân của họ. Nguyên nhân khả năng
   cao nhất là gì, và lệnh nào sửa đúng vấn đề đó?
   <details><summary>Đáp án</summary>Thư mục được tạo với owner là user cá nhân của kỹ sư (vì
   <code>mkdir</code> không tự biết service nào sẽ dùng thư mục), không phải
   <code>svc_app</code> — service không có quyền viết. Sửa bằng
   <code>chown svc_app:svc_app &lt;thư-mục&gt;</code> (và kiểm tra lại mode phù hợp nếu
   cần).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.filesystem-storage.troubleshooting` — chẩn đoán khi filesystem đầy, liên quan trực
  tiếp tới việc hiểu đúng vai trò từng thư mục FHS (`/var` thường là nơi đầy trước tiên vì log/
  cache tăng dần).

**Bài liên quan ngoài module:**
- `linux.users-permissions.chmod-chown` — đi sâu hơn về `chmod`/`chown`, ACL, SUID/SGID (module
  khác, chuyên về user/permission).

**Nguồn tham khảo:**
- [hier(7) — man7.org](https://man7.org/linux/man-pages/man7/hier.7.html) — định nghĩa chính
  thức vai trò từng thư mục trong FHS.
