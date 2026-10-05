---
id: linux.users-permissions.users-groups
title: "Quản lý user/group: useradd, usermod, /etc/passwd, /etc/shadow"
domain: linux
module: linux.users-permissions
level: "nền tảng"
prerequisites: []
applies_to:
  - "Ubuntu 22.04 LTS — useradd/usermod/groupadd (shadow-utils), format /etc/passwd chuẩn POSIX"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man8/useradd.8.html"
  - "https://man7.org/linux/man-pages/man8/usermod.8.html"
  - "https://man7.org/linux/man-pages/man5/shadow.5.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** tạo user/group thật là thao tác sửa đổi cơ sở dữ liệu người
> dùng hệ thống (`/etc/passwd`, `/etc/shadow`, `/etc/group`) — máy viết bài này là máy cá nhân
> thật của người dùng, không phải môi trường test dùng để demo xoá/tạo được. Lệnh
> `useradd`/`usermod`/`groupadd` trong mục 4 đánh dấu **output minh hoạ** theo cú pháp chính
> thức (`useradd(8)`); các lệnh ĐỌC (`id`, `groups`, `getent`) chạy thật trên máy.

## 1. Vì sao cần biết

Mọi quyền truy cập trên Linux (file, sudo, service) đều quy về MỘT câu hỏi: user này thuộc
group nào? Một lỗi phân quyền "khó hiểu" thường chỉ là user thiếu một group cần thiết (ví dụ
không vào được group `docker` nên không chạy `docker` được mà không cần `sudo`). Hiểu đúng
cách Linux lưu trữ và tra cứu thông tin user/group là nền tảng để debug nhanh mọi lỗi dạng này.

## 2. Khái niệm cốt lõi

Ba file văn bản thuần (không phải database nhị phân) lưu toàn bộ thông tin user/group:

| File | Chứa gì | Ai đọc được |
|---|---|---|
| `/etc/passwd` | UID, GID chính, home, shell, thông tin cơ bản của MỖI user | Mọi user (đọc được) |
| `/etc/shadow` | Mật khẩu đã hash + chính sách hết hạn | CHỈ root (640, owner root) |
| `/etc/group` | Danh sách group và THÀNH VIÊN PHỤ (supplementary members) | Mọi user (đọc được) |

Mỗi user có ĐÚNG MỘT group CHÍNH (primary group, ghi trong `/etc/passwd`) và CÓ THỂ thuộc nhiều
group PHỤ (supplementary groups, ghi trong `/etc/group`). Lệnh cốt lõi:

```
useradd -m -s /bin/bash -G <group1,group2> <username>   # tạo user mới
usermod -aG <group>  <username>                          # thêm vào group phụ (-a = append)
groupadd <groupname>                                      # tạo group mới
```

## 3. Cách nó hoạt động

**`/etc/passwd` tách biệt khỏi `/etc/shadow` vì lý do bảo mật lịch sử**: ngày xưa mật khẩu
hash nằm NGAY trong `/etc/passwd` — nhưng file này cần ĐỌC ĐƯỢC bởi mọi user (để các lệnh như
`ls -l` hiển thị đúng tên owner, `id` hoạt động...), nên hash mật khẩu "lộ" cho mọi người đọc
được bản mã hoá (dễ bị brute-force offline). Giải pháp: tách hash mật khẩu sang `/etc/shadow`,
giới hạn quyền đọc chỉ cho root — `/etc/passwd` vẫn đọc được cho mọi user nhưng không còn chứa
gì nhạy cảm.

**`usermod -aG` thiếu `-a` sẽ GHI ĐÈ toàn bộ group phụ, không phải "thêm vào"** — đây là lỗi
cực kỳ phổ biến và nguy hiểm: `usermod -G docker user1` (không có `-a`) đặt LẠI danh sách group
phụ của `user1` thành CHỈ `docker`, XOÁ mọi group phụ khác user đó đang có (ví dụ `sudo`, `adm`)
mà không cảnh báo gì. `-a` (append) mới đúng nghĩa "thêm vào", giữ nguyên các group hiện có.

**Thay đổi group chỉ có hiệu lực ở LẦN ĐĂNG NHẬP MỚI, không áp dụng ngay cho session đang mở**:
`usermod -aG` sửa file `/etc/group` ngay, nhưng session/process ĐANG CHẠY của user đó đã "chốt"
danh sách group tại thời điểm login — không tự đọc lại. Đây là lý do sau khi thêm user vào
group `docker`, user đó vẫn cần đăng xuất/đăng nhập lại (hoặc dùng `newgrp docker` cho session
hiện tại) mới dùng được quyền mới ngay, dù file đã đúng.

## 4. Thực hành

Xem thông tin user hiện tại — group CHÍNH và group PHỤ (chạy thật, lệnh đọc an toàn):

```bash
$ id
uid=1000(tuantm5) gid=1000(tuantm5) groups=1000(tuantm5),4(adm),24(cdrom),27(sudo),30(dip),46(plugdev),122(lpadmin),135(lxd),136(sambashare)
```

