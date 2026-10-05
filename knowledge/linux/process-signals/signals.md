---
id: linux.process-signals.signals
title: "Tín hiệu Unix: SIGTERM/SIGKILL/SIGHUP và graceful shutdown"
domain: linux
module: linux.process-signals
level: "nền tảng"
prerequisites: ["linux.process-signals.lifecycle"]
applies_to:
  - "Ubuntu 22.04 LTS (kernel 6.8)"
  - "Bảng signal là chuẩn POSIX, số hiệu giống nhau trên hầu hết Linux x86/ARM"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man7/signal.7.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

`kill` là một trong những lệnh bị hiểu sai nhiều nhất: nhiều người dùng `kill -9` cho MỌI
trường hợp vì "chắc chắn chết", nhưng điều đó có thể làm mất dữ liệu đang xử lý (connection
đang mở, file đang viết nửa chừng, transaction đang chạy) vì process không có cơ hội dọn dẹp.
Hiểu đúng tín hiệu nào nên dùng khi nào — và tín hiệu nào process có thể "lắng nghe" được, tín
hiệu nào thì không — là kỹ năng nền tảng để dừng service đúng cách, dù là dừng tay qua `kill`
hay gián tiếp qua `systemctl stop` (chính systemctl cũng gửi tín hiệu phía dưới, xem mục 3).

## 2. Khái niệm cốt lõi

Tín hiệu (signal) là một cơ chế kernel dùng để thông báo một sự kiện bất đồng bộ tới process —
"bất đồng bộ" nghĩa là process có thể nhận tín hiệu ở BẤT KỲ thời điểm nào trong lúc chạy, không
cần chủ động "hỏi". Bốn tín hiệu quan trọng nhất với SE vận hành hằng ngày:

| Tín hiệu | Số hiệu | Default action | Ý nghĩa thường dùng |
|---|---|---|---|
| `SIGHUP` | 1 | Term | Lịch sử: "đứt kết nối terminal điều khiển"; ngày nay nhiều daemon tự định nghĩa lại thành "tải lại config" |
| `SIGINT` | 2 | Term | Người dùng bấm Ctrl+C ở terminal |
| `SIGTERM` | 15 | Term | Yêu cầu kết thúc "lịch sự" — process CÓ THỂ bắt được để tự dọn dẹp trước khi thoát |
| `SIGKILL` | 9 | Term | Buộc kết thúc NGAY, process KHÔNG có cơ hội chạy code dọn dẹp |

**Phân biệt `Term` (default action) ở bảng trên với việc process có "bắt" (catch) được tín
hiệu hay không** — đây là điểm hay nhầm: cả 4 tín hiệu trên đều có default action là
"terminate" NẾU process không tự định nghĩa hành vi riêng. Khác biệt thật nằm ở việc process
CÓ ĐƯỢC PHÉP tự định nghĩa hành vi khác với default hay không.

## 3. Cách nó hoạt động

**`SIGKILL` và `SIGSTOP` là hai tín hiệu DUY NHẤT không thể bị bắt, chặn, hay bỏ qua** — theo
đúng tài liệu `signal(7)`: "The signals SIGKILL and SIGSTOP cannot be caught, blocked, or
ignored." Đây là lý do `kill -9` (SIGKILL) luôn "chắc chắn chết" — không process nào, dù viết
tốt hay tệ, có thể chống lại được tín hiệu này, vì kernel xử lý nó trực tiếp mà không giao
quyền cho code của process. Ngược lại, `SIGTERM`, `SIGHUP`, `SIGINT` đều CÓ THỂ bị process tự
viết lại hành vi (qua `signal()`/`sigaction()` trong code) — một process được thiết kế tốt sẽ
bắt `SIGTERM` để: đóng kết nối database đang mở, ghi nốt dữ liệu đang buffer, rồi mới tự
`exit()` — đây chính là ý nghĩa "graceful shutdown".

