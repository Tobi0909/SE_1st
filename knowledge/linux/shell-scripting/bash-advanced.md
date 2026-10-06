---
id: linux.shell-scripting.bash-advanced
title: "Bash nâng cao: hàm, trap, set -e/-u, xử lý lỗi"
domain: linux
module: linux.shell-scripting
level: "chuyên sâu"
prerequisites: ["linux.shell-scripting.bash-basics", "linux.shell-scripting.text-processing"]
applies_to:
  - "Ubuntu 22.04 LTS, GNU bash 5.1.16"
status: draft
sources:
  - "https://www.gnu.org/software/bash/manual/bash.html#The-Set-Builtin"
  - "https://www.gnu.org/software/bash/manual/bash.html#Bourne-Shell-Builtins"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Script ngắn dùng 1 lần có thể bỏ qua xử lý lỗi, nhưng script chạy ĐỊNH KỲ (cron) hoặc trên
PRODUCTION cần đáng tin cậy hơn: dừng đúng lúc khi có lỗi (không tiếp tục chạy với dữ liệu sai),
dọn dẹp tài nguyên tạm dù script bị lỗi giữa chừng, và báo lỗi rõ ràng để dễ debug. `set -e`,
`set -u`, `trap`, và hàm (`function`) là bộ công cụ chuẩn để đạt được điều đó mà không cần viết
logic kiểm tra lỗi thủ công sau MỖI lệnh.

## 2. Khái niệm cốt lõi

**Hàm (`function`)**: `ten_ham() { ... }` (dấu `function` ở đầu là tuỳ chọn trong Bash). Tham
số truyền vào hàm đọc bằng `$1`, `$2`... (RIÊNG của hàm, không phải tham số của script), biến
khai báo với `local` chỉ tồn tại TRONG hàm, không ảnh hưởng biến cùng tên ở ngoài — thiếu
`local` là nguyên nhân phổ biến khiến hàm vô tình ghi đè biến global.

**`set -e`**: script DỪNG NGAY khi bất kỳ lệnh nào trả về exit code khác `0` (thất bại) — mặc
định Bash KHÔNG dừng, tiếp tục chạy lệnh sau dù lệnh trước lỗi.

**`set -u`**: tham chiếu tới biến CHƯA được gán sẽ làm script DỪNG và báo lỗi — mặc định Bash
coi biến chưa gán là chuỗi rỗng, im lặng tiếp tục chạy, dễ che giấu lỗi gõ sai tên biến.

**`set -o pipefail`**: trong một pipeline (`a | b | c`), exit code của TOÀN pipeline mặc định
là exit code của lệnh CUỐI CÙNG — nếu `a` lỗi nhưng `b`/`c` vẫn chạy "thành công", pipeline vẫn
báo thành công. `pipefail` đổi hành vi: pipeline lỗi nếu BẤT KỲ lệnh nào trong đó lỗi.

**`trap`**: đăng ký một hàm/lệnh chạy khi script nhận một SIGNAL hoặc khi THOÁT (`EXIT`) — dùng
phổ biến nhất để đảm bảo DỌN DẸP (xoá file tạm, đóng kết nối) chạy dù script kết thúc bình
thường HAY do lỗi/bị ngắt giữa chừng.

## 3. Cách nó hoạt động

**`set -euo pipefail` là tổ hợp phổ biến ("strict mode") nhưng KHÔNG bắt được mọi loại lỗi** —
`set -e` có một số ngoại lệ quan trọng cần nhớ: lệnh trong điều kiện `if`/`while`/`&&`/`||`
KHÔNG kích hoạt `set -e` dù trả về lỗi (vì exit code đó đang được CHỦ ĐỘNG kiểm tra, không phải
lỗi bất ngờ) — đây là lý do ví dụ `if ! check_service "x"; then ...; fi` ở mục 4 vẫn tiếp tục
chạy bình thường dù hàm trả về lỗi, không làm dừng script.

