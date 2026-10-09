---
id: linux.kernel-troubleshooting.kernel-logs
title: "Đọc log kernel: dmesg, journalctl -k, nhận diện lỗi phần cứng/driver"
domain: linux
module: linux.kernel-troubleshooting
level: "vận hành"
prerequisites: ["linux.kernel-troubleshooting.modules"]
applies_to:
  - "Ubuntu 22.04 LTS với systemd-journald — `dmesg` bị giới hạn quyền đọc bởi `kernel.dmesg_restrict=1` (mặc định Ubuntu); `journalctl -k` không cần root nếu user thuộc group `adm`"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man1/journalctl.1.html"
  - "https://man7.org/linux/man-pages/man1/dmesg.1.html"
  - "https://www.kernel.org/doc/html/latest/admin-guide/dynamic-debug-howto.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Khi một module load thất bại, driver gặp lỗi I/O, thiết bị mạng bị reset, hay hệ thống bị kernel
panic, thông báo ĐẦU TIÊN xuất hiện không phải trong `/var/log/syslog` hay log ứng dụng — chúng
nằm trong KERNEL RING BUFFER, bộ nhớ vòng trong kernel dành riêng cho thông điệp nội bộ kernel
(không qua syslog daemon). Một SE cần biết cách đọc ring buffer này (`dmesg`), lọc theo mức độ
nghiêm trọng, và phân biệt các mẫu thông điệp quen thuộc để nhanh chóng nhận ra: "đây là lỗi phần
cứng thật", "đây là driver không tương thích", hay "đây là lỗi cấu hình có thể sửa được ngay".

> **Lưu ý quyền trên máy demo:** `kernel.dmesg_restrict=1` (xác nhận thật ở bài
> `linux.kernel-troubleshooting.sysctl`) khiến `dmesg` báo "Operation not permitted" với user
> thường. `journalctl -k` hoạt động vì user thuộc group `adm` (Ubuntu thêm sẵn). Các ví dụ
> `journalctl -k` trong bài này là OUTPUT THẬT (đã ẩn danh hoá hostname). Các ví dụ `dmesg` là
> **output minh hoạ** theo format chuẩn của man page, nhưng nội dung phản ánh đúng các thông điệp
> thật thường gặp.

## 2. Khái niệm cốt lõi

**Kernel ring buffer**: bộ nhớ vòng cố định kích thước trong kernel (thường 256KB-1MB), chứa các
thông điệp từ kernel và driver. "Vòng" (ring) vì khi đầy, thông điệp cũ bị ghi đè bởi mới — boot
cũ có thể mất nếu hệ thống đã chạy lâu. `dmesg` đọc trực tiếp ring buffer này; `journalctl -k`
đọc từ journal của `systemd-journald` (đã ghi lại khi boot và liên tục, KHÔNG mất khi buffer đầy).

**Mức độ nghiêm trọng** (`loglevel`, 0-7, giống syslog): kernel gán mỗi thông điệp một mức:
`0=emerg`, `1=alert`, `2=crit`, `3=err`, `4=warn`, `5=notice`, `6=info`, `7=debug`. Lệnh `dmesg
-l err` hoặc `journalctl -k -p err` lọc chỉ hiện từ `err` (3) trở lên.

**`systemd-journald` vs ring buffer**: `systemd-journald` đọc ring buffer liên tục và ghi vào
journal binary (`/run/log/journal/` hoặc `/var/log/journal/`), bền vững qua reboot (nếu bật
persistent logging). `journalctl -k` lọc chỉ các thông điệp nguồn "kernel" trong journal — đây là
cách đọc kernel log bền vững, không bị mất do buffer đầy.

| Lệnh | Tác dụng |
|---|---|
| `dmesg` | Đọc ring buffer kernel (cần root nếu `dmesg_restrict=1`) |
| `dmesg -H` | Human-readable: timestamp relative, màu mức độ |
| `dmesg -l err,warn` | Chỉ hiện thông điệp lỗi/cảnh báo |
| `dmesg -w` | Follow (stream thông điệp mới real-time) |
| `journalctl -k` | Kernel log từ boot HIỆN TẠI (qua journal, không mất khi buffer đầy) |
| `journalctl -k -b -1` | Kernel log từ boot TRƯỚC (hữu ích sau khi crash/panic + reboot) |
| `journalctl -k -p err` | Chỉ kernel message mức `err` và cao hơn |
| `journalctl -k -S "1 hour ago"` | Kernel log trong 1 giờ qua |

## 3. Cách nó hoạt động

