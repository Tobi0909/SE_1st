---
id: linux.process-signals.job-control
title: "Job control: foreground/background, nohup, disown"
domain: linux
module: linux.process-signals
level: "vận hành"
prerequisites: ["linux.process-signals.lifecycle"]
applies_to:
  - "Bash (Ubuntu 22.04 LTS) — cú pháp job control giống nhau trên hầu hết shell POSIX (zsh, dash có job control, cú pháp tương tự)"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man7/signal.7.html"
  - "https://www.gnu.org/software/bash/manual/html_node/Signals.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

SSH vào server, chạy một tác vụ dài (migrate dữ liệu, build, đồng bộ file lớn), rồi mất kết nối
mạng giữa đường — tác vụ đó có tiếp tục chạy không, hay bị giết theo khi session đóng? Câu trả
lời phụ thuộc hoàn toàn vào việc tác vụ được chạy foreground/background như thế nào, và có
dùng `nohup`/`disown` đúng cách không. Đây là kỹ năng cơ bản nhưng rất dễ bị bỏ qua cho tới khi
mất một lần công việc quan trọng giữa đường vì SSH rớt.

## 2. Khái niệm cốt lõi

Shell quản lý mỗi lệnh (hoặc pipeline lệnh) đã chạy như một **job**, có thể ở foreground (chiếm
quyền điều khiển terminal, shell chờ nó xong mới nhận lệnh tiếp) hoặc background (chạy song
song, shell nhận lệnh mới ngay). Ba lệnh job control cốt lõi:

| Lệnh/cú pháp | Tác dụng |
|---|---|
| `cmd &` | Chạy `cmd` ở background ngay từ đầu, trả lại quyền điều khiển terminal ngay |
| `jobs -l` | Liệt kê các job đang được SHELL HIỆN TẠI theo dõi |
| `disown %N` | Gỡ job số N khỏi danh sách theo dõi của shell — process vẫn chạy, chỉ không còn bị shell "quản lý" |
| `nohup cmd &` | Chạy `cmd` ở background, đồng thời chặn tín hiệu `SIGHUP` tới nó |

## 3. Cách nó hoạt động

**Vì sao đóng terminal/mất SSH có thể giết chết process con đang chạy**: khi terminal (hoặc
session SSH) đóng, kernel gửi `SIGHUP` tới **session leader** (thường chính là shell, ví dụ
`bash`) gắn với terminal đó. Theo tài liệu chính thức của Bash: một interactive shell nhận
`SIGHUP` sẽ TỰ FORWARD lại tín hiệu này tới TOÀN BỘ job nó đang quản lý (cả đang chạy và đã bị
dừng) TRƯỚC KHI chính nó thoát — đây mới là lý do thật khiến job background (`cmd &`) cũng bị
giết, KHÔNG phải vì kernel gửi SIGHUP trực tiếp tới từng job một cách độc lập. Chính vì đây là
hành vi của SHELL (không phải của kernel), một job đã được gỡ khỏi "danh sách job của shell"
(qua `disown`, xem đoạn dưới) sẽ không bị shell forward SIGHUP tới nữa, dù kernel vẫn gửi
SIGHUP cho chính shell đó như thường.

**`nohup` giải quyết vấn đề bằng cách chặn SIGHUP ngay tại chính process con**: `nohup cmd`
chạy `cmd` với tín hiệu `SIGHUP` được đặt thành bị bỏ qua (ignore) ngay từ đầu — bất kể SIGHUP
tới từ đâu (kernel gửi trực tiếp, hay do shell cha forward lại), process này đơn giản là không
phản ứng gì với tín hiệu đó, tiếp tục chạy. `nohup` cũng tự động redirect output ra file
`nohup.out` (nếu không tự redirect) vì sau khi terminal đóng, sẽ không còn "nơi" nào để in
output nếu để mặc định in ra terminal đã mất.

