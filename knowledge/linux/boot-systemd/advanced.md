---
id: linux.boot-systemd.advanced
title: "systemd nâng cao: dependency (After/Requires), target, socket activation, cấu hình journald"
domain: linux
module: linux.boot-systemd
level: "chuyên sâu"
prerequisites: ["linux.boot-systemd.service-mgmt"]
applies_to:
  - "Ubuntu 22.04 LTS (systemd 249)"
  - "Khái niệm socket activation/journald áp dụng chung mọi distro dùng systemd"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man5/systemd.socket.5.html"
  - "https://man7.org/linux/man-pages/man5/journald.conf.5.html"
  - "https://man7.org/linux/man-pages/man7/bootup.7.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Ba bài trước trong module đủ để vận hành hằng ngày. Bài này dành cho lúc cần hiểu SÂU hơn: vì
sao một service "tự nhiên" khởi động dù không ai gọi `start` (socket activation), vì sao một
cụm nhiều service cùng phụ thuộc một target lại đôi khi khởi động không như kỳ vọng (dependency
graph phức tạp), và vì sao log đột ngột "biến mất" sau reboot trên một số máy (journald
`Storage=volatile`). Đây là kiến thức cần khi debug những ca lạ mà 3 bài trước không đủ giải
thích.

## 2. Khái niệm cốt lõi

**Socket activation**: một `.socket` unit khai báo một địa chỉ lắng nghe (`ListenStream=` cho
TCP, có thể là cổng hoặc file socket Unix), systemd tự lắng nghe HỘ service — service tương
ứng (cùng tên gốc) CHỈ thực sự được khởi động khi có kết nối đầu tiên tới. Lợi ích: service
không cần chạy sẵn 24/7 nếu ít dùng, và nhiều service có thể khởi động PARALLEL ngay từ đầu boot
vì socket đã sẵn sàng nhận kết nối trước khi service thật kịp khởi động xong (kết nối tới
được giữ trong buffer, không bị từ chối).

**journald**: bộ thu log trung tâm của systemd (thay thế một phần vai trò syslog truyền
thống). Cấu hình chính ở `/etc/systemd/journald.conf`, quan trọng nhất là `Storage=`:

| Giá trị | Ý nghĩa |
|---|---|
| `volatile` | Chỉ lưu trong RAM (`/run/log/journal`) — **mất hết log khi reboot** |
| `persistent` | Lưu trên đĩa (`/var/log/journal`), có fallback về RAM nếu thư mục chưa tồn tại |
| `auto` (mặc định) | Hành xử như `persistent` NẾU `/var/log/journal` đã tồn tại, ngược lại như `volatile` |
| `none` | Tắt hoàn toàn việc lưu trữ (vẫn có thể forward sang nơi khác) |

## 3. Cách nó hoạt động

**Vì sao `Accept=` trong `.socket` quyết định cả tên service được kéo dậy**: với
`Accept=no` (mặc định, phổ biến hơn), MỘT instance service duy nhất xử lý mọi kết nối tới
(service tự `accept()` nhiều client trong code của nó — đây là cách hầu hết daemon mạng hiện
đại hoạt động, ví dụ `dbus.service`). Với `Accept=yes`, mỗi kết nối mới sinh ra MỘT instance
riêng của service, và vì vậy tên unit bắt buộc phải là template (`foo@.service`, có dấu `@`) để
systemd đặt tên từng instance theo kết nối cụ thể — đây là mô hình cũ kiểu inetd, ít dùng hơn
trong daemon hiện đại vì tạo process mới cho mỗi kết nối khá tốn.

**`Storage=auto` là lý do một số máy "tự nhiên" mất log sau khi cài mới**: ngay sau khi cài OS,
thư mục `/var/log/journal` thường CHƯA tồn tại (phải tạo tay hoặc qua một package cụ thể tạo
sẵn) — với `Storage=auto` (giá trị mặc định), journald thấy thư mục không tồn tại nên tự chọn
hành xử như `volatile`, lưu log chỉ trong RAM. Hậu quả: debug một sự cố xảy ra TRƯỚC lần
reboot gần nhất sẽ không còn log gì để xem — đây là một trong những nguyên nhân phổ biến khiến
SE "không hiểu vì sao máy mới cài lại không giữ log qua reboot" trong khi máy cũ (đã từng được
tạo `/var/log/journal` từ trước) vẫn giữ bình thường.