**`journalctl -k -b -1` là cách ĐỌC LỖI SAU KHI CRASH — không phải `dmesg`** — khi hệ thống
kernel panic hoặc bị hard reset, ring buffer trong RAM BỊ MẤT. `journalctl -b -1` đọc từ JOURNAL
ĐÃ GHI trước đó (`-b -1` = boot thứ n-1, tức là boot trước boot hiện tại) — đây là lý do nên bật
persistent journal (`/var/log/journal/` thay vì chỉ `/run/log/journal/`) trên server production.

**Timestamp trong `dmesg` là giây kể từ boot, KHÔNG phải giờ thực** — dạng `[    0.123456]`
(giây.microsecond từ khi kernel khởi động). `dmesg -T` (hoặc `journalctl -k`) convert sang thời
gian thực tế, hữu ích hơn nhiều khi debug sự cố xảy ra vào thời điểm cụ thể.

**Nhận diện mẫu thông điệp quan trọng:**
- `ACPI Error`/`ACPI BIOS Error`: driver ACPI gặp lỗi (thường khi BIOS khai báo hardware không
  đúng spec ACPI) — thường không gây crash nhưng có thể ảnh hưởng power management/sensor.
- `Call Trace:` theo sau bởi danh sách địa chỉ hàm: kernel oops/panic — stack trace của lỗi
  nghiêm trọng, cần đọc dòng đầu ("BUG:", "Oops", "WARNING") để biết nguyên nhân gốc.
- `I/O error, dev <thiết-bị>`: lỗi đọc/ghi đĩa — cần kiểm tra SMART ngay.
- `eth0: Hardware address mismatch` / `firmware: failed to load`: lỗi driver hoặc firmware thiếu.
- `audit:` / `apparmor=`: thông điệp security framework, bình thường nếu ứng dụng bị AppArmor
  profile chặn theo thiết kế.

## 4. Thực hành

Đọc kernel log qua `journalctl -k` (chạy thật — user `tuantm5` thuộc group `adm`, hostname đã ẩn
danh hoá):

```bash
$ journalctl -k --no-pager -n 8
Oct 06 07:34:28 demo-host kernel: set_capacity_and_notify: 20 callbacks suppressed
Oct 06 07:34:28 demo-host kernel: loop29: detected capacity change from 0 to 229696
Oct 06 07:34:28 demo-host kernel: audit: type=1400 audit(1791247194.402:77): apparmor="STATUS" operation="profile_replace" profile="unconfined" name="snap.obsidian.obsidian" pid=8549 comm="apparmor_parser"
Oct 06 07:34:28 demo-host kernel: audit: type=1400 audit(1791247194.405:78): apparmor="STATUS" operation="profile_replace" info="same as current profile, skipping" profile="unconfined" name="snap-update-ns.obsidian" pid=8551 comm="apparmor_parser"
Oct 06 08:44:00 demo-host kernel: ptrace attach of "tail -f /dev/null"[11916] was attempted by "strace -p 11916"[11919]
Oct 06 08:54:27 demo-host kernel: ptrace attach of "tail -f /dev/null"[13266] was attempted by "strace -p 13266"[13269]
Oct 06 09:36:43 demo-host kernel: sctp: Hash tables configured (bind 256/256)
Oct 06 12:46:46 demo-host kernel: perf: interrupt took too long (2529 > 2500), lowering kernel.perf_event_max_sample_rate to 79000
```

Đọc: dòng `apparmor="STATUS"` là bình thường (Snap cập nhật AppArmor profile khi load). Dòng
`ptrace attach ... was attempted by "strace -p"` là kernel Yama LSM ghi nhận thao tác ptrace bị từ
chối hoặc được phép theo `ptrace_scope` (xem thêm `linux.performance.case-study`). Dòng `perf:
interrupt took too long` là cảnh báo kernel tự giảm tần suất perf sampling để tránh overhead — bình
thường trên máy có load cao.

Lọc chỉ thông điệp mức `err` trở lên (thực sự quan trọng hơn) — chạy thật:

```bash
$ journalctl -k -p err --no-pager -n 5
Oct 06 07:34:28 demo-host kernel: ACPI Error: Aborting method \_SB.WMID.WQBZ due to previous error (AE_AML_BUFFER_LIMIT) (20230628/psparse-529)
Oct 06 07:34:28 demo-host kernel: ACPI Error: Aborting method \_SB.WMID.WQBE due to previous error (AE_AML_BUFFER_LIMIT) (20230628/psparse-529)
Oct 06 07:34:28 demo-host kernel: ACPI BIOS Error (bug): AE_AML_BUFFER_LIMIT, Index (0x000000050) is beyond end of object (length 0x50) (20230628/exoparg2-393)
```