`gid=1000(tuantm5)` là group CHÍNH (trùng tên với user — quy ước phổ biến "user private group"
trên Debian/Ubuntu, mỗi user có group riêng cùng tên khi tạo mặc định). `groups=...` liệt kê
TẤT CẢ group (cả chính và phụ) — ví dụ user này thuộc `sudo` (được chạy sudo) và `lpadmin`
(quản lý máy in).

Tra cứu trực tiếp dòng thật trong `/etc/passwd` qua `getent` (cách đúng để tra cứu, hoạt động
cả khi hệ thống dùng LDAP/NIS thay vì chỉ file local — khác việc `grep` thẳng vào file):

```bash
$ getent passwd tuantm5
tuantm5:x:1000:1000:Tuantm5,,,:/home/tuantm5:/bin/bash
```

Đọc 7 trường theo đúng thứ tự chuẩn: `username:password-placeholder:UID:GID:comment:
home:shell` — trường thứ 2 luôn là `x` (chỉ báo "mật khẩu thật nằm trong `/etc/shadow`", không
còn được dùng để lưu hash trực tiếp như giải thích ở mục 3).

Tra cứu thành viên group (xác nhận user nào thuộc group `sudo`):

```bash
$ getent group sudo
sudo:x:27:tuantm5
```

Tạo user mới + thêm vào group phụ (**output minh hoạ** theo `useradd(8)`, không tự chạy trên
máy viết bài):

```bash
$ useradd -m -s /bin/bash -G docker,sudo newdev
$ id newdev
uid=1002(newdev) gid=1002(newdev) groups=1002(newdev),27(sudo),998(docker)
```

Thêm user đã có sẵn vào MỘT group phụ mới, KHÔNG làm mất group phụ cũ (chú ý `-a`, **output
minh hoạ**):

