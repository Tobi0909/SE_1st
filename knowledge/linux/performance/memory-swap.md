---
id: linux.performance.memory-swap
title: "Bộ nhớ và swap: free, buffer/cache, OOM killer"
domain: linux
module: linux.performance
level: "vận hành"
prerequisites: []
applies_to:
  - "Ubuntu 22.04 LTS (kernel 6.8) — hành vi OOM killer/swap chuẩn mọi distro Linux"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man5/proc_pid_oom_score.5.html"
  - "https://man7.org/linux/man-pages/man5/proc_meminfo.5.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

"Server hết RAM" và "server dùng swap" là hai triệu chứng DỄ NHẦM nhưng mức độ nghiêm trọng
khác nhau rất xa: dùng MỘT CHÚT swap không phải lúc nào cũng là vấn đề, nhưng swap LIÊN TỤC
tăng là dấu hiệu RÕ RÀNG hệ thống đang thiếu RAM thật. Và khi RAM thực sự cạn, Linux không
"treo" một cách lịch sự — nó kích hoạt OOM (Out Of Memory) killer, TỰ CHỌN một process để GIẾT
NGAY nhằm cứu cả hệ thống. Hiểu đúng kernel CHỌN process nào để giết, và đọc đúng `free`/
`/proc/meminfo`, giúp chẩn đoán nhanh và tránh hoảng loạn khi gặp "Server bị OOM kill ứng dụng
X" trong log.

## 2. Khái niệm cốt lõi

| Chỉ số | Ý nghĩa |
|---|---|
| `MemFree` | RAM HOÀN TOÀN chưa đụng tới |
| `Buffers`/`Cached` | RAM kernel dùng để CACHE (filesystem metadata, dữ liệu file) — có thể giải phóng NGAY khi cần |
| `MemAvailable` | RAM THỰC SỰ còn dùng được (free + phần cache có thể giải phóng ngay) |
| `SwapTotal`/`SwapFree` | Tổng/còn trống không gian swap (đĩa dùng làm "RAM phụ" khi thiếu RAM thật) |
| `oom_score` | Điểm kernel tính cho MỖI process để quyết định AI bị giết khi OOM — CAO hơn = DỄ bị giết hơn |

## 3. Cách nó hoạt động

**`MemAvailable` là chỉ số ĐÚNG để đánh giá "còn bao nhiêu RAM dùng được", không phải
`MemFree`** — đã nhắc sơ ở module trước, đào sâu thêm: `Buffers`/`Cached` là RAM kernel CHỦ
ĐỘNG dùng để tăng tốc (cache dữ liệu đọc gần đây) — đây là HÀNH VI THIẾT KẾ, không phải lãng
phí. Khi ứng dụng CẦN thêm RAM, kernel giải phóng cache NGAY LẬP TỨC (gần như miễn phí về thời
gian) để nhường chỗ — vì vậy `MemAvailable` (đã TÍNH SẴN phần cache có thể giải phóng) là con
số phản ánh ĐÚNG khả năng thực sự, còn `MemFree` một mình gây hoảng sợ không cần thiết trên hệ
thống đã chạy lâu (cache tự nhiên lớn dần).

**Swap KHÔNG PHẢI "xấu" tuyệt đối — một chút swap ổn định có thể là BÌNH THƯỜNG, swap TĂNG
LIÊN TỤC mới là vấn đề**: kernel có thể chủ động swap ra những trang nhớ RẤT ÍT DÙNG (ví dụ
process nền im lặng cả tuần) để dành RAM thật cho dữ liệu ĐANG DÙNG tích cực — đây là tối ưu
hợp lý, không phải dấu hiệu "thiếu RAM". Vấn đề THẬT xảy ra khi swap TĂNG ĐỀU, LIÊN TỤC, VÀ
đi kèm `si`/`so` (swap in/out trong `vmstat`) cao — nghĩa là dữ liệu ĐANG DÙNG tích cực bị đẩy
ra đĩa rồi lại phải đọc vào liên tục (gọi là "thrashing") — ĐÂY mới là dấu hiệu RAM thật sự
thiếu, hiệu năng giảm NGHIÊM TRỌNG vì đĩa chậm hơn RAM hàng nghìn lần.

**OOM killer tính `oom_score` DỰA CHỦ YẾU vào LƯỢNG RAM process đang dùng, cộng điều chỉnh
qua `oom_score_adj`** — theo đúng tài liệu kernel: process dùng NHIỀU RAM có `oom_score` CAO
hơn (dễ bị giết hơn khi cần giải phóng RAM gấp) — logic "giết process giải phóng được NHIỀU
RAM nhất, cứu hệ thống nhanh nhất". `oom_score_adj` cho phép admin CHỈNH TAY độ "dễ bị giết"
của một process CỤ THỂ (giá trị âm = khó bị giết hơn, dương = dễ bị giết hơn) — hữu ích để BẢO
VỆ process quan trọng (ví dụ chính database) khỏi bị OOM killer chọn trước những process ít
quan trọng hơn dù chúng dùng ít RAM hơn.

## 4. Thực hành