**`SIGHUP` đã "tiến hóa" ý nghĩa qua thời gian**: tên gốc ("hangup") xuất phát từ thời terminal
vật lý qua modem — khi đường dây bị ngắt, kernel gửi `SIGHUP` cho mọi process gắn với terminal
đó. Trên hệ thống hiện đại không còn modem, nhiều daemon (ví dụ `nginx`, nhiều dịch vụ Unix
lâu đời) TỰ ĐỊNH NGHĨA LẠI ý nghĩa `SIGHUP` thành "tải lại config mà không restart toàn bộ
process" — đây là lý do một số tài liệu cũ nói `SIGHUP` dùng để "reload", dù default action
theo kernel vẫn là terminate (chỉ áp dụng khi chương trình không tự định nghĩa lại).

**`systemctl stop` không "có pháp thuật riêng" — nó cũng gửi tín hiệu, chỉ có thêm timeout**:
khi dừng một service, systemd gửi `SIGTERM` trước (cho process cơ hội tự dọn dẹp), đợi một
khoảng thời gian cấu hình được qua `TimeoutStopSec=` (mặc định 90 giây), nếu process vẫn chưa
thoát, systemd mới gửi tiếp `SIGKILL` để buộc kết thúc. Hiểu điều này giải thích tại sao một
service "chậm dừng" đôi khi mất rất lâu trước khi biến mất hẳn — nó đang ở trong khoảng chờ
`TimeoutStopSec=` trước khi bị `SIGKILL`.

**Exit code phản ánh lại CHÍNH tín hiệu đã kết thúc process**: theo quy ước shell, khi process
bị kết thúc bởi tín hiệu số N (và không tự bắt tín hiệu đó để đổi hành vi), exit code của nó là
`128 + N`. Ví dụ `SIGTERM` (15) → exit code `143`; `SIGKILL` (9) → exit code `137`. Đây là cách
nhanh để biết TỪ XA (không cần xem log) process vừa bị tín hiệu nào kết thúc, chỉ cần đọc exit
code.

## 4. Thực hành

Gửi `SIGTERM` cho một process nền và quan sát (chạy thật trên máy Ubuntu 22.04.5 LTS):

```bash
$ sleep 60 & PID=$!
$ ps -p $PID -o pid,ppid,stat,comm
    PID    PPID STAT COMMAND
  30273   30269 S    sleep
$ kill -TERM $PID
[1]+  Terminated              sleep 60
$ wait $PID; echo "exit code: $?"
exit code: 143
```

Exit code `143 = 128 + 15` xác nhận đúng công thức ở mục 3: process bị kết thúc bởi tín hiệu số
15 (`SIGTERM`), vì `sleep` không tự định nghĩa lại hành vi cho tín hiệu này (dùng default
action "terminate").

Xem toàn bộ danh sách tín hiệu kernel hỗ trợ kèm số hiệu (để biết `128 + N` ứng với tín hiệu
nào khi đọc exit code lạ):

