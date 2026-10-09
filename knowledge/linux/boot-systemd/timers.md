---
id: linux.boot-systemd.timers
title: "systemd timer và cron: lập lịch tác vụ"
domain: linux
module: linux.boot-systemd
level: "vận hành"
prerequisites: ["linux.boot-systemd.units"]
applies_to:
  - "Ubuntu 22.04 LTS (systemd 249)"
  - "cron (vixie-cron/cronie — cú pháp crontab giống nhau giữa các distro)"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man5/systemd.timer.5.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Backup hằng đêm chạy trễ, job dọn log không chạy sau khi server reboot giữa đêm, hay hai task
lập lịch "đè" lên nhau vì chạy cùng giờ — phần lớn sự cố dạng "tự động hoá bị im lặng" đều xoay
quanh cron hoặc systemd timer. SE hiện đại cần biết CẢ HAI: cron vẫn còn khắp nơi trong các
script cũ, còn systemd timer dần trở thành chuẩn mới (nhiều distro hiện đại, như log rotation
trên máy viết bài này, đã chuyển sang dùng timer thay cron — xem mục 4) và giải quyết đúng điểm
yếu của cron (không catch-up sau khi máy tắt, không tích hợp log/dependency).

## 2. Khái niệm cốt lõi

systemd timer hoạt động theo cặp: một `.timer` unit định nghĩa LỊCH, kích hoạt một `.service`
unit CÙNG TÊN gốc (trừ khi khai báo khác bằng `Unit=`) để thực hiện công việc thật:

```
logrotate.timer   --(đến giờ)-->   logrotate.service
```

Hai cách khai báo lịch chính trong `[Timer]`:

| Chỉ thị | Ý nghĩa | Giống cron ở điểm nào |
|---|---|---|
| `OnCalendar=` | Lịch theo giờ thực (wall-clock), cú pháp riêng (`daily`, `*-*-* 02:00:00`...) | Gần nhất với cron (chạy "lúc 2h sáng mỗi ngày") |
| `OnBootSec=` | Chạy sau N giây/phút kể từ lúc boot | Không có tương đương trong cron |
| `OnUnitActiveSec=` | Chạy sau N giây/phút kể từ lần unit này active trước đó | Giống `@reboot` + lặp lại, nhưng tính từ lần CHẠY trước, không phải mốc cố định |

Thêm `Persistent=true` để timer tự "bắt kịp" (catch-up) nếu máy tắt đúng lúc lịch đáng lẽ chạy
— đây là khác biệt lớn nhất so với cron truyền thống (xem mục 3).

## 3. Cách nó hoạt động

**`Persistent=true` giải quyết đúng điểm yếu kinh điển của cron**: cron chỉ kiểm tra lịch tại
thời điểm đến giờ — nếu máy đang TẮT lúc 2h sáng (giờ backup hằng ngày), cron đơn giản là bỏ
lỡ, không có cơ chế bù. Với `Persistent=true`, systemd ghi lại "lần cuối unit này được kích
hoạt" vào đĩa; khi máy khởi động lại, nếu phát hiện đã bỏ lỡ một lần kích hoạt theo lịch, nó
chạy ngay sau khi boot xong để bù lại. Đây là lý do nhiều distro hiện đại chuyển các job quan
trọng (dọn log, backup) từ cron sang timer.

**Timer có `AccuracySec=` — lịch không chính xác tuyệt đối theo thiết kế**: để tránh tất cả
timer "đến giờ" cùng lúc làm máy giật tải (ví dụ 100 timer đều đặt đúng `00:00:00`), systemd
cho phép trễ một khoảng ngẫu nhiên trong phạm vi `AccuracySec=` (mặc định 1 phút) để rải đều
tải CPU/I/O. Ví dụ thật trên máy viết bài này, `logrotate.timer` đặt `AccuracySec=1h` — nghĩa
là có thể chạy lệch tới 1 giờ so với giờ lý thuyết, đánh đổi lấy việc không dồn tải đúng lúc
nửa đêm.