**`disown` khác `nohup` ở ĐỐI TƯỢNG được áp dụng**: `nohup` tác động lên PROCESS (chặn SIGHUP
từ lúc khởi động) — phải dùng trước khi hoặc ngay khi chạy lệnh. `disown` tác động lên BẢN GHI
TRONG SHELL (gỡ job khỏi danh sách theo dõi của shell) — áp dụng được cho một job ĐÃ ĐANG CHẠY
background. Đúng theo cơ chế vừa giải thích ở trên, `disown` có tác dụng CHÍNH XÁC vì shell chỉ
forward SIGHUP cho job nó còn "biết" — gỡ khỏi bảng theo dõi khiến shell không còn gửi SIGHUP
tới job đó khi chính shell thoát. `shopt huponexit` mở rộng thêm hành vi này sang cả trường hợp
login shell thoát BÌNH THƯỜNG (không chỉ khi tự nhận SIGHUP), mặc định thường tắt.

**Vì sao `jobs -l` không thấy job từ một lần SSH/terminal TRƯỚC**: bảng job là trạng thái CỦA
MỘT SHELL INSTANCE cụ thể — mỗi lần mở terminal/SSH mới là một shell mới, có bảng job RIÊNG,
rỗng từ đầu. Một process được `disown` xong, hoặc chạy bằng `nohup ... &` từ một session trước,
dù vẫn đang chạy thật trên hệ thống, sẽ KHÔNG xuất hiện trong `jobs -l` của session mới — phải
dùng `ps`/`pgrep` (không phụ thuộc shell instance) để tìm nó theo tên lệnh hoặc PID đã ghi lại
từ trước.

## 4. Thực hành

Chạy một job ở background, theo dõi bằng `jobs`, rồi `disown` (minh hoạ bằng `tail -f
/dev/null` thay cho một tác vụ dài thật — hành vi job control giống nhau):

```bash
$ tail -f /dev/null & echo "PID: $!"
PID: 30350
$ jobs -l
[1]+ 30350 Running                 tail -f /dev/null &
$ disown %1
$ jobs -l
(không còn gì được in ra)
```

Sau `disown`, `jobs -l` không còn hiển thị job này — nhưng process vẫn SỐNG THẬT (không bị
dừng), xác nhận bằng cách `kill` trực tiếp theo PID đã ghi lại trước đó vẫn thành công:

```bash
$ kill 30350
$ echo "da kill $?"
da kill 0
```

Chạy với `nohup`, xem process không còn gắn với việc "có terminal hay không" (ở đây minh hoạ
redirect output ra file, đúng hành vi mặc định của `nohup` khi không có terminal để in):

```bash
$ nohup tail -f /dev/null > /tmp/nohup_demo.out 2>&1 &
$ ps -p $! -o pid,ppid,stat,comm
    PID    PPID STAT COMMAND
  30357   30355 S    tail
```

Process chạy bình thường, output (nếu `tail -f /dev/null` có in gì) sẽ nằm trong
`/tmp/nohup_demo.out` thay vì terminal — đúng hành vi `nohup` đã mô tả ở mục 3.

## 5. Lỗi thường gặp và cách chẩn đoán

**Chạy `cmd &` rồi đóng terminal SSH, tưởng background là đủ để sống sót — nhưng job bị mất**
- Nguyên nhân: `cmd &` chỉ đưa job ra background, KHÔNG chặn `SIGHUP`. Shell vẫn đang "quản lý"
  job này trong bảng job của nó, nên khi shell nhận SIGHUP (do terminal/SSH đóng) và tự forward
  lại cho mọi job trước khi thoát (xem mục 3), job này cũng bị giết theo.
- Cách xác nhận: sau khi mất SSH và kết nối lại, `ps aux | grep <tên lệnh>` không còn thấy
  process.
- Cách xử lý: luôn dùng `nohup cmd &` (hoặc trong tmux/screen — một giải pháp mạnh hơn, giữ
  nguyên cả output tương tác, không chỉ chặn SIGHUP) cho tác vụ dài cần sống sót qua việc đóng
  session.

