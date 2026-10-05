---
id: linux.filesystem-storage.troubleshooting
title: "Chẩn đoán hết dung lượng, hết inode, filesystem lỗi (fsck)"
domain: linux
module: linux.filesystem-storage
level: "vận hành"
prerequisites: ["linux.filesystem-storage.fhs-permissions", "linux.filesystem-storage.partitioning"]
applies_to:
  - "Ubuntu 22.04 LTS (kernel 6.8) — df/du/lsof/fsck là công cụ chuẩn trên mọi distro Linux"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man1/df.1.html"
  - "https://man7.org/linux/man-pages/man8/fsck.8.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

"Disk full" là một trong số ít sự cố Linux có thể làm SẬP cả hệ thống (không ghi được log,
không tạo được file tạm, database không commit được transaction) chỉ vì MỘT con số chạm đáy.
Điều khó chịu hơn: đôi khi `df` báo đầy nhưng `du` cộng lại không ra số tương ứng — khiến SE
mới hoang mang không biết "dung lượng biến đi đâu". Bài này tổng hợp 3 dạng "hết chỗ" khác
nhau (hết dung lượng, hết inode, filesystem lỗi cấu trúc) và quy trình chẩn đoán đúng cho từng
dạng, vì cách xử lý hoàn toàn khác nhau.

## 2. Khái niệm cốt lõi

| Vấn đề | Lệnh phát hiện | Triệu chứng |
|---|---|---|
| Hết dung lượng (space) | `df -h` | "No space left on device" khi ghi file |
| Hết inode | `df -i` | CŨNG "No space left on device" dù `df -h` còn dư nhiều dung lượng |
| Filesystem lỗi cấu trúc | `fsck` (offline) | Lỗi đọc/ghi lạ, mount báo lỗi, dmesg có cảnh báo filesystem |

**Phân biệt dung lượng (space) và inode**: mỗi file/thư mục cần MỘT inode (bản ghi metadata —
owner, permission, vị trí dữ liệu...) NGOÀI không gian lưu nội dung thật. Một filesystem có thể
còn RẤT NHIỀU dung lượng trống nhưng vẫn báo lỗi "hết chỗ" nếu đã dùng hết SỐ LƯỢNG inode được
cấp sẵn lúc format — thường gặp khi có HÀNG TRIỆU file nhỏ (ví dụ cache, session file) dù tổng
dung lượng của chúng không lớn.

## 3. Cách nó hoạt động

**`df` và `du` đo hai thứ khác nhau, có thể cho kết quả KHÔNG khớp nhau một cách hợp lệ**: `df`
hỏi KERNEL "filesystem này còn bao nhiêu block trống" — con số chính xác tuyệt đối tại thời
điểm hỏi. `du` tự ĐI DUYỆT cây thư mục và CỘNG kích thước từng file nó NHÌN THẤY — nếu có file
đã bị XOÁ (`rm`) nhưng vẫn đang được một PROCESS giữ mở (file descriptor chưa đóng), kernel vẫn
giữ nguyên block đĩa cho file đó (file "vô hình" với mọi lệnh duyệt thư mục, vì đã không còn
tên/đường dẫn nào trỏ tới nó) cho tới khi process đóng file descriptor — `df` vẫn tính block đó
là "đang dùng" (đúng sự thật), nhưng `du` không thấy được file đó để cộng vào (vì nó không còn
nằm trong cây thư mục nào) — đây là nguyên nhân phổ biến nhất của hiện tượng "`df` báo đầy
nhưng `du` cộng không ra".

**Hết inode không thể "dọn" bằng cách xoá VÀI file lớn** — phải xoá NHIỀU file nhỏ: vì mỗi file
(bất kể kích thước 1 byte hay 1GB) chỉ tốn ĐÚNG MỘT inode, xoá một file 10GB chỉ giải phóng
ĐÚNG MỘT inode — không giúp gì nhiều nếu vấn đề là có 2 triệu file nhỏ (session, cache, log
rotate không dọn dẹp) đang chiếm hết số inode cho phép. Ngược lại, hết DUNG LƯỢNG thường giải
quyết nhanh hơn bằng cách xoá ÍT file LỚN. Chẩn đoán sai loại vấn đề dẫn tới hướng xử lý sai
hoàn toàn.

