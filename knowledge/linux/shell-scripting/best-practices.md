---
id: linux.shell-scripting.best-practices
title: "Best practice viết script vận hành: idempotent, logging, exit code"
domain: linux
module: linux.shell-scripting
level: "chuyên sâu"
prerequisites: ["linux.shell-scripting.bash-advanced"]
applies_to:
  - "Ubuntu 22.04 LTS, GNU bash 5.1.16 — nguyên tắc áp dụng cho mọi script vận hành chạy qua cron/CI"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man1/bash.1.html"
  - "https://tldp.org/LDP/abs/html/exitcodes.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Script viết để chạy MỘT LẦN, do chính người viết theo dõi, khác hẳn script vận hành chạy LẶP
LẠI qua cron/CI mà không ai trực tiếp quan sát mỗi lần chạy. Ba nguyên tắc ở bài này — idempotent
(chạy lại nhiều lần vẫn an toàn), logging đủ để debug KHÔNG CẦN chạy lại, và exit code đúng
chuẩn để hệ thống giám sát tự động biết thành công/thất bại — là điều phân biệt một script
"chạy được một lần" với một script THỰC SỰ sẵn sàng cho vận hành liên tục.

## 2. Khái niệm cốt lõi

**Idempotent**: chạy script NHIỀU LẦN với cùng input phải cho ra cùng KẾT QUẢ CUỐI, không tích
lũy lỗi hoặc trạng thái sai dù chạy lại (ví dụ do cron trùng giờ, hoặc retry sau lỗi mạng). Ví
dụ: `mkdir -p` (không lỗi nếu thư mục đã tồn tại) có tính idempotent, còn `mkdir` (lỗi nếu đã
tồn tại) thì không.

**Exit code chuẩn**: `0` LUÔN là thành công; khác `0` là lỗi, theo quy ước phổ biến `1` là lỗi
chung, `2` là lỗi cú pháp/tham số dùng sai, `126` là tìm thấy lệnh nhưng không thực thi được
(thiếu quyền execute), `127` là không tìm thấy lệnh. Không có chuẩn CHẶT cho mọi mã ngoài `0`,
nhưng việc chọn mã KHÁC NHAU cho các LOẠI lỗi khác nhau giúp hệ thống gọi script (cron, CI,
script khác) phân biệt được "lỗi gì" chỉ từ exit code, không cần đọc log.

**Logging có cấu trúc tối thiểu**: mỗi dòng log nên có TIMESTAMP (để biết lỗi xảy ra lúc nào,
đặc biệt quan trọng khi debug sau khi cron đã chạy xong từ lâu) và MỨC ĐỘ (INFO/WARN/ERROR) để
lọc nhanh bằng `grep` khi log dài.

## 3. Cách nó hoạt động

**Idempotent đạt được bằng cách KIỂM TRA TRẠNG THÁI trước khi hành động, không chỉ "làm rồi
mong là chưa làm"** — mẫu chung: `if <điều kiện CHƯA tồn tại>; then <tạo/thêm>; else <bỏ qua,
log lại là đã có>; fi`. Đây là lý do thao tác như "thêm một dòng cấu hình" KHÔNG nên dùng
`echo ... >> file` một cách vô điều kiện (sẽ thêm dòng TRÙNG LẶP mỗi lần script chạy lại) — phải
`grep -qF "dòng cần thêm" file || echo "dòng cần thêm" >> file` (chỉ thêm NẾU chưa có).

**Exit code của SCRIPT (không phải của một lệnh bên trong) là giá trị của LỆNH CUỐI CÙNG được
thực thi, hoặc giá trị truyền cho `exit <code>` nếu có gọi tường minh** — một script không gọi
`exit` tường minh ở cuối sẽ trả về exit code của dòng CUỐI, có thể KHÔNG phản ánh đúng ý định
tổng thể (ví dụ dòng cuối chỉ là một `echo "Hoàn tất"` luôn thành công, dù logic trước đó có thể
đã gặp lỗi không gây dừng script). Luôn kết thúc script vận hành bằng `exit 0`/`exit 1` TƯỜNG
MINH dựa trên kết quả thực tế, không để exit code "ngẫu nhiên" theo dòng cuối.

## 4. Thực hành

Script idempotent thật — chạy 2 lần liên tiếp, lần 2 KHÔNG tạo dòng trùng lặp:

```bash
$ cat idempotent.sh
#!/bin/bash
set -euo pipefail

