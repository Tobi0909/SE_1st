---
id: linux.users-permissions.selinux-apparmor
title: "SELinux/AppArmor: enforcing/permissive, chẩn đoán bị chặn bởi MAC"
domain: linux
module: linux.users-permissions
level: "chuyên sâu"
prerequisites: ["linux.users-permissions.chmod-chown"]
applies_to:
  - "AppArmor (Ubuntu 22.04 LTS, mặc định bật) — SELinux dùng minh hoạ (RHEL/Rocky/CentOS mặc định)"
status: draft
sources:
  - "https://www.man7.org/linux/man-pages/man8/setenforce.8.html"
  - "https://manpages.ubuntu.com/manpages/jammy/man7/apparmor.7.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** máy viết bài là Ubuntu, dùng AppArmor làm MAC mặc định (phần
> AppArmor chạy lệnh thật). SELinux không có trên máy này (mặc định của RHEL/Rocky/CentOS,
> khác distro) — phần SELinux dùng **output minh hoạ** theo tài liệu/kiến thức phổ biến về
> `getenforce`/`setenforce`/`ls -Z`, đánh dấu rõ trong bài.

## 1. Vì sao cần biết

"Permission denied" dù `ls -l` cho thấy quyền rwx hoàn toàn đúng — đây là một trong những lỗi
gây mất thời gian debug nhiều nhất với người mới gặp MAC (Mandatory Access Control) lần đầu.
DAC (Discretionary Access Control — rwx/ACL đã học ở các bài trước) và MAC (SELinux/AppArmor)
là HAI LỚP KIỂM TRA ĐỘC LẬP, một request phải qua CẢ HAI mới được phép — permission đúng không
đảm bảo MAC cũng cho qua. Hiểu đúng cách chẩn đoán "bị chặn bởi MAC" là kỹ năng bắt buộc trên
mọi server RHEL-family (SELinux mặc định bật) và ngày càng phổ biến trên Ubuntu/Debian
(AppArmor mặc định bật từ nhiều phiên bản gần đây).

## 2. Khái niệm cốt lõi

| | SELinux | AppArmor |
|---|---|---|
| Cơ chế | LABEL-based — gắn "security context" (`user:role:type:level`) vào MỖI file/process | PATH-based — profile gắn theo ĐƯỜNG DẪN chương trình (ví dụ `/usr/sbin/nginx`) |
| Lưu ở đâu | Extended attribute `security.selinux` trên inode | File profile riêng trong `/etc/apparmor.d/`, không đụng tới inode |
| Distro mặc định | RHEL, Rocky, CentOS, Fedora | Ubuntu, Debian, SUSE |
| Chế độ "học, không chặn" | `permissive` | `complain` |
| Chế độ chặn thật | `enforcing` | `enforce` |

Cả hai đều có một chế độ TRUNG GIAN hữu ích khi viết/debug policy mới: ghi log việc GÌ SẼ bị
chặn, nhưng KHÔNG thực sự chặn — dùng để kiểm tra policy mới có quá chặt không trước khi bật
chế độ chặn thật.

## 3. Cách nó hoạt động

**SELinux gắn label VÀO INODE — di chuyển/copy file có thể làm MẤT hoặc SAI label**: vì label
SELinux là một xattr lưu trên inode, một file copy sang vị trí khác (`cp`) thường nhận label
THEO QUY TẮC CỦA THƯ MỤC ĐÍCH (gọi là "relabeling" tự động dựa trên policy đường dẫn), nhưng
`mv` trong CÙNG filesystem thường GIỮ NGUYÊN label cũ của file (vì về bản chất chỉ đổi tên
entry, không tạo inode mới) — đây là lý do kinh điển "di chuyển file cấu hình web server vào
đúng thư mục nhưng service vẫn không đọc được" (label cũ không khớp với label mà SELinux policy
mong đợi cho vị trí mới). AppArmor KHÔNG gặp vấn đề này vì profile gắn theo path của CHƯƠNG
TRÌNH đang chạy, không gắn theo file dữ liệu nó truy cập.