Đọc đúng `free -h`, phân biệt `free` (cột gây hiểu nhầm) với `available` (chỉ số đúng — chạy
thật):

```bash
$ free -h
               total        used        free      shared  buff/cache   available
Mem:            15Gi       4.5Gi       5.7Gi       530Mi        5.1Gi         9Gi
Swap:           2.0Gi          0B        2.0Gi
```

`free` chỉ `5.7Gi` nhưng `available` là `9Gi` — chênh lệch chính là phần `buff/cache`
(`5.1Gi`) kernel ĐANG dùng để cache, có thể giải phóng ngay khi cần — đúng khớp giải thích ở
mục 3. `Swap: 0B used` — máy này KHÔNG dùng swap gì, xác nhận RAM thật hiện dư dả.

Đọc chi tiết hơn qua `/proc/meminfo` (nguồn dữ liệu THẬT mà `free` tính toán từ đó):

```bash
$ grep -E "^MemTotal|^MemFree|^MemAvailable|^Buffers|^Cached|^SwapTotal|^SwapFree" /proc/meminfo
MemTotal:       16052912 kB
MemFree:         5988416 kB
MemAvailable:   10476660 kB
Buffers:          339080 kB
Cached:          4704196 kB
SwapTotal:       2097148 kB
SwapFree:        2097148 kB
```

`SwapFree` = `SwapTotal` (toàn bộ swap còn trống) — xác nhận lại không có hoạt động swap nào
đang diễn ra trên máy này.

Xem `oom_score` THẬT của chính process đang chạy, so với PID 1 (`systemd`, luôn được "bảo vệ"
gần tuyệt đối):

```bash
$ cat /proc/self/oom_score
666
$ cat /proc/self/oom_score_adj
0
$ cat /proc/1/oom_score
0
```

`oom_score` của `systemd` (PID 1) là `0` — THẤP NHẤT có thể, xác nhận kernel BẢO VỆ init
process khỏi bị OOM killer chọn (giết PID 1 sẽ sập toàn bộ hệ thống, kernel biết điều này và
tránh tuyệt đối). Process shell hiện tại có `oom_score=666` cao hơn nhiều — dễ bị chọn hơn nếu
cần giải phóng RAM gấp (dù vẫn chỉ là một con số TƯƠNG ĐỐI, không có nghĩa SẮP bị giết).

## 5. Lỗi thường gặp và cách chẩn đoán

**Hoảng loạn vì `free` báo "free" rất thấp, nghĩ máy sắp hết RAM**
- Nguyên nhân: nhìn cột `free` thay vì `available` — như giải thích ở mục 3, phần lớn "mất
  đi" nằm ở `buff/cache`, có thể giải phóng ngay.
- Cách xác nhận: so sánh `free` và `available` trong `free -h` — chênh lệch lớn là bình
  thường trên máy chạy lâu.
- Cách xử lý: không cần làm gì — đây là hành vi đúng; chỉ lo ngại khi `available` CHÍNH NÓ
  cũng thấp.

**Log hệ thống ghi "Out of memory: Killed process X", admin RESTART process đó và không điều
tra gì thêm**
- Nguyên nhân: OOM killer là TRIỆU CHỨNG của việc RAM thật sự cạn — restart process bị giết
  chỉ xử lý bề mặt, không tìm ra AI/CÁI GÌ đã chiếm hết RAM TRƯỚC KHI OOM xảy ra.
- Cách xác nhận: xem log TRƯỚC thời điểm OOM (qua `journalctl` hoặc log giám sát RAM theo thời
  gian) để biết process/xu hướng nào đã làm RAM cạn dần.
- Cách xử lý: điều tra NGUYÊN NHÂN GỐC (memory leak của một ứng dụng, hoặc tải tăng vượt dự
  kiến) — restart chỉ là xử lý tạm, vấn đề sẽ LẶP LẠI nếu không tìm đúng nguyên nhân.

**Thấy swap có dùng (khác 0), lập tức kết luận "RAM không đủ, cần nâng cấp ngay"**
- Nguyên nhân: như mục 3, một CHÚT swap ổn định (không tăng) có thể là tối ưu BÌNH THƯỜNG của
  kernel, không phải dấu hiệu khẩn cấp.
- Cách xác nhận: theo dõi swap USED theo THỜI GIAN (không chỉ 1 lần đo) — tăng DẦN liên tục
  mới là vấn đề thật; `vmstat` xem cột `si`/`so` có hoạt động LIÊN TỤC không (thrashing) hay
  chỉ là một lần swap ra rồi đứng yên.
- Cách xử lý: chỉ hành động (thêm RAM, giảm tải) khi xác nhận xu hướng TĂNG LIÊN TỤC hoặc có
  `si`/`so` hoạt động tích cực, không phản ứng với một lần đo swap khác 0 đơn lẻ.

## 6. Tình huống thực tế

Một ứng dụng Java bị OOM killer giết đột ngột, log hệ thống chỉ ghi "Out of memory: Killed
process 4521 (java)", không có thêm chi tiết.

1. Kiểm tra `oom_score_adj` của process đó TRƯỚC khi bị giết (nếu còn log/giám sát lưu lại) —
   xác nhận KHÔNG có điều chỉnh đặc biệt (giá trị `0`, không được bảo vệ hay bị "nhắm" sẵn).
