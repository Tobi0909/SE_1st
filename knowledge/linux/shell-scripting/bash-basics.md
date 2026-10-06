---
id: linux.shell-scripting.bash-basics
title: "Bash cơ bản: biến, điều kiện, vòng lặp, tham số dòng lệnh"
domain: linux
module: linux.shell-scripting
level: "nền tảng"
prerequisites: []
applies_to:
  - "Ubuntu 22.04 LTS, GNU bash 5.1.16 — cú pháp cơ bản giống nhau trên hầu hết distro Linux"
status: draft
sources:
  - "https://www.gnu.org/software/bash/manual/bash.html"
  - "https://man7.org/linux/man-pages/man1/test.1.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Phần lớn công việc vận hành hằng ngày của System Engineer — chạy một chuỗi lệnh lặp lại, kiểm
tra điều kiện trước khi hành động, xử lý tham số do người khác (hoặc cron) truyền vào — đều có
thể gói gọn trong một shell script thay vì gõ tay từng lệnh. Không biết viết script tốt dẫn tới
hai hậu quả hay gặp: (1) lặp lại thao tác thủ công, dễ sai khi làm nhiều lần; (2) viết script
"chạy được" nhưng không biết TẠI SAO một điều kiện không khớp như mong đợi — thường do nhầm
giữa kiểu chuỗi và số, hoặc quên quote biến.

## 2. Khái niệm cốt lõi

**Biến**: gán bằng `TEN=giá_trị` (KHÔNG có khoảng trắng quanh `=`), đọc bằng `$TEN` hoặc
`${TEN}` (cặp `{}` cần khi biến đứng cạnh chữ khác, ví dụ `${TEN}_suffix`). Biến mặc định là
kiểu chuỗi — Bash không có kiểu số riêng, phép so sánh số (`-gt`, `-eq`...) và so sánh chuỗi
(`=`, `!=`) là HAI BỘ TOÁN TỬ KHÁC NHAU, dùng nhầm bộ sẽ cho kết quả sai mà không báo lỗi rõ.

**Tham số dòng lệnh**: `$1`, `$2`... là tham số theo vị trí, `$0` là tên script, `$#` là số
lượng tham số, `$@`/`$*` là toàn bộ tham số. `${1:-default}` lấy tham số 1 nếu có, nếu không có
thì dùng `default` — cách phổ biến để đặt giá trị mặc định an toàn.

**`test`/`[ ]`/`[[ ]]`**: `[ ]` là lệnh `test` dạng ngoặc vuông (POSIX, tương thích `sh`),
`[[ ]]` là cú pháp mở rộng CHỈ CÓ trong Bash (hỗ trợ `&&`/`||` bên trong, so khớp pattern bằng
`==`, không cần quote biến để tránh word-splitting). Trong script chỉ chạy bằng Bash (có
`#!/bin/bash`), ưu tiên `[[ ]]` vì an toàn hơn.

| Toán tử số | Ý nghĩa | Toán tử chuỗi | Ý nghĩa |
|---|---|---|---|
| `-eq` | bằng | `=` hoặc `==` | bằng |
| `-ne` | khác | `!=` | khác |
| `-gt` | lớn hơn | (không có, dùng so sánh số) | |
| `-lt` | nhỏ hơn | | |
| `-z` | chuỗi RỖNG | `-n` | chuỗi KHÔNG rỗng |

**Vòng lặp**: `for i in ...; do ... done` lặp qua danh sách giá trị (không phải lặp theo số như
C); `while <điều kiện>; do ... done` lặp khi điều kiện còn đúng. `seq 1 N` sinh dãy số 1 tới N
để dùng trong `for`.

## 3. Cách nó hoạt động

**Luôn quote biến (`"$BIEN"`) khi dùng trong điều kiện hoặc truyền làm tham số** — nếu biến
RỖNG hoặc CHỨA khoảng trắng và không được quote, Bash thực hiện word-splitting, có thể biến
`[ $BIEN = "x" ]` (biến rỗng) thành `[ = "x" ]` — thiếu một bên của phép so sánh, báo lỗi cú
pháp runtime thay vì so sánh đúng/sai như mong đợi. Dùng `[[ $BIEN = "x" ]]` tránh được vấn đề
này vì `[[ ]]` không áp dụng word-splitting lên biến không quote, nhưng quote vẫn là thói quen
AN TOÀN hơn để không phải nhớ ngoại lệ này khi chuyển đổi giữa `[ ]` và `[[ ]]`.

