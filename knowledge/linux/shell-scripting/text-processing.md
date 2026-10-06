---
id: linux.shell-scripting.text-processing
title: "Xử lý văn bản: grep, sed, awk, xargs"
domain: linux
module: linux.shell-scripting
level: "vận hành"
prerequisites: ["linux.shell-scripting.bash-basics"]
applies_to:
  - "Ubuntu 22.04 LTS — GNU grep/sed/awk/findutils (xargs), hành vi tương tự mọi distro Linux"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man1/grep.1.html"
  - "https://man7.org/linux/man-pages/man1/sed.1.html"
  - "https://man7.org/linux/man-pages/man1/gawk.1.html"
  - "https://man7.org/linux/man-pages/man1/xargs.1.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Log file, output lệnh, file cấu hình — phần lớn dữ liệu một System Engineer xử lý hằng ngày là
VĂN BẢN THÔ, không có cấu trúc để query như database. Bốn công cụ `grep`/`sed`/`awk`/`xargs`
cùng nhau tạo thành bộ xử lý văn bản theo pipeline Unix cổ điển: tìm dòng cần (`grep`), thay thế
nội dung (`sed`), tính toán/tổng hợp theo cột (`awk`), rồi áp dụng hành động cho từng kết quả
(`xargs`) — không cần viết script Python/khác cho các tác vụ xử lý log/text đơn giản tới trung
bình.

## 2. Khái niệm cốt lõi

**`grep`**: tìm DÒNG khớp pattern. Cờ hay dùng: `-c` (đếm số dòng khớp, không in dòng), `-v`
(đảo ngược — in dòng KHÔNG khớp), `-E` (extended regex, cho phép `{}`/`|`/`+` không cần
escape), `-i` (không phân biệt hoa/thường), `-n` (in kèm số dòng).

**`sed`**: Stream EDitor, xử lý văn bản THEO DÒNG, lệnh phổ biến nhất `s/pattern/thay_thế/`
(thay thế lần khớp ĐẦU TIÊN mỗi dòng; thêm `g` ở cuối để thay TOÀN BỘ lần khớp trong dòng).
Theo mặc định `sed` chỉ IN ra kết quả, KHÔNG sửa file gốc — phải dùng cờ `-i` (in-place) mới ghi
đè file, nên luôn xem thử (không `-i`) trước khi áp dụng thật.

**`awk`**: xử lý văn bản THEO CỘT (field) — mỗi dòng tự động tách thành `$1`, `$2`... theo dấu
phân cách (mặc định là khoảng trắng, đổi bằng `-F`), `$0` là toàn dòng. Hỗ trợ biến, mảng
(associative array), khối `END { }` chạy MỘT LẦN sau khi đọc hết input — rất hợp để tổng hợp
(đếm, cộng tổng) theo nhóm.

**`xargs`**: đọc danh sách giá trị từ STDIN (thường từ `find`/`grep -l`), rồi gọi một lệnh KHÁC
với từng giá trị làm tham số — cầu nối giữa "tìm danh sách" và "hành động trên từng phần tử",
vì nhiều lệnh (như `rm`, `wc`) nhận tham số trực tiếp, không đọc từ STDIN.

## 3. Cách nó hoạt động

**`awk` xử lý dữ liệu theo mô hình "field + record"**: mỗi DÒNG là một record, tự tách thành
field theo dấu phân cách — đây là lý do `awk '{print $1}'` lấy cột đầu tiên của MỌI dòng mà
không cần viết logic tách chuỗi thủ công như các ngôn ngữ khác. Biến trong `awk` (ví dụ
`sum[$8] += $9`) tồn tại suốt quá trình xử lý TOÀN BỘ input, không bị reset mỗi dòng — đây là
cơ chế cho phép tổng hợp theo nhóm chỉ trong 1 lệnh.

**`xargs` mặc định tách tham số theo khoảng trắng/dòng mới** — nếu tên file chứa khoảng trắng,
`find ... | xargs rm` có thể tách NHẦM một tên file thành nhiều "tham số", xoá sai file hoặc
báo lỗi "No such file". Cách an toàn: `find ... -print0 | xargs -0 ...` — `-print0` của `find`
và `-0` của `xargs` dùng ký tự NUL (`\0`) làm dấu phân cách thay vì khoảng trắng, NUL không bao
giờ xuất hiện trong tên file hợp lệ nên luôn tách đúng.