**AppArmor dễ bị "lách" qua hard link/mount trick hơn SELinux** — đánh đổi của việc path-based:
nếu một chương trình bị confine theo profile giới hạn truy cập `/var/www`, về lý thuyết tạo
một hard link hoặc bind mount để "nhìn thấy" dữ liệu đó ở một PATH KHÁC không bị policy chặn có
thể bypass được kiểm soát (tuỳ cấu hình profile cụ thể có đủ chặt không). **Lưu ý quan trọng:**
đây KHÔNG phải lỗ hổng "miễn phí" — để tạo hard link tới một file, vẫn cần đủ quyền DAC (rwx)
trên file/thư mục đó từ trước; tình huống thực tế thường là một chương trình ĐÃ BỊ compromise
(qua lỗ hổng khác) rồi tự lợi dụng kỹ thuật này để mở rộng phạm vi truy cập, không phải cách
"bypass AppArmor dễ dàng" nói chung cho người chưa có quyền gì. SELinux (label theo
inode, không theo path) không có đúng lỗ hổng loại này vì label đi theo chính file/inode, không
quan tâm truy cập qua đường dẫn nào.

**Cả hai hệ thống đều có LOG RIÊNG, KHÁC với log lỗi ứng dụng thông thường** — đây là lý do SE
mới hay "tìm sai chỗ" khi debug: ứng dụng bị MAC chặn thường chỉ thấy "Permission denied" chung
(ứng dụng không biết bị chặn bởi MAC hay bởi permission DAC thường), còn LÝ DO THẬT (rule nào
trong profile/policy chặn) chỉ nằm trong log của chính SELinux/AppArmor (qua `audit.log`/
`journalctl`, tìm theo từ khóa `avc:` cho SELinux hoặc `apparmor=` cho AppArmor) — không nằm
trong log ứng dụng.

## 4. Thực hành

Kiểm tra AppArmor THẬT đang chạy trên máy (chạy thật — kernel module + service, không cần
quyền root cho các lệnh đọc trạng thái cơ bản này):

```bash
$ cat /sys/module/apparmor/parameters/enabled
Y
$ systemctl status apparmor --no-pager
● apparmor.service - Load AppArmor profiles
     Loaded: loaded (/lib/systemd/system/apparmor.service; enabled; vendor preset: enabled)
     Active: active (exited) since Mon 2026-10-05 07:50:31 +07; 7h ago
       Docs: man:apparmor(7)
   Main PID: 578 (code=exited, status=0/SUCCESS)
```

`Active: active (exited)` — bình thường cho loại service này: nhiệm vụ của nó là NẠP profile
lúc boot rồi thoát (profile sau đó được kernel tự enforce liên tục, không cần service này tiếp
tục chạy nền).

Xem profile nào đang ở chế độ nào (cần quyền root để xem đầy đủ danh sách — chạy thật, kết quả
phụ thuộc quyền hiện tại):

```bash
$ aa-status
You do not have enough privilege to read the profile set.
apparmor module is loaded.
```

Xác nhận module đã load (đúng với `cat /sys/module/.../enabled` ở trên) nhưng cần `sudo
aa-status` để xem chi tiết từng profile đang `enforce` hay `complain`.

SELinux (**output minh hoạ** — máy viết bài dùng AppArmor, không có SELinux để chạy thật):

```bash
$ getenforce
Enforcing
$ ls -Z /var/www/html/index.html
unconfined_u:object_r:httpd_sys_content_t:s0 /var/www/html/index.html
```

Đổi tạm sang permissive để debug (minh hoạ) MÀ KHÔNG reboot — hữu ích khi nghi ngờ SELinux
chặn một hành vi, muốn xác nhận NHANH trước khi sửa policy đúng cách:

```bash
$ setenforce 0        # tạm chuyển permissive, chỉ tồn tại tới lần reboot sau
$ getenforce
Permissive
```

Tìm log SELinux chặn gì (minh hoạ, từ khoá `avc:` là dấu hiệu nhận biết):

```bash
$ sudo ausearch -m avc -ts recent
type=AVC msg=audit(...): avc:  denied  { write } for  pid=1234 comm="httpd" ...
    scontext=system_u:system_r:httpd_t:s0 tcontext=unconfined_u:object_r:user_home_t:s0
```

Đọc: process `httpd` (context `httpd_t`) bị chặn `write` vào một file có context
`user_home_t` — đúng loại lỗi kinh điển "web server không ghi được vào thư mục home của user"
vì SELinux coi hai context này không được phép tương tác theo policy mặc định.

## 5. Lỗi thường gặp và cách chẩn đoán

