---
id: linux.performance.io
title: "Hiệu năng I/O: iostat, vmstat, phân biệt nghẽn CPU/RAM/disk"
domain: linux
module: linux.performance
level: "chuyên sâu"
prerequisites: ["linux.performance.cpu-load", "linux.performance.memory-swap"]
applies_to:
  - "Ubuntu 22.04 LTS (kernel 6.8) — /proc/diskstats, vmstat; iostat (sysstat) minh họa do không có sẵn"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man1/iostat.1.html"
  - "https://www.kernel.org/doc/Documentation/iostats.txt"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** gói `sysstat` (chứa `iostat`) không có sẵn trên máy viết bài
> (không cài thêm gói ngoài phạm vi, theo đúng tiền lệ). Output `iostat` trong mục 4 đánh dấu
> **output minh hoạ** theo man page chính thức. `vmstat`/`/proc/diskstats` chạy thật.

## 1. Vì sao cần biết

Hai bài trước đã tách riêng CPU và RAM/swap — bài này hoàn thiện "tam giác hiệu năng" với I/O
(đĩa). Một hệ thống "chậm" có thể do BẤT KỲ một trong ba (hoặc kết hợp), và nhầm nghẽn I/O
thành nghẽn CPU (hoặc ngược lại) dẫn tới giải pháp SAI hoàn toàn (thêm CPU không giúp gì nếu
đĩa là điểm nghẽn thật). Cột `wa` trong `vmstat` là manh mối ĐẦU TIÊN, nhưng cần đào sâu hơn
bằng `iostat` để biết CHÍNH XÁC đĩa nào, mức độ nào.

## 2. Khái niệm cốt lõi

| Chỉ số | Nguồn | Ý nghĩa |
|---|---|---|
| `wa` (vmstat) | `vmstat` | % thời gian CPU ở trạng thái "chờ I/O" — CPU không làm gì, chỉ đợi đĩa |
| `%util` (iostat) | `iostat -x` | % thời gian đĩa có request đang xử lý |
| `await` (iostat) | `iostat -x` | Thời gian chờ trung bình (ms) cho MỖI request I/O |
| `r/s`, `w/s` | `iostat -x` | Số request đọc/viết hoàn tất MỖI GIÂY (IOPS) |
| `rkB/s`, `wkB/s` | `iostat -x` | Thông lượng (throughput) đọc/viết mỗi giây |

**IOPS vs Throughput — hai chỉ số ĐO KHÁC NHAU, không thể suy ra nhau**: IOPS (request/giây)
cao với throughput THẤP thường gặp ở tải NHIỀU request NHỎ (database OLTP, nhiều transaction
nhỏ). Throughput cao với IOPS THẤP gặp ở tải ÍT request nhưng LỚN (sao lưu file lớn, streaming
tuần tự). Một đĩa có thể "giỏi" ở chỉ số này nhưng "kém" ở chỉ số khác — SSD thường IOPS cao
hơn HDD rất nhiều ở cùng throughput.

## 3. Cách nó hoạt động

**`%util` KHÔNG ĐÁNG TIN để đánh giá "đĩa đã bão hoà" với SSD/RAID hiện đại** — đây là điểm
hay bị hiểu SAI nhất, theo đúng tài liệu chính thức `iostat(1)`: "%util gần 100% chỉ chắc chắn
nghĩa là bão hoà với thiết bị xử lý request THEO TUẦN TỰ (serially)". SSD hiện đại và RAID xử
lý NHIỀU request CÙNG LÚC (song song) — `%util=100%` trên thiết bị này có thể chỉ nghĩa là "có
ít nhất 1 request đang xử lý tại MỌI thời điểm đo", KHÔNG có nghĩa đĩa đã hết khả năng xử lý
thêm. Phải nhìn THÊM `await` (thời gian chờ THỰC TẾ) — `await` TĂNG CAO bất thường mới là dấu
hiệu đáng tin của nghẽn thật, không chỉ riêng `%util`.