**Dependency graph phức tạp — `Requires=` không tạo thứ tự, chỉ tạo ràng buộc tồn tại**: đây
là điểm hay bị hiểu lẫn tiếp vào phần đã nói ở bài `units`: một unit có `Requires=foo.service`
NHƯNG KHÔNG CÓ `After=foo.service` thì hai unit này có thể khởi động PARALLEL — `Requires=`
chỉ đảm bảo nếu `foo.service` dừng/fail thì unit này cũng bị kéo theo dừng, không đảm bảo thứ
tự khởi động. Muốn cả ràng buộc tồn tại VÀ thứ tự, phải khai báo CẢ HAI `Requires=` và `After=`
cùng lúc — đây là lý do nhiều unit thực tế (ví dụ `cron.service` ở các bài trước) có cả hai
dòng riêng biệt dù trỏ tới cùng một tập unit.

## 4. Thực hành

Xem một `.socket` unit thật, minh hoạ `ListenStream=` và quan hệ `PartOf=` với service (CUPS —
dịch vụ in ấn, có sẵn trên máy viết bài này):

```bash
$ systemctl cat cups.socket
# /lib/systemd/system/cups.socket
[Unit]
Description=CUPS Scheduler
PartOf=cups.service

[Socket]
ListenStream=/run/cups/cups.sock

[Install]
WantedBy=sockets.target
```

`PartOf=cups.service` ở đây là một biến thể của dependency: nó nói "nếu `cups.service` được
`restart`/`stop`, hãy áp dụng tương tự cho socket này" — khác `Requires=` thường thấy ở
`.service`, cho thấy mỗi loại unit có thể dùng chỉ thị dependency phù hợp với vai trò của nó.

Xem file cấu hình journald thật trên máy (mặc định, mọi dòng đều comment — nghĩa là đang chạy
với giá trị mặc định của chính systemd, bao gồm `Storage=auto` nói ở mục 3):

```bash
$ cat /etc/systemd/journald.conf
[Journal]
#Storage=auto
#Compress=yes
#Seal=yes
#SplitMode=uid
...
```

Kiểm tra máy này đang lưu log kiểu gì trong thực tế (persistent hay volatile) — không cần đoán
từ file config, hỏi trực tiếp journald:

```bash
$ journalctl --header 2>&1 | grep -i "storage\|path" | head -5
File path: /var/log/journal/.../system.journal
```

Đường dẫn bắt đầu bằng `/var/log/journal/` xác nhận máy này đang lưu PERSISTENT (không phải
`/run/log/journal/` của volatile) — khớp với việc thư mục đó đã tồn tại từ lúc cài distro.

Xem một phần cây phụ thuộc thật của `multi-user.target` để thấy quy mô thực tế (chỉ trích một
đoạn, cây đầy đủ dài hơn nhiều):

```bash
$ systemctl list-dependencies multi-user.target
multi-user.target
● ├─anydesk.service
● ├─apport.service
● ├─avahi-daemon.service
● ├─cron.service
● ├─cups.service
● ├─dbus.service
...
```

Ký hiệu `●` nghĩa là unit đang active; một dấu khác (vòng tròn rỗng `○`) sẽ xuất hiện cho unit
loaded nhưng không active — cách đọc nhanh "cả cụm có gì đang chạy" chỉ bằng một lệnh.

## 5. Lỗi thường gặp và cách chẩn đoán

**Service tự "sống lại" ngay sau khi `stop`, tưởng là bug**
- Nguyên nhân: service có `.socket` cùng tên vẫn đang active và đang lắng nghe — ngay khi có
  kết nối mới tới, socket activation tự khởi động lại service. `stop` thủ công
  `foo.service` không tự `stop` luôn `foo.socket` (hai unit riêng).
