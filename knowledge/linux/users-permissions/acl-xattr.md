---
id: linux.users-permissions.acl-xattr
title: "ACL và extended attributes: quyền chi tiết hơn rwx truyền thống"
domain: linux
module: linux.users-permissions
level: "chuyên sâu"
prerequisites: ["linux.users-permissions.chmod-chown"]
applies_to:
  - "Ubuntu 22.04 LTS — ACL POSIX.1e (acl package), extended attributes (xattr), chattr (ext4)"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man5/acl.5.html"
  - "https://man7.org/linux/man-pages/man1/setfattr.1.html"
  - "https://man7.org/linux/man-pages/man1/chattr.1.html"
  - "https://man7.org/linux/man-pages/man1/chmod.1.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** phần ACL (`getfacl`/`setfacl`) chạy THẬT trên file tạm trong
> `/tmp` (an toàn, tự dọn ngay). Phần extended attribute (`getfattr`/`setfattr`) dùng **output
> minh hoạ** vì gói `attr` không có sẵn trên máy viết bài (quyết định không cài thêm gói cho
> module này, theo đúng tiền lệ module `linux.filesystem-storage`). Phần `chattr +i` có chạy
> thử thật — và thực tế bị từ chối vì cần quyền root, một kết quả THẬT minh hoạ đúng ý bài học.

## 1. Vì sao cần biết