```bash
$ kill -l | head -3
 1) SIGHUP	 2) SIGINT	 3) SIGQUIT	 4) SIGILL	 5) SIGTRAP
 6) SIGABRT	 7) SIGBUS	 8) SIGFPE	 9) SIGKILL	10) SIGUSR1
11) SIGSEGV	12) SIGUSR2	13) SIGPIPE	14) SIGALRM	15) SIGTERM
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Dùng `kill -9` làm phản xạ mặc định cho mọi service "không dừng được"**
- Nguyên nhân: tâm lý "chắc chắn chết nhanh" — đúng về mặt kỹ thuật (SIGKILL không thể bị
  chặn), nhưng bỏ qua hoàn toàn khả năng process đang xử lý dữ liệu quan trọng (transaction
  DB, file đang viết) mà graceful shutdown qua SIGTERM lẽ ra cho phép hoàn tất trước khi thoát.
- Cách xác nhận hậu quả: sau khi `kill -9` một service có ghi file/DB, kiểm tra log ứng dụng
  thường thấy dấu hiệu dữ liệu dở dang (transaction chưa commit, file tạm chưa dọn).
- Cách xử lý đúng: luôn thử `SIGTERM` (`kill` không kèm số hiệu mặc định chính là SIGTERM) hoặc
  `systemctl stop` (tự làm đúng trình tự SIGTERM → chờ → SIGKILL) trước; chỉ dùng `-9` khi đã
  xác nhận process không phản hồi SIGTERM sau một khoảng thời gian hợp lý.

**Service dừng rất lâu mỗi lần `systemctl stop`, tưởng là bug**
- Nguyên nhân: service không xử lý `SIGTERM` đúng cách (không có code bắt tín hiệu này để tự
  thoát nhanh, hoặc đang kẹt trong một tác vụ dài), nên luôn phải chờ hết `TimeoutStopSec=`
  (mặc định 90 giây) rồi mới bị `SIGKILL`.
- Cách xác nhận: `journalctl -u foo.service` thấy khoảng cách lớn giữa log "Stopping..." và
  "Stopped"/"Killed" tương ứng với giá trị timeout.
- Cách xử lý: nếu service tự viết, thêm xử lý `SIGTERM` trong code để thoát nhanh hơn; nếu
  không sửa được code, có thể giảm `TimeoutStopSec=` qua `systemctl edit` cho phù hợp (đánh đổi
  giảm thời gian chờ nhưng tăng rủi ro cắt ngang tác vụ đang xử lý).

**Gửi `SIGHUP` để "reload" một service nhưng service đó dừng luôn thay vì reload**
- Nguyên nhân: không phải MỌI chương trình tự định nghĩa lại `SIGHUP` thành reload — nhiều
  chương trình giữ default action gốc (terminate). Hành vi "SIGHUP = reload" là do TỪNG chương
  trình tự chọn implement, không phải quy tắc chung của kernel.
- Cách xác nhận: đọc tài liệu/man page của chính chương trình đó xem có khai báo hỗ trợ reload
  qua SIGHUP không, trước khi gửi.
- Cách xử lý: nếu chương trình không hỗ trợ, dùng đúng cơ chế reload riêng của nó (ví dụ cờ
  dòng lệnh, hoặc `systemctl reload` nếu unit có khai báo `ExecReload=` — xem bài
  `linux.boot-systemd.service-mgmt`).

## 6. Tình huống thực tế

Một job xử lý batch ghi dữ liệu vào file CSV lớn bị "treo" (không phản hồi) trong lúc chạy,
admin vội `kill -9` để giải phóng CPU gấp cho một tác vụ khác quan trọng hơn. Sau đó phát hiện
file CSV output bị hỏng (dòng cuối cắt nửa chừng, không đọc được bằng công cụ phân tích).

1. Nguyên nhân trực tiếp: `SIGKILL` không cho process cơ hội chạy bất kỳ code dọn dẹp nào —
   buffer đang ghi (chưa `flush()`/`fsync()` ra đĩa) bị mất ngay lập tức, để lại file ở trạng
   thái nửa vời.
2. Đánh giá lại tình huống: nếu đã thử `SIGTERM` trước và chờ một khoảng hợp lý (ví dụ 10-30
   giây tuỳ đặc tính job), job CÓ THỂ (nếu được viết tốt, bắt SIGTERM để flush buffer trước khi
   thoát) đã thoát sạch sẽ hơn — nhưng cũng có thể job đó không viết code xử lý SIGTERM, nên
   dùng SIGKILL ngay là phản xạ sai do bỏ qua bước thử SIGTERM trước, không phải vì SIGKILL
   "sai" tuyệt đối.
3. Khôi phục: chạy lại job từ điểm checkpoint gần nhất (nếu job có hỗ trợ checkpoint) hoặc chạy
   lại từ đầu, không dùng được file CSV output đã hỏng.
4. Cải tiến lâu dài: nếu job này chạy định kỳ và quan trọng, sửa code để bắt `SIGTERM`
   (flush + đóng file đúng cách trước khi thoát), và cập nhật runbook: với job ghi file/DB,
   LUÔN thử `SIGTERM` + chờ timeout hợp lý trước khi cân nhắc `SIGKILL`, trừ trường hợp thực sự
   cấp bách không còn lựa chọn khác.

## 7. Tự kiểm tra

1. Một chương trình tự viết code bắt `SIGTERM` để in ra "Đang dọn dẹp..." rồi mới thoát. Nếu
   gửi `SIGKILL` cho chương trình này, dòng "Đang dọn dẹp..." có được in ra không? Vì sao?
   <details><summary>Đáp án</summary>Không. <code>SIGKILL</code> không thể bị bắt/chặn/bỏ qua
   dưới bất kỳ hình thức nào — kernel kết thúc process trực tiếp, không bao giờ giao quyền
   thực thi lại cho code của chương trình, nên handler bắt <code>SIGTERM</code> không bao giờ
   có cơ hội chạy khi nhận <code>SIGKILL</code>.</details>

2. Một process bị kết thúc, bạn thấy exit code là `137`. Process này bị tín hiệu nào kết thúc?
   <details><summary>Đáp án</summary><code>137 = 128 + 9</code> → tín hiệu số 9, chính là
   <code>SIGKILL</code>.</details>

3. Vì sao `systemctl stop` một service đôi khi mất tới gần 90 giây trước khi service biến mất
   hẳn?
   <details><summary>Đáp án</summary>systemd gửi <code>SIGTERM</code> trước, đợi theo
   <code>TimeoutStopSec=</code> (mặc định 90 giây) để service tự thoát; nếu service không tự
   thoát trong khoảng đó (ví dụ không xử lý SIGTERM, hoặc đang kẹt), systemd mới gửi tiếp
   <code>SIGKILL</code> — khoảng chờ gần đủ 90 giây đó chính là thời gian chờ SIGTERM hết
   hiệu lực trước khi buộc kill.</details>

4. Bạn gửi `SIGHUP` cho một service X để "reload config" như vẫn làm với service Y trước đó,
   nhưng X lại dừng hẳn. Đây có phải lỗi hệ thống không?
   <details><summary>Đáp án</summary>Không phải lỗi hệ thống. Default action của
   <code>SIGHUP</code> theo kernel là terminate — việc "SIGHUP = reload" chỉ đúng với những
   chương trình TỰ CHỌN implement lại hành vi này (như service Y), không phải quy tắc chung.
   Service X đơn giản là không tự định nghĩa lại, nên giữ hành vi terminate mặc định.</details>

5. Vì sao nên thử `kill <PID>` (không kèm số hiệu, mặc định gửi SIGTERM) trước khi dùng
   `kill -9 <PID>` cho một service đang ghi dữ liệu xuống đĩa?
   <details><summary>Đáp án</summary>Vì <code>SIGTERM</code> CÓ THỂ bị chương trình bắt để tự
   flush buffer/đóng file/đóng kết nối database đúng cách trước khi thoát — cho cơ hội "graceful
   shutdown" không làm hỏng dữ liệu đang xử lý. <code>SIGKILL</code> loại bỏ hoàn toàn cơ hội
   này, kết thúc ngay giữa chừng bất kể process đang làm gì.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.process-signals.lifecycle` — bối cảnh process sống/chết, zombie khác với bị tín hiệu
  kết thúc.
- `linux.process-signals.job-control` — `nohup`/`disown` liên quan tới việc process có nhận
  `SIGHUP` khi terminal đóng hay không.

**Bài liên quan ngoài module:**
- `linux.boot-systemd.service-mgmt` — cách `systemctl stop`/`reload` dùng tín hiệu phía dưới.

**Nguồn tham khảo:**
- [signal(7) — man7.org](https://man7.org/linux/man-pages/man7/signal.7.html) — bảng tín hiệu
  đầy đủ, default action, xác nhận SIGKILL/SIGSTOP không thể bị chặn.
