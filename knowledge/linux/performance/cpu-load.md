---
id: linux.performance.cpu-load
title: "Hiệu năng CPU: load average, nice/renice, context switch"
domain: linux
module: linux.performance
level: "vận hành"
prerequisites: ["linux.process-signals.monitoring"]
applies_to:
  - "Ubuntu 22.04 LTS (kernel 6.8) — vmstat/nice/renice là chuẩn mọi distro Linux"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man8/vmstat.8.html"
  - "https://man7.org/linux/man-pages/man5/proc_loadavg.5.html"
  - "https://man7.org/linux/man-pages/man1/renice.1.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Bài `linux.process-signals.monitoring` đã giới thiệu load average ở mức khái niệm cơ bản. Bài
này đi SÂU hơn vào CÁCH kernel thực sự quyết định process nào được chạy, khi nào — đặc biệt
`nice`/`renice` (ưu tiên CPU) và context switch (chi phí ẨN khi có quá nhiều process tranh
giành CPU). Hiểu đúng giúp trả lời câu hỏi thực tế: "có nên giảm priority của job backup để
không ảnh hưởng ứng dụng chính?" hay "vì sao CPU idle vẫn cao nhưng hệ thống phản hồi chậm?"
(gợi ý: context switch quá nhiều, không phải thiếu CPU).

## 2. Khái niệm cốt lõi

**Nice value**: độ ưu tiên THỦ CÔNG gán cho một process, từ `-20` (ưu tiên CAO NHẤT, ít "nhường"
CPU) tới `19` (ưu tiên THẤP NHẤT, "nhường" nhiều nhất) — giá trị MẶC ĐỊNH của process mới là
`0`. Tên gọi "nice" xuất phát từ ý nghĩa: giá trị CAO = process "tốt bụng, biết nhường" cho
process khác, KHÔNG phải "được ưu tiên cao".

| Lệnh | Tác dụng |
|---|---|
| `nice -n <value> <cmd>` | Khởi động `<cmd>` với nice value chỉ định |
| `renice -n <value> -p <pid>` | Đổi nice value của process ĐANG CHẠY |

**Context switch**: khi kernel CHUYỂN CPU từ process A sang process B, nó phải LƯU toàn bộ
trạng thái của A (register, program counter...) và NẠP trạng thái của B — mỗi lần chuyển này
tốn một khoảng thời gian CPU THỰC SỰ (không dùng để "làm việc", chỉ để "chuyển đổi") — số lượng
context switch/giây cao bất thường là dấu hiệu CPU đang bị "xé nhỏ" quá mức giữa quá nhiều
process, giảm hiệu năng THỰC TẾ dù `%CPU` tổng thể trông vẫn còn dư.

## 3. Cách nó hoạt động

**`nice`/`renice` chỉ là GỢI Ý cho scheduler, KHÔNG đảm bảo tuyệt đối** — kernel Linux (CFS —
Completely Fair Scheduler, mặc định hiện đại) dùng nice value để tính TRỌNG SỐ thời gian CPU
mỗi process nhận được TƯƠNG ĐỐI so với process khác CÙNG chạy — process nice `19` vẫn được cấp
CPU, chỉ ÍT HƠN đáng kể so với nice `0` khi có tranh chấp; nếu CPU ĐANG RẢNH (không ai tranh
chấp), process nice `19` chạy NHANH như bình thường, không bị "ép chậm" một cách tuyệt đối.
Đây là lý do `renice` một job background "nặng" (ví dụ backup) KHÔNG làm job đó chạy LÂU HƠN
nếu máy đang rảnh — chỉ có tác dụng khi CÙNG LÚC có process khác cần CPU.

**Context switch tăng vọt khi có QUÁ NHIỀU process runnable cùng lúc, kể cả khi mỗi process
dùng ít CPU** — đây là nguyên lý hay bị bỏ qua: 1000 process, mỗi process chỉ cần 1ms CPU mỗi
lần, TỔNG `%CPU` có thể vẫn thấp (vì mỗi process dùng rất ít), nhưng kernel phải CONTEXT SWITCH
liên tục giữa 1000 process đó — CHI PHÍ CHUYỂN ĐỔI (không phải "làm việc thật") chiếm phần lớn
thời gian CPU, hệ thống "cảm giác" chậm dù %CPU từng tác vụ riêng lẻ thấp. Đây là lý do có
server "CPU idle cao nhưng phản hồi chậm" — triệu chứng chỉ ra đúng vấn đề NÀY, không phải
thiếu CPU.

**Load average (nhắc lại, đào sâu)**: cột `r` (runnable) trong `vmstat` là số process đang CHỜ
hoặc ĐANG CHẠY trên CPU NGAY TẠI THỜI ĐIỂM đo — khác load average (trung bình theo thời gian
1/5/15 phút). `r` cao LIÊN TỤC qua nhiều lần đo (không phải một lần ngẫu nhiên) xác nhận CPU
THỰC SỰ đang là điểm nghẽn, đúng khớp với load average cao đã thấy trước đó.

