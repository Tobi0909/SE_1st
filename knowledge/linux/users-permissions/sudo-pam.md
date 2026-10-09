---
id: linux.users-permissions.sudo-pam
title: "sudo và PAM cơ bản: /etc/sudoers, module xác thực"
domain: linux
module: linux.users-permissions
level: "vận hành"
prerequisites: ["linux.users-permissions.users-groups"]
applies_to:
  - "sudo 1.9.x (Ubuntu 22.04 LTS), Linux-PAM"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man5/sudoers.5.html"
  - "https://man7.org/linux/man-pages/man5/pam.conf.5.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** sửa `/etc/sudoers` hoặc cấu hình PAM sai có thể khiến KHÔNG
> AI (kể cả root) sudo được, hoặc khoá hẳn đăng nhập trên máy thật đang dùng — máy viết bài này
> là máy cá nhân thật, không phải môi trường test dùng để demo sửa file này. Nội dung `visudo`/
> `pam.d` trong mục 4 đánh dấu **output minh hoạ** theo man page chính thức; các lệnh ĐỌC
> (`sudo -l`, `getent group sudo`) chạy thật.

## 1. Vì sao cần biết

"Ai được quyền làm gì với tư cách root" là câu hỏi bảo mật quan trọng nhất trên bất kỳ server
Linux nào. `sudo` không phải "bật/tắt" đơn giản — nó có một ngôn ngữ cấu hình chi tiết
(`/etc/sudoers`) cho phép cấp quyền CHÍNH XÁC tới từng lệnh, từng user, có thể yêu cầu hoặc bỏ
qua mật khẩu riêng cho từng rule. Phía dưới `sudo` (và mọi cơ chế xác thực khác trên Linux —
đăng nhập SSH, đổi mật khẩu...) đều chạy qua PAM (Pluggable Authentication Modules) — một
framework cho phép "lắp ráp" các bước xác thực khác nhau mà không cần sửa code từng chương
trình riêng lẻ.

## 2. Khái niệm cốt lõi

Cấu trúc một dòng rule trong `/etc/sudoers`, theo đúng man page:

```
who  where = (as_whom) what
```

Ví dụ: `ray  rushmore = NOPASSWD: /bin/kill, /bin/ls` — user `ray`, trên máy `rushmore`, không
cần mật khẩu, được chạy `/bin/kill` và `/bin/ls` (với quyền root theo mặc định nếu không chỉ
định khác). Group dùng tiền tố `%` (ví dụ `%sudo ALL=(ALL:ALL) ALL` — rule mặc định cấp toàn
quyền cho mọi user trong group `sudo` trên Ubuntu).

PAM chia công việc xác thực thành 4 LOẠI module, xếp thành "stack" (chuỗi) cho mỗi dịch vụ:

| Loại | Vai trò |
|---|---|
| `auth` | Xác minh "bạn là ai" (hỏi mật khẩu, vân tay...) |
| `account` | Kiểm tra điều kiện KHÔNG liên quan xác thực (tài khoản hết hạn? đủ quyền giờ này?) |
| `password` | Cập nhật thông tin xác thực (đổi mật khẩu) |
| `session` | Thiết lập môi trường trước/sau khi session bắt đầu (mount home, ghi log...) |

## 3. Cách nó hoạt động

**`visudo` không chỉ là "editor thường" — nó validate cú pháp TRƯỚC khi lưu**: sửa trực tiếp
`/etc/sudoers` bằng editor thường (`vi`/`nano`) có rủi ro: nếu gõ sai cú pháp và LƯU, `sudo` có
thể hỏng HOÀN TOÀN ngay lập tức (không ai `sudo` được nữa, kể cả để SỬA LẠI chính file đó —
một vòng lặp chết). `visudo` khoá file trong lúc sửa (tránh hai người sửa cùng lúc xung đột) VÀ
kiểm tra cú pháp trước khi cho phép lưu — nếu phát hiện lỗi, nó hỏi lại "giữ nguyên để sửa tiếp
hay bỏ thay đổi", không lưu file hỏng xuống đĩa.

