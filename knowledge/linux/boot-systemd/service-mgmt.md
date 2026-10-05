---
id: linux.boot-systemd.service-mgmt
title: "Quản lý service với systemctl (start/stop/enable/status)"
domain: linux
module: linux.boot-systemd
level: "vận hành"
prerequisites: ["linux.boot-systemd.units"]
applies_to:
  - "Ubuntu 22.04 LTS (systemd 249)"
  - "Lệnh systemctl giống nhau trên mọi distro dùng systemd; khác biệt chỉ ở tên service"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man5/systemd.service.5.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Đây là nhóm lệnh SE dùng nhiều nhất trong ngày: kiểm tra một dịch vụ có đang chạy không, khởi
động lại sau khi đổi config, hoặc đảm bảo một service tự chạy lại sau reboot. Hiểu đúng và
chính xác từng lệnh — không chỉ "biết gõ" mà biết lệnh nào làm gì, an toàn tới đâu — quyết định
tốc độ xử lý khi có incident lúc 2 giờ sáng.

## 2. Khái niệm cốt lõi

6 lệnh cốt lõi, chia theo 2 nhóm: **tác động ngay** (runtime) và **đăng ký cho boot sau**
(persistence) — nhắc lại và mở rộng phân biệt đã nêu ở bài trước
(`linux.boot-systemd.units`):

| Lệnh | Nhóm | Tác dụng |
|---|---|---|
| `systemctl start <unit>` | Runtime | Chạy service NGAY |
| `systemctl stop <unit>` | Runtime | Dừng service NGAY |
| `systemctl restart <unit>` | Runtime | Stop rồi start lại (có khoảng downtime) |
| `systemctl reload <unit>` | Runtime | Yêu cầu service tự nạp lại config, KHÔNG restart process (chỉ hoạt động nếu service hỗ trợ, qua `ExecReload=`) |
| `systemctl enable <unit>` | Persistence | Đăng ký tự chạy ở các lần boot SAU |
| `systemctl disable <unit>` | Persistence | Bỏ đăng ký tự chạy |

Hai lệnh đọc trạng thái, không đổi gì:

- `systemctl status <unit>` — tổng hợp: loaded/active state, PID, vài dòng log gần nhất.
- `systemctl is-active <unit>` / `systemctl is-enabled <unit>` — trả đúng 1 từ
  (`active`/`inactive`/`failed`, hoặc `enabled`/`disabled`), dùng tốt trong script vì dễ parse
  và set đúng exit code.

## 3. Cách nó hoạt động

**`reload` không phải lúc nào cũng khả dụng**: lệnh này gửi tín hiệu tương ứng `ExecReload=`
khai báo trong file service (thường là gửi `SIGHUP` cho process, hoặc chạy một lệnh riêng để
service tự đọc lại config mà không tắt). Nếu file service không khai báo `ExecReload=`,
`systemctl reload` sẽ báo lỗi "Job type reload is not applicable" — khi đó buộc phải dùng
`restart` (có downtime ngắn, process bị tắt rồi khởi động lại hoàn toàn) thay vì `reload`.

**`restart` khi unit đang inactive vẫn hoạt động, tương đương `start`**: không cần kiểm tra
trạng thái trước khi gọi `restart` — nếu unit chưa chạy, systemd chỉ thực hiện phần "start",
bỏ qua phần "stop" vì không có gì để dừng.

**Exit code của `systemctl status` khác 0 không có nghĩa là lỗi lệnh**: `status` trả về exit
code theo chuẩn LSB phản ánh TRẠNG THÁI của unit — `0` = active, `3` = KHÔNG active (dùng
chung cho cả `inactive` lẫn `failed`, hai trạng thái này không có mã riêng để phân biệt qua
exit code), `4` = unit không tồn tại — không phải lỗi của chính lệnh `systemctl`. Script tự
động muốn biết CHÍNH XÁC có phải `failed` hay chỉ đơn thuần `inactive` phải dùng riêng
`systemctl is-failed foo.service` (trả `active`/`failed`/`unknown`, không dùng chung mã với
`is-active`), không thể suy ra từ một mình exit code `3`.