**`trap cleanup EXIT` chạy hàm `cleanup` khi script thoát theo BẤT KỲ đường nào** — kể cả thoát
bình thường (hết lệnh), thoát do `exit`, HAY dừng đột ngột do `set -e` kích hoạt bởi một lệnh
lỗi. Biến `$?` TRONG hàm `cleanup` (đọc ngay dòng đầu, lưu vào biến `local` trước khi gọi lệnh
khác) giữ đúng exit code của lệnh đã làm script dừng — gọi lệnh khác (như `rm`) TRƯỚC khi đọc
`$?` sẽ làm mất giá trị gốc (vì `$?` lúc đó phản ánh exit code của `rm`, không phải lệnh gây
lỗi ban đầu).

## 4. Thực hành

Hàm với `local`, `case`, và pattern log có timestamp — chạy thật:

```bash
$ cat funcdemo.sh
#!/bin/bash
set -euo pipefail

log() {
  local level="$1"; shift
  echo "[$(date '+%H:%M:%S')] [$level] $*"
}

check_service() {
  local name="$1"
  case "$name" in
    ssh|sshd)
      log INFO "Kiem tra SSH (gia lap)"
      return 0
      ;;
    *)
      log ERROR "Khong nhan dien service: $name"
      return 1
      ;;
  esac
}

check_service "sshd"
if ! check_service "unknown-service"; then
  log WARN "check_service tra ve loi nhu ky vong, script van tiep tuc"
fi
log INFO "Hoan tat"

$ ./funcdemo.sh
[09:08:52] [INFO] Kiem tra SSH (gia lap)
[09:08:52] [ERROR] Khong nhan dien service: unknown-service
[09:08:52] [WARN] check_service tra ve loi nhu ky vong, script van tiep tuc
[09:08:52] [INFO] Hoan tat
```

Xác nhận đúng mục 3: `check_service "unknown-service"` trả về `1` (lỗi) nhưng vì đang nằm trong
điều kiện `if !`, `set -e` KHÔNG kích hoạt, script tiếp tục chạy tới dòng cuối.

`trap` dọn file tạm khi script dừng do `set -e` (lệnh `false` gây lỗi giữa chừng):

```bash
$ cat trapdemo.sh
#!/bin/bash
set -e
cleanup() {
  local rc=$?
  echo "[cleanup] dang don dep, exit code goc: $rc"
  rm -f /tmp/kb_shell_demo/tmpfile_trap.txt
}
trap cleanup EXIT

echo "tao file tam"
touch /tmp/kb_shell_demo/tmpfile_trap.txt
echo "gia lap loi"
false
echo "dong nay KHONG chay vi set -e"

$ ./trapdemo.sh
tao file tam
gia lap loi
[cleanup] dang don dep, exit code goc: 1
$ echo "exit code thuc cua script: $?"
exit code thuc cua script: 1
$ ls /tmp/kb_shell_demo/tmpfile_trap.txt
ls: cannot access '/tmp/kb_shell_demo/tmpfile_trap.txt': No such file or directory
```

Xác nhận: dòng `echo "dong nay KHONG chay..."` không in ra (script dừng ngay tại `false` nhờ
`set -e`), nhưng `cleanup` VẪN chạy (nhờ `trap ... EXIT`) và xoá đúng file tạm — exit code cuối
cùng của script (`1`) giữ nguyên từ lệnh gây lỗi, không bị `cleanup`/`rm` (chạy sau, thành công)
che mất.

`set -u` bắt lỗi biến chưa gán — chạy thật, xác nhận exit code:

```bash
$ cat unbound.sh
#!/bin/bash
set -u
echo "truoc"
echo "$UNDEFINED_VAR"
echo "sau"

$ ./unbound.sh
truoc
./unbound.sh: line 4: UNDEFINED_VAR: unbound variable
$ echo "exit code thuc: $?"
exit code thuc: 1
```