**Tên file quyết định unit nào được kích hoạt, trừ khi ghi đè bằng `Unit=`**: theo quy ước mặc
định, `foo.timer` kích hoạt `foo.service` (cùng tên gốc, khác đuôi) — không cần khai báo gì
thêm. Chỉ cần thêm `Unit=other.service` trong `[Timer]` nếu muốn trỏ tới một service tên khác.

**Khác biệt vận hành so với cron**: timer là một unit systemd đầy đủ — có thể xem log qua
`journalctl -u foo.service` (cron ghi log rải rác, tuỳ cấu hình syslog), có thể khai báo
`After=`/`Requires=` để đảm bảo thứ tự với unit khác (ví dụ chỉ chạy backup SAU khi một mount
network sẵn sàng), và `systemctl list-timers` cho cái nhìn tổng hợp mọi timer cùng lúc — cron
không có lệnh tương đương, phải tự đọc từng crontab.

## 4. Thực hành

Xem toàn bộ timer đang hoạt động trên máy, sắp theo thời điểm chạy kế tiếp:

```bash
$ systemctl list-timers --all
NEXT                        LEFT       LAST                       PASSED      UNIT                 ACTIVATES
Mon 2026-10-05 12:33:02 +07 31min left Mon 2026-10-05 11:30:36 +07 30min ago   anacron.timer        anacron.service
...
Tue 2026-10-06 00:00:00 +07 11h left   Mon 2026-10-05 07:50:32 +07 4h10min ago logrotate.timer      logrotate.service
...
```

Cột `ACTIVATES` xác nhận đúng quy ước "tên gốc giống nhau" nói ở mục 3. Xem định nghĩa thật
của `logrotate.timer` (ví dụ thực tế cho `OnCalendar=`/`Persistent=`/`AccuracySec=`):

```bash
$ systemctl cat logrotate.timer
# /lib/systemd/system/logrotate.timer
[Unit]
Description=Daily rotation of log files
Documentation=man:logrotate(8) man:logrotate.conf(5)

[Timer]
OnCalendar=daily
AccuracySec=1h
Persistent=true

[Install]
WantedBy=timers.target
```

`OnCalendar=daily` là viết tắt của `*-*-* 00:00:00` (cú pháp lịch của systemd đọc tương tự
ngày-tháng-năm giờ:phút:giây, `*` là "mọi giá trị"). `Persistent=true` đảm bảo nếu máy tắt đúng
lúc nửa đêm, log vẫn được rotate ngay khi máy khởi động lại lần sau — xoay vòng log không bị
"trôi" vô thời hạn chỉ vì máy tắt đúng lúc.

Tạo một timer demo gắn với service demo đã dùng ở bài trước (`se-dojo-demo.service`, scope
user — không ảnh hưởng hệ thống), để thấy cách khai báo tối thiểu:

```bash
# ~/.config/systemd/user/se-dojo-demo.timer
[Unit]
Description=Timer demo cho SE Dojo (kich hoat se-dojo-demo.service)

[Timer]
OnCalendar=*-*-* *:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
$ systemctl --user daemon-reload
$ systemctl --user start se-dojo-demo.timer
$ systemctl --user list-timers --all
NEXT                        LEFT       LAST PASSED UNIT               ACTIVATES
Mon 2026-10-05 13:00:00 +07 57min left n/a  n/a    se-dojo-demo.timer se-dojo-demo.service
```

`LAST`/`PASSED` đều là `n/a` vì timer này vừa tạo, chưa từng kích hoạt lần nào — khác với các
timer hệ thống lâu đời ở ví dụ trên đã có lịch sử. (Unit demo này đã được dọn sạch
— `stop` + `disable` + xoá file + `daemon-reload` — ngay sau khi chụp lại kết quả cho bài học,
không để lại trên máy.)

## 5. Lỗi thường gặp và cách chẩn đoán