**Dùng `disown` nhưng vẫn lo lắng vì không chắc process có "thật sự an toàn" không**
- Nguyên nhân: hiểu `disown` giống `nohup` — thực ra `disown` chỉ gỡ khỏi bảng theo dõi của
  shell, không tự chặn SIGHUP ở tầng process (xem phân biệt ở mục 3). Với một số cấu hình shell
  (`huponexit` bật), riêng `disown` không đủ để đảm bảo an toàn 100% trong mọi tình huống.
- Cách xác nhận: kiểm tra `shopt huponexit` trong bash — nếu `on`, cân nhắc dùng thêm `nohup`
  kết hợp `disown` cho chắc chắn, không chỉ dựa vào một trong hai.
- Cách xử lý: với tác vụ CỰC KỲ quan trọng không được mất, ưu tiên `tmux`/`screen` (session độc
  lập hoàn toàn, có thể detach/attach lại nhiều lần) hơn là chỉ `nohup`/`disown`.

**Mất dấu PID của job đã background, không tìm lại được để kiểm tra tiến độ**
- Nguyên nhân: không ghi lại `$!` (PID của job background vừa tạo) ngay khi chạy, và job đó
  không còn trong `jobs -l` sau khi mở lại session mới.
- Cách xác nhận: không có cách "nhớ lại" PID nếu không ghi — phải tìm bằng
  `pgrep -af "<một phần lệnh đặc trưng>"`.
- Cách xử lý: luôn in và LƯU LẠI `$!` ngay sau khi chạy lệnh nền (ví dụ ghi vào file
  `echo $! > /tmp/job.pid`), đặc biệt với tác vụ dài cần theo dõi qua nhiều session.

## 6. Tình huống thực tế

Một SE SSH vào server để chạy một job đồng bộ dữ liệu dự kiến mất 3 giờ, chạy bằng `./sync.sh
&` rồi đóng terminal để về nhà, nghĩ rằng background là đủ. Sáng hôm sau kiểm tra, job đã biến
mất, dữ liệu chỉ đồng bộ được một phần.

1. `ps aux | grep sync.sh` — không còn process nào, xác nhận job đã bị dừng ở đâu đó.
2. Xem lại: lệnh chạy chỉ có `&`, không có `nohup`, không `disown`. Khi SSH session đóng (dù cố
   ý hay do mất mạng), shell nhận SIGHUP rồi tự forward lại cho mọi job nó còn quản lý trước
   khi thoát, bao gồm `sync.sh` — đây đúng là nguyên nhân (đã học ở mục 3), không phải lỗi
   ngẫu nhiên.
3. Dữ liệu đồng bộ một phần — cần xác minh xem `sync.sh` có cơ chế resume/idempotent không
   (chạy lại có tự bỏ qua phần đã đồng bộ hay đồng bộ lại từ đầu, gây trùng lặp).
4. Chạy lại đúng cách lần này: `nohup ./sync.sh > sync.log 2>&1 &` rồi `disown`, ghi lại PID
   (`echo $! > /tmp/sync.pid`) để có thể kiểm tra tiến độ qua `tail -f sync.log` ở các session
   sau mà không cần giữ nguyên session gốc.
5. Với các job dài tương tự trong tương lai, đề xuất team ưu tiên `tmux`: `tmux new -s sync`,
   chạy job trong đó, `Ctrl+B D` để detach — có thể `tmux attach -t sync` lại từ bất kỳ session
   SSH nào sau đó để xem lại output TRỰC TIẾP (không chỉ đọc log), mạnh hơn `nohup` cho tác vụ
   cần theo dõi tương tác.
6. Ghi vào runbook: mọi job vận hành dự kiến chạy quá 5 phút qua SSH PHẢI dùng `nohup`/`tmux`/
   `screen`, không chạy trần bằng `&`.