**`chmod 777` cả thư mục, service vẫn báo Permission denied — "đã mở hết quyền sao vẫn lỗi"**
- Nguyên nhân: đây CHÍNH XÁC là tình huống mục 1 nêu ra — DAC (permission) đã đúng/mở hết,
  nhưng MAC (SELinux/AppArmor) riêng biệt vẫn chặn. Mở permission DAC không có tác dụng gì với
  lớp MAC.
- Cách xác nhận: SELinux — `sudo ausearch -m avc -ts recent` (hoặc `dmesg | grep avc`) ngay
  sau khi tái hiện lỗi; AppArmor — `dmesg | grep apparmor` hoặc `journalctl` tìm
  `apparmor="DENIED"`.
- Cách xử lý: sửa ĐÚNG lớp bị chặn — SELinux: `restorecon` (khôi phục label đúng theo policy)
  hoặc tạo policy module riêng nếu hành vi đó NÊN được phép; AppArmor: sửa profile tương ứng
  trong `/etc/apparmor.d/`, thêm rule cho phép đúng path cần.

**Di chuyển file cấu hình web server vào thư mục đích bằng `mv`, service không đọc được dù
permission đúng (chỉ xảy ra trên hệ thống SELinux)**
- Nguyên nhân: như giải thích ở mục 3, `mv` trong cùng filesystem giữ nguyên label CŨ (không
  tự relabel), label cũ không khớp context mà policy mong đợi cho vị trí mới.
- Cách xác nhận: `ls -Z <file>` so sánh với context của các file khác ĐÃ Ở ĐÚNG vị trí đó từ
  trước — label khác biệt là dấu hiệu rõ ràng.
- Cách xử lý: `restorecon -v <file>` (gán lại label đúng theo policy cho đường dẫn hiện tại),
  hoặc dùng `cp` + xoá file gốc thay vì `mv` nếu cần tự động relabel theo đích.

**Tắt hẳn SELinux/AppArmor ("disabled") để "cho dễ debug", quên bật lại**
- Nguyên nhân: tắt hoàn toàn (không phải permissive/complain) là cách "chữa cháy" nhanh nhưng
  xoá bỏ toàn bộ lớp bảo vệ MAC — rủi ro bảo mật nghiêm trọng nếu để vậy lâu dài trên production.
- Cách xác nhận: `getenforce` trả `Disabled`, hoặc `aa-status` báo module không loaded.
- Cách xử lý: LUÔN dùng `permissive`/`complain` (ghi log, không chặn) để debug tạm thời, KHÔNG
  BAO GIỜ dùng `disabled` trên production trừ trường hợp bắt buộc có lý do rõ ràng và kế hoạch
  bật lại ngay; permissive/complain đủ để xác nhận giả thuyết "có phải MAC đang chặn không" mà
  không mất hẳn lớp bảo vệ.

## 6. Tình huống thực tế

Một web server mới deploy trên RHEL báo lỗi 403 khi serve file tĩnh, dù `ls -l` xác nhận
permission `644` (đọc được cho mọi người) và owner đúng là user chạy service.

1. `getenforce` — xác nhận `Enforcing`, nghi ngờ ngay đây là vấn đề SELinux (đúng thói quen
   nên hình thành khi làm việc trên RHEL-family — luôn kiểm tra SELinux SỚM khi gặp
   "Permission denied" vô lý).
2. `ls -Z /var/www/html/newfile.html` — thấy context khác biệt so với các file tĩnh khác đang
   hoạt động bình thường trong cùng thư mục (ví dụ `admin_home_t` thay vì `httpd_sys_content_t`
   mong đợi).
3. Xác định nguyên nhân: file này được TẠO bởi một admin ở thư mục home cá nhân rồi `mv` sang
   `/var/www/html` — đúng kịch bản kinh điển ở mục 5, label cũ (`admin_home_t`, gắn với thư
   mục home) đi theo file, không tự đổi thành context web server mong đợi.
4. Xác nhận bằng log: `sudo ausearch -m avc -ts recent` thấy dòng `avc: denied { read } ...
   tcontext=...admin_home_t...` — khớp đúng giả thuyết.
5. Sửa: `restorecon -v /var/www/html/newfile.html` — SELinux tự gán lại context ĐÚNG theo
   policy cho đường dẫn hiện tại (`httpd_sys_content_t`), không cần biết tay tên context chính
   xác.