`pipefail` phát hiện lỗi "ẩn" trong pipeline mà không có cũng không thấy:

```bash
$ bash -c 'false | true; echo "exit code cua pipeline: $?"'
exit code cua pipeline: 0
$ bash -c 'set -o pipefail; false | true; echo "exit code cua pipeline: $?"'
exit code cua pipeline: 1
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Script có `set -e` nhưng vẫn tiếp tục chạy sau một lệnh lỗi trong `if`/`&&`/`||`**
- Nguyên nhân: đây là hành vi ĐÚNG theo thiết kế của `set -e`, không phải bug — lệnh trong điều
  kiện được coi là đang bị kiểm tra CHỦ ĐỘNG, không kích hoạt dừng script.
- Cách xác nhận: đọc lại GNU Bash Reference Manual phần "The Set Builtin" — danh sách ngoại lệ
  của `-e` liệt kê rõ các trường hợp này.
- Cách xử lý: không cần "sửa" — nếu MUỐN script dừng khi lệnh trong `if` lỗi, phải tự thêm
  `exit 1` trong nhánh xử lý lỗi, không trông chờ `set -e` tự làm điều đó.

**Hàm vô tình thay đổi biến global ngoài ý muốn**
- Nguyên nhân: quên `local` khi khai báo biến trong hàm — biến đó trở thành biến GLOBAL, nếu
  trùng tên với biến đang dùng ở phần script chính, giá trị bị ghi đè không báo lỗi.
- Cách xác nhận: thêm `set -u` và kiểm tra giá trị biến trước/sau khi gọi hàm bằng `echo`/`declare -p`.
- Cách xử lý: LUÔN dùng `local` cho biến chỉ cần dùng trong hàm, coi đây là quy tắc mặc định
  khi viết hàm mới, không phải việc cân nhắc tuỳ trường hợp.

**`trap cleanup EXIT` không chạy khi script bị kill bằng `kill -9`**
- Nguyên nhân: `SIGKILL` (tín hiệu số 9) KHÔNG THỂ bị bắt hoặc xử lý bởi bất kỳ process nào
  (giống đã học ở `linux.process-signals.signals`) — `trap` chỉ hoạt động với tín hiệu CÓ THỂ
  bắt được (`EXIT`, `SIGTERM`, `SIGINT`...), không áp dụng cho `SIGKILL`.
- Cách xác nhận: so sánh hành vi `kill -TERM` (trap chạy) vs `kill -9`/`kill -KILL` (trap KHÔNG
  chạy).
- Cách xử lý: không có cách "bắt" `SIGKILL` ở tầng ứng dụng — nếu cần đảm bảo dọn dẹp dù bị kill
  cứng, phải thiết kế ở tầng khác (ví dụ file tạm trong thư mục tự dọn định kỳ, hoặc service
  quản lý resource riêng).

## 6. Tình huống thực tế

Một script backup chạy qua cron hằng đêm, gần đây backup "thành công" (exit code 0, cron không
báo lỗi) nhưng file backup thực tế trống/hỏng:

1. Đọc lại script, phát hiện pipeline dạng `tar czf - /data | ssh backup-server "cat > backup.tar.gz"`
   — không có `pipefail`. Khi `/data` gặp lỗi đọc (permission, file đang bị lock), `tar` lỗi
   NHƯNG `ssh`/`cat` phía sau vẫn "thành công" (nhận được ít/không dữ liệu nhưng ghi file OK) —
   exit code cuối cùng của pipeline là của `ssh`, che mất lỗi thật của `tar`.
2. Thêm `set -o pipefail` đầu script — xác nhận lại bằng cách tái tạo lỗi có kiểm soát (tạm đổi
   quyền một file trong `/data` để `tar` lỗi thật), thấy script giờ dừng đúng và trả exit code
   khác `0`.
3. Thêm `trap` để xoá file backup DỞ (không hoàn chỉnh) nếu script dừng giữa chừng — tránh để
   lại file backup trông "có vẻ tồn tại" nhưng thực chất hỏng, dễ gây hiểu nhầm khi cần restore
   gấp.
4. Thêm bước kiểm tra cuối: `tar tzf backup.tar.gz > /dev/null` (test tính hợp lệ của file
   nén) trước khi coi backup là THÀNH CÔNG, không chỉ dựa vào exit code của lệnh tạo file.
5. Cập nhật alerting: cron gửi cảnh báo khi script backup exit code khác `0` — lúc này mới thật
   sự bắt được lỗi, trước đây exit code luôn là `0` nên không alert nào được kích hoạt dù backup
   đã hỏng nhiều ngày.

## 7. Tự kiểm tra

1. `set -e` có làm script dừng khi một lệnh lỗi NẰM TRONG điều kiện `if lenh_loi; then` không?
   <details><summary>Đáp án</summary>Không — đây là một trong các ngoại lệ của
   <code>set -e</code>: lệnh đang được kiểm tra CHỦ ĐỘNG trong <code>if</code>/<code>while</code>/
   <code>&&</code>/<code>||</code> không kích hoạt dừng script dù lỗi.</details>

2. Vì sao phải đọc `$?` vào một biến `local` NGAY dòng đầu của hàm `cleanup` được gọi qua
   `trap ... EXIT`, trước khi chạy bất kỳ lệnh nào khác trong hàm?
   <details><summary>Đáp án</summary>Vì <code>$?</code> luôn phản ánh exit code của LỆNH VỪA
   CHẠY GẦN NHẤT — nếu chạy một lệnh khác (như <code>rm</code>) trước khi đọc, <code>$?</code>
   sẽ bị ghi đè thành exit code của lệnh đó, mất giá trị gốc cho biết TẠI SAO script dừng.</details>

3. Pipeline `a | b` với `a` lỗi, `b` thành công, KHÔNG có `pipefail`. Exit code của pipeline là
   gì, và vì sao đây là một "cạm bẫy"?
   <details><summary>Đáp án</summary>Exit code là của <code>b</code> (lệnh CUỐI pipeline) —
   tức thành công (<code>0</code>) dù <code>a</code> đã lỗi. Đây là cạm bẫy vì script/cron chỉ
   kiểm tra exit code cuối sẽ KHÔNG BIẾT lệnh đầu pipeline đã thất bại, trừ khi bật
   <code>set -o pipefail</code>.</details>

4. `trap cleanup EXIT` có chạy `cleanup` khi process bị `kill -9` không? Vì sao?
   <details><summary>Đáp án</summary>Không — <code>SIGKILL</code> không thể bị bắt hoặc xử lý
   bởi bất kỳ cơ chế trap/signal handler nào ở tầng ứng dụng, nên <code>trap</code> (dựa trên
   bắt signal) không có cơ hội chạy.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.shell-scripting.bash-basics` — nền tảng biến/điều kiện mà hàm và `trap` ở bài này mở
  rộng.
- `linux.shell-scripting.best-practices` — áp dụng `set -euo pipefail`/`trap` làm thành phần
  bắt buộc của script vận hành production.

**Bài liên quan ngoài module:**
- `linux.process-signals.signals` — vì sao `SIGKILL` không thể bị `trap` bắt (đã học ở đây,
  nhắc lại đúng ngữ cảnh ở mục 5).

**Nguồn tham khảo:**
- [GNU Bash Manual — The Set Builtin](https://www.gnu.org/software/bash/manual/bash.html#The-Set-Builtin)
  — đặc tả đầy đủ `-e`/`-u`/`-o pipefail`, bao gồm các ngoại lệ của `-e`.
- [GNU Bash Manual — Bourne Shell Builtins](https://www.gnu.org/software/bash/manual/bash.html#Bourne-Shell-Builtins)
  — cú pháp `trap`.