TARGET_DIR="/tmp/kb_shell_demo/idempotent_target"
CONFIG_FILE="$TARGET_DIR/app.conf"
MARKER_LINE="enable_feature_x=true"

mkdir -p "$TARGET_DIR"
touch "$CONFIG_FILE"

if grep -qF "$MARKER_LINE" "$CONFIG_FILE"; then
  echo "Da co dong cau hinh, khong them trung lap"
else
  echo "$MARKER_LINE" >> "$CONFIG_FILE"
  echo "Da them dong cau hinh moi"
fi

echo "--- noi dung $CONFIG_FILE ---"
cat "$CONFIG_FILE"

$ ./idempotent.sh
Da them dong cau hinh moi
--- noi dung /tmp/kb_shell_demo/idempotent_target/app.conf ---
enable_feature_x=true

$ ./idempotent.sh
Da co dong cau hinh, khong them trung lap
--- noi dung /tmp/kb_shell_demo/idempotent_target/app.conf ---
enable_feature_x=true
```

Lần chạy thứ hai, nhờ `grep -qF ... || ...` kiểm tra trạng thái TRƯỚC khi thêm, file cấu hình
vẫn chỉ có ĐÚNG 1 dòng `enable_feature_x=true` — xác nhận đúng tính chất idempotent ở mục 2,
không có bản sao thứ hai nào được thêm vào.

`mkdir -p` tự thân cũng idempotent — chạy lại nhiều lần không báo lỗi dù thư mục đã tồn tại
(khác `mkdir` không có `-p`, lần 2 sẽ báo lỗi `File exists`), đúng như định nghĩa ở mục 2.

## 5. Lỗi thường gặp và cách chẩn đoán

**Script cron "chạy OK" (không email lỗi) nhưng tác vụ thực tế không hoàn thành**
- Nguyên nhân phổ biến nhất: script không `exit` tường minh dựa trên kết quả logic, exit code
  cuối chỉ là của một lệnh `echo`/`log` vô hại ở cuối — luôn trả `0` dù logic chính đã lỗi.
- Cách xác nhận: chạy script thủ công, kiểm tra `$?` sau khi chạy, so sánh với kết quả thực tế
  của tác vụ (file có được tạo đúng không, dữ liệu có đúng không).
- Cách xử lý: thêm kiểm tra kết quả tường minh và `exit 1` ngay khi phát hiện sai, không để
  script "trôi" tới cuối rồi tự nhiên trả `0`.

**Script thêm dòng cấu hình/cron job bị TRÙNG LẶP sau vài lần chạy lại (do retry hoặc deploy
nhiều lần)**
- Nguyên nhân: dùng `>>` (append) vô điều kiện mà không kiểm tra đã tồn tại chưa — không
  idempotent.
- Cách xác nhận: `grep -c "dòng cần tìm" file` — nếu số lần xuất hiện lớn hơn 1 sau nhiều lần
  deploy, xác nhận đúng vấn đề.
- Cách xử lý: luôn kiểm tra trạng thái trước khi thêm (mẫu `grep -qF ... || ...` ở mục 3/4), áp
  dụng cho MỌI thao tác "thêm" (dòng config, cron job, user, symlink...).

**Log của script cron không có timestamp, không biết lỗi xảy ra lúc nào khi debug sau vài
ngày**
- Nguyên nhân: dùng `echo` thuần, không kèm thời gian — khi log nhiều lần chạy bị NỐI vào cùng
  một file (`>>`), không thể phân biệt dòng nào thuộc lần chạy nào.
- Cách xác nhận: mở log file, nếu không thấy mốc thời gian nào phân biệt các lần chạy, xác nhận
  đúng vấn đề.
- Cách xử lý: mọi dòng log thêm `$(date '+%Y-%m-%d %H:%M:%S')` ở đầu (như hàm `log()` ở bài
  `linux.shell-scripting.bash-advanced`), áp dụng NHẤT QUÁN cho mọi script vận hành, không chỉ
  thêm khi cần debug.

## 6. Tình huống thực tế

Một script "ensure config" được cron chạy mỗi 5 phút để đảm bảo một dòng cấu hình luôn tồn tại
trong file (tự phục hồi nếu ai đó vô tình xoá) — sau một thời gian, file cấu hình phình to bất
thường với hàng trăm dòng TRÙNG LẶP, gây lỗi khi service đọc file (parser không xử lý được dòng
trùng):

1. Mở script, phát hiện dùng `echo "$MARKER_LINE" >> "$CONFIG_FILE"` KHÔNG kiểm tra tồn tại
   trước — mỗi 5 phút cron chạy, dòng được thêm MỘT LẦN NỮA, dù đã tồn tại từ trước — đúng là
   lỗi thiếu idempotent đã nêu ở mục 5.
2. Sửa thành mẫu `grep -qF "$MARKER_LINE" "$CONFIG_FILE" || echo "$MARKER_LINE" >> "$CONFIG_FILE"`
   — chỉ thêm khi THỰC SỰ chưa có.
3. Dọn dẹp file cấu hình hiện tại: giữ lại ĐÚNG 1 dòng marker, xoá các dòng trùng lặp (ví dụ
   `awk '!seen[$0]++' config.conf` — in mỗi dòng DUY NHẤT MỘT LẦN, dựa trên nội dung đã thấy
   qua mảng `seen`).
4. Thêm log có timestamp vào script, ghi rõ mỗi lần chạy có THÊM MỚI hay BỎ QUA (đã có) — giúp
   lần sau nếu vấn đề tái diễn, có thể xem log để biết ngay lỗi xảy ra từ lúc nào, không cần
   đoán.
5. Thêm bước kiểm tra cuối script: đếm số lần xuất hiện của marker trong file, nếu `> 1` thì
   log ERROR và `exit 1` — biến việc "phát hiện trùng lặp" thành tự động, không phải đợi đến khi
   service khác báo lỗi mới biết.

## 7. Tự kiểm tra

1. Vì sao `mkdir -p` được coi là idempotent nhưng `mkdir` (không `-p`) thì không?
   <details><summary>Đáp án</summary><code>mkdir -p</code> không báo lỗi nếu thư mục ĐÃ tồn
   tại (chạy lại nhiều lần cho cùng kết quả cuối — thư mục tồn tại, không lỗi). <code>mkdir</code>
   thường báo lỗi "File exists" ở lần chạy thứ hai — kết quả (exit code) KHÁC nhau giữa lần 1 và
   lần sau, không idempotent.</details>

2. Một script không có `exit` tường minh ở cuối, dòng cuối cùng là `echo "Da xong"`. Exit code
   của script là gì, và vì sao điều này có thể gây hiểu nhầm?
   <details><summary>Đáp án</summary>Exit code của script là exit code của <code>echo</code>
   (luôn là <code>0</code>, thành công). Điều này gây hiểu nhầm vì cron/hệ thống gọi script sẽ
   nghĩ script THÀNH CÔNG dù logic chính trước đó có thể đã gặp lỗi không làm dừng script (nếu
   không có <code>set -e</code> hoặc lỗi nằm trong điều kiện được kiểm tra).</details>

3. Vì sao nên dùng `grep -qF "..." file || echo "..." >> file` thay vì `echo "..." >> file`
   trực tiếp khi script có thể chạy lại nhiều lần (ví dụ qua cron)?
   <details><summary>Đáp án</summary><code>echo >> file</code> trực tiếp sẽ thêm dòng MỖI LẦN
   script chạy, dẫn tới trùng lặp nếu script chạy lại (không idempotent).
   <code>grep -qF ... ||</code> kiểm tra dòng đã tồn tại chưa, chỉ thêm khi CHƯA có, đảm bảo kết
   quả cuối giống nhau dù chạy bao nhiều lần.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.shell-scripting.bash-advanced` — `set -euo pipefail`/`trap`/hàm `log()` là nền tảng kỹ
  thuật để áp dụng các nguyên tắc ở bài này.
- `linux.shell-scripting.text-processing` — `grep -qF`/`awk '!seen[$0]++'` dùng trực tiếp trong
  mẫu kiểm tra idempotent và dọn trùng lặp ở mục 6.

**Bài liên quan ngoài module:**
- `linux.boot-systemd.service-mgmt` — khi viết script tự tạo/xoá một unit `systemctl --user`
  tạm thời để demo (như cách bài đó hướng dẫn dọn dẹp bằng `stop`/`disable`/xoá file/
  `daemon-reload`), áp dụng đúng tư duy idempotent ở bài này: script demo nên tự kiểm tra unit
  đã tồn tại/đang chạy chưa trước khi tạo lại, không giả định trạng thái ban đầu.

**Nguồn tham khảo:**
- [bash(1) — man7.org](https://man7.org/linux/man-pages/man1/bash.1.html) — exit status của
  shell và các lệnh built-in.
- [Advanced Bash-Scripting Guide — Exit Codes](https://tldp.org/LDP/abs/html/exitcodes.html) —
  quy ước exit code phổ biến (0, 1, 2, 126, 127...).