**Control flag của PAM quyết định "fail có dừng ngay hay vẫn chạy tiếp các module khác"**: 4
giá trị chính:
- `required`: module này PHẢI thành công, nhưng nếu fail KHÔNG dừng ngay — vẫn chạy hết các
  module `required` khác trong stack trước khi báo fail cho user (tránh "rò" thông tin module
  nào fail qua thời gian phản hồi).
- `requisite`: giống `required` nhưng fail thì DỪNG NGAY, trả lỗi về cho ứng dụng tức thì.
- `sufficient`: module này THÀNH CÔNG là ĐỦ để qua cả stack (nếu chưa có `required` nào fail
  trước đó) — không cần chạy tiếp module sau. Fail thì BỎ QUA (không chặn), tiếp tục module kế.
- `optional`: kết quả module này chỉ quan trọng nếu nó là module DUY NHẤT trong stack cho
  loại đó.

**`sudo` mặc định CACHE quyền xác thực trong một khoảng thời gian (`timestamp_timeout`, mặc
định 15 phút)** — đây là lý do chạy `sudo` lệnh thứ hai ngay sau lệnh đầu KHÔNG hỏi lại mật
khẩu, dù mỗi lần gọi `sudo` về lý thuyết là một lần xác thực riêng. Hết 15 phút không dùng
`sudo` nào, lần gọi tiếp theo hỏi lại mật khẩu — đây là đánh đổi tiện lợi/an toàn có thể cấu
hình (`Defaults timestamp_timeout=<phút>`), không phải hành vi cố định.

## 4. Thực hành

Xem group `sudo` thật trên máy — cách phổ biến nhất Ubuntu/Debian cấp quyền sudo (chạy thật):

```bash
$ getent group sudo
sudo:x:27:tuantm5
```

User `tuantm5` thuộc group `sudo` — khớp với rule mặc định `%sudo ALL=(ALL:ALL) ALL` trong
`/etc/sudoers` (không cần rule riêng cho TỪNG user, chỉ cần thêm vào group).

Xem quyền sudo THẬT của user hiện tại qua `sudo -l` (yêu cầu nhập mật khẩu nếu chưa cache —
đây là hành vi ĐÚNG, không phải lỗi, vì máy này không cấu hình `NOPASSWD`):

```bash
$ sudo -ln
sudo: a password is required
```

Xác nhận: máy này YÊU CẦU mật khẩu cho sudo (không có rule `NOPASSWD` áp dụng cho user hiện
tại) — đúng với thiết lập mặc định an toàn của Ubuntu, khác với một số môi trường dev/CI cố ý
cấu hình `NOPASSWD` để tự động hoá (đánh đổi tiện lợi lấy rủi ro nếu máy đó bị truy cập trái
phép).

Thêm một rule cụ thể vào sudoers bằng `visudo` (**output minh hoạ**, không tự sửa trên máy
viết bài):

```
$ sudo visudo
# Thêm dòng mới ở cuối file:
deploy  ALL = NOPASSWD: /usr/bin/systemctl restart myapp
```

Rule này cho phép user `deploy` restart ĐÚNG MỘT service cụ thể, không cần mật khẩu, nhưng
KHÔNG được chạy bất kỳ lệnh `sudo` nào khác — phạm vi quyền hẹp hơn RẤT NHIỀU so với thêm user
vào group `sudo` (toàn quyền).

Cấu hình PAM mẫu cho một service (**output minh hoạ**, ví dụ rút gọn từ `/etc/pam.d/sshd`):

```
auth       required     pam_unix.so
account    required     pam_nologin.so
session    required     pam_limits.so
```

Đọc theo đúng nghĩa stack: để đăng nhập SSH thành công, PHẢI qua `pam_unix.so` (kiểm tra mật
khẩu) ở loại `auth`, PHẢI qua `pam_nologin.so` (kiểm tra file `/etc/nologin` có tồn tại không —
chặn đăng nhập khi hệ thống đang bảo trì) ở loại `account`, và thiết lập giới hạn resource qua
`pam_limits.so` ở loại `session`.