## 4. Thực hành

Xem nice value của một process và đổi bằng `renice` (chạy thật, trên một process nền an toàn
tự tạo — không đụng gì tới service hệ thống):

```bash
$ tail -f /dev/null & BGPID=$!
$ ps -o pid,ni,cmd -p $BGPID
    PID  NI CMD
  11879   0 tail -f /dev/null
$ renice -n 15 -p $BGPID
11879 (process ID) old priority 0, new priority 15
$ ps -o pid,ni,cmd -p $BGPID
    PID  NI CMD
  11879  15 tail -f /dev/null
```

Xác nhận đúng khớp mục 2: nice value đổi từ `0` (mặc định) thành `15` (ưu tiên thấp hơn, "nhường"
CPU nhiều hơn khi có tranh chấp).

Xem `vmstat` thật, đọc đúng cột `r`/`in`/`cs` (runnable, interrupts, context switches):

```bash
$ vmstat 1 3
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 2  0      0 5966360 339024 5036088    0    0    61    36  227  386  2  1 97  0  0
 0  0      0 5969208 339024 5034248    0    0     0     0  565 1192  0  0 100  0  0
 0  0      0 5969208 339024 5034248    0    0     0     0  801 1225  0  0 100  0  0
```

Đọc: `r=0-2` (rất thấp — hầu như không có process nào chờ CPU, khớp máy đang rảnh), `cs`
(context switch/giây) dao động `386-1225` — con số NÀY RIÊNG LẺ không nói lên nhiều, cần SO
SÁNH với baseline của CHÍNH máy đó qua thời gian để phát hiện bất thường (tăng vọt so với bình
thường), không có một "ngưỡng chuẩn" chung cho mọi máy.

## 5. Lỗi thường gặp và cách chẩn đoán

**`renice` một job background, kỳ vọng nó chạy CHẬM HƠN rõ rệt, nhưng không thấy khác biệt**
- Nguyên nhân: máy đang KHÔNG có tranh chấp CPU (đủ CPU rảnh cho mọi process) — nice value chỉ
  có tác dụng khi CÓ tranh chấp, đúng khớp giải thích ở mục 3.
- Cách xác nhận: `vmstat 1` xem cột `r` — nếu luôn thấp (ít process chờ), xác nhận không có
  tranh chấp để `nice` phát huy tác dụng.
- Cách xử lý: không cần "sửa" gì — đây đúng là hành vi mong đợi; `nice` chỉ thể hiện rõ tác
  dụng khi máy BẬN.

**Server báo "CPU idle cao" nhưng ứng dụng vẫn phản hồi chậm**
- Nguyên nhân khả năng cao: context switch quá nhiều (quá nhiều process/thread nhỏ tranh giành
  CPU liên tục) — chi phí CHUYỂN ĐỔI chiếm phần lớn thời gian, không phải thiếu CPU để "làm
  việc".
- Cách xác nhận: `vmstat 1` xem cột `cs` có TĂNG VỌT bất thường so với baseline bình thường
  của máy không.
- Cách xử lý: điều tra NGUYÊN NHÂN tạo quá nhiều process/thread (ví dụ thread pool cấu hình
  sai, tạo quá nhiều worker nhỏ) — giảm SỐ LƯỢNG đơn vị tranh chấp CPU, không phải thêm CPU
  (vì CPU vốn đã "rảnh" theo %).

**So sánh nice value giữa hai process và kết luận sai process nào "ưu tiên cao hơn"**
- Nguyên nhân: nhầm "số CAO" với "ưu tiên CAO" — ngược lại, nice value THẤP (kể cả âm) mới là
  ưu tiên CAO (ít nhường), nice value CAO là ưu tiên THẤP (nhường nhiều).
- Cách xác nhận: đọc đúng chiều — `nice -20` là ưu tiên cao nhất có thể, `nice 19` là thấp
  nhất.
- Cách xử lý: luôn nhớ "nice = độ nhường", không phải "độ ưu tiên" theo nghĩa thông thường, để
  tránh đọc ngược chiều.

## 6. Tình huống thực tế

Một server chạy job backup hằng đêm, team nhận báo cáo "ứng dụng chính chậm hẳn trong lúc
backup chạy", dù server có nhiều CPU và job backup không dùng 100% CPU liên tục.

1. `vmstat 1` TRONG LÚC backup chạy — thấy cột `r` tăng cao bất thường (nhiều process runnable
   cùng lúc: job backup + ứng dụng chính + các worker phụ) — xác nhận ĐANG CÓ tranh chấp CPU
   thật, không phải cảm giác.
2. Kiểm tra nice value của job backup: `0` (mặc định) — CÙNG mức ưu tiên với ứng dụng chính,
   nên khi tranh chấp, CFS chia CPU GẦN BẰNG NHAU giữa hai bên, ứng dụng chính bị "cướp" một
   phần CPU đáng kể bởi backup.