**`mask` khác `disable`**: `disable` chỉ xoá symlink trong `*.target.wants/` — service vẫn có
thể bị `start` tay hoặc được một unit khác kéo dậy qua `Requires=`. `mask` đi xa hơn: tạo
symlink unit đó trỏ tới `/dev/null`, khiến KHÔNG AI (kể cả start tay, kể cả dependency khác)
khởi động được nó cho tới khi `unmask`. Dùng `mask` khi cần chắc chắn một service không được
chạy trong bất kỳ trường hợp nào (ví dụ đã thay thế hẳn bằng service khác).

## 4. Thực hành

Để minh hoạ an toàn mà không đụng tới service hệ thống thật, các lệnh dưới đây chạy trên một
unit demo tạo riêng cho bài học (`se-dojo-demo.service`, scope **user** —
`systemctl --user`, không phải unit hệ thống, không ảnh hưởng gì tới máy đang chạy ngoài phiên
đăng nhập hiện tại), nội dung chỉ là `ExecStart=/bin/sleep infinity`. Toàn bộ lệnh `systemctl
--user` hoạt động giống hệt `systemctl` (hệ thống) về cú pháp, chỉ khác phạm vi quản lý.

Trạng thái trước khi start (chú ý exit code 3 — đây là "inactive", không phải lỗi lệnh):

```bash
$ systemctl --user status se-dojo-demo.service
○ se-dojo-demo.service - SE Dojo demo service
     Loaded: loaded (/home/.../se-dojo-demo.service; disabled; vendor preset: enabled)
     Active: inactive (dead)
$ echo $?
3
```

Start, rồi xem status (chú ý `Main PID`, `Active: active (running) since ...`):

```bash
$ systemctl --user start se-dojo-demo.service
$ systemctl --user status se-dojo-demo.service
● se-dojo-demo.service - SE Dojo demo service
     Loaded: loaded (...; disabled; vendor preset: enabled)
     Active: active (running) since Mon 2026-10-05 12:01:58 +07; 13ms ago
   Main PID: 27907 (sleep)
      Tasks: 1 (limit: 18589)
     Memory: 284.0K
        CPU: 2ms
```

`enable` rồi kiểm tra bằng `is-enabled` (chú ý `enable` không in gì về trạng thái RUNNING, chỉ
tạo symlink — đúng như phân biệt ở mục 2):

```bash
$ systemctl --user enable se-dojo-demo.service
Created symlink /home/.../default.target.wants/se-dojo-demo.service → /home/.../se-dojo-demo.service.
$ systemctl --user is-enabled se-dojo-demo.service
enabled
```

`restart` trên unit đang chạy (PID đổi — process cũ bị kill, process mới được tạo, không phải
"nạp lại" process cũ):

```bash
$ systemctl --user restart se-dojo-demo.service
$ systemctl --user status se-dojo-demo.service
● se-dojo-demo.service - SE Dojo demo service
     Active: active (running) since Mon 2026-10-05 12:01:59 +07; 5ms ago
   Main PID: 27917 (sleep)
```

(PID đổi từ `27907` → `27917` — xác nhận đây là process hoàn toàn mới, không phải cùng
process được "làm mới").

`stop` + `disable`, rồi xem lại journal — log vẫn còn dù service đã dừng, vì `journalctl` đọc
từ journal (lưu riêng), không phụ thuộc unit còn tồn tại hay không:

```bash
$ systemctl --user stop se-dojo-demo.service
$ systemctl --user disable se-dojo-demo.service
Removed /home/.../default.target.wants/se-dojo-demo.service.
$ journalctl --user -u se-dojo-demo.service --no-pager
Thg 10 05 12:01:58 ... systemd[3466]: Started SE Dojo demo service.
Thg 10 05 12:01:59 ... systemd[3466]: Stopping SE Dojo demo service...
Thg 10 05 12:01:59 ... systemd[3466]: Stopped SE Dojo demo service.
Thg 10 05 12:01:59 ... systemd[3466]: Started SE Dojo demo service.
Thg 10 05 12:02:07 ... systemd[3466]: Stopping SE Dojo demo service...
Thg 10 05 12:02:07 ... systemd[3466]: Stopped SE Dojo demo service.
```