rwx + owner/group/other (đã học ở các bài trước) chỉ cho phép phân quyền theo ĐÚNG 3 nhóm. Khi
cần cấp quyền CHO MỘT USER CỤ THỂ khác owner (ví dụ "chỉ user `audit` được đọc thêm file này,
không ai khác ngoài owner") mà không muốn tạo cả một group mới chỉ cho một trường hợp, ACL là
công cụ đúng. Extended attributes (xattr) đi xa hơn: lưu TRỮ SIÊU DỮ LIỆU tùy ý gắn với file
(không phải quyền truy cập) — nhiều công cụ hệ thống dùng xattr "âm thầm" (SELinux context,
capabilities...) mà SE cần biết để không bị bất ngờ khi `cp`/`tar` không giữ nguyên các thuộc
tính này.

## 2. Khái niệm cốt lõi

| Công cụ | Mục đích | Lệnh |
|---|---|---|
| ACL (POSIX.1e) | Cấp quyền rwx cho TỪNG user/group CỤ THỂ, ngoài owner/group/other | `getfacl`, `setfacl` |
| Extended attributes (xattr) | Lưu metadata tùy ý (namespace `user.*`, `trusted.*`, `security.*`, `system.*`) | `getfattr`, `setfattr` |
| File attributes (ext2/3/4) | Cờ đặc biệt ở tầng filesystem (immutable, append-only...) | `lsattr`, `chattr` |

Ba khái niệm DỄ NHẦM vì tên gần giống nhau nhưng cơ chế hoàn toàn khác: ACL là MỞ RỘNG của
permission truyền thống (vẫn là quyền đọc/viết/thực thi, chỉ chi tiết hơn theo user/group cụ
thể); xattr là metadata TÙY Ý (không nhất thiết liên quan quyền truy cập); file attributes là
CỜ ở TẦNG FILESYSTEM, độc lập hoàn toàn với permission/owner.

## 3. Cách nó hoạt động

**ACL được LƯU thực chất dưới dạng một xattr đặc biệt** (namespace `system.posix_acl_access`),
nhưng có GIAO DIỆN LỆNH riêng (`getfacl`/`setfacl`) vì đây là một chuẩn riêng (POSIX.1e) với
ngữ nghĩa cụ thể (ai đọc/viết/thực thi), không phải metadata tùy ý chung. Khi một file CÓ ACL
mở rộng (nhiều hơn 3 entry owner/group/other cơ bản), `ls -l` hiển thị thêm dấu `+` ngay sau
chuỗi quyền (`-rw-rw-r--+`) — dấu hiệu "còn có quyền chi tiết hơn, xem bằng `getfacl`", không
thể biết ĐẦY ĐỦ chỉ bằng `ls -l`.

**`mask` trong ACL giới hạn quyền HIỆU LỰC TỐI ĐA cho mọi entry (trừ owner/other)** — điểm hay
gây nhầm: thêm một ACL entry `user:alice:rwx` KHÔNG đảm bảo `alice` chắc chắn có đủ `rwx` — nếu
`mask` của file đó chỉ là `r--`, quyền HIỆU LỰC của `alice` bị CẮT XUỐNG còn `r--` (giao của
entry và mask), dù entry ghi rõ `rwx`. `setfacl` tự động tính lại `mask` hợp lý mỗi lần thêm
entry mới (thường là OR của mọi entry) trừ khi dùng cờ đặc biệt để cố định mask, nhưng hiểu rõ
tồn tại bước "cắt qua mask" này là cần thiết khi debug quyền ACL "không đúng như đã set".

**Extended attribute namespace `trusted`/`security` cần quyền CAP_SYS_ADMIN, khác `user`
(không cần quyền đặc biệt ngoài quyền viết file bình thường)**: namespace `user.*` ai có quyền
viết file đó đều set được (dùng cho mục đích tùy ý của ứng dụng, ví dụ lưu checksum, tag phân
loại). Namespace `security.*` (nơi SELinux lưu context) và `trusted.*` cần quyền ADMIN —
không phải ai cũng tự set được, đây là lý do một số thuộc tính hệ thống quan trọng (như SELinux
label) không thể bị user thường vô tình/cố ý ghi đè qua `setfattr` thông thường.

## 4. Thực hành

ACL — chạy thật trên file tạm (an toàn, tự dọn ngay sau demo):

```bash
$ touch /tmp/acl_demo.txt
$ getfacl /tmp/acl_demo.txt
# file: acl_demo.txt
# owner: tuantm5
# group: tuantm5
user::rw-
group::rw-
other::r--

$ setfacl -m u:nobody:r /tmp/acl_demo.txt
$ getfacl /tmp/acl_demo.txt
# file: acl_demo.txt
# owner: tuantm5
# group: tuantm5
user::rw-
user:nobody:r--
group::rw-
mask::rw-
other::r--

$ ls -l /tmp/acl_demo.txt
-rw-rw-r--+ 1 tuantm5 tuantm5 0 ... /tmp/acl_demo.txt
```

Chú ý: sau khi `setfacl`, `getfacl` TỰ THÊM dòng `mask::rw-` (không có trong output trước đó)
— đúng cơ chế đã giải thích ở mục 3, `setfacl` tự tính mask mới để entry vừa thêm (`user:nobody:
r--`) có hiệu lực đúng như khai báo. Dấu `+` cuối chuỗi quyền trong `ls -l` xác nhận file này
có ACL mở rộng.

Extended attributes (**output minh hoạ** theo `setfattr(1)` — gói `attr` không có sẵn trên máy
viết bài):

```bash
$ setfattr -n user.checksum -v "d41d8cd98f00b204e9800998ecf8427e" /tmp/somefile
$ getfattr -d /tmp/somefile
# file: somefile
user.checksum="d41d8cd98f00b204e9800998ecf8427e"
```

File attributes ở tầng filesystem — THỬ THẬT bit immutable, và nhận đúng lỗi quyền (đây LÀ
output thật, không phải minh hoạ — xác nhận trực tiếp quy tắc "chỉ root mới set được +i"):

```bash
$ lsattr /tmp/xattr_demo.txt
--------------e------- /tmp/xattr_demo.txt
$ chattr +i /tmp/xattr_demo.txt
chattr: Operation not permitted while setting flags on /tmp/xattr_demo.txt
```

Lỗi `Operation not permitted` xảy ra NGAY vì user hiện tại không có quyền root/
`CAP_LINUX_IMMUTABLE` — đúng khớp tài liệu `chattr(1)`: "Only the superuser or a process
possessing the CAP_LINUX_IMMUTABLE capability can set or clear this attribute." (Cờ `e` đã
thấy sẵn trong `lsattr` không phải do ai set tay — đây là cờ mặc định của ext4 báo file dùng
"extent", một chi tiết cấp phát block bên trong filesystem, không liên quan quyền truy cập.)

## 5. Lỗi thường gặp và cách chẩn đoán

**Set ACL cho một user cụ thể nhưng quyền KHÔNG có hiệu lực như khai báo**
- Nguyên nhân: như giải thích ở mục 3, `mask` của file giới hạn quyền hiệu lực tối đa — entry
  ACL có thể bị "cắt" bởi mask thấp hơn.