2. Xem log giám sát RAM (nếu có hệ thống theo dõi theo thời gian, ví dụ Prometheus/Zabbix) —
   phát hiện RAM sử dụng của process Java TĂNG DẦN LIÊN TỤC trong vài giờ TRƯỚC khi bị giết,
   không phải tăng đột ngột — dấu hiệu KINH ĐIỂN của memory leak, không phải traffic tăng đột
   biến.
3. Xác nhận thêm: các process KHÁC trên máy không có xu hướng tăng RAM bất thường tương tự —
   loại trừ khả năng "cả hệ thống thiếu RAM do tải chung tăng", xác định đúng VẤN ĐỀ nằm ở
   CHÍNH ứng dụng Java.
4. Điều tra code/heap dump (nếu có bật heap dump khi OOM — khuyến nghị bật sẵn cho ứng dụng
   Java production) — tìm đúng đoạn code giữ tham chiếu không cần thiết, gây leak.
5. Xử lý tạm: tăng giới hạn heap (`-Xmx`) hoặc lên lịch restart định kỳ (workaround, không
   phải giải pháp) trong khi chờ fix code gốc.
6. Ghi vào runbook: với MỌI lần OOM killer giết một process, bước ĐẦU TIÊN là xem XU HƯỚNG
   RAM theo thời gian (không chỉ thời điểm OOM) để phân biệt "memory leak dần" với "tải tăng
   đột biến" — hai nguyên nhân cần hướng xử lý hoàn toàn khác nhau.

## 7. Tự kiểm tra

1. `free -h` cho thấy `free=500Mi` nhưng `available=6Gi`. Máy có sắp hết RAM không?
   <details><summary>Đáp án</summary>Không — <code>available</code> (đã tính cả phần cache có
   thể giải phóng ngay) mới là chỉ số đúng để đánh giá RAM thực sự còn dùng được.
   <code>available=6Gi</code> cho thấy máy còn dư RAM đáng kể, dù <code>free</code> (RAM hoàn
   toàn chưa đụng) thấp.</details>

2. Một process dùng RẤT NHIỀU RAM nhưng có `oom_score_adj = -1000`. Process này có dễ bị OOM
   killer chọn giết không?
   <details><summary>Đáp án</summary>Không — <code>oom_score_adj</code> rất âm làm GIẢM mạnh
   <code>oom_score</code> hiệu lực, khiến process này được "bảo vệ" khỏi OOM killer dù dùng
   nhiều RAM. Đây là cách admin bảo vệ process quan trọng (ví dụ database chính) khỏi bị chọn
   giết trước các process khác.</details>

3. Swap used tăng từ 0 lên 200MB một lần rồi GIỮ NGUYÊN ổn định trong nhiều ngày sau đó. Đây
   có phải dấu hiệu cần nâng cấp RAM ngay không?
   <details><summary>Đáp án</summary>Không nhất thiết — một lần swap ra rồi ổn định có thể là
   kernel tối ưu hợp lý (đẩy trang nhớ ít dùng ra để dành RAM cho dữ liệu tích cực hơn). Chỉ
   đáng lo khi swap TĂNG LIÊN TỤC hoặc có hoạt động <code>si</code>/<code>so</code> tích cực
   (thrashing).</details>

4. Một ứng dụng bị OOM killer giết. Hành động "restart ứng dụng" có giải quyết được nguyên
   nhân gốc không?
   <details><summary>Đáp án</summary>Không — restart chỉ xử lý TRIỆU CHỨNG (process đã chết).
   Nếu nguyên nhân là memory leak hoặc tải thật sự vượt khả năng RAM, vấn đề sẽ LẶP LẠI. Cần
   điều tra xu hướng RAM trước khi OOM xảy ra để tìm đúng nguyên nhân gốc.</details>

5. Vì sao `oom_score` của PID 1 (`systemd`/init) luôn ở mức thấp nhất có thể?
   <details><summary>Đáp án</summary>Vì PID 1 là tiến trình init — nếu bị giết, toàn bộ hệ
   thống sẽ sập (kernel panic hoặc không còn tiến trình nào quản lý các process khác). Kernel
   tự bảo vệ tuyệt đối PID 1 khỏi bị OOM killer chọn, bất kể lượng RAM nó dùng.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.performance.cpu-load` — phân biệt "chậm vì CPU" với "chậm vì RAM/swap" ở bài này.
- `linux.performance.io` — swap thrashing thực chất là MỘT DẠNG vấn đề I/O (đọc/viết liên tục
  xuống đĩa), liên quan trực tiếp tới bài tiếp theo.

**Nguồn tham khảo:**
- [proc_pid_oom_score(5) — man7.org](https://man7.org/linux/man-pages/man5/proc_pid_oom_score.5.html)
  — định nghĩa chính thức `oom_score`, `oom_score_adj`.
- [proc_meminfo(5) — man7.org](https://man7.org/linux/man-pages/man5/proc_meminfo.5.html) —
  định nghĩa `MemAvailable`, `Buffers`, `Cached`.