3. Giải pháp: `renice` job backup lên nice value cao hơn (ví dụ `10` hoặc `15`) — khi CÓ tranh
   chấp (đúng lúc backup chạy, như đã xác nhận ở bước 1), scheduler sẽ ưu tiên CPU cho ứng dụng
   chính (nice `0`) nhiều hơn, backup chỉ "lấn" được phần CPU còn dư.
4. Áp dụng: sửa script/cron job backup, thêm `nice -n 15` vào lệnh khởi động backup (hoặc
   `renice` ngay sau khi job bắt đầu nếu không sửa được lệnh khởi động trực tiếp).
5. Test lại đêm sau — xác nhận ứng dụng chính không còn chậm rõ rệt, job backup VẪN HOÀN THÀNH
   (chỉ chạy lâu hơn một chút khi có tranh chấp, nhưng không ảnh hưởng ứng dụng chính).
6. Ghi vào runbook: MỌI job nền (backup, batch processing, dọn dẹp định kỳ) không cần hoàn
   thành GẤP nên LUÔN chạy với nice value cao hơn mặc định — nguyên tắc "nhường CPU cho việc
   quan trọng hơn khi có tranh chấp", áp dụng mặc định cho mọi job loại này, không chỉ sửa sau
   khi có khiếu nại.

## 7. Tự kiểm tra

1. Process A có nice value `-5`, process B có nice value `10`. Khi CÓ tranh chấp CPU, process
   nào được ưu tiên nhiều CPU hơn?
   <details><summary>Đáp án</summary>Process A (nice <code>-5</code>) — nice value THẤP hơn
   (kể cả âm) nghĩa là ưu tiên CAO hơn, "nhường" ít hơn, được cấp nhiều CPU hơn khi có tranh
   chấp.</details>

2. Bạn `renice` một job xuống nice `19` nhưng máy đang hoàn toàn rảnh (không process khác cần
   CPU). Job đó có chạy chậm hơn không?
   <details><summary>Đáp án</summary>Không — nice value chỉ ảnh hưởng khi CÓ TRANH CHẤP CPU
   với process khác. Máy rảnh, không ai tranh chấp, job chạy với tốc độ bình thường dù nice
   value cao.</details>

3. `vmstat 1` cho thấy `%CPU idle` luôn trên 80%, nhưng cột `cs` (context switch) rất cao và
   tăng dần. Ứng dụng phản hồi chậm. Hướng điều tra hợp lý nhất là gì?
   <details><summary>Đáp án</summary>Điều tra NGUYÊN NHÂN tạo quá nhiều process/thread tranh
   giành CPU liên tục (chi phí context switch cao), KHÔNG phải thêm CPU — vì %CPU idle cao đã
   xác nhận không thiếu CPU để "làm việc", vấn đề nằm ở chi phí CHUYỂN ĐỔI giữa quá nhiều đơn
   vị tranh chấp.</details>

4. Cột `r` trong `vmstat` đo gì, khác load average (1/5/15 phút) ở điểm nào?
   <details><summary>Đáp án</summary><code>r</code> là số process runnable (đang chờ hoặc
   đang chạy CPU) NGAY TẠI THỜI ĐIỂM đo — một snapshot. Load average là giá trị TRUNG BÌNH
   theo thời gian (1/5/15 phút), phản ánh xu hướng dài hơn, không phải một thời điểm tức
   thì.</details>

5. Vì sao nên đặt nice value cao hơn mặc định cho MỌI job nền không cần hoàn thành gấp (backup,
   batch xử lý), không chỉ sửa sau khi có khiếu nại?
   <details><summary>Đáp án</summary>Vì nice value chỉ phát huy tác dụng khi CÓ tranh chấp CPU
   — đặt sẵn từ đầu đảm bảo job quan trọng hơn (ứng dụng chính) luôn được ưu tiên đúng mức
   ngay khi tranh chấp xảy ra, không cần đợi phát hiện vấn đề rồi mới sửa (lúc đó ảnh hưởng đã
   xảy ra).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.performance.memory-swap` — một nguyên nhân KHÁC gây "chậm" dễ nhầm với vấn đề CPU.
- `linux.performance.io` — phân biệt tiếp "chậm vì CPU" với "chậm vì I/O" (cột `wa` trong
  `vmstat`).

**Bài liên quan ngoài module:**
- `linux.process-signals.monitoring` — nền tảng load average, `ps`/`top` mà bài này mở rộng.

**Nguồn tham khảo:**
- [vmstat(8) — man7.org](https://man7.org/linux/man-pages/man8/vmstat.8.html) — ý nghĩa đầy
  đủ các cột `procs`/`system`/`cpu`.
- [proc_loadavg(5) — man7.org](https://man7.org/linux/man-pages/man5/proc_loadavg.5.html) —
  định nghĩa load average, đã dùng ở bài `linux.process-signals.monitoring`.
- [renice(1) — man7.org](https://man7.org/linux/man-pages/man1/renice.1.html) — cú pháp và
  phạm vi giá trị nice (-20 tới 19).