**`sed`/`grep` theo mặc định dùng BASIC regex, `grep -E`/`sed -E` mới dùng EXTENDED regex** —
sự khác biệt chính: basic regex cần escape `\{`, `\+`, `\|` để dùng như ký tự đặc biệt (ngược
với extended regex, escape để dùng như ký tự THƯỜNG) — nhầm giữa hai chế độ là nguyên nhân phổ
biến khiến một pattern "đúng cú pháp" nhưng không khớp như mong đợi.

## 4. Thực hành

Dữ liệu mẫu (log truy cập giả lập, tự tạo để demo, không phải dữ liệu thật):

```bash
$ cat access.log
192.168.1.10 - - [06/Oct/2026:10:00:01] "GET /api/users HTTP/1.1" 200 512
192.168.1.11 - - [06/Oct/2026:10:00:02] "GET /api/orders HTTP/1.1" 404 128
192.168.1.10 - - [06/Oct/2026:10:00:03] "POST /api/login HTTP/1.1" 500 64
192.168.1.12 - - [06/Oct/2026:10:00:04] "GET /api/users HTTP/1.1" 200 512
192.168.1.11 - - [06/Oct/2026:10:00:05] "GET /api/orders HTTP/1.1" 500 128
```

`grep`: tìm request lỗi 5xx (dùng `-E` vì pattern có `{}`):

```bash
$ grep -E ' [45][0-9]{2} ' access.log
192.168.1.11 - - [06/Oct/2026:10:00:02] "GET /api/orders HTTP/1.1" 404 128
192.168.1.10 - - [06/Oct/2026:10:00:03] "POST /api/login HTTP/1.1" 500 64
192.168.1.11 - - [06/Oct/2026:10:00:05] "GET /api/orders HTTP/1.1" 500 128
```

`awk`: đếm request theo IP, rồi tổng bytes theo status code (cột 1 và cột 8/9 theo khoảng
trắng):

```bash
$ awk '{print $1}' access.log | sort | uniq -c
      2 192.168.1.10
      2 192.168.1.11
      1 192.168.1.12

$ awk '{sum[$8] += $9} END {for (code in sum) print code, sum[code]}' access.log
200 1024
404 128
500 192
```

`sed`: xem thử thay `HTTP/1.1` thành `HTTP/2` (KHÔNG `-i`, chỉ in ra để kiểm tra trước):

```bash
$ sed 's#HTTP/1.1#HTTP/2#' access.log | head -2
192.168.1.10 - - [06/Oct/2026:10:00:01] "GET /api/users HTTP/2" 200 512
192.168.1.11 - - [06/Oct/2026:10:00:02] "GET /api/orders HTTP/2" 404 128
```

Dùng `#` làm dấu phân cách thay cho `/` mặc định — tránh phải escape `/` có sẵn trong
`HTTP/1.1`, dễ đọc hơn `s/HTTP\/1.1/HTTP\/2/`.

`xargs`: áp dụng hành động cho từng file tìm được bằng `find`, dùng `-print0`/`-0` để an toàn
với tên file có khoảng trắng:

```bash
$ find . -maxdepth 1 -type f -name "*.tmp" -print0 | xargs -0 -I{} rm {}
$ ls
file1.txt  file2.log  file3.txt
```

(file `.tmp` đã bị xoá bởi `xargs`, 3 file còn lại vẫn nguyên — xác nhận lệnh chỉ tác động đúng
tập file khớp pattern.)

## 5. Lỗi thường gặp và cách chẩn đoán

**Pattern `grep`/`sed` có `{}`/`+`/`|` nhưng không khớp dù trông "đúng cú pháp"**
- Nguyên nhân: quên `-E` (hoặc `-r`) — mặc định dùng basic regex, các ký tự này bị hiểu là ký
  tự THƯỜNG (literal), không phải toán tử regex.