- Cách xác nhận: `getfacl` xem dòng `mask::` — nếu thấp hơn quyền entry đã set, đây là nguyên
  nhân.
- Cách xử lý: `setfacl -m mask::rwx <file>` để nâng mask lên đủ cho entry cần, hoặc dùng
  `setfacl -b` rồi set lại từ đầu để `setfacl` tự tính mask đúng.

**`cp`/`rsync` không giữ ACL khi copy file sang vị trí khác**
- Nguyên nhân: nhiều lệnh copy mặc định KHÔNG copy ACL/xattr trừ khi có cờ riêng — hành vi mặc
  định ưu tiên "copy nội dung + permission cơ bản", không phải mọi metadata mở rộng.
- Cách xác nhận: `getfacl` trên file đích sau khi copy chỉ thấy 3 entry cơ bản, mất các entry
  ACL đã set trên file gốc.
- Cách xử lý: `cp --preserve=all` hoặc `rsync -A` (giữ ACL) / `rsync -X` (giữ xattr) — phải
  CHỦ ĐỘNG yêu cầu giữ lại, không phải mặc định.

**Đặt bit immutable (`chattr +i`) cho một file quan trọng, sau đó không xoá/sửa được dù có
quyền root đầy đủ theo permission thông thường**
- Nguyên nhân: immutable bit hoạt động ở TẦNG FILESYSTEM, ĐỘC LẬP với permission/owner — dù là
  root và có đủ `rwx`, file vẫn không sửa/xoá được cho tới khi gỡ bit này.
- Cách xác nhận: `lsattr <file>` thấy cờ `i`.
- Cách xử lý: `chattr -i <file>` (cần quyền root/CAP_LINUX_IMMUTABLE, giống lúc set) để gỡ bit
  trước khi sửa/xoá được.

## 6. Tình huống thực tế

Một thư mục log tập trung cần cấp quyền ĐỌC cho user `audit` (dùng để chạy công cụ phân tích
bảo mật định kỳ) nhưng KHÔNG muốn thêm `audit` vào group owner hiện tại của log (vì group đó
còn có quyền VIẾT, không muốn `audit` vô tình/bị lợi dụng để sửa log).

1. Permission truyền thống (owner/group/other) không đủ linh hoạt cho yêu cầu này — thêm
   `audit` vào group sẽ cấp luôn quyền viết (nếu group có `rw`), không thể cấp "chỉ đọc" riêng
   cho một user mà KHÔNG đổi cũng quyền của cả group.
2. Giải pháp: dùng ACL — `setfacl -R -m u:audit:rX /var/log/appdata` (cờ `-R` áp dụng đệ quy
   cho mọi file/thư mục con hiện có; `rX` nghĩa là đọc + thực thi CÓ ĐIỀU KIỆN — theo đúng
   `chmod(1)`, `X` chỉ bật execute nếu đối tượng là THƯ MỤC, HOẶC nếu file đó ĐÃ CÓ execute cho
   bất kỳ class nào từ trước — tránh vô tình cấp execute cho file log thông thường chưa từng có
   bit `x`, trong khi vẫn giữ execute cho những file vốn đã thực thi được).
3. Để ACL áp dụng tự động cho file MỚI (log tiếp tục được ghi), cần thêm default ACL:
   `setfacl -R -d -m u:audit:rX /var/log/appdata` (cờ `-d` đặt ACL MẶC ĐỊNH, áp dụng tự động
   cho mọi file/thư mục con tạo SAU này, tương tự cách SGID áp dụng cho group ở bài trước
   nhưng linh hoạt hơn vì áp dụng cho USER cụ thể, không chỉ group).
4. Kiểm tra: `getfacl /var/log/appdata` xác nhận có cả ACL hiện tại (`user:audit:r-x`) VÀ
   default ACL (`default:user:audit:r-x`) — xác nhận cấu hình đúng cả hai chiều.
5. User `audit` chạy công cụ phân tích, xác nhận đọc được log nhưng thử viết thì bị từ chối
   (đúng ý định ban đầu — chỉ đọc).