## 7. Tự kiểm tra

1. Bạn chạy `./backup.sh &` qua SSH rồi đóng terminal ngay. Job có chắc chắn tiếp tục chạy
   không? Vì sao?
   <details><summary>Đáp án</summary>Không chắc chắn — rất có thể bị dừng. <code>&</code> chỉ
   đưa job ra background, không chặn <code>SIGHUP</code>. Shell vẫn "quản lý" job này, và theo
   tài liệu Bash, một interactive shell nhận SIGHUP sẽ tự forward lại cho toàn bộ job nó quản
   lý trước khi thoát — kể cả job background.</details>

2. Phân biệt: `nohup cmd &` và `cmd & ; disown` khác nhau ở điểm nào?
   <details><summary>Đáp án</summary><code>nohup</code> tác động ở TẦNG PROCESS — chặn
   <code>SIGHUP</code> ngay từ lúc khởi động process. <code>disown</code> tác động ở TẦNG SHELL
   — chỉ gỡ job khỏi bảng theo dõi của shell hiện tại, không tự chặn SIGHUP ở tầng process
   (dù trong thực tế với hầu hết cấu hình bash tương tác, kết quả cuối thường tương tự, nhưng
   cơ chế bên dưới khác nhau).</details>

3. Bạn mở một session SSH mới và chạy `jobs -l`, không thấy job đã `nohup` + background từ một
   session TRƯỚC đó, dù `ps aux` vẫn thấy process đang chạy. Đây có phải lỗi không?
   <details><summary>Đáp án</summary>Không phải lỗi. Bảng job (<code>jobs</code>) thuộc về MỘT
   shell instance cụ thể — mỗi session mới có bảng job riêng, rỗng từ đầu, không "nhìn thấy"
   job của session khác dù process đó vẫn đang chạy thật trên hệ thống.</details>

4. Vì sao nên lưu lại `$!` ngay sau khi chạy một lệnh nền dài hạn?
   <details><summary>Đáp án</summary><code>$!</code> là PID của job background vừa tạo — đây
   là cách duy nhất để "tìm lại" chính xác process đó sau này (để kiểm tra tiến độ, gửi tín
   hiệu, hay xác nhận nó còn sống), đặc biệt sau khi job đã bị <code>disown</code> hoặc sau khi
   mở một session mới không còn thấy nó trong <code>jobs -l</code>.</details>

5. Vì sao `tmux`/`screen` được coi là giải pháp "mạnh hơn" `nohup` cho một tác vụ cần theo dõi
   tương tác liên tục (không chỉ cần sống sót qua mất kết nối)?
   <details><summary>Đáp án</summary><code>nohup</code> chỉ giúp process không bị
   <code>SIGHUP</code> giết khi terminal đóng, output phải đọc qua file log sau đó.
   <code>tmux</code>/<code>screen</code> tạo một session giả lập ĐỘC LẬP khỏi kết nối SSH hiện
   tại — có thể "detach" rồi "attach" lại từ bất kỳ kết nối SSH nào sau đó và nhìn thấy TRỰC
   TIẾP đúng màn hình terminal như lúc rời đi, không chỉ đọc log tĩnh.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.process-signals.signals` — ý nghĩa `SIGHUP` mà `nohup` chặn, và tại sao terminal đóng
  lại gửi tín hiệu này.
- `linux.process-signals.lifecycle` — quan hệ cha-con giữa shell và job background.

**Nguồn tham khảo:**
- [signal(7) — man7.org](https://man7.org/linux/man-pages/man7/signal.7.html) — định nghĩa
  `SIGHUP` và hành vi mặc định.
- [Bash Reference Manual — Signals](https://www.gnu.org/software/bash/manual/html_node/Signals.html)
  — xác nhận interactive shell tự forward `SIGHUP` cho job nó quản lý trước khi thoát, và vai
  trò của `shopt huponexit`.