`ACPI Error: AE_AML_BUFFER_LIMIT` — BIOS khai báo object ACPI nhỏ hơn index mà firmware đang cố
đọc; xuất hiện khi boot và không lặp lại sau — đây là lỗi BIOS firmware, không phải lỗi kernel hay
driver. Không ảnh hưởng hoạt động (máy vẫn chạy bình thường) nhưng có thể khiến một số tính năng
ACPI (sensor đặc thù của mainboard) không hoạt động đúng.

Xác nhận `dmesg` không chạy được với user thường (lý do đã giải thích ở mục 1):

```bash
$ dmesg 2>&1 | head -1
dmesg: read kernel buffer failed: Operation not permitted
```

`kernel.dmesg_restrict=1` — xác nhận đúng với giá trị sysctl đã đọc ở bài
`linux.kernel-troubleshooting.sysctl`.

> Phần dưới là **output minh hoạ** định dạng `dmesg` trên hệ thống KHÔNG có `dmesg_restrict` (ví
> dụ khi chạy với `sudo dmesg` hoặc distro không restrict). Format này theo `dmesg(1)` chính thức:

```
$ sudo dmesg -T | grep -E "error|fail|warn" | head -5
[Mon Oct  6 07:34:28 2026] ACPI Error: Aborting method \_SB.WMID.WQBZ due to previous error (AE_AML_BUFFER_LIMIT)
[Mon Oct  6 07:34:28 2026] ACPI BIOS Error (bug): AE_AML_BUFFER_LIMIT
[Mon Oct  6 09:36:43 2026] wlp2s0: failed to initiate AP scan
```

## 5. Lỗi thường gặp và cách chẩn đoán

**`dmesg: read kernel buffer failed: Operation not permitted`**
- Nguyên nhân: `kernel.dmesg_restrict=1` — chính sách bảo mật ngăn user thường đọc ring buffer
  (kernel log có thể chứa địa chỉ bộ nhớ kernel, KASLR offset...).
- Cách xử lý: dùng `journalctl -k` (thường cho phép với user thuộc group `adm` trên Ubuntu); hoặc
  `sudo dmesg` nếu có sudo. Không nên hạ `dmesg_restrict` xuống `0` trên server production.

**Hệ thống kernel panic rồi reboot, cần đọc lại log lúc panic**
- Nguyên nhân vấn đề debug: ring buffer mất khi reboot, `dmesg` sau khi boot lại sẽ hiện log của
  boot MỚI.
- Cách xử lý: `journalctl -k -b -1` — đọc kernel log từ boot TRƯỚC (lưu trong persistent journal).
  Yêu cầu: persistent journal phải được bật (`/var/log/journal/` tồn tại và không chỉ là
  `/run/log/journal/`). Kiểm tra: `ls /var/log/journal/` — nếu thư mục này tồn tại và có nội dung,
  persistent journal đang bật.

**Kernel log đầy thông điệp lặp lại làm khó tìm lỗi thật**
- Nguyên nhân: module/driver gặp lỗi liên tục ghi log nhiều (ví dụ thiết bị bị ngắt kết nối/kết
  nối lặp lại). Kernel có cơ chế "rate limiting" cho thông điệp giống nhau: sau một số lần nhất
  định, in "N callbacks suppressed" thay vì lặp lại đầy đủ.
- Cách xử lý: `journalctl -k -p err` lọc chỉ level error trở lên để tập trung vào vấn đề thật;
  nếu cần xem toàn bộ kể cả suppressed, cần `dmesg -r` hoặc điều chỉnh kernel log level.

## 6. Tình huống thực tế

Server báo ổ đĩa `/dev/sdb` bị "I/O error" đột ngột, ứng dụng gặp lỗi ghi file:

1. `journalctl -k -p err -S "1 hour ago" --no-pager` — tìm thông điệp liên quan tới `sdb`:

   ```
   Oct 06 14:23:11 demo-host kernel: blk_update_request: I/O error, dev sdb, sector 2097152 op 0x1:(WRITE) flags 0x0 phys_seg 1 prio class 0
   Oct 06 14:23:11 demo-host kernel: Buffer I/O error on dev sdb1, logical block 0, async page write
   Oct 06 14:23:11 demo-host kernel: EXT4-fs error (device sdb1): ext4_find_entry:1455: inode #2: comm kworker/u8:6: reading directory lblock 0
   ```

   *(output minh hoạ — đây là format thật của các thông điệp I/O error kernel)*