6. Test lại, file serve được bình thường. Ghi vào runbook: trên server RHEL-family, file cấu
   hình/nội dung web PHẢI được tạo/copy TRỰC TIẾP vào đúng vị trí cuối (hoặc chạy `restorecon`
   ngay sau khi di chuyển), không nên soạn ở thư mục home rồi `mv` sang — thói quen này gây lỗi
   SELinux lặp lại nhiều lần với các admin chưa quen.

## 7. Tự kiểm tra

1. `ls -l` cho thấy một file có quyền `777` (mọi người đọc/viết/thực thi), nhưng một service
   vẫn báo "Permission denied" khi truy cập nó trên server RHEL. Giả thuyết cần kiểm tra ngay
   là gì?
   <details><summary>Đáp án</summary>SELinux đang ở chế độ <code>Enforcing</code> và chặn qua
   lớp MAC (label/context), độc lập hoàn toàn với permission DAC đã mở hết. Kiểm tra bằng
   <code>getenforce</code> rồi tìm log qua <code>ausearch -m avc</code>.</details>

2. Phân biệt chế độ `permissive` (SELinux) / `complain` (AppArmor) với `disabled`/tắt hẳn — vì
   sao nên ưu tiên cái trước khi debug?
   <details><summary>Đáp án</summary><code>permissive</code>/<code>complain</code> vẫn GHI LOG
   những gì SẼ bị chặn nhưng KHÔNG thực sự chặn — giữ được thông tin chẩn đoán và vẫn còn một
   phần giám sát. <code>disabled</code>/tắt hẳn xoá bỏ HOÀN TOÀN lớp bảo vệ, không ghi log gì
   nữa, và dễ bị quên bật lại, rủi ro bảo mật lâu dài.</details>

3. Một file được `mv` (không phải `cp`) từ thư mục home sang `/var/www/html` trên hệ thống
   SELinux. Context của file này sau khi `mv` là gì?
   <details><summary>Đáp án</summary>Giữ NGUYÊN context cũ (gắn với thư mục home gốc), KHÔNG
   tự đổi thành context mong đợi cho vị trí mới — vì <code>mv</code> trong cùng filesystem chỉ
   đổi tên entry, không tạo inode mới để trigger relabel tự động.</details>

4. Vì sao AppArmor được coi là dễ "lách" qua hard link/mount trick hơn SELinux, xét về mặt
   kiến trúc?
   <details><summary>Đáp án</summary>AppArmor xác định quyền DỰA THEO ĐƯỜNG DẪN (path-based) —
   nếu một chương trình truy cập cùng dữ liệu qua một đường dẫn khác (hard link/bind mount)
   không nằm trong phạm vi profile, kiểm soát có thể bị bỏ qua. SELinux gắn label THEO INODE
   (label-based) — label đi theo chính file, không quan tâm truy cập qua đường dẫn nào, nên
   không có đúng lỗ hổng kiểu này.</details>

5. Log lỗi của chính ứng dụng web server chỉ ghi "403 Forbidden" chung, không nói rõ nguyên
   nhân. Nên tìm thông tin chi tiết về việc MAC có chặn hay không ở đâu?
   <details><summary>Đáp án</summary>Trong log RIÊNG của hệ thống MAC, không phải log ứng dụng
   — SELinux: <code>ausearch -m avc</code>/<code>dmesg | grep avc</code>; AppArmor:
   <code>journalctl</code>/<code>dmesg</code> tìm <code>apparmor="DENIED"</code>. Ứng dụng
   thường không "biết" nó bị MAC chặn, chỉ thấy syscall thất bại và báo lỗi chung.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.users-permissions.acl-xattr` — SELinux lưu context qua xattr namespace `security.*`
  đã nhắc tới ở bài trước, đây là một ứng dụng cụ thể của cơ chế đó.
- `linux.users-permissions.chmod-chown` — nền tảng DAC (permission truyền thống) mà MAC hoạt
  động SONG SONG, không thay thế.

**Nguồn tham khảo:**
- [setenforce(8) — man7.org](https://www.man7.org/linux/man-pages/man8/setenforce.8.html) —
  cú pháp chuyển enforcing/permissive, xác nhận thay đổi không tồn tại qua reboot.
- [apparmor(7) — manpages.ubuntu.com](https://manpages.ubuntu.com/manpages/jammy/man7/apparmor.7.html)
  — định nghĩa chính thức AppArmor, chế độ enforce/complain, vị trí lưu profile
  (`/etc/apparmor.d/`).