```bash
$ usermod -aG docker newdev
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Chạy `usermod -G docker user1` (quên `-a`), user1 bị mất quyền sudo ngay sau đó**
- Nguyên nhân: như giải thích ở mục 3, thiếu `-a` khiến lệnh GHI ĐÈ toàn bộ group phụ thành chỉ
  danh sách vừa chỉ định — mọi group phụ khác (bao gồm `sudo`) bị xoá khỏi user đó.
- Cách xác nhận: `id user1` (hoặc `getent group sudo` xem user1 còn trong đó không) cho thấy
  thiếu các group trước đó từng có.
- Cách xử lý: thêm lại từng group đã mất bằng `usermod -aG <group>` (luôn có `-a`); ghi nhớ
  quy tắc "luôn kèm `-a` trừ khi CHỦ ĐÍCH muốn reset toàn bộ group phụ".

**Vừa `usermod -aG docker` cho user hiện tại, chạy `docker ps` vẫn báo permission denied**
- Nguyên nhân: session terminal hiện tại đã "chốt" danh sách group từ lúc đăng nhập, không tự
  đọc lại `/etc/group` — đúng hành vi đã giải thích ở mục 3, không phải lỗi.
- Cách xác nhận: mở một terminal MỚI (hoặc SSH lại), `id` sẽ hiện group mới ngay.
- Cách xử lý: đăng xuất/đăng nhập lại, hoặc dùng `newgrp docker` để áp dụng ngay cho session
  hiện tại (chỉ ảnh hưởng session đó, không cần đăng nhập lại toàn bộ).

**Script tạo user hàng loạt không chỉ định `-m`, user không có home directory**
- Nguyên nhân: `useradd` theo mặc định trên nhiều distro KHÔNG tự tạo home directory trừ khi có
  cờ `-m`/`--create-home` (hành vi này có thể khác nhau tuỳ cấu hình `/etc/login.defs`, nên
  luôn chỉ định rõ `-m` thay vì trông chờ mặc định).
- Cách xác nhận: `getent passwd <user>` cho thấy đường dẫn home khai báo, nhưng `ls -ld
  <home>` báo "No such file or directory".
- Cách xử lý: `mkhomedir_helper <user>` hoặc tạo tay + `chown` đúng owner, nhưng tốt nhất là
  sửa script dùng `-m` ngay từ đầu để tránh phải vá sau.

## 6. Tình huống thực tế

Một kỹ sư mới được cấp quyền truy cập server, chạy `usermod -G sudo,docker newuser` để cấp cả
hai quyền cần thiết. Vài ngày sau, `newuser` báo không chạy được một script nội bộ cần quyền
group `appteam` mà trước đó họ ĐÃ được thêm vào bởi một đồng nghiệp khác.

1. `id newuser` — chỉ thấy `sudo` và `docker`, KHÔNG còn `appteam` — xác nhận group đó đã biến
   mất.
2. Kiểm tra lịch sử lệnh/log hệ thống (nếu có audit log các lệnh admin): xác nhận đúng là lệnh
   `usermod -G sudo,docker newuser` (thiếu `-a`) là nguyên nhân — đây đúng là lỗi phổ biến ở
   mục 5, vô tình ghi đè mất group `appteam` đã có từ trước.
3. Sửa ngay: `usermod -aG appteam newuser` (có `-a` lần này) để thêm lại group đã mất, không
   ảnh hưởng tới `sudo`/`docker` hiện có.
4. Soát lại toàn bộ group phụ đúng ý định ban đầu bằng `id newuser`, đối chiếu với danh sách
   quyền đã cấp cho user này trong hồ sơ onboarding.
5. Ghi vào runbook team: khi cần thêm group cho user ĐÃ CÓ sẵn group khác, LUÔN dùng
   `usermod -aG` (có `-a`), KHÔNG BAO GIỜ dùng `usermod -G` (không `-a`) trừ khi thực sự muốn
   reset toàn bộ danh sách group phụ về đúng danh sách mới chỉ định — thêm cảnh báo này vào
   checklist review trước khi chạy lệnh quản lý user trên server production.

## 7. Tự kiểm tra

1. Vì sao mật khẩu hash không còn lưu trực tiếp trong `/etc/passwd` dù file này vẫn có một
   trường ở vị trí đó (hiện là `x`)?
   <details><summary>Đáp án</summary><code>/etc/passwd</code> cần đọc được bởi MỌI user (để các
   lệnh như <code>ls -l</code>/<code>id</code> hoạt động), nên lưu hash mật khẩu trực tiếp ở
   đây sẽ lộ cho mọi người đọc được (dễ brute-force offline). Hash thật được tách sang
   <code>/etc/shadow</code>, chỉ root đọc được; trường <code>x</code> trong
   <code>/etc/passwd</code> chỉ là placeholder báo "xem /etc/shadow".</details>

2. Bạn chạy `usermod -G backup user1` cho một user đã thuộc sẵn `sudo` và `docker`. Sau lệnh
   này, `id user1` sẽ hiện những group nào?
   <details><summary>Đáp án</summary>CHỈ <code>backup</code> (và group chính của user1) — thiếu
   <code>-a</code> khiến lệnh GHI ĐÈ toàn bộ group phụ, xoá mất <code>sudo</code> và
   <code>docker</code> đã có trước đó.</details>

3. Sau khi thêm user vào group `docker` đúng cách (`usermod -aG`), user đó vẫn không chạy được
   `docker` trong terminal ĐANG MỞ. Đây có phải lỗi của lệnh `usermod` không?
   <details><summary>Đáp án</summary>Không. Lệnh đã đúng, chỉ là session/terminal đang mở đã
   "chốt" danh sách group từ lúc đăng nhập, không tự đọc lại <code>/etc/group</code>. Cần đăng
   nhập lại (terminal mới/SSH lại) hoặc dùng <code>newgrp docker</code> cho session hiện
   tại.</details>

4. Mỗi user có thể thuộc MẤY group chính (primary group) cùng lúc? Mấy group phụ?
   <details><summary>Đáp án</summary>Đúng MỘT group chính (ghi trong <code>/etc/passwd</code>,
   trường GID). Có thể thuộc NHIỀU group phụ (ghi trong <code>/etc/group</code>, không giới hạn
   cố định ngoài giới hạn hệ thống rất lớn).</details>

5. Vì sao nên dùng `getent passwd <user>` thay vì `grep <user> /etc/passwd` để tra cứu thông
   tin user trên một hệ thống lớn?
   <details><summary>Đáp án</summary><code>getent</code> tra cứu qua đúng cơ chế NSS (Name
   Service Switch) của hệ thống — hoạt động đúng cả khi thông tin user không chỉ nằm trong file
   local mà còn ở LDAP/NIS/AD (cấu hình qua <code>/etc/nsswitch.conf</code>).
   <code>grep</code> trực tiếp file CHỈ thấy được user cục bộ, bỏ lọt user quản lý qua hệ thống
   tập trung.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.users-permissions.chmod-chown` — dùng chính user/group vừa tạo để gán ownership file.
- `linux.users-permissions.sudo-pam` — group `sudo` (đã thấy ở mục 4) là cách phổ biến nhất
  cấp quyền sudo qua `/etc/sudoers` (`%sudo ALL=(ALL:ALL) ALL`).

**Nguồn tham khảo:**
- [useradd(8) — man7.org](https://man7.org/linux/man-pages/man8/useradd.8.html) — cú pháp tạo
  user, các cờ `-m`/`-s`/`-G`.
- [usermod(8) — man7.org](https://man7.org/linux/man-pages/man8/usermod.8.html) — cú pháp
  `-aG` (append group) vs `-G` (ghi đè).
- [shadow(5) — man7.org](https://man7.org/linux/man-pages/man5/shadow.5.html) — xác nhận
  `/etc/shadow` chỉ root đọc được, cấu trúc các trường.
