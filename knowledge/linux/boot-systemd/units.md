---
id: linux.boot-systemd.units
title: "systemd: unit, service, target cơ bản"
domain: linux
module: linux.boot-systemd
level: "nền tảng"
prerequisites: ["linux.boot-systemd.boot-process"]
applies_to:
  - "Ubuntu 22.04 LTS (systemd 249)"
  - "Cấu trúc unit file áp dụng chung cho mọi distro dùng systemd (RHEL/Rocky/Debian/SUSE...)"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man5/systemd.service.5.html"
  - "https://man7.org/linux/man-pages/man7/bootup.7.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Gần như mọi tác vụ vận hành Linux hằng ngày — từ xem một dịch vụ có đang chạy không, tới hiểu
vì sao sau khi `reboot` một app lại không tự chạy lại — đều quay về một câu hỏi: **unit file
này được định nghĩa ra sao, và nó liên kết với các unit khác thế nào?** Không hiểu cấu trúc
unit, SE rất dễ mắc các lỗi phổ biến: sửa file trong `/lib/systemd/system/` (bị ghi đè khi
update gói), tưởng `enable` tức là service đang chạy (thực ra `enable` chỉ là "sẽ tự chạy lúc
boot", không chạy ngay), hoặc không hiểu vì sao xoá một symlink lại tắt được một service mà
không cần sửa file gốc.

## 2. Khái niệm cốt lõi

systemd quản lý mọi thứ dưới dạng **unit** — một đơn vị cấu hình có tên dạng
`<tên>.<loại>`. Các loại unit thường gặp nhất:

| Loại | Đuôi file | Dùng để |
|---|---|---|
| Service | `.service` | Một process/daemon (ví dụ `cron.service`) |
| Target | `.target` | Nhóm nhiều unit lại, dùng làm "điểm hội tụ" (ví dụ `multi-user.target`) |
| Socket | `.socket` | Một socket lắng nghe, có thể tự khởi động service tương ứng khi có kết nối |
| Timer | `.timer` | Lập lịch kích hoạt một service, kiểu thay thế cho cron |
| Mount | `.mount` | Một điểm mount filesystem |

Bài này tập trung vào `.service` và `.target`; `.timer` có bài riêng
(`linux.boot-systemd.timers`), `.socket` được nói kỹ hơn ở bài nâng cao
(`linux.boot-systemd.advanced`).

Một `.service` file thường có 3 khối (unit file dùng cú pháp giống INI):

```ini
[Unit]
Description=...      # Mô tả, hiện ra khi systemctl status
After=...             # Thứ tự khởi động (KHÔNG tạo phụ thuộc bắt buộc phải chạy)
Requires=...          # Phụ thuộc bắt buộc — unit kia fail thì unit này cũng coi như fail

[Service]
Type=...              # Cách systemd nhận biết service đã "sẵn sàng" (xem mục 3)
ExecStart=...          # Lệnh chạy chính
Restart=...             # Chính sách tự khởi động lại khi process chết

[Install]
WantedBy=...            # Target nào sẽ "kéo" unit này lên khi unit đó active
```

`.target` không có `[Service]`, chỉ có `[Unit]`/`[Install]` — nó không tự chạy gì, chỉ đóng
vai trò "điểm neo" để các service khác khai báo `WantedBy=` trỏ vào.

## 3. Cách nó hoạt động

**Phân biệt `After=`/`Before=` (thứ tự) với `Requires=`/`Wants=` (phụ thuộc)** — đây là điểm
dễ hiểu nhầm nhất: `After=` CHỈ nói "nếu cả hai cùng được khởi động, hãy chạy cái này sau",
không có nghĩa unit kia phải tồn tại hay phải thành công. Muốn bắt buộc một unit phải active
thì cần `Requires=` (chặt — unit kia fail/stop thì unit này cũng bị kéo theo) hoặc `Wants=`
(lỏng — cố gắng khởi động cùng nhưng không bắt buộc, dùng phổ biến hơn vì ít gây sụp đổ dây
chuyền). Ví dụ `cron.service` thật trên máy viết bài này (lấy qua `systemctl cat`, xem mục 4)
có `After=remote-fs.target nss-user-lookup.target` — chỉ là thứ tự, không phải điều kiện bắt
buộc.

**`enable` khác `start`**: `systemctl enable foo.service` đọc `WantedBy=` trong `[Install]`
của file đó rồi tạo một **symlink** trỏ tới file gốc, đặt trong thư mục
`<target>.wants/` (ví dụ `/etc/systemd/system/multi-user.target.wants/foo.service`) — hành
động này chỉ đăng ký "lần boot sau, khi `multi-user.target` được kích hoạt, hãy kéo theo unit
này", **không chạy service ngay**. `systemctl start foo.service` mới là lệnh chạy service tại
thời điểm hiện tại. Hai việc độc lập: có thể `enable` mà chưa `start` (sẽ chạy ở lần boot kế
tiếp), hoặc `start` mà không `enable` (chạy ngay, nhưng mất khi reboot). Bài tiếp theo trong
module này (`linux.boot-systemd.service-mgmt`) thực hành trực tiếp 4 lệnh
start/stop/enable/disable để thấy rõ sự khác biệt.

**Vì sao không nên sửa file trong `/lib/systemd/system/` (hoặc `/usr/lib/systemd/system/`)**:
đây là nơi gói phần mềm (deb/rpm) cài unit file gốc — một lần update gói sẽ ghi đè file này,
mất mọi chỉnh sửa tay. Đường đúng là tạo **override** trong `/etc/systemd/system/` (ưu tiên cao
hơn, systemd đọc theo thứ tự `/etc` > `/run` > `/lib`), hoặc dùng `systemctl edit foo.service`
(tự tạo file drop-in `/etc/systemd/system/foo.service.d/override.conf` chỉ chứa phần cần đổi,
phần còn lại kế thừa từ file gốc) — an toàn hơn vì không phải chép lại toàn bộ file gốc.

**`.target` không "chạy" gì, nó chỉ là nhãn hội tụ**: khi systemd "kích hoạt"
`multi-user.target`, thực chất nó khởi động tất cả unit có `WantedBy=multi-user.target` (qua
cơ chế symlink ở trên), rồi coi `multi-user.target` là "active" khi các unit đó đã khởi động
xong (không cần tất cả thành công, tuỳ `Requires`/`Wants`). Đây là lý do `systemctl
get-default` (xem bài trước) chỉ trả về MỘT tên target — nó là đích hội tụ cuối cùng của toàn
bộ cây phụ thuộc.

## 4. Thực hành

Xem toàn văn một unit file thật đang chạy trên máy (không cần biết file nằm ở đường dẫn nào —
`systemctl cat` tự tìm và gộp cả override nếu có):

```bash
$ systemctl cat cron.service
# /lib/systemd/system/cron.service
[Unit]
Description=Regular background program processing daemon
Documentation=man:cron(8)
After=remote-fs.target nss-user-lookup.target

[Service]
EnvironmentFile=-/etc/default/cron
ExecStart=/usr/sbin/cron -f -P $EXTRA_OPTS
IgnoreSIGPIPE=false
KillMode=process
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Dòng đầu `# /lib/systemd/system/cron.service` do chính `systemctl cat` in ra, cho biết file gốc
nằm ở đâu — nếu có override trong `/etc/systemd/system/cron.service.d/`, nó sẽ in tiếp bên
dưới.

Xem các thuộc tính phụ thuộc/thứ tự thật của unit này mà không cần tự đọc file:

```bash
$ systemctl show cron.service -p WantedBy,After,Requires,UnitFileState
Requires=system.slice sysinit.target
WantedBy=multi-user.target
After=basic.target system.slice remote-fs.target systemd-journald.socket sysinit.target nss-user-lookup.target
UnitFileState=enabled
```

Lưu ý `After=` ở đây dài hơn những gì khai báo tay trong file — systemd tự thêm một số ràng
buộc ngầm định (ví dụ hầu hết service tự động `After=basic.target`) để tránh phải khai báo lại
ở mọi unit.

Xem cơ chế symlink đứng sau `enable` (chính là `UnitFileState=enabled` ở trên):

```bash
$ ls -la /etc/systemd/system/multi-user.target.wants/ | head -3
lrwxrwxrwx 1 root root 35 ... anacron.service -> /lib/systemd/system/anacron.service
lrwxrwxrwx 1 root root 35 ... anydesk.service -> /etc/systemd/system/anydesk.service
```

Mỗi dòng là một symlink — xoá symlink này (hoặc dùng `systemctl disable`, làm đúng việc đó một
cách an toàn) tương đương "bỏ" unit khỏi danh sách tự chạy của `multi-user.target`, không đụng
tới file service gốc.

## 5. Lỗi thường gặp và cách chẩn đoán

**Sửa file service xong nhưng `systemctl start` vẫn chạy hành vi cũ**
- Nguyên nhân: quên chạy `systemctl daemon-reload` — systemd cache nội dung unit file trong bộ
  nhớ, sửa file trên đĩa không tự động được nạp lại.
- Cách xác nhận: `systemctl status foo.service` phần đầu thường có cảnh báo
  "Warning: The unit file ... changed on disk. Run 'systemctl daemon-reload' to reload.".
- Cách xử lý: `systemctl daemon-reload` rồi `systemctl restart foo.service`.

**Update gói xong, chỉnh sửa trước đó trong unit file "biến mất"**
- Nguyên nhân: đã sửa trực tiếp file trong `/lib/systemd/system/` (hoặc
  `/usr/lib/systemd/system/`) — gói package coi đây là file của nó, ghi đè khi update.
- Cách xác nhận: `dpkg -S /lib/systemd/system/foo.service` (Debian/Ubuntu) hoặc `rpm -qf` xác
  nhận file thuộc gói nào.
- Cách xử lý: chuyển chỉnh sửa sang drop-in qua `systemctl edit foo.service` (ghi vào
  `/etc/systemd/system/foo.service.d/override.conf`), không sửa file gốc.

**Nghĩ rằng `enable` một service là nó đang chạy, nhưng thực tế chưa**
- Nguyên nhân: nhầm `enable` (đăng ký tự chạy ở lần boot SAU) với `start` (chạy NGAY) — xem
  giải thích ở mục 3.
- Cách xác nhận: `systemctl is-active foo.service` trả `inactive` dù `systemctl is-enabled`
  trả `enabled`.
- Cách xử lý: chạy thêm `systemctl start foo.service`, hoặc dùng một lệnh duy nhất
  `systemctl enable --now foo.service` để làm cả hai.

## 6. Tình huống thực tế

Một đồng nghiệp báo: "Em sửa `ExecStart` trong file
`/lib/systemd/system/myapp.service` để thêm một biến môi trường, chạy `systemctl restart
myapp` thấy đổi đúng ý, nhưng sáng nay sau khi `apt upgrade` xong app lại chạy sai như cũ mà
không ai sửa gì". Phân tích:

1. Việc restart "thấy đổi đúng ý" ngay sau khi sửa là bình thường — các thay đổi áp dụng được
   ngay tại thời điểm đó (có thể đã chạy `daemon-reload` trước, hoặc bản thân `systemctl
   restart` ở phiên bản này tự kích hoạt reload — tuỳ, không phải trọng tâm vấn đề).
2. Vấn đề thật nằm ở việc chỉnh sửa trực tiếp file trong `/lib/systemd/system/` — đây đúng là
   file do gói cài (`myapp` được cài qua `.deb` nội bộ của team). `apt upgrade` lên version mới
   của gói sẽ ghi đè toàn bộ file này về bản gốc trong gói, xoá sạch chỉnh sửa tay.
3. Xác nhận bằng `dpkg -S /lib/systemd/system/myapp.service` để chắc chắn file thuộc quyền sở
   hữu của gói `myapp`.
4. Sửa đúng cách: chuyển biến môi trường đó sang
   `/etc/systemd/system/myapp.service.d/override.conf` qua `systemctl edit myapp.service`
   (chỉ cần khai báo lại `Environment=` hoặc `EnvironmentFile=` cần thêm, không cần chép lại
   toàn bộ file), sau đó `daemon-reload` + `restart`. Từ nay override này sống độc lập với file
   gốc của gói, update gói không còn xoá mất.
5. Ghi vào runbook team: "Không bao giờ sửa trực tiếp file trong /lib/systemd/system hoặc
   /usr/lib/systemd/system — luôn dùng systemctl edit hoặc tạo file riêng trong
   /etc/systemd/system/".

## 7. Tự kiểm tra

1. Một service có `Wants=foo.service` (không phải `Requires=`). `foo.service` khởi động thất
   bại. Service gốc có bị coi là fail theo không?
   <details><summary>Đáp án</summary>Không. <code>Wants=</code> là phụ thuộc lỏng — systemd vẫn
   cố khởi động cả hai cùng nhau nhưng nếu <code>foo.service</code> fail, service gốc vẫn tiếp
   tục khởi động bình thường. Chỉ <code>Requires=</code> mới kéo theo fail.</details>

2. Bạn chạy `systemctl enable myapp.service` và thấy output
   "Created symlink /etc/systemd/system/multi-user.target.wants/myapp.service → ...". Điều gì
   SẼ và SẼ KHÔNG xảy ra ngay sau lệnh này?
   <details><summary>Đáp án</summary>SẼ: lần boot tiếp theo, khi <code>multi-user.target</code>
   kích hoạt, <code>myapp.service</code> sẽ tự được khởi động theo. SẼ KHÔNG: service KHÔNG
   chạy ngay tại thời điểm chạy lệnh <code>enable</code> — cần thêm <code>systemctl start</code>
   (hoặc dùng <code>enable --now</code> ngay từ đầu) nếu muốn chạy ngay.</details>

3. Vì sao nên dùng `systemctl edit foo.service` thay vì sửa trực tiếp file trong
   `/lib/systemd/system/foo.service`?
   <details><summary>Đáp án</summary>Vì file trong <code>/lib/systemd/system/</code> thuộc gói
   phần mềm, sẽ bị ghi đè mất chỉnh sửa ở lần update gói kế tiếp. <code>systemctl edit</code>
   tạo file drop-in riêng trong <code>/etc/systemd/system/foo.service.d/</code>, độc lập với
   file gốc, systemd tự gộp (merge) hai file này khi đọc unit.</details>

4. `.target` có `[Service]` section không? Tại sao?
   <details><summary>Đáp án</summary>Không. <code>.target</code> không tự chạy process nào —
   nó chỉ là điểm hội tụ để các unit khác (thường là <code>.service</code>) khai báo
   <code>WantedBy=</code> trỏ vào, nên không cần (và không có) phần <code>[Service]</code> để
   mô tả cách chạy một tiến trình.</details>

5. Lệnh `systemctl show <unit> -p After` trả về nhiều unit hơn những gì bạn thấy khai báo
   trong file gốc của chính unit đó. Đây có phải lỗi không?
   <details><summary>Đáp án</summary>Không. systemd tự thêm một số ràng buộc ngầm định (implicit
   dependencies) cho hầu hết loại unit — ví dụ hầu hết service tự có thêm
   <code>After=basic.target</code> — để tác giả unit file không phải khai báo lại ở mọi nơi.
   <code>systemctl show</code> trả về giá trị ĐÃ GỘP (effective), không phải nguyên văn file.
   </details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.boot-systemd.boot-process` — bối cảnh tổng quát: boot đi tới `multi-user.target`/
  `graphical.target` bằng cách nào.
- `linux.boot-systemd.service-mgmt` — thực hành trực tiếp start/stop/enable/disable trên một
  service thật.
- `linux.boot-systemd.advanced` — `.socket`, dependency nâng cao, cấu hình journald.

**Nguồn tham khảo:**
- [systemd.service(5) — man7.org](https://man7.org/linux/man-pages/man5/systemd.service.5.html)
  — định nghĩa chính thức `Type=`, `Restart=`, `ExecStart=`/`ExecStop=`.
- [bootup(7) — man7.org](https://man7.org/linux/man-pages/man7/bootup.7.html) — vai trò target
  trong trình tự boot.