Với service hệ thống thật (không cần `--user`), cách đọc log tương tự:
`journalctl -u cron.service --no-pager -n 20` (xem 20 dòng log gần nhất của `cron.service`).

## 5. Lỗi thường gặp và cách chẩn đoán

**`systemctl reload foo.service` báo lỗi "Job type reload is not applicable for unit"**
- Nguyên nhân: file service không khai báo `ExecReload=`, service đó không hỗ trợ reload
  (phổ biến với daemon đơn giản không tự implement cơ chế đọc lại config khi đang chạy).
- Cách xác nhận: `systemctl cat foo.service` xem có dòng `ExecReload=` không.
- Cách xử lý: dùng `systemctl restart foo.service` thay thế — chấp nhận một khoảng downtime
  ngắn trong lúc process khởi động lại.

**Đổi file service, chạy `systemctl restart` ngay, hành vi không đổi**
- Nguyên nhân: như đã nói ở bài trước, thiếu `systemctl daemon-reload` sau khi sửa file unit —
  `restart` dùng lại định nghĩa CŨ đang cache trong bộ nhớ systemd.
- Cách xác nhận: `systemctl status foo.service` hiện cảnh báo "unit file changed on disk".
- Cách xử lý: luôn chạy `daemon-reload` trước `restart` sau khi sửa unit file.

**`systemctl start foo.service` không báo lỗi gì nhưng service "biến mất" sau vài giây**
- Nguyên nhân: service fail ngay khi chạy (ví dụ lỗi cấu hình, thiếu quyền, port đã bị chiếm),
  và `Restart=` không được cấu hình (hoặc đã thử lại hết số lần cho phép) nên dừng hẳn ở trạng
  thái `failed`.
- Cách xác nhận: `systemctl status foo.service` cho thấy `Active: failed`, kèm vài dòng log
  lỗi cuối; `journalctl -u foo.service -n 50` xem đầy đủ log để tìm nguyên nhân gốc.
- Cách xử lý: sửa nguyên nhân gốc theo log (thường là lỗi config hoặc port conflict), rồi
  `systemctl reset-failed foo.service` để xoá trạng thái "failed" tồn đọng trước khi start lại.

## 6. Tình huống thực tế

Một ứng dụng nội bộ (`billing-worker.service`) được báo là "sáng nay không chạy". Quy trình xử
lý:

1. `systemctl status billing-worker.service` — thấy `Active: failed (Result: exit-code)`,
   dòng log cuối: `Main process exited, code=exited, status=1/FAILURE`.
2. `journalctl -u billing-worker.service -n 50 --no-pager` — kéo xuống thấy log ứng dụng tự in
   ra trước khi chết: `FATAL: cannot bind port 8080: address already in use`.
3. Xác định process nào đang chiếm port 8080:
   `ss -ltnp | grep :8080` → thấy một process `billing-worker` khác (PID cũ) vẫn đang chạy —
   khả năng cao là lần deploy trước dùng lệnh khởi động process trực tiếp (không qua systemd),
   để lại process "mồ côi" không bị quản lý.
4. Dừng process cũ đó bằng đúng PID tìm được (không dùng `kill` bừa theo tên để tránh ảnh hưởng
   process khác trùng tên), sau đó `systemctl reset-failed billing-worker.service` để xoá
   trạng thái failed tồn đọng.
5. `systemctl start billing-worker.service` — lần này bind port thành công vì không còn ai
   chiếm port.
6. Ghi vào runbook: không bao giờ chạy app trực tiếp bằng tay khi app đã có systemd unit quản
   lý — mọi lần khởi động/dừng đều phải qua `systemctl` để tránh tình trạng có process "ngoài
   vòng kiểm soát" của systemd gây xung đột port ở lần restart kế tiếp.

## 7. Tự kiểm tra