6. Ghi vào runbook: khi cần cấp quyền cho MỘT user cụ thể mà không ảnh hưởng tới group/other,
   ACL (kèm default ACL nếu cần áp dụng cho file tương lai) là công cụ đúng — không "lách" bằng
   cách đổi group hoặc permission chung, tránh cấp dư quyền không cần thiết.

## 7. Tự kiểm tra

1. Một file có `mask::r--` và một ACL entry `user:bob:rwx`. Quyền HIỆU LỰC thật của `bob` trên
   file này là gì?
   <details><summary>Đáp án</summary><code>r--</code> (chỉ đọc) — quyền hiệu lực là GIAO của
   entry và mask, dù entry khai báo <code>rwx</code>, mask chỉ cho phép tối đa
   <code>r--</code>.</details>

2. Vì sao ACL, extended attribute, và file attribute (immutable...) được coi là BA cơ chế khác
   nhau dù đều "thêm thông tin" vào file ngoài permission rwx cơ bản?
   <details><summary>Đáp án</summary>ACL là MỞ RỘNG của permission truyền thống (vẫn là quyền
   đọc/viết/thực thi, chỉ chi tiết hơn theo user/group cụ thể). Extended attribute là metadata
   TÙY Ý, không nhất thiết liên quan quyền truy cập. File attribute (immutable, append-only...)
   là CỜ ở TẦNG FILESYSTEM, hoạt động độc lập hoàn toàn với permission/owner/ACL.</details>

3. `chattr +i file.txt` báo lỗi "Operation not permitted" dù bạn chạy với `sudo`. Có phải lệnh
   `sudo` không hoạt động đúng không?
   <details><summary>Đáp án</summary>Không — nếu dùng đúng <code>sudo chattr +i file.txt</code>
   (có <code>sudo</code>) thì sẽ thành công vì root/CAP_LINUX_IMMUTABLE có quyền set bit này.
   Nếu lỗi xảy ra khi KHÔNG có <code>sudo</code> (như minh hoạ ở mục 4), đây là hành vi ĐÚNG
   theo thiết kế, không phải lỗi.</details>

4. Sau khi `rsync` một file có ACL mở rộng sang server khác (không dùng cờ đặc biệt), ACL trên
   file đích có giữ nguyên không?
   <details><summary>Đáp án</summary>Không, theo mặc định. Cần cờ <code>-A</code> (giữ ACL)
   hoặc <code>-X</code> (giữ xattr) với <code>rsync</code> để chủ động yêu cầu giữ lại các
   metadata mở rộng này — hành vi mặc định chỉ copy nội dung + permission cơ bản.</details>

5. Vì sao dùng ACL thay vì đổi group/permission chung khi cần cấp quyền ĐỌC cho một user cụ
   thể mà không muốn ảnh hưởng tới quyền của cả group hiện tại?
   <details><summary>Đáp án</summary>ACL cho phép cấp quyền CHÍNH XÁC cho MỘT user cụ thể mà
   KHÔNG cần thay đổi group/permission chung của file — tránh vô tình cấp dư quyền (ví dụ cấp
   cả quyền viết nếu group đó có <code>rw</code>) cho user chỉ cần đọc, giữ đúng nguyên tắc
   least privilege.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.users-permissions.chmod-chown` — nền tảng permission/SGID mà ACL mở rộng thêm.
- `linux.users-permissions.selinux-apparmor` — SELinux lưu context qua xattr namespace
  `security.*` đã nhắc ở mục 3, chi tiết hơn ở bài tiếp theo.

**Nguồn tham khảo:**
- [acl(5) — man7.org](https://man7.org/linux/man-pages/man5/acl.5.html) — định nghĩa chính
  thức ACL POSIX.1e, khái niệm mask.
- [setfattr(1) — man7.org](https://man7.org/linux/man-pages/man1/setfattr.1.html) — cú pháp
  extended attribute, các namespace.
- [chattr(1) — man7.org](https://man7.org/linux/man-pages/man1/chattr.1.html) — định nghĩa
  bit immutable/append-only và yêu cầu quyền CAP_LINUX_IMMUTABLE.
- [chmod(1) — man7.org](https://man7.org/linux/man-pages/man1/chmod.1.html) — định nghĩa ký
  tự `X` trong symbolic mode (áp dụng tương tự cho `setfacl`).