- Cách xác nhận: `systemctl status foo.socket` cho thấy vẫn `active (listening)`.
- Cách xử lý: muốn tắt hẳn, phải `stop`/`disable` CẢ `foo.socket` lẫn `foo.service`.

**Mất toàn bộ log của những ngày trước ngay sau một lần reboot, trên một máy mới cài**
- Nguyên nhân: `Storage=auto` + `/var/log/journal` chưa từng được tạo → journald chạy volatile
  từ đầu, log chỉ sống trong RAM, mất khi tắt máy (xem mục 3).
- Cách xác nhận: `journalctl --header | grep "File path"` trả về đường dẫn bắt đầu bằng
  `/run/log/journal/` thay vì `/var/log/journal/`.
- Cách xử lý: tạo thư mục đúng cách bằng `sudo mkdir -p /var/log/journal && sudo
  systemd-tmpfiles --create --prefix /var/log/journal`, sau đó `journalctl --flush` (hoặc gửi
  `SIGUSR1` cho journald) để chuyển ngay sang persistent mà không cần reboot.

**Hai unit cùng `Requires=` nhau nhưng khởi động không theo thứ tự mong muốn, gây lỗi race
condition lúc boot**
- Nguyên nhân: chỉ khai báo `Requires=`, thiếu `After=` — như giải thích ở mục 3, `Requires=`
  không đảm bảo thứ tự, hai unit có thể cùng khởi động song song.
- Cách xác nhận: `systemd-analyze critical-chain foo.service` xem chuỗi phụ thuộc được tính
  thực tế có đúng như kỳ vọng không.
- Cách xử lý: thêm `After=` cho đúng chiều mong muốn cùng với `Requires=` đã có.

## 6. Tình huống thực tế

Một service in ấn nội bộ dùng CUPS, team báo "tắt CUPS để bảo trì nhưng vài phút sau nó tự chạy
lại, không ai đụng vào gì".

1. `systemctl stop cups.service` — service dừng, xác nhận qua `systemctl status cups.service`
   báo `inactive (dead)`.
2. Vài phút sau kiểm tra lại: `Active: active (running)` — đúng như báo cáo, tự chạy lại.
3. Nghi ngờ socket activation (đã học ở mục 2-3): `systemctl status cups.socket` — quả thật
   vẫn `active (listening)` trên `/run/cups/cups.sock`.
4. Giải thích: trong lúc "bảo trì", một tiến trình khác trên máy (ví dụ một job định kỳ kiểm
   tra máy in) vẫn mở kết nối tới socket CUPS như thường lệ — socket đang lắng nghe nên lập tức
   khởi động lại `cups.service` để phục vụ kết nối đó, đúng cơ chế thiết kế, không phải lỗi.
5. Muốn bảo trì thật sự "im", phải dừng CẢ hai: `systemctl stop cups.service cups.socket`
   (và nếu cần giữ trạng thái này qua reboot trong thời gian bảo trì dài, thêm
   `disable` cho cả hai, nhớ `enable` lại sau khi xong).