**`fsck` không nên (và thường không THỂ) chạy trên filesystem đang MOUNT, đặc biệt root
filesystem**: `fsck` cần toàn quyền sửa cấu trúc filesystem — chạy trên filesystem đang mount
và đang ghi có thể gây xung đột nghiêm trọng hơn chính lỗi ban đầu. Với filesystem phụ (không
phải root), có thể `umount` rồi `fsck` trực tiếp. Với ROOT filesystem (`/`), cách an toàn là
boot vào chế độ rescue/single-user, hoặc để hệ thống tự chạy `fsck` ở lần boot kế tiếp (nhiều
distro tự kiểm tra định kỳ dựa trên số lần mount hoặc thời gian, cấu hình qua `tune2fs` cho
ext2/3/4).

## 4. Thực hành

Đọc dung lượng filesystem (chạy thật trên máy Ubuntu 22.04.5 LTS):

```bash
$ df -h /
Filesystem      Size  Used Avail Use% Mounted on
/dev/nvme0n1p2  468G  168G  277G  38% /
```

Đọc SỐ LƯỢNG INODE (cờ `-i`, hoàn toàn khác `-h`) — đây là bảng RIÊNG, không liên quan tới
dung lượng byte ở trên:

```bash
$ df -i /
Filesystem       Inodes   IUsed    IFree IUse% Mounted on
/dev/nvme0n1p2 31227904 1065193 30162711    4% /
```

Máy này còn rất nhiều cả dung lượng (38% used) lẫn inode (4% used) — không có vấn đề gì hiện
tại, nhưng đây CHÍNH XÁC là hai lệnh cần chạy đầu tiên khi nghi ngờ bất kỳ vấn đề "hết chỗ" nào,
trước khi đào sâu hơn.

Minh hoạ trực tiếp hiện tượng "deleted nhưng vẫn giữ dung lượng" (tạo và dọn sạch ngay trong
cùng thao tác, an toàn, không ảnh hưởng hệ thống):

```bash
$ cd /tmp && dd if=/dev/zero of=demo_bigfile bs=1M count=50
50+0 records in
50+0 records out
52428800 bytes (52 MB) copied
$ exec 3< demo_bigfile      # mở file descriptor giữ file này
$ rm -f demo_bigfile        # xoá tên file — "biến mất" khỏi mọi lệnh ls/du
$ ls -la demo_bigfile
ls: cannot access 'demo_bigfile': No such file or directory
$ lsof +L1 2>/dev/null | grep demo_bigfile
bash      33036 tuantm5    3r   REG  259,2 52428800     0  3430455 /tmp/demo_bigfile (deleted)
$ exec 3<&-                 # đóng file descriptor — NGAY LÚC NÀY 52MB mới thực sự giải phóng
```

`lsof +L1` (liệt kê file có link count < 1, tức đã bị unlink/xoá nhưng vẫn đang mở) cho thấy
RÕ RÀNG file `demo_bigfile (deleted)` vẫn đang bị giữ bởi process `bash` (PID `33036`), chiếm
đúng `52428800` byte (~50MB) — đây chính xác là cách chẩn đoán hiện tượng "`df` đầy nhưng `du`
không khớp" đã giải thích ở mục 3, không cần đoán.

Chạy `fsck` trên filesystem phụ đã unmount (**output minh hoạ** theo cú pháp chuẩn — KHÔNG tự
chạy trên máy viết bài vì sẽ phải unmount một filesystem đang dùng thật):

```bash
$ umount /dev/sdb1
$ fsck -y /dev/sdb1
fsck from util-linux 2.37.2
e2fsck 1.46.5 (30-Dec-2021)
/dev/sdb1: clean, 11/655360 files, 85000/2621440 blocks
```

Cờ `-y` tự động trả lời "yes" cho mọi câu hỏi sửa lỗi `fsck` gặp phải — tiện cho script tự
động, nhưng cần CẨN THẬN dùng trên filesystem quan trọng (một số câu hỏi sửa lỗi có thể làm mất
một phần dữ liệu bị hỏng để đổi lấy filesystem nhất quán trở lại — nên hiểu rõ từng cảnh báo
nếu chạy tương tác thay vì `-y` tự động trên dữ liệu quan trọng).

## 5. Lỗi thường gặp và cách chẩn đoán