**Exit code quyết định điều kiện đúng/sai, không phải "giá trị" theo nghĩa thông thường** —
MỌI lệnh Bash khi chạy xong trả về một exit code (`$?`), `0` nghĩa là THÀNH CÔNG (= "đúng" trong
ngữ cảnh `if`), khác `0` nghĩa là LỖI (= "sai"). Đây là lý do `if some_command; then ...`
chạy được dù `some_command` không phải phép so sánh — `if` chỉ kiểm tra exit code của BẤT KỲ
lệnh nào, `[ ]`/`[[ ]]` tự nó cũng chỉ là một lệnh trả về `0`/`1`.

## 4. Thực hành

Script cơ bản dùng biến, tham số mặc định, vòng lặp, điều kiện số — chạy thật:

```bash
$ cat demo1.sh
#!/bin/bash
NAME="${1:-the gioi}"
COUNT=3
for i in $(seq 1 "$COUNT"); do
  echo "Xin chao, $NAME! (lan $i)"
done
if [ "$COUNT" -gt 2 ]; then
  echo "COUNT lon hon 2"
fi

$ ./demo1.sh "SE Dojo"
Xin chao, SE Dojo! (lan 1)
Xin chao, SE Dojo! (lan 2)
Xin chao, SE Dojo! (lan 3)
COUNT lon hon 2

$ ./demo1.sh
Xin chao, the gioi! (lan 1)
Xin chao, the gioi! (lan 2)
Xin chao, the gioi! (lan 3)
COUNT lon hon 2
```

Chạy không có tham số, `${1:-the gioi}` tự dùng giá trị mặc định — xác nhận đúng khớp mục 2.

## 5. Lỗi thường gặp và cách chẩn đoán

**Dùng toán tử so sánh số (`-gt`, `-eq`) cho biến chuỗi, hoặc ngược lại, gặp lỗi lạ**
- Nguyên nhân: `[ "abc" -gt "5" ]` báo lỗi `integer expression expected` vì `-gt` yêu cầu CẢ HAI
  bên là số — Bash không tự chuyển kiểu chuỗi "abc" sang số.
- Cách xác nhận: đọc kỹ thông báo lỗi `integer expression expected` — đây LUÔN LÀ dấu hiệu dùng
  toán tử số cho giá trị không phải số (kể cả chuỗi rỗng do biến chưa gán).
- Cách xử lý: xác nhận lại ý định — nếu so sánh SỐ, đảm bảo biến thực sự chứa số; nếu so sánh
  CHUỖI, đổi sang `=`/`!=`.

**Biến rỗng hoặc chưa gán làm điều kiện báo lỗi cú pháp thay vì so sánh sai**
- Nguyên nhân: không quote biến trong `[ ]`, biến rỗng bị word-splitting mất hoàn toàn khỏi câu
  lệnh, `[ ]` nhận ít tham số hơn mong đợi.
- Cách xác nhận: lỗi dạng `[: =: unary operator expected` hoặc tương tự — dấu hiệu một bên của
  phép so sánh đã "biến mất".
- Cách xử lý: luôn quote biến (`"$BIEN"`) hoặc dùng `[[ ]]`.

## 6. Tình huống thực tế

Một script kiểm tra dung lượng đĩa còn lại, cảnh báo nếu dưới ngưỡng, được viết nhanh và chạy
không đúng như mong đợi:

