---
id: linux.users-permissions.chmod-chown
title: "Permission và ownership: chmod, chown, umask"
domain: linux
module: linux.users-permissions
level: "nền tảng"
prerequisites: ["linux.users-permissions.users-groups"]
applies_to:
  - "Ubuntu 22.04 LTS — chmod/chown (coreutils), hành vi SUID/SGID chuẩn POSIX"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man1/chmod.1.html"
  - "https://man7.org/linux/man-pages/man1/chown.1.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Bài `linux.filesystem-storage.fhs-permissions` đã giới thiệu permission cơ bản (rwx, umask,
sticky bit) ở mức đọc-hiểu. Bài này tập trung vào THAO TÁC THỰC SỰ: cách `chmod`/`chown` hoạt
động chi tiết (numeric vs symbolic mode, đệ quy), và hai bit đặc biệt chưa nói tới —
**SUID**/**SGID** — cơ chế đứng sau một số lệnh "lạ" như `passwd` (user thường đổi được mật
khẩu của chính mình dù `/etc/shadow` chỉ root mới viết được).

## 2. Khái niệm cốt lõi

Hai cách biểu diễn mode cho `chmod`, tương đương nhau:

| Kiểu | Ví dụ | Ý nghĩa |
|---|---|---|
| Numeric (octal) | `chmod 750 file` | Đặt CHÍNH XÁC owner=rwx, group=r-x, other=--- |
| Symbolic | `chmod u+x,g-w file` | THAY ĐỔI TƯƠNG ĐỐI — chỉ sửa bit được nêu, giữ nguyên bit khác |

Hai bit đặc biệt (ngoài rwx thường, cộng thêm vào octal như chữ số thứ 4 phía trước):

| Bit | Octal | Trên FILE thực thi | Trên THƯ MỤC |
|---|---|---|---|
| SUID | `4___` | Chạy với quyền OWNER của file, không phải người chạy nó | Không có tác dụng |
| SGID | `2___` | Chạy với quyền GROUP của file | File/thư mục mới tạo bên trong KẾ THỪA group của thư mục cha |

`chown` đổi owner (và group nếu dùng `user:group`):

```
chown newowner file           # chỉ đổi owner
chown newowner:newgroup file  # đổi cả owner và group
chgrp newgroup file           # chỉ đổi group (tương đương chown :newgroup)
```

## 3. Cách nó hoạt động

**Numeric mode SET TUYỆT ĐỐI, symbolic mode SỬA TƯƠNG ĐỐI — chọn sai kiểu dễ gây lỗi khó
lường**: `chmod 750 file` LUÔN cho kết quả giống nhau bất kể mode trước đó của file là gì (ghi
đè hoàn toàn). `chmod u+x file` chỉ THÊM bit `x` cho owner, giữ nguyên mọi bit khác — an toàn
hơn khi không chắc mode hiện tại, nhưng không "tất định" như numeric nếu cần đảm bảo kết quả
chính xác. Dùng numeric khi biết chính xác mode mong muốn cuối cùng; dùng symbolic khi chỉ cần
sửa MỘT phần, không muốn vô tình đổi các bit khác.

**SUID là cơ chế đứng sau việc user thường đổi được mật khẩu của chính mình**: `/usr/bin/passwd`
cần VIẾT vào `/etc/shadow` (file chỉ root mới có quyền viết) để cập nhật hash mật khẩu mới.
Nếu chạy `passwd` với quyền user thường, nó sẽ không viết được `/etc/shadow`. Giải pháp: file
`passwd` được gắn bit SUID (owner là `root`) — khi BẤT KỲ user nào thực thi nó, process chạy
với quyền hiệu lực (effective UID) của OWNER file (`root`), không phải người gọi nó. Đây chính
xác là lý do tồn tại SUID: cho phép một chương trình CỤ THỂ, ĐÃ ĐƯỢC TIN TƯỞNG, tạm thời có
quyền cao hơn người chạy nó, nhưng CHỈ trong phạm vi logic chương trình đó cho phép (ví dụ
`passwd` chỉ cho sửa đúng mật khẩu CỦA CHÍNH người gọi, không cho sửa mật khẩu người khác dù
đang chạy với quyền root bên trong).

**SGID trên THƯ MỤC khác hoàn toàn SGID trên FILE thực thi** — đây là điểm hay nhầm nhất: SGID
trên một FILE THỰC THI nghĩa là "chạy với quyền group của file". SGID trên một THƯ MỤC lại
mang ý nghĩa khác hẳn: mọi file/thư mục con tạo MỚI bên trong sẽ tự động có GROUP giống thư mục
cha (thay vì group chính của user tạo ra nó như hành vi mặc định) — cơ chế này giải quyết đúng
vấn đề "thư mục dùng chung nhiều user, muốn mọi file mới tự động đúng group chia sẻ" mà không
cần mỗi user tự `chgrp` tay sau khi tạo file.

## 4. Thực hành

So sánh numeric và symbolic mode trên cùng một file (chạy thật trên máy):

```bash
$ touch /tmp/demo.txt && ls -l /tmp/demo.txt
-rw-rw-r-- 1 tuantm5 tuantm5 0 ... /tmp/demo.txt
$ chmod 640 /tmp/demo.txt && ls -l /tmp/demo.txt
-rw-r----- 1 tuantm5 tuantm5 0 ... /tmp/demo.txt
$ chmod u+x,g-r /tmp/demo.txt && ls -l /tmp/demo.txt
-rwx------ 1 tuantm5 tuantm5 0 ... /tmp/demo.txt
```

Dòng 2 (`640`) đặt TUYỆT ĐỐI. Dòng 3 (`u+x,g-r`) chỉ sửa 2 bit nêu rõ (thêm `x` cho owner, bỏ
`r` của group), giữ nguyên các bit khác — kết quả `rwx------` đúng vì owner đã có `rw` từ
trước, cộng thêm `x`; group từ `r--` (từ bước trước) bị bỏ `r` thành `---`.

Xem SUID THẬT trên hệ thống (ký tự `s` thay cho `x` ở vị trí quyền thực thi của owner):

```bash
$ ls -l /usr/bin/passwd
-rwsr-xr-x 1 root root 59976 ... /usr/bin/passwd
$ ls -l /usr/bin/sudo
-rwsr-xr-x 1 root root 232416 ... /usr/bin/sudo
```

Cả hai đều có `s` ở vị trí owner-execute — xác nhận cả `passwd` VÀ `sudo` đều chạy với quyền
root hiệu lực bất kể ai gọi, đúng khớp với mục 3.

Minh hoạ SGID trên thư mục (tạo 2 thư mục để so sánh — một có SGID, một không, cùng đổi group
thành `adm` trước khi tạo file bên trong):

```bash
$ mkdir sgid_demo && chgrp adm sgid_demo && chmod g+s sgid_demo
$ ls -ld sgid_demo
drwxrwsr-x 2 tuantm5 adm 4096 ... sgid_demo
$ touch sgid_demo/innerfile.txt && ls -l sgid_demo/innerfile.txt
-rw-rw-r-- 1 tuantm5 adm 0 ... sgid_demo/innerfile.txt

$ mkdir nosgid_demo && chgrp adm nosgid_demo
$ touch nosgid_demo/innerfile.txt && ls -l nosgid_demo/innerfile.txt
-rw-rw-r-- 1 tuantm5 tuantm5 0 ... nosgid_demo/innerfile.txt
```

Khác biệt RÕ RÀNG: file trong `sgid_demo` (có SGID, ký tự `s` ở vị trí group-execute) nhận
group `adm` (kế thừa từ thư mục cha), còn file trong `nosgid_demo` (không SGID) nhận group
CHÍNH của user tạo nó (`tuantm5`) — đúng khớp với giải thích ở mục 3, không phải suy đoán.

## 5. Lỗi thường gặp và cách chẩn đoán

**Dùng `chmod 777` để "sửa nhanh" lỗi permission, vô tình mở quyền cho MỌI người**
- Nguyên nhân: `777` cho phép owner/group/other đều đọc-viết-thực thi — thường "chữa được"
  triệu chứng ngay nhưng mở lỗ hổng bảo mật nghiêm trọng (bất kỳ user nào trên máy đều sửa/xoá
  được file đó).
- Cách xác nhận: `ls -l` thấy `rwxrwxrwx` — dấu hiệu rõ ràng của việc "chữa cháy" sai cách.
- Cách xử lý: luôn xác định ĐÚNG nguyên nhân (thường là owner/group sai, không phải bit quyền
  sai) trước khi đổi permission — set lại mode hợp lý (thường `644`/`664` cho file,
  `755`/`775` cho thư mục) sau khi đã sửa đúng owner/group.

**Thư mục chia sẻ nhóm, file mới tạo bởi các user khác nhau có group KHÁC NHAU, gây lỗi quyền
chéo**
- Nguyên nhân: thiếu SGID trên thư mục chia sẻ — mỗi user tạo file mới với GROUP CHÍNH của họ
  (khác nhau giữa các user), không tự đồng bộ theo group chia sẻ mong muốn.
- Cách xác nhận: `ls -l` trong thư mục đó thấy nhiều GROUP khác nhau giữa các file, dù chủ ý
  ban đầu là dùng chung một group.
- Cách xử lý: `chmod g+s <thư-mục>` NGAY từ khi tạo thư mục chia sẻ (file CŨ đã tạo trước đó
  cần `chgrp` lại tay một lần, SGID chỉ áp dụng cho file tạo SAU khi bật).

**Gắn SUID cho một script shell tự viết, mong nó chạy với quyền root nhưng không có tác dụng**
- Nguyên nhân: Linux kernel (từ lâu) KHÔNG áp dụng SUID cho script có shebang (`#!/bin/bash`...)
  vì lý do bảo mật (dễ bị khai thác qua race condition giữa lúc kernel đọc shebang và lúc
  thực thi) — SUID chỉ có tác dụng thật với BINARY thực thi, không phải script văn bản.
- Cách xác nhận: dù `ls -l` thấy `s` đúng vị trí, script khi chạy vẫn chỉ có quyền của người
  gọi, không phải owner.
- Cách xử lý: nếu thực sự cần nâng quyền cho một script, dùng `sudo` với rule cụ thể trong
  `/etc/sudoers` (xem bài `linux.users-permissions.sudo-pam`) thay vì trông chờ SUID trên
  script.

## 6. Tình huống thực tế

Team dev chia sẻ một thư mục `/srv/shared/releases` để nhiều kỹ sư cùng upload file release,
nhưng liên tục gặp lỗi "Permission denied" khi người này cố xoá/sửa file do người khác upload.

1. `ls -la /srv/shared/releases` — thấy các file có OWNER khác nhau (đúng, mỗi người upload
   file của mình) nhưng cũng GROUP khác nhau (`dev1`, `dev2`... — mỗi người group chính riêng)
   — đây là dấu hiệu thiếu SGID trên thư mục, không phải lỗi quyền file cụ thể.
2. Xác nhận: `ls -ld /srv/shared/releases` không thấy ký tự `s` ở vị trí group — xác nhận đúng
   thiếu SGID.
3. Giải pháp 2 bước: (a) `chmod g+s /srv/shared/releases` để file MỚI từ nay tự đúng group
   chung; (b) `chgrp -R releaseteam /srv/shared/releases` + `chmod -R g+rw
   /srv/shared/releases` MỘT LẦN để sửa toàn bộ file CŨ đã tồn tại (SGID không hồi tố cho file
   đã tạo trước đó).
4. Tạo group `releaseteam` riêng (nếu chưa có) và thêm toàn bộ kỹ sư liên quan vào group này
   (`usermod -aG releaseteam <user>` cho từng người, nhớ `-a` theo bài trước).
5. Kiểm tra lại: một kỹ sư khác upload file mới, xác nhận file đó TỰ ĐỘNG có group
   `releaseteam` (không cần `chgrp` tay), và mọi thành viên group đều sửa/xoá được.
6. Ghi vào runbook: MỌI thư mục dùng để nhiều user cùng ghi chung PHẢI có SGID + group chuyên
   dụng được tạo sẵn (không dùng group chính cá nhân của ai) ngay từ lúc setup, tránh lặp lại
   vấn đề này ở thư mục chia sẻ khác trong tương lai.

## 7. Tự kiểm tra

1. `chmod 640 file` và `chmod u=rw,g=r,o= file` có cho kết quả GIỐNG NHAU không?
   <details><summary>Đáp án</summary>Có — cả hai đều ĐẶT TUYỆT ĐỐI thành
   <code>rw-r-----</code>, chỉ khác cách viết (numeric vs symbolic với dấu <code>=</code>, đặt
   tuyệt đối từng nhóm thay vì chỉ thêm/bớt bit).</details>

2. Một file thực thi có owner là `root` và bit SUID được bật. User thường chạy file này. Quyền
   HIỆU LỰC của process đang chạy là của ai?
   <details><summary>Đáp án</summary>Của OWNER file (<code>root</code>), không phải của user
   thường đang gọi nó — đây chính là tác dụng của SUID.</details>

3. Vì sao gắn SUID cho một shell script (`#!/bin/bash`) không có tác dụng nâng quyền như mong
   đợi?
   <details><summary>Đáp án</summary>Kernel Linux không áp dụng SUID cho file có shebang (script
   văn bản), chỉ áp dụng cho BINARY thực thi thật, vì lý do bảo mật (tránh race condition khi
   kernel đọc shebang). Muốn nâng quyền có kiểm soát cho một script, phải dùng cơ chế khác như
   sudo rule cụ thể.</details>

4. Một thư mục chia sẻ có SGID bật TỪ HÔM NAY. Các file ĐÃ TẠO TRƯỚC KHI bật SGID có tự động
   đổi group theo thư mục không?
   <details><summary>Đáp án</summary>Không. SGID chỉ ảnh hưởng tới file/thư mục TẠO MỚI sau khi
   bật — file cũ giữ nguyên group như lúc tạo, cần <code>chgrp</code> tay (hoặc
   <code>chgrp -R</code>) một lần để đồng bộ nếu cần.</details>

5. Lệnh nào đổi CẢ owner VÀ group của một file trong một lệnh duy nhất?
   <details><summary>Đáp án</summary><code>chown newowner:newgroup file</code> (dùng dấu
   <code>:</code> phân tách owner và group trong cùng lệnh <code>chown</code>, không cần gọi
   riêng <code>chgrp</code>).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.users-permissions.users-groups` — tạo user/group dùng làm owner/group cho
  `chown`/`chgrp`.
- `linux.users-permissions.sudo-pam` — cách thay thế SUID-trên-script để nâng quyền có kiểm
  soát cho một lệnh cụ thể.

**Bài liên quan ngoài module:**
- `linux.filesystem-storage.fhs-permissions` — nền tảng rwx/umask/sticky bit mà bài này mở
  rộng thêm SUID/SGID và cơ chế `chmod`/`chown` chi tiết hơn.

**Nguồn tham khảo:**
- [chmod(1) — man7.org](https://man7.org/linux/man-pages/man1/chmod.1.html) — định nghĩa
  chính thức SUID/SGID, cú pháp numeric/symbolic mode.
- [chown(1) — man7.org](https://man7.org/linux/man-pages/man1/chown.1.html) — cú pháp đổi
  owner/group, dạng `owner:group`.