6. Ghi vào runbook: "Service có socket activation (kiểm tra bằng `systemctl status
   foo.socket`) phải dừng cả cặp socket+service khi bảo trì, dừng riêng service không đủ."

## 7. Tự kiểm tra

1. Một `.service` có `Requires=network.target` nhưng KHÔNG có `After=network.target`. Điều gì
   CÓ THỂ xảy ra lúc boot mà người viết unit file này không ngờ tới?
   <details><summary>Đáp án</summary>Service này có thể khởi động TRƯỚC khi network thực sự
   sẵn sàng, vì <code>Requires=</code> chỉ đảm bảo tồn tại/ràng buộc dừng cùng nhau, không đảm
   bảo thứ tự khởi động. Nếu service cần network đã lên để hoạt động đúng, thiếu
   <code>After=</code> có thể gây lỗi ngầm lúc boot (chạy trước, fail vì chưa có mạng) mà khó
   tái hiện khi test thủ công lúc máy đã chạy ổn định (network lúc đó luôn sẵn sàng).</details>

2. Vì sao `systemctl stop foo.service` đôi khi không đủ để "tắt hẳn" một service, và cách kiểm
   tra nhanh nhất để biết có cần dừng thêm gì không?
   <details><summary>Đáp án</summary>Nếu service có <code>.socket</code> cùng tên đang active,
   socket activation sẽ tự khởi động lại service khi có kết nối mới tới. Kiểm tra nhanh:
   <code>systemctl status foo.socket</code> — nếu thấy <code>active (listening)</code>, cần
   dừng luôn socket đó.</details>

3. Máy mới cài, bạn cố tình KHÔNG đổi `Storage=` trong `journald.conf` (giữ mặc định `auto`).
   Sau 3 ngày vận hành, log có được giữ qua reboot không? Giải thích dựa trên hành vi thật của
   `auto`.
   <details><summary>Đáp án</summary>Phụ thuộc việc thư mục <code>/var/log/journal</code> đã
   tồn tại hay chưa tại lần journald khởi động đầu tiên — nếu một gói nào đó (hoặc chính
   quá trình cài distro) đã tạo thư mục này, <code>auto</code> hành xử như
   <code>persistent</code> (giữ log qua reboot); nếu chưa, nó hành xử như
   <code>volatile</code> (mất log mỗi lần tắt máy) — KHÔNG có mốc thời gian "sau 3 ngày sẽ tự
   đổi", hành vi chỉ phụ thuộc trạng thái thư mục tại thời điểm journald start.</details>

4. `foo@.service` (có dấu `@`) khác `foo.service` (không có dấu `@`) ở điểm nào, và nó liên
   quan gì tới `Accept=yes` trong `.socket`?
   <details><summary>Đáp án</summary><code>foo@.service</code> là TEMPLATE unit — systemd có
   thể tạo nhiều instance từ nó (<code>foo@1.service</code>, <code>foo@2.service</code>...).
   Khi một <code>.socket</code> khai báo <code>Accept=yes</code>, mỗi kết nối mới cần MỘT
   instance service riêng để xử lý, nên bắt buộc service tương ứng phải là dạng template
   (<code>foo@.service</code>), không thể là unit tên cố định.</details>

5. Lệnh nào cho biết chuỗi phụ thuộc "găng" (critical path) thực sự ảnh hưởng tới thời gian
   boot của một unit cụ thể, khác với việc chỉ xem `After=`/`Requires=` khai báo tĩnh trong
   file?
   <details><summary>Đáp án</summary><code>systemd-analyze critical-chain foo.service</code> —
   cho thấy chuỗi phụ thuộc THỰC TẾ (đã tính toán, kèm thời gian) dẫn tới unit đó active, khác
   với việc chỉ đọc <code>After=</code>/<code>Requires=</code> tĩnh trong file (chưa phản ánh
   độ trễ thực tế hay toàn bộ chuỗi gián tiếp qua nhiều unit trung gian).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.boot-systemd.units` — nền tảng `After=`/`Requires=`/`Wants=` mà bài này mở rộng.
- `linux.boot-systemd.service-mgmt` — bộ lệnh `systemctl` dùng để thao tác `.socket` giống
  `.service`.
- `linux.boot-systemd.boot-process` — vị trí `sockets.target` trong trình tự boot tổng quát.

**Nguồn tham khảo:**
- [systemd.socket(5) — man7.org](https://man7.org/linux/man-pages/man5/systemd.socket.5.html)
  — định nghĩa `ListenStream=`, `Accept=`.
- [journald.conf(5) — man7.org](https://man7.org/linux/man-pages/man5/journald.conf.5.html) —
  định nghĩa `Storage=` và các giới hạn dung lượng log.
- [bootup(7) — man7.org](https://man7.org/linux/man-pages/man7/bootup.7.html) — vị trí
  `sockets.target`/`basic.target` trong trình tự boot.