## 5. Lỗi thường gặp và cách chẩn đoán

**Sửa trực tiếp `/etc/sudoers` bằng `nano`/`vi`, gõ sai cú pháp, lưu — không ai sudo được nữa**
- Nguyên nhân: editor thường không validate cú pháp trước khi lưu — một lỗi nhỏ có thể làm
  `sudo` từ chối CHẠY BẤT KỲ LỆNH NÀO, kể cả để tự sửa lại chính file đó.
- Cách xác nhận: `sudo <lệnh-bất-kỳ>` báo lỗi parse ngay, không cho chạy gì.
- Cách xử lý: nếu còn quyền root qua đường khác (console vật lý, single-user mode), sửa lại
  bằng `visudo`; LUÔN dùng `visudo` để sửa từ đầu — đây là lý do nó tồn tại.

**Rule sudoers viết đúng cú pháp nhưng không có hiệu lực — lệnh mong đợi vẫn bị từ chối**
- Nguyên nhân phổ biến: rule bị một rule SAU trong file ghi đè (sudoers đọc tuần tự), hoặc
  đường dẫn lệnh trong rule không khớp chính xác đường dẫn thật.
- Cách xác nhận: `sudo -l` hiện toàn bộ rule áp dụng, kiểm tra thứ tự và đường dẫn.
- Cách xử lý: sắp rule hẹp phạm vi TRƯỚC rule rộng, dùng đường dẫn tuyệt đối xác nhận bằng
  `which <lệnh>` trước khi viết vào sudoers.

**Cấu hình PAM sai control flag, user hợp lệ vẫn bị từ chối đăng nhập**
- Nguyên nhân: nhầm `requisite` thành `sufficient` cho một module luôn fail trong môi trường cụ
  thể — với `requisite`, module fail đó CHẶN NGAY toàn bộ.
- Cách xác nhận: log PAM (qua syslog/auth.log) cho thấy module nào fail, đúng dòng trong stack.
- Cách xử lý: hiểu đúng 4 control flag trước khi sửa (mục 3) — test trên session/service phụ
  trước, không sửa trực tiếp PAM cho SSH trên server production là đường truy cập duy nhất.

## 6. Tình huống thực tế

Một CI/CD pipeline cần user `deploy` chạy được `systemctl restart myapp` tự động, không có
người nhập mật khẩu. Ban đầu một kỹ sư thêm `deploy` vào group `sudo` "cho tiện", nhưng audit
yêu cầu thu hẹp quyền.

1. Audit chỉ ra: group `sudo` cấp quyền chạy BẤT KỲ lệnh nào với quyền root — vượt xa nhu cầu
   (chỉ cần restart một service).
2. Thiết kế lại: gỡ `deploy` khỏi group `sudo` (`gpasswd -d deploy sudo`), thêm rule riêng qua
   `visudo`: `deploy ALL = NOPASSWD: /usr/bin/systemctl restart myapp` — chỉ đúng một lệnh.
3. Test: `sudo systemctl restart myapp` chạy được không cần mật khẩu; `sudo systemctl stop
   myapp` hoặc `sudo cat /etc/shadow` đều bị từ chối — đúng phạm vi hẹp như ý định.
4. `sudo -l -U deploy` xác nhận chính xác rule đang áp dụng, đối chiếu đúng với đã viết.
5. Document rule kèm lý do (phục vụ CI/CD) để audit sau không cần điều tra lại.
6. Nguyên tắc chung: user service tự động hoá LUÔN dùng rule sudoers hẹp theo đúng lệnh cần
   (least privilege), không thêm vào group `sudo` "cho tiện".

## 7. Tự kiểm tra