- Cách xác nhận: thử lại với `-E`, nếu khớp đúng thì xác nhận đúng nguyên nhân.
- Cách xử lý: luôn thêm `-E` khi pattern dùng cú pháp extended regex, hoặc escape bằng `\`
  trong basic regex (`\{2\}` thay vì `{2}`) nếu không muốn đổi cờ.

**`sed -i` áp dụng lên production config, phát hiện sai pattern SAU KHI đã sửa, không rollback
được vì không có backup**
- Nguyên nhân: chạy trực tiếp `-i` mà không xem thử trước, và không dùng `-i.bak` để giữ bản
  gốc.
- Cách xác nhận: diff giữa file hiện tại và bản backup (nếu có) để thấy đúng phần đã đổi sai.
- Cách xử lý: LUÔN chạy `sed` KHÔNG `-i` trước để xem kết quả, chỉ thêm `-i.bak` (tạo file
  `.bak` giữ bản gốc) khi đã chắc chắn pattern đúng — không bao giờ `-i` trực tiếp (không có
  đuôi backup) trên file quan trọng.

**`find ... | xargs rm` xoá sai hoặc báo lỗi khi tên file có khoảng trắng**
- Nguyên nhân: không dùng `-print0`/`-0`, `xargs` tách tham số theo khoảng trắng, một tên file
  "co khoang trang.txt" bị hiểu thành hai tham số riêng.
- Cách xác nhận: thử với tên file test có khoảng trắng, so sánh hành vi có/không `-print0`.
- Cách xử lý: luôn dùng cặp `find -print0` + `xargs -0` khi xử lý danh sách file bằng `xargs`.

## 6. Tình huống thực tế

Team cần báo cáo nhanh: trong log truy cập 1 giờ qua, IP nào gửi nhiều request lỗi 5xx nhất (để
nghi vấn tấn công hoặc client lỗi)?

1. Lọc đúng các dòng lỗi 5xx bằng `grep -E ' 5[0-9]{2} ' access.log` — xác nhận trước bằng cách
   đếm `grep -cE ' 5[0-9]{2} ' access.log` để biết tổng số dòng lỗi, tránh xử lý "mù" không biết
   kết quả trung gian có hợp lý không.
2. Lấy cột IP (cột 1) từ các dòng đã lọc, đếm số lần xuất hiện mỗi IP:
   `grep -E ' 5[0-9]{2} ' access.log | awk '{print $1}' | sort | uniq -c | sort -rn` — `sort -rn`
   sắp xếp giảm dần theo số (IP xuất hiện nhiều lỗi nhất lên đầu).
3. Xem kết quả: nếu một IP chiếm tỉ lệ bất thường so với các IP khác, đó là điểm nghi vấn cần
   điều tra tiếp (xem chi tiết request của IP đó bằng `grep "$IP" access.log`).
4. Việc này lặp lại hằng ngày — gói thành một script nhỏ nhận tham số file log và khoảng thời
   gian, để không phải gõ lại pipeline mỗi lần (liên kết trực tiếp tới
   `linux.shell-scripting.bash-basics` về cách nhận tham số dòng lệnh).

## 7. Tự kiểm tra

1. `sed 's/foo/bar/' file.txt` có sửa `file.txt` không? Cần thêm gì để sửa thật?
   <details><summary>Đáp án</summary>Không — mặc định <code>sed</code> chỉ IN kết quả ra
   stdout, không đổi file gốc. Cần thêm cờ <code>-i</code> (in-place) để ghi đè file, nên xem
   thử không có <code>-i</code> trước khi áp dụng thật.</details>

2. Vì sao `find . -name "*.log" | xargs rm` có thể xoá SAI file nếu tên file chứa khoảng
   trắng?
   <details><summary>Đáp án</summary><code>xargs</code> mặc định tách tham số theo khoảng
   trắng/dòng mới, nên một tên file có khoảng trắng bị tách thành nhiều tham số riêng. Dùng
   <code>find -print0</code> kèm <code>xargs -0</code> (phân cách bằng NUL) để tránh lỗi
   này.</details>

3. `awk '{sum[$1] += $2} END {...}'` dùng cơ chế gì của `awk` để tổng hợp được theo nhóm chỉ
   trong một lệnh?
   <details><summary>Đáp án</summary>Biến mảng (<code>sum[$1]</code>, mảng associative theo
   khoá là field) TỒN TẠI SUỐT quá trình xử lý toàn bộ input (không reset mỗi dòng), và khối
   <code>END { }</code> chạy một lần duy nhất sau khi đọc hết input để in kết quả tổng hợp
   cuối cùng.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.shell-scripting.bash-basics` — biến/điều kiện/vòng lặp dùng để đóng gói các pipeline
  ở bài này thành script tái sử dụng được.
- `linux.shell-scripting.bash-advanced` — `trap`/`set -e` giúp script dùng `sed -i`/`xargs rm`
  an toàn hơn khi có lỗi giữa chừng.

**Nguồn tham khảo:**
- [grep(1) — man7.org](https://man7.org/linux/man-pages/man1/grep.1.html) — cờ `-c`/`-v`/`-E`/
  `-i`.
- [sed(1) — man7.org](https://man7.org/linux/man-pages/man1/sed.1.html) — cú pháp `s///`, cờ
  `-i`.
- [gawk(1) — man7.org](https://man7.org/linux/man-pages/man1/gawk.1.html) — mô hình field/
  record, mảng, khối `END`.
- [xargs(1) — man7.org](https://man7.org/linux/man-pages/man1/xargs.1.html) — `-I`, `-0`/
  `-print0`, `-P` (song song).