**Tạo `foo.timer` xong, `systemctl list-timers` không thấy xuất hiện**
- Nguyên nhân phổ biến nhất: quên `systemctl daemon-reload` sau khi tạo file mới (giống lỗi đã
  nêu ở hai bài trước — đây là lỗi lặp lại thường gặp nhất với người mới dùng systemd), hoặc
  quên `systemctl enable`/`start` chính timer đó (tạo file không tự động kích hoạt gì).
- Cách xác nhận: `systemctl status foo.timer` báo "could not be found" nếu chưa reload đúng
  cách, hoặc hiện `inactive (dead)` nếu đã nạp nhưng chưa start.
- Cách xử lý: `daemon-reload` rồi `enable --now foo.timer`.

**Timer chạy đúng giờ nhưng service gắn với nó không làm gì (hoặc fail), không ai biết**
- Nguyên nhân: timer chỉ chịu trách nhiệm "đến giờ thì kích hoạt", không có nghĩa service chạy
  thành công — nếu không chủ động giám sát, một job quan trọng có thể fail âm thầm trong nhiều
  ngày trước khi bị phát hiện (ví dụ do thay đổi quyền file khiến job không ghi được output).
- Cách xác nhận: `systemctl list-timers` cho thấy "LAST" vẫn cập nhật đúng giờ (timer có chạy),
  nhưng `systemctl status foo.service` sau đó cho thấy `Active: failed`.