**Cột `wa` trong `vmstat` đo CPU chờ, KHÔNG đo đĩa bận bao nhiêu** — phân biệt quan trọng: `wa`
là % THỜI GIAN CPU ở trạng thái "có request I/O đang chờ nhưng CPU không có gì khác để làm, nên
ở trạng thái idle-nhưng-vì-chờ-IO". `wa` CAO xác nhận CÓ vấn đề I/O ảnh hưởng CPU, nhưng KHÔNG
cho biết đĩa NÀO, request NÀO — cần `iostat -x` (theo từng device) để biết CHÍNH XÁC.

**Process ở trạng thái `D` (uninterruptible sleep — đã học ở `linux.process-signals.lifecycle`)
là "nạn nhân trực tiếp" của I/O chậm, trong khi `wa` là góc nhìn TOÀN HỆ THỐNG**: một process cụ
thể bị "treo" ở `D` đang chờ MỘT request I/O CỤ THỂ hoàn tất — nhiều process `D` cùng lúc, cộng
lại, LÀ nguyên nhân khiến `wa` tổng thể tăng cao. Tìm process `D` cụ thể (`ps -eo pid,stat,comm
| grep ' D '`) giúp xác định CHÍNH XÁC AI đang bị ảnh hưởng, bổ sung cho góc nhìn tổng quát của
`wa`/`iostat`.

## 4. Thực hành

Xem `vmstat` thật, đọc đúng cột `wa` (chạy thật — máy hiện tại đĩa khoẻ, `wa=0`, dùng làm
baseline để so sánh khi có vấn đề):

```bash
$ vmstat 1 3
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 2  0      0 5966360 339024 5036088    0    0    61    36  227  386  2  1 97  0  0
 0  0      0 5969208 339024 5034248    0    0     0     0  565 1192  0  0 100  0  0
```

`wa=0` ở cả hai dòng, cột `b` (process blocked chờ I/O) = `0` — xác nhận KHÔNG có nghẽn I/O
tại thời điểm đo. Nếu `wa` tăng cao (ví dụ > 20-30% kéo dài) VÀ `b` > 0 liên tục, đó là dấu
hiệu cần điều tra sâu hơn bằng `iostat`.

Xem số liệu I/O THẬT theo từng đĩa, đọc trực tiếp từ kernel (không cần `iostat`/`sysstat`):

```bash
$ cat /proc/diskstats | grep nvme0n1
259 0 nvme0n1 107287 43874 9081437 25513 134855 89547 5777476 260361 0 35742 289130 0 0 0 0 7698 3255
```

Các cột (theo thứ tự): số lần đọc hoàn tất, số lần đọc được merge, số sector đã đọc, thời gian
đọc (ms)... — đây CHÍNH LÀ dữ liệu THÔ mà `iostat` tính toán và hiển thị dễ đọc hơn.

`iostat -x` — **output minh hoạ** theo đúng cú pháp/cột chính thức, minh hoạ 2 tình huống ĐỐI
LẬP để thấy rõ cách đọc `%util` kèm `await`:

```bash
# Tình huống 1: %util cao nhưng await THẤP — KHÔNG phải bão hoà thật (SSD xử lý song song tốt)
Device   r/s   w/s  rkB/s  wkB/s  await  %util
nvme0n1  850   320  45000  18000   0.8    98

# Tình huống 2: %util cao VÀ await CAO — bão hoà THẬT, cần điều tra
Device   r/s   w/s  rkB/s  wkB/s  await  %util
sda       45    12   1800    600   85.2    99
```

Đọc đúng khớp mục 3: tình huống 1 có `%util=98` nhưng `await` chỉ `0.8ms` (RẤT thấp) — đĩa
(SSD) xử lý song song tốt, KHÔNG bão hoà thật dù `%util` cao. Tình huống 2 có CẢ `%util` cao
VÀ `await=85.2ms` (rất cao với HDD) — đây mới là bão hoà THẬT, request phải chờ lâu.

## 5. Lỗi thường gặp và cách chẩn đoán