1. Một dòng sudoers: `%ops ALL = (root) /usr/bin/systemctl *`. Ai được chạy lệnh gì, với quyền
   của ai?
   <details><summary>Đáp án</summary>Mọi user thuộc group <code>ops</code>
   (<code>%ops</code>), trên mọi máy (<code>ALL</code>), được chạy bất kỳ lệnh con nào của
   <code>/usr/bin/systemctl</code> (dấu <code>*</code>), với quyền của <code>root</code> (chỉ
   định trong <code>(root)</code>).</details>

2. Vì sao nên dùng `visudo` thay vì `vi /etc/sudoers` trực tiếp, dù cả hai đều là "sửa file
   text"?
   <details><summary>Đáp án</summary><code>visudo</code> validate cú pháp TRƯỚC khi cho phép
   lưu, và khoá file tránh xung đột sửa đồng thời. Sửa trực tiếp bằng editor thường không có
   bước kiểm tra này — một lỗi cú pháp nhỏ khi lưu có thể làm hỏng <code>sudo</code> hoàn toàn
   cho MỌI user, kể cả chính người sửa.</details>

3. Phân biệt control flag `required` và `requisite` trong PAM — khác nhau ở điểm nào khi module
   đó FAIL?
   <details><summary>Đáp án</summary>Cả hai đều coi module đó là BẮT BUỘC phải thành công để cả
   stack qua được. Khác biệt: <code>required</code> fail thì KHÔNG dừng ngay — vẫn chạy hết các
   module khác trong stack trước khi báo lỗi cuối cùng. <code>requisite</code> fail thì DỪNG
   NGAY, trả lỗi về ứng dụng ngay lập tức, không chạy module nào sau đó nữa.</details>

4. Sau khi `sudo` một lệnh thành công, bạn chạy `sudo` lệnh thứ hai ngay sau đó và KHÔNG bị hỏi
   lại mật khẩu. Đây có phải lỗ hổng bảo mật không?
   <details><summary>Đáp án</summary>Không, đây là hành vi THIẾT KẾ của <code>sudo</code> —
   cache xác thực trong một khoảng thời gian (mặc định 15 phút, cấu hình qua
   <code>timestamp_timeout</code>). Đánh đổi tiện lợi lấy một khoảng rủi ro nhỏ nếu máy bị
   chiếm quyền truy cập trong khoảng cache đó — có thể cấu hình ngắn hơn hoặc tắt hẳn nếu cần
   an toàn cao hơn.</details>

5. Một user service cần tự động chạy MỘT lệnh cụ thể không cần mật khẩu trong pipeline CI/CD.
   Phương án nào phù hợp hơn: thêm vào group `sudo`, hay viết một rule riêng trong sudoers?
   <details><summary>Đáp án</summary>Viết rule riêng, hẹp phạm vi, CHỈ cho đúng lệnh cần (ví dụ
   với <code>NOPASSWD</code> cho riêng lệnh đó). Thêm vào group <code>sudo</code> cấp toàn
   quyền root cho MỌI lệnh — vi phạm nguyên tắc least privilege, rủi ro lớn hơn nhiều nếu tài
   khoản service đó bị lộ.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.users-permissions.users-groups` — group `sudo` là cách phổ biến nhất cấp quyền (rule
  mặc định `%sudo` đã thấy ở mục 4).
- `linux.users-permissions.chmod-chown` — SUID là cơ chế THAY THẾ (ở tầng file, không phải
  policy tập trung) cho một số nhu cầu nâng quyền đơn giản, nhưng sudoers linh hoạt và kiểm
  soát được (log, giới hạn lệnh) tốt hơn nhiều cho production.

**Nguồn tham khảo:**
- [sudoers(5) — man7.org](https://man7.org/linux/man-pages/man5/sudoers.5.html) — cú pháp đầy
  đủ rule sudoers, `NOPASSWD`, cú pháp group `%`.
- [pam.conf(5) — man7.org](https://man7.org/linux/man-pages/man5/pam.conf.5.html) — định
  nghĩa chính thức 4 loại module và 4 control flag của PAM.