1. Đọc lại script, phát hiện dòng `if [ $FREE_PERCENT < 20 ]` — dùng `<` thay vì `-lt` (so sánh
   số). Trong `[ ]` (lệnh `test`), `<` KHÔNG BAO GIỜ được hiểu là toán tử so sánh — shell luôn
   "nuốt" nó làm REDIRECT đầu vào TRƯỚC KHI `test` kịp nhìn thấy, bất kể biến có quote đúng cách
   hay không. Đây khác hẳn `[[ ]]`, nơi `<` thực sự là so sánh chuỗi theo thứ tự ký tự — nhầm
   hành vi của `[[ ]]` sang `[ ]` là một lỗi hiểu sai phổ biến.
   - Thực tế kiểm chứng: `[ "$FREE_PERCENT" < 20 ]` cố mở file tên `20` để redirect vào `test`
     làm stdin — nếu KHÔNG có file `20` trong thư mục hiện tại, bash báo lỗi ra stderr
     (`bash: line 1: 20: No such file or directory`) và điều kiện coi như sai (exit `1`) — tức
     script VẪN có báo lỗi, chỉ dễ bị bỏ qua nếu không xem kỹ output/log. Nếu TÌNH CỜ có file
     tên `20` tồn tại, `test` nhận một tham số không rỗng (`"$FREE_PERCENT"`) và LUÔN trả về
     đúng (exit `0`) — vô nghĩa, không hề so sánh giá trị với ngưỡng `20` như ý định.
2. Sửa thành `[ "$FREE_PERCENT" -lt 20 ]` (so sánh số đúng) hoặc `[[ $FREE_PERCENT -lt 20 ]]`.
   Nếu thật sự cần so sánh CHUỖI theo thứ tự ký tự, dùng `[[ "$a" < "$b" ]]` (chỉ `[[ ]]` hiểu
   đúng `<` theo nghĩa này).
3. Test lại với giá trị biết trước (`FREE_PERCENT=15`) để xác nhận điều kiện kích hoạt đúng.
4. Ghi vào checklist review script: mọi phép so sánh SỐ trong `[ ]`/`[[ ]]` phải dùng `-lt`/
   `-gt`/`-eq`..., không dùng `<`/`>` trong `[ ]` (luôn bị hiểu là redirect, không phải so
   sánh) — và cẩn trọng cả khi dùng trong `[[ ]]` (ở đó `<`/`>` là so sánh CHUỖI, không phải
   SỐ, nên vẫn sai nếu ý định là so sánh số).

## 7. Tự kiểm tra

1. Vì sao `[ "$BIEN" = "5" ]` và `[ "$BIEN" -eq 5 ]` có thể cho kết quả KHÁC NHAU nếu
   `BIEN="05"`?
   <details><summary>Đáp án</summary><code>=</code> so sánh CHUỖI ký tự ("05" khác "5" về mặt
   ký tự) nên trả về SAI; <code>-eq</code> so sánh SỐ (05 bằng 5 về giá trị số) nên trả về
   ĐÚNG. Hai toán tử thuộc hai hệ so sánh khác nhau.</details>

2. Script có `if some_command; then echo "ok"; fi` — "điều kiện" ở đây thực chất kiểm tra cái
   gì?
   <details><summary>Đáp án</summary>Exit code của <code>some_command</code> — <code>0</code>
   (thành công) được coi là "đúng", khác <code>0</code> được coi là "sai". <code>if</code>
   không giới hạn ở phép so sánh, nó chạy BẤT KỲ lệnh và kiểm tra exit code.</details>

3. Tại sao nên quote biến (`"$BIEN"`) khi dùng trong `[ ]`, kể cả khi tin chắc biến không chứa
   khoảng trắng?
   <details><summary>Đáp án</summary>Vì biến có thể RỖNG (chưa gán, hoặc gán rỗng) — không
   quote khiến phần đó "biến mất" khỏi câu lệnh do word-splitting, làm <code>[ ]</code> thiếu
   tham số và báo lỗi cú pháp thay vì so sánh sai/đúng như mong đợi.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.shell-scripting.text-processing` — dùng biến/điều kiện/vòng lặp ở đây để xử lý văn
  bản thực tế (grep/sed/awk/xargs).
- `linux.shell-scripting.bash-advanced` — hàm, `trap`, `set -e/-u` mở rộng trực tiếp từ nền
  tảng ở bài này.

**Nguồn tham khảo:**
- [GNU Bash Reference Manual](https://www.gnu.org/software/bash/manual/bash.html) — cú pháp
  biến, tham số vị trí, vòng lặp.
- [test(1) — man7.org](https://man7.org/linux/man-pages/man1/test.1.html) — toán tử so sánh
  đầy đủ của `[ ]`/`test`.