**`df -h` báo gần đầy nhưng `du -sh /* ` cộng lại không ra số tương ứng**
- Nguyên nhân: file đã bị xoá nhưng vẫn bị một process giữ mở — đúng hiện tượng minh hoạ ở
  mục 4, phổ biến nhất với log file bị xoá tay (thay vì dùng logrotate) trong khi service ghi
  log đó vẫn đang chạy.
- Cách xác nhận: `lsof +L1` (hoặc `lsof | grep deleted`) liệt kê TOÀN BỘ file đã xoá nhưng vẫn
  mở trên toàn hệ thống, kèm PID đang giữ và kích thước.
- Cách xử lý: KHÔNG thể xoá "lại" file đã xoá — phải làm process đang giữ nó ĐÓNG file descriptor,
  cách sạch nhất là `systemctl restart <service>` (service tự mở lại file log mới, giải phóng
  file cũ) thay vì cố can thiệp vào file descriptor đang mở của process khác.

**`No space left on device` khi ghi file, nhưng `df -h` cho thấy còn hàng chục GB trống**
- Nguyên nhân: hết INODE, không phải hết dung lượng byte — hai loại tài nguyên riêng biệt (mục
  2-3), thường gặp trên filesystem chứa hàng triệu file nhỏ (session PHP, cache, mail queue).
- Cách xác nhận: `df -i` cho filesystem đó hiện `IUse% = 100%` dù `df -h` còn dư nhiều.
- Cách xử lý: tìm và dọn thư mục có SỐ LƯỢNG FILE lớn bất thường
  (`find <đường-dẫn> -xdev -printf '.' | wc -c` đếm nhanh số file trong một cây mà không liệt
  kê từng tên — nhanh hơn `find | wc -l` trên cây rất lớn), không phải tìm file DUNG LƯỢNG lớn
  (`du` không giúp ích trực tiếp ở đây).

**Server không boot lên được sau mất điện đột ngột, màn hình dừng chờ nhập mật khẩu
maintenance/emergency shell**
- Nguyên nhân: filesystem bị lỗi cấu trúc do tắt đột ngột giữa lúc đang ghi (journal chưa kịp
  hoàn tất), hệ thống tự phát hiện lúc boot và yêu cầu `fsck` thủ công thay vì tự sửa im lặng
  (để tránh tự động mất dữ liệu mà người dùng không biết).
- Cách xác nhận: thông báo trên màn hình console thường nêu rõ thiết bị và gợi ý chạy
  `fsck <thiết-bị>` thủ công.
- Cách xử lý: chạy `fsck` theo đúng gợi ý trên màn hình (thường cần nhập mật khẩu root ở chế độ
  maintenance), xác nhận từng câu hỏi sửa lỗi nếu chạy tương tác (không vội dùng `-y` mù quáng
  nếu không chắc chắn dữ liệu nào sẽ bị ảnh hưởng), reboot lại sau khi `fsck` hoàn tất.

## 6. Tình huống thực tế

Server xử lý upload file người dùng báo `No space left on device` khi lưu file mới, dù team
nhớ rõ mới dọn dẹp ổ đĩa tuần trước và `df -h` lúc đó còn rất nhiều chỗ trống.

1. `df -h /data` — xác nhận NGAY: chỉ còn `2%` trống, đúng với triệu chứng báo lỗi.
2. `du -sh /data/*` cộng lại chỉ ra khoảng 60% dung lượng đã dùng theo `df` — lệch đáng kể,
   không khớp. Đây là tín hiệu rõ ràng cần kiểm tra file đã xoá nhưng còn giữ mở (mục 3).
3. `lsof +L1 | grep /data` — phát hiện một process `backup-agent` đang giữ mở MỘT file archive
   tạm `.tar.gz.tmp` đã bị xoá, kích thước ~40% tổng dung lượng ổ đĩa.
4. Điều tra thêm: log của `backup-agent` cho thấy job backup tuần trước bị CRASH giữa chừng
   (không kịp dọn file tạm, và vì chương trình giữ file descriptor liên tục trong suốt quá
   trình nén, file "xoá" bởi một job dọn dẹp tự động khác chạy song song đã không thực sự giải
   phóng được dung lượng — đúng cơ chế đã học).
5. Xử lý: `systemctl restart backup-agent` (hoặc kill đúng PID nếu không chạy qua systemd) để
   đóng file descriptor, giải phóng ngay ~40% dung lượng đã "ẩn".