1. Bạn chạy `systemctl reload nginx.service` và nhận lỗi "Job type reload is not applicable".
   Bước tiếp theo hợp lý là gì, và vì sao `restart` không "nguy hiểm ngang" `reload` trong mọi
   trường hợp?
   <details><summary>Đáp án</summary>Dùng <code>systemctl restart nginx.service</code> thay thế
   (nginx thường hỗ trợ reload thật qua <code>ExecReload=</code>, nhưng nếu lỗi này xảy ra tức
   bản cấu hình/unit cụ thể không khai báo nó). Khác biệt quan trọng: <code>reload</code> không
   tắt process (không mất kết nối đang xử lý), còn <code>restart</code> tắt hẳn rồi chạy lại —
   có một khoảng downtime và có thể làm rớt kết nối đang mở, nên với service chịu tải cao cần
   cân nhắc thời điểm restart.</details>

2. `systemctl status foo.service` trả về exit code `3`. Đây có phải lỗi của lệnh `systemctl`
   không?
   <details><summary>Đáp án</summary>Không. Exit code của <code>status</code> phản ánh TRẠNG
   THÁI của unit (3 nghĩa là KHÔNG active — dùng chung cho cả inactive và failed, không có mã
   riêng để phân biệt hai trạng thái này), không phải lỗi thực thi lệnh. Muốn biết lệnh
   <code>systemctl</code> bản thân có lỗi hay không, cần nhìn vào output lỗi (stderr), không chỉ
   dựa vào exit code của status.</details>

3. Sau khi `systemctl enable foo.service`, bạn `reboot` server nhưng `foo.service` KHÔNG tự
   chạy. Hai khả năng hợp lý nhất cần kiểm tra trước là gì?
   <details><summary>Đáp án</summary>(1) File service không có dòng
   <code>WantedBy=</code> đúng target thực sự được kích hoạt lúc boot (ví dụ file khai báo
   <code>WantedBy=multi-user.target</code> nhưng máy này boot tới <code>graphical.target</code>
   — về lý thuyết <code>graphical.target</code> kéo theo <code>multi-user.target</code> nên
   trường hợp này thường không phải nguyên nhân, nhưng cần xác nhận); (2) service tự fail ngay
   khi khởi động (ví dụ do thiếu tài nguyên lúc boot sớm) rồi dừng ở trạng thái failed mà không
   ai để ý — kiểm tra bằng <code>systemctl status foo.service</code> và
   <code>journalctl -b -u foo.service</code> (log của lần boot hiện tại).</details>

4. Phân biệt `systemctl disable foo.service` và `systemctl mask foo.service` — khi nào chọn
   cái thứ hai?
   <details><summary>Đáp án</summary><code>disable</code> chỉ xoá symlink trong
   <code>*.target.wants/</code> — service vẫn start được bằng tay hoặc bị kéo dậy qua
   <code>Requires=</code> từ unit khác. <code>mask</code> trỏ unit đó sang
   <code>/dev/null</code>, không ai khởi động được nó dưới bất kỳ hình thức nào cho tới khi
   <code>unmask</code>. Chọn <code>mask</code> khi cần đảm bảo tuyệt đối một service không được
   chạy (ví dụ đã thay thế hẳn bằng service khác và không muốn rủi ro bị dependency kéo dậy
   nhầm).</details>

5. Vì sao nên dùng `systemctl is-active foo.service` (kiểm tra exit code) trong script tự
   động, thay vì `systemctl status foo.service | grep "running"`?
   <details><summary>Đáp án</summary><code>is-active</code> trả về đúng một từ chuẩn hoá
   (active/inactive/failed/...) và exit code tương ứng, ổn định để script dựa vào. Parse chuỗi
   output của <code>status</code> (vốn là output cho người đọc, có thể đổi định dạng giữa các
   phiên bản systemd, chứa nhiều ngôn ngữ khác nhau tuỳ locale) dễ gãy và không đáng tin cho
   logic tự động.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.boot-systemd.units` — cấu trúc unit file, phân biệt `enable` và `start` ở mức khái
  niệm (bài này thực hành trực tiếp).
- `linux.boot-systemd.timers` — thay thế cron bằng `.timer`, vẫn dùng chung bộ lệnh
  `systemctl` để quản lý.

**Nguồn tham khảo:**
- [systemd.service(5) — man7.org](https://man7.org/linux/man-pages/man5/systemd.service.5.html)
  — định nghĩa `ExecReload=`, `Restart=`, các `Type=`.