- Cách xử lý: với job quan trọng, luôn có cảnh báo riêng (không chỉ dựa vào việc "thấy timer
  chạy là yên tâm") — ví dụ thêm `OnFailure=alert-on-failure.service` trong `[Unit]` của
  service để tự kích hoạt một unit gửi cảnh báo khi job thất bại.

**Đổi `OnCalendar=` nhưng `NEXT` trong `list-timers` vẫn hiện giờ cũ**
- Nguyên nhân: giống hai lỗi trên — thiếu `daemon-reload`; đôi khi còn cần `systemctl restart
  foo.timer` (không chỉ reload) vì bản thân timer instance đang chạy đã tính "lần kích hoạt kế
  tiếp" dựa theo lịch CŨ tại thời điểm nó start, sửa file không tự tính lại cho tới khi
  restart.
- Cách xử lý: `daemon-reload` + `systemctl restart foo.timer`, rồi kiểm tra lại bằng
  `list-timers`.

## 6. Tình huống thực tế

Team phát hiện báo cáo doanh thu hằng ngày (sinh ra bởi `daily-report.timer` →
`daily-report.service`, chạy lúc 06:00) không xuất hiện sau một lần bảo trì hạ tầng (migrate
sang server mới) dù trước đó chạy ổn định nhiều tháng.

1. `systemctl list-timers | grep daily-report` — timer vẫn hiện trong danh sách, `LAST` cho
   thấy ĐÃ chạy đúng 06:00 sáng nay (vậy vấn đề không phải do timer không kích hoạt).
2. `systemctl status daily-report.service` — `Active: failed (Result: exit-code)`.
3. `journalctl -u daily-report.service -n 30 --no-pager` — log cuối cho thấy
   `FATAL: cannot write to /mnt/reports: Permission denied`.
4. `/mnt/reports` là một network share — sau khi migrate server, share được remount với owner/
   permission khác (do UID của service account đổi giữa hai server). Script chạy đúng giờ,
   đúng logic, nhưng không viết được file vì quyền sai.
5. Sửa quyền (hoặc sửa UID service account cho khớp lại giữa hai môi trường), sau đó
   `systemctl reset-failed daily-report.service` rồi `systemctl start daily-report.service` để
   chạy thử lại ngay (không cần chờ tới 06:00 ngày sau).
6. Thêm `OnFailure=` vào service để lần sau job lập lịch fail âm thầm kiểu này được phát hiện
   ngay trong vài phút, không phải chờ người dùng cuối báo thiếu báo cáo.

## 7. Tự kiểm tra

1. Một job cần chạy đúng 30 phút sau mỗi lần nó chạy xong (không phải "đúng giờ cố định" mà là
   "cách đều kể từ lần trước"). `OnCalendar=` hay `OnUnitActiveSec=` phù hợp hơn?
   <details><summary>Đáp án</summary><code>OnUnitActiveSec=30min</code> — tính từ lần unit này
   ACTIVE gần nhất, phù hợp đúng yêu cầu "cách đều kể từ lần trước", khác với
   <code>OnCalendar=</code> vốn gắn với mốc giờ thực cố định.</details>

2. Máy chủ backup tắt đúng lúc 2h sáng (giờ job backup theo lịch) do mất điện, phục hồi lúc
   8h sáng. Với `Persistent=true`, điều gì xảy ra? Nếu KHÔNG có `Persistent=true`?
   <details><summary>Đáp án</summary>Có <code>Persistent=true</code>: job backup bị bỏ lỡ sẽ tự
   chạy ngay sau khi máy khởi động lại lúc 8h (bù lại lần bị lỡ). Không có: job đó bị bỏ qua
   hoàn toàn cho tới lần kích hoạt theo lịch tiếp theo (2h sáng ngày kế) — mất một kỳ backup mà
   không có cảnh báo gì riêng.</details>

3. `logrotate.timer` trên máy thật có `AccuracySec=1h`. Nếu 50 server trong hệ thống đều cùng
   cấu hình này và cùng đặt `OnCalendar=daily`, chúng có chắc chắn chạy đúng cùng một giây
   không? Vì sao điều đó lại là chủ ý thiết kế?
   <details><summary>Đáp án</summary>Không chắc — mỗi máy có thể lệch tới 1 giờ so với giờ lý
   thuyết do <code>AccuracySec=</code>. Đây là chủ ý: tránh toàn bộ các timer dồn vào đúng một
   thời điểm gây giật tải CPU/I/O đồng loạt, đánh đổi độ chính xác tuyệt đối để lấy tải được rải
   đều.</details>

4. Bạn sửa `OnCalendar=` trong file `foo.timer` từ `daily` thành `*-*-* 03:00:00`, chạy
   `systemctl daemon-reload`, nhưng `list-timers` vẫn hiện giờ kích hoạt kế tiếp theo lịch cũ.
   Bước tiếp theo?
   <details><summary>Đáp án</summary><code>systemctl restart foo.timer</code> — timer instance
   đang chạy đã tính "lần kích hoạt kế tiếp" dựa theo lịch tại thời điểm nó start; chỉ
   <code>daemon-reload</code> nạp lại định nghĩa file, chưa buộc timer tính lại ngay, cần
   restart để áp dụng lịch mới.</details>

5. Vì sao `systemctl list-timers` hữu ích hơn việc liệt kê từng crontab của từng user khi cần
   kiểm toán toàn bộ job lập lịch trên một server?
   <details><summary>Đáp án</summary><code>list-timers</code> cho một bảng tổng hợp MỌI timer
   hệ thống (không phân biệt user nào tạo), sắp theo thời điểm chạy kế tiếp, kèm lịch sử lần
   chạy gần nhất — một lệnh, một cái nhìn toàn cảnh. Với cron, mỗi user có crontab riêng
   (<code>crontab -l</code> chỉ xem được của user hiện tại hoặc cần quyền root để xem của
   người khác), không có lệnh tổng hợp tương đương.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.boot-systemd.units` — cấu trúc `[Unit]`/`[Install]` dùng chung cho mọi loại unit,
  bao gồm `.timer`.
- `linux.boot-systemd.service-mgmt` — bộ lệnh `systemctl` start/stop/enable dùng để quản lý cả
  `.timer` giống như `.service`.

**Nguồn tham khảo:**
- [systemd.timer(5) — man7.org](https://man7.org/linux/man-pages/man5/systemd.timer.5.html) —
  định nghĩa chính thức `OnCalendar=`, `OnBootSec=`, `OnUnitActiveSec=`, `Persistent=`.