6. Điều tra nguyên nhân crash của job backup tuần trước để tránh lặp lại, và sửa job dọn dẹp tự
   động: không nên `rm` trực tiếp file mà một process KHÁC có thể đang dùng mà không kiểm tra
   trước (dùng `lsof` hoặc cơ chế lock file để biết chắc an toàn trước khi xoá).
7. Ghi vào runbook: khi `df` và `du` không khớp đáng kể, BƯỚC ĐẦU TIÊN là `lsof +L1`, không
   phải cố tìm thêm file lớn để xoá (có thể không còn file lớn nào THẬT SỰ tồn tại trong cây
   thư mục để xoá thêm).

## 7. Tự kiểm tra

1. `df -h` báo filesystem còn 20GB trống, nhưng ghi một file 1GB mới vẫn báo lỗi "No space left
   on device". Giả thuyết hợp lý nhất cần kiểm tra ĐẦU TIÊN là gì?
   <details><summary>Đáp án</summary>Hết INODE, không phải hết dung lượng byte — kiểm tra ngay
   bằng <code>df -i</code>. Hai loại tài nguyên độc lập, "còn dư GB" không đảm bảo còn inode để
   tạo file mới.</details>

2. Bạn xoá một file log 5GB bằng `rm` để giải phóng dung lượng gấp, nhưng `df -h` vẫn báo dung
   lượng y hệt trước khi xoá. Điều gì có khả năng đang xảy ra?
   <details><summary>Đáp án</summary>Một process (thường chính service đang ghi vào file log
   đó) vẫn giữ file descriptor mở tới file đã bị <code>rm</code> — kernel chưa giải phóng block
   đĩa cho tới khi TẤT CẢ file descriptor trỏ tới file đó được đóng, dù tên file đã biến mất
   khỏi hệ thống thư mục.</details>

3. Vì sao xoá MỘT file 10GB thường giải quyết vấn đề "hết dung lượng" hiệu quả hơn, nhưng KHÔNG
   giải quyết được vấn đề "hết inode"?
   <details><summary>Đáp án</summary>Mỗi file (bất kể kích thước) chỉ chiếm ĐÚNG MỘT inode. Xoá
   một file 10GB giải phóng nhiều dung lượng byte nhưng cũng chỉ giải phóng MỘT inode — không
   giúp ích nếu vấn đề thật là có hàng triệu file NHỎ chiếm hết số inode cho phép.</details>

4. Vì sao không nên chạy `fsck` trực tiếp trên root filesystem (`/`) đang mount và đang hoạt
   động bình thường?
   <details><summary>Đáp án</summary><code>fsck</code> cần toàn quyền sửa cấu trúc filesystem —
   chạy trên filesystem đang mount và đang có ghi/đọc diễn ra có thể gây xung đột, làm hỏng
   thêm thay vì sửa. Với root filesystem, cách an toàn là boot vào chế độ rescue/single-user
   hoặc để fsck tự chạy ở lần boot tiếp theo trước khi root được mount đầy đủ.</details>

5. `lsof +L1` cho thấy một file đã xoá vẫn bị giữ bởi process PID 4521, chiếm 40GB. Hành động
   NÀO giải phóng được dung lượng này một cách sạch sẽ nhất?
   <details><summary>Đáp án</summary>Khiến process đó đóng file descriptor — cách sạch nhất là
   restart đúng service/process đó (qua <code>systemctl restart</code> nếu được quản lý bằng
   systemd), để nó tự dọn dẹp và (nếu cần) tự mở lại file mới. Không có cách nào "xoá lại" file
   đã xoá hay trực tiếp ép giải phóng block mà không đóng file descriptor theo cách này hay cách
   khác.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.filesystem-storage.fhs-permissions` — hiểu vai trò `/var`/`/tmp` giúp đoán đúng nơi dễ
  đầy dung lượng nhất (log, cache tăng dần theo thời gian).
- `linux.filesystem-storage.lvm-basics` — nếu filesystem đầy là vấn đề LẶP LẠI (không phải sự
  cố một lần), cân nhắc chuyển sang LVM để mở rộng dễ dàng hơn partition trần.

**Nguồn tham khảo:**
- [df(1) — man7.org](https://man7.org/linux/man-pages/man1/df.1.html) — cờ `-h`/`-i`, ý nghĩa
  các cột.
- [fsck(8) — man7.org](https://man7.org/linux/man-pages/man8/fsck.8.html) — cú pháp và lưu ý an
  toàn khi chạy trên filesystem đang mount.