**Thấy `%util=100%` trên SSD, lập tức nâng cấp đĩa nhanh hơn mà không kiểm tra `await`**
- Nguyên nhân: tin tưởng tuyệt đối vào `%util` như với HDD cũ (xử lý tuần tự) — SSD xử lý
  song song, `%util` cao không đồng nghĩa bão hoà (mục 3).
- Cách xác nhận: xem `await` CÙNG LÚC — nếu THẤP (dưới vài ms), đĩa chưa thực sự bão hoà dù
  `%util` cao.
- Cách xử lý: chỉ nâng cấp/điều tra sâu khi `await` CŨNG cao bất thường, không chỉ dựa vào
  `%util` một mình.

**`wa` cao trong `vmstat` nhưng không biết ĐĨA NÀO, PROCESS NÀO đang gây ra**
- Nguyên nhân: `vmstat` chỉ cho góc nhìn TOÀN HỆ THỐNG, không chỉ ra chi tiết theo device/
  process.
- Cách xác nhận: `iostat -x 1` (theo từng device) tìm đĩa có `await` cao; `ps -eo
  pid,stat,comm | grep ' D '` tìm process cụ thể đang ở trạng thái chờ I/O.
- Cách xử lý: kết hợp CẢ hai góc nhìn (device nào + process nào) để xác định đúng nguồn gây
  tải I/O, không chỉ dừng ở "biết có vấn đề I/O chung".

**Nhầm IOPS cao là "tốt" một cách tuyệt đối, không xét THROUGHPUT đi kèm**
- Nguyên nhân: không phân biệt hai chỉ số đo khác nhau (mục 2) — IOPS cao với throughput THẤP
  (nhiều request nhỏ) có thể vẫn là vấn đề nếu ỨNG DỤNG thực ra cần THROUGHPUT cao (ví dụ sao
  lưu file lớn), không phải nhiều request nhỏ.
- Cách xác nhận: xem ĐÚNG chỉ số phù hợp với LOẠI tải của ứng dụng (OLTP cần IOPS, backup/
  streaming cần throughput) trước khi đánh giá "tốt/xấu".
- Cách xử lý: chọn đúng loại đĩa/cấu hình theo đúng LOẠI tải thực tế, không chỉ nhìn một chỉ
  số chung.

## 6. Tình huống thực tế

Một database server báo truy vấn chậm, team ban đầu nghi ngờ CPU (vì server có vẻ "tải cao")
nhưng sau khi kiểm tra `top` thấy CPU idle vẫn cao.

1. `vmstat 1 5` — xác nhận `wa` cao (~35%) VÀ cột `b` (blocked) thường xuyên > 0 — loại trừ
   ngay giả thuyết CPU (CPU idle cao đã xác nhận không thiếu CPU để xử lý), xác nhận ĐÚNG là
   vấn đề I/O.
2. `iostat -x 1 5` (hoặc tương đương) theo từng device — phát hiện đĩa chứa data directory của
   database có `await` RẤT CAO (hàng trăm ms), `%util` gần 100%.
3. `ps -eo pid,stat,comm | grep ' D '` — thấy NHIỀU process database worker đang ở trạng thái
   `D`, xác nhận TRỰC TIẾP các worker đang chờ I/O, khớp đúng với `wa`/`await` cao đã thấy.
4. Điều tra tiếp: kiểm tra có job NÀO KHÁC đang chạy đồng thời trên CÙNG đĩa (ví dụ backup
   full database chạy trùng giờ cao điểm truy vấn) — phát hiện ĐÚNG: job backup đang đọc toàn
   bộ data directory cùng lúc với truy vấn thật, tranh chấp I/O trên CÙNG đĩa vật lý.
5. Xử lý: dời giờ backup ra ngoài giờ cao điểm, hoặc (giải pháp tốt hơn dài hạn) tách riêng
   đĩa vật lý cho backup và cho data directory chính, tránh tranh chấp I/O giữa hai loại tải
   khác mục đích.