2. Xác nhận ngay: đây KHÔNG phải lỗi cấu hình hay phần mềm — kernel báo I/O error vật lý xuống
   tận sector cụ thể (`sector 2097152`), kèm filesystem layer (EXT4) cũng báo lỗi đọc.
3. Ưu tiên: backup dữ liệu NGAY trước mọi thứ khác — I/O error trên đĩa production là tín hiệu
   đĩa có thể hỏng dần.
4. Kiểm tra SMART: `sudo smartctl -a /dev/sdb` xem số `Reallocated Sectors`, `Pending Sectors`,
   `Uncorrectable Sectors` — nếu các con số này > 0 và tăng dần, xác nhận đĩa đang hỏng.
5. Lên kế hoạch thay đĩa, migrate dữ liệu. Ghi nhận vào checklist "I/O error": bước 1 luôn là
   đọc kernel log để xác định PHẠM VI lỗi (chỉ 1 sector, hay nhiều sector/toàn đĩa), không phải
   restart ứng dụng.

## 7. Tự kiểm tra

1. Sau khi server kernel panic và reboot lại, làm thế nào để đọc kernel log từ LÚC TRƯỚC KHI
   PANIC?
   <details><summary>Đáp án</summary><code>journalctl -k -b -1</code> — đọc kernel log từ boot
   trước (<code>-b -1</code>). Yêu cầu persistent journal phải được bật (kiểm tra bằng <code>ls
   /var/log/journal/</code>). Ring buffer thông thường của <code>dmesg</code> mất khi reboot.
   </details>

2. `journalctl -k` hiện rất nhiều dòng. Muốn chỉ xem các vấn đề nghiêm trọng (error trở lên), dùng
   option nào?
   <details><summary>Đáp án</summary><code>journalctl -k -p err</code> — lọc chỉ các thông điệp
   từ mức <code>err</code> (3) trở lên (err, crit, alert, emerg). Có thể kết hợp thêm <code>-S
   "2 hours ago"</code> để giới hạn thời gian.</details>

3. Thấy nhiều dòng `ACPI Error` trong kernel log ngay từ lúc boot. Điều này có nghĩa là gì, cần
   xử lý gấp không?
   <details><summary>Đáp án</summary>Thường là lỗi BIOS firmware khai báo không đúng spec ACPI —
   xuất hiện khi boot và KHÔNG lặp lại sau. Thường không ảnh hưởng hoạt động chính nhưng một số
   tính năng ACPI đặc thù (sensor mainboard, một số power management) có thể không hoạt động đúng.
   Kiểm tra: nếu lỗi CHỈ xuất hiện lúc boot và không lặp lại, không cần xử lý gấp; nếu lỗi lặp
   liên tục, cần điều tra thêm (kiểm tra firmware update từ nhà sản xuất mainboard).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.kernel-troubleshooting.sysctl` — `kernel.dmesg_restrict` là tham số sysctl giải thích
  vì sao `dmesg` không chạy được với user thường (xác nhận ở bài đó).
- `linux.kernel-troubleshooting.modules` — lỗi module load thất bại xuất hiện đầu tiên trong kernel
  log (`journalctl -k` / `dmesg`).
- `linux.kernel-troubleshooting.methodology` — kernel log là một trong các bước đầu tiên trong quy
  trình troubleshooting tổng hợp.

**Bài liên quan ngoài module:**
- `linux.performance.case-study` — `ptrace attach ... was attempted by "strace -p"` trong kernel
  log mục 4 là dấu vết từ bài đó (Yama LSM ghi nhận thao tác ptrace).
- `linux.boot-systemd.boot-process` — kernel log lúc boot (initramfs, driver init, filesystem
  mount) là phần đầu của `dmesg` / `journalctl -k -b`.

**Nguồn tham khảo:**
- [journalctl(1) — man7.org](https://man7.org/linux/man-pages/man1/journalctl.1.html) — cờ
  `-k`/`-b`/`-p`/`-S`, lọc theo đơn vị và mức độ.
- [dmesg(1) — man7.org](https://man7.org/linux/man-pages/man1/dmesg.1.html) — cờ `-T`/`-H`/`-l`/
  `-w`, mức log.
- [Kernel dynamic debug — kernel.org](https://www.kernel.org/doc/html/latest/admin-guide/dynamic-debug-howto.html)
  — kích hoạt debug log theo module/file cụ thể mà không recompile kernel.