6. Ghi vào runbook: khi "database chậm" mà CPU idle cao, LUÔN kiểm tra `wa`/`iostat` TRƯỚC khi
   nghi ngờ CPU hay tối ưu query — tách đúng loại nghẽn (CPU/RAM/I/O) ngay từ đầu tránh lãng
   phí thời gian điều tra sai hướng.

## 7. Tự kiểm tra

1. `iostat -x` cho thấy một SSD có `%util=99%` nhưng `await=0.5ms`. Đĩa này có đang bão hoà
   thật không?
   <details><summary>Đáp án</summary>Nhiều khả năng KHÔNG — SSD xử lý request song song,
   <code>%util</code> cao không đồng nghĩa bão hoà. <code>await</code> rất thấp
   (<code>0.5ms</code>) xác nhận request vẫn được xử lý nhanh, chưa có dấu hiệu nghẽn
   thật.</details>

2. `vmstat` cho thấy `wa=40%`. Chỉ số này cho biết ĐĨA NÀO đang gây vấn đề không?
   <details><summary>Đáp án</summary>Không — <code>wa</code> chỉ là góc nhìn TOÀN HỆ THỐNG (%
   CPU đang chờ I/O nói chung), không chỉ ra device cụ thể. Cần <code>iostat -x</code> (theo
   từng device) để biết CHÍNH XÁC đĩa nào.</details>

3. Phân biệt IOPS và throughput — một ứng dụng OLTP (nhiều transaction nhỏ) cần ưu tiên chỉ số
   nào hơn?
   <details><summary>Đáp án</summary>IOPS (số request/giây) — OLTP đặc trưng bởi NHIỀU request
   NHỎ, cần đĩa xử lý được nhiều request/giây, không cần thông lượng (throughput) lớn cho mỗi
   request.</details>

4. Một process ở trạng thái `D` kéo dài. Đây có phải "process đó bị lỗi logic, cần kill và
   restart" không?
   <details><summary>Đáp án</summary>Không chắc — <code>D</code> nghĩa là process đang CHỜ một
   request I/O cụ thể hoàn tất (uninterruptible sleep), thường do đĩa/thiết bị bên dưới chậm/
   treo, không phải lỗi LOGIC của chính process đó. Không thể <code>kill</code> process ở
   trạng thái D (không nhận tín hiệu) — cần giải quyết nguyên nhân I/O bên dưới.</details>

5. Vì sao cần xem CẢ `await` và `%util` cùng lúc, không chỉ dựa vào MỘT trong hai khi đánh giá
   nghẽn đĩa?
   <details><summary>Đáp án</summary><code>%util</code> một mình không đáng tin với SSD/RAID
   (xử lý song song, có thể cao mà không bão hoà thật). <code>await</code> cho biết THỜI GIAN
   CHỜ THỰC TẾ của mỗi request — kết hợp cả hai mới xác định đúng đĩa có đang bão hoà THẬT hay
   chỉ "bận nhưng vẫn đáp ứng nhanh".</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.performance.cpu-load` — phân biệt nghẽn CPU với nghẽn I/O (cả hai đều có thể làm hệ
  thống "chậm" theo cách khác nhau).
- `linux.performance.memory-swap` — swap thrashing thực chất là MỘT DẠNG tải I/O đặc biệt, áp
  dụng cùng công cụ chẩn đoán ở bài này.
- `linux.performance.case-study` — tổng hợp cả ba góc nhìn (CPU/RAM/I/O) vào một case study
  hoàn chỉnh.

**Bài liên quan ngoài module:**
- `linux.process-signals.lifecycle` — trạng thái `D` (uninterruptible sleep), nền tảng để
  hiểu "nạn nhân" của I/O chậm ở cấp process.

**Nguồn tham khảo:**
- [iostat(1) — man7.org](https://man7.org/linux/man-pages/man1/iostat.1.html) — định nghĩa
  chính thức `%util`, `await`, xác nhận hạn chế của `%util` với thiết bị xử lý song song.
- [Kernel iostats documentation](https://www.kernel.org/doc/Documentation/iostats.txt) — thứ
  tự và ý nghĩa các trường trong `/proc/diskstats`.
