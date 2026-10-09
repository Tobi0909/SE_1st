---
id: linux.process-signals.monitoring
title: "Giám sát process: ps, top, htop, đọc load/CPU/MEM"
domain: linux
module: linux.process-signals
level: "vận hành"
prerequisites: ["linux.process-signals.lifecycle"]
applies_to:
  - "Ubuntu 22.04 LTS — procps-ng (ps/top/free/uptime), htop (nếu đã cài)"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man1/ps.1.html"
  - "https://man7.org/linux/man-pages/man5/proc_loadavg.5.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

"Server chậm" là lời báo phổ biến nhất nhưng mơ hồ nhất mà SE nhận được. Trước khi đụng tới bất
kỳ thay đổi nào, câu hỏi đầu tiên luôn là: chậm vì CPU, vì RAM, hay vì I/O? `ps`/`top`/`htop`
trả lời được câu hỏi này trong vài giây — nhưng chỉ khi đọc đúng số liệu. Đọc sai load average
(nhầm "load cao" với "CPU quá tải" trong mọi trường hợp) hoặc đọc sai cột MEM (nhầm "RAM used
cao" với "sắp hết RAM") dẫn tới chẩn đoán sai hướng ngay từ bước đầu.

## 2. Khái niệm cốt lõi

Ba công cụ, ba mục đích hơi khác nhau:

| Công cụ | Dùng khi | Đặc điểm |
|---|---|---|
| `ps` | Cần SNAPSHOT một lần, dùng trong script | Không tự refresh, dễ lọc/pipe (`grep`, `awk`) |
| `top` | Cần xem REAL-TIME, có sẵn trên mọi distro | Tự refresh, sắp xếp theo CPU/MEM, tương tác được (`k` để kill, `r` để renice) |
| `htop` | Cần xem REAL-TIME, trực quan hơn | Màu sắc, cây process, cuộn ngang/dọc — nhưng phải cài thêm, không có sẵn mặc định mọi distro |

Các chỉ số cốt lõi cần đọc đúng:

- **Load average**: 3 số (1 phút / 5 phút / 15 phút) — số process đang "chờ được chạy" trung
  bình trong khoảng thời gian đó (bao gồm cả đang chạy VÀ đang chờ CPU, trên Linux còn tính cả
  một số process ở trạng thái `D` — chờ I/O không gián đoạn được).
- **%CPU trong `top`/`ps`**: phần trăm MỘT LÕI CPU mà process dùng — một process dùng 150% có
  nghĩa nó đang dùng tương đương 1.5 lõi (chạy đa luồng), KHÔNG phải lỗi hiển thị.
- **RES (Resident Memory)** trong `top`/`ps`: lượng RAM THẬT process đang chiếm trong RAM vật
  lý — khác `VIRT` (virtual memory, bao gồm cả bộ nhớ đã "xin" nhưng chưa thật sự dùng, có thể
  lớn hơn RAM vật lý rất nhiều mà không có nghĩa là vấn đề).

## 3. Cách nó hoạt động

**Load average CAO không luôn luôn nghĩa là CPU quá tải** — đây là điểm hiểu sai phổ biến
nhất. Trên Linux (khác một số Unix khác), load average tính luôn cả process ở trạng thái `D`
(uninterruptible sleep, thường đang chờ disk/NFS phản hồi), không chỉ process đang thực sự
tranh chấp CPU. Một server có load average 20 nhưng CPU idle 95% (`%Cpu(s)` trong `top` cho
thấy `id` cao) nhiều khả năng đang bị nghẽn I/O (nhiều process đang chờ đĩa), KHÔNG phải nghẽn
CPU — hai nguyên nhân này cần hướng xử lý hoàn toàn khác nhau.

**Phải biết số lõi CPU để đánh giá load average có "cao" hay không** — load average là một số
tuyệt đối, không tự chuẩn hoá theo số lõi. Load average `8` là BÌNH THƯỜNG trên máy 16 lõi
(dùng ~50% khả năng xử lý đồng thời) nhưng là QUÁ TẢI NGHIÊM TRỌNG trên máy 2 lõi (gấp 4 lần
khả năng). Luôn đối chiếu với `nproc` (số lõi logic) trước khi kết luận "cao" hay "thấp".

**RSS/RES cao không đồng nghĩa "sắp hết RAM"** — Linux chủ động dùng RAM trống để làm
`buff/cache` (cache filesystem, buffer I/O) nhằm tăng tốc truy cập sau này — đây là hành vi
THIẾT KẾ, không phải rò rỉ hay lãng phí. Cột `available` trong `free -h` (khác `free`) đã tính
sẵn phần cache có thể được kernel tự giải phóng ngay khi cần cho ứng dụng, nên đây là số ĐÚNG
để đánh giá "còn bao nhiêu RAM thực sự dùng được", không phải cột `free` (chỉ RAM hoàn toàn
chưa đụng tới, luôn có vẻ "thấp" một cách gây hiểu lầm trên hệ thống đã chạy lâu).

## 4. Thực hành

Đọc load average thật, đối chiếu với số lõi CPU (chạy trên máy Ubuntu 22.04.5 LTS, 16 lõi):

```bash
$ uptime
14:09:03 up 6:18, 1 user, load average: 1.04, 0.81, 0.79
$ nproc
16
```

Load average `~1.0` trên máy 16 lõi là RẤT THẤP (dùng ~6% khả năng xử lý đồng thời) — hoàn
toàn không có vấn đề về CPU, dù một người mới có thể hoảng khi thấy số "1.0" nếu không biết
đối chiếu với số lõi.

Snapshot tổng quan hệ thống qua `top` (chế độ batch, in một lần rồi thoát — dùng tốt trong
script, khác với `top` tương tác thường thấy):

```bash
$ top -bn1 | head -5
top - 14:09:12 up 6:18, 1 user, load average: 0.88, 0.79, 0.78
Tasks: 428 total, 1 running, 427 sleeping, 0 stopped, 0 zombie
%Cpu(s): 0.7 us, 1.1 sy, 0.0 ni, 98.2 id, 0.0 wa, 0.0 hi, 0.0 si, 0.0 st
MiB Mem : 15676.7 total, 1046.3 free, 7884.2 used, 6746.1 buff/cache
MiB Swap: 2048.0 total, 1944.5 free, 103.5 used. 6679.4 avail Mem
```

Đọc dòng `%Cpu(s)`: `id` (idle) = 98.2% — CPU gần như rảnh hoàn toàn, khớp đúng với load
average thấp vừa đọc ở trên. Dòng `Tasks`: `0 zombie` — xác nhận không có zombie tồn đọng tại
thời điểm này (nếu có, sẽ hiện số khác 0 ngay tại đây, không cần lọc riêng bằng `ps`).

Đọc bộ nhớ đúng cách bằng `free -h` (chú ý cột `available`, không phải `free`):

```bash
$ free -h
               total        used        free      shared  buff/cache   available
Mem:            15Gi       7.7Gi       972Mi       804Mi       6.6Gi        6.4Gi
Swap:          2.0Gi       103Mi       1.9Gi
```

Cột `free` chỉ `972Mi` (nhìn tưởng "gần hết RAM"), nhưng `available` là `6.4Gi` — vì
`6.6Gi` đang nằm ở `buff/cache`, kernel có thể giải phóng ngay khi ứng dụng cần, không phải
RAM bị "chiếm" không dùng được. Đây chính là minh hoạ trực tiếp cho nguyên lý ở mục 3.

## 5. Lỗi thường gặp và cách chẩn đoán

**Thấy load average cao, lập tức kết luận "CPU quá tải" rồi tìm cách giảm tải CPU — nhưng
không cải thiện gì**
- Nguyên nhân: như giải thích ở mục 3, load average cao trên Linux có thể do nhiều process
  đang ở trạng thái `D` (chờ I/O), không phải tranh chấp CPU.
- Cách xác nhận: nhìn `%Cpu(s)` trong `top` — nếu `id` (idle) vẫn cao (ví dụ > 80%) trong khi
  load average cao, hướng nghi ngờ phải chuyển sang I/O (disk, network storage), không phải
  CPU. Lệnh `vmstat 1 5` xem cột `wa` (waiting for I/O) để xác nhận thêm.
- Cách xử lý: điều tra I/O (storage chậm, NFS/CIFS treo) thay vì cố giảm tải CPU — xem thêm ở
  bài `linux.performance.io` (module khác, chuyên sâu hơn về phân biệt CPU/RAM/I/O).

**So sánh load average giữa hai server khác số lõi CPU và kết luận sai server nào "nặng hơn"**
- Nguyên nhân: load average là số tuyệt đối, không tự chia theo số lõi — load average `4` trên
  máy 2 lõi nặng hơn NHIỀU so với load average `4` trên máy 16 lõi.
- Cách xác nhận: luôn lấy `nproc` của từng máy trước khi so sánh, tính tỷ lệ
  `load / nproc` để so sánh công bằng.
- Cách xử lý: khi viết cảnh báo giám sát dựa trên load average, luôn đặt ngưỡng theo TỶ LỆ với
  số lõi của từng máy, không dùng một ngưỡng tuyệt đối chung cho mọi server có cấu hình khác
  nhau.

**Thấy `buff/cache` chiếm phần lớn RAM, nghĩ hệ thống "lãng phí RAM" và tìm cách tắt cache**
- Nguyên nhân: hiểu sai vai trò của `buff/cache` — đây là cơ chế tối ưu hiệu năng CHỦ ĐỘNG của
  kernel, không phải rò rỉ bộ nhớ.
- Cách xác nhận: cột `available` trong `free -h` phản ánh đúng RAM thực sự dùng được, không
  phải cột `free`.
- Cách xử lý: không cần (và không nên) chủ động can thiệp để "giải phóng" cache trừ khi đang
  debug một vấn đề cụ thể — kernel tự quản lý việc này tốt hơn can thiệp tay trong hầu hết
  trường hợp.

## 6. Tình huống thực tế

Team nhận báo cáo "server báo cáo chạy chậm" từ một dashboard giám sát bên thứ ba chỉ hiển thị
đúng MỘT số: load average. Dashboard báo load average `12` trên server X.

1. Trước khi hoảng, kiểm tra `nproc` trên server X: ra `16` — load average 12/16 ≈ 75% khả
   năng xử lý đồng thời, cao nhưng chưa phải quá tải nghiêm trọng, không phải tình huống cấp
   bách như số "12" đơn thuần gợi ý.
2. `top -bn1 | head -5` — `%Cpu(s)` cho thấy `id` chỉ 15%, `wa` (waiting I/O) tới 40% — xác
   nhận phần lớn tải không phải do tính toán CPU mà do chờ I/O.
3. `ps -eo pid,ppid,stat,comm | awk '$3 ~ /D/'` — liệt kê các process đang ở trạng thái `D`,
   phát hiện nhiều process cùng đang ghi log vào một mount NFS.
4. Kiểm tra server NFS đích: đang có một tác vụ backup khác chạy đồng thời, chiếm hết băng
   thông I/O của NAS, khiến mọi client (bao gồm server X) ghi log bị chậm, process rơi vào `D`
   chờ I/O hoàn tất.
5. Xử lý: phối hợp với team vận hành NAS để dời giờ backup ra ngoài giờ cao điểm, hoặc tách
   riêng đường I/O cho log ra khỏi NFS chia sẻ.
6. Ghi vào runbook giám sát: dashboard chỉ hiển thị load average KHÔNG đủ để kết luận — mọi
   cảnh báo load average cao cần kèm bước kiểm tra `%Cpu(s)` (đặc biệt cột `wa`) trước khi coi
   là vấn đề CPU.

## 7. Tự kiểm tra

1. Server A có 4 lõi, load average `3.8`. Server B có 32 lõi, load average `3.8`. Hai server
   có đang "nặng" như nhau không?
   <details><summary>Đáp án</summary>Không. Server A đang dùng gần hết (95%) khả năng xử lý
   đồng thời của nó — khá nặng. Server B chỉ dùng khoảng 12% — rất nhẹ. Load average là số
   tuyệt đối, phải chia theo số lõi (<code>nproc</code>) để so sánh đúng.</details>

2. `top` cho thấy load average cao nhưng `%Cpu(s)` có `id` (idle) rất cao (>80%). Hướng điều
   tra tiếp theo hợp lý nhất là gì?
   <details><summary>Đáp án</summary>Điều tra I/O, không phải CPU — kiểm tra cột <code>wa</code>
   trong <code>top</code>/<code>vmstat</code>, và tìm process ở trạng thái <code>D</code> bằng
   <code>ps -eo pid,stat,comm</code> để xác định cái gì đang chờ I/O.</details>

3. `free -h` cho thấy `free` rất thấp nhưng `available` khá cao. Hệ thống có sắp hết RAM
   không?
   <details><summary>Đáp án</summary>Chưa chắc, và thường là KHÔNG. Phần chênh lệch giữa
   <code>free</code> và <code>available</code> nằm ở <code>buff/cache</code> — RAM kernel đang
   dùng để cache, có thể giải phóng ngay khi ứng dụng cần. <code>available</code> phản ánh đúng
   lượng RAM thực sự còn dùng được.</details>

4. Một process hiện `%CPU = 180` trong `top`. Đây có phải lỗi hiển thị không?
   <details><summary>Đáp án</summary>Không phải lỗi. <code>%CPU</code> tính theo MỘT lõi —
   180% nghĩa là process đang dùng tương đương 1.8 lõi CPU (thường do chạy đa luồng/đa
   process con cùng lúc), hoàn toàn hợp lệ trên máy có nhiều hơn 1 lõi.</details>

5. Bạn muốn viết một script tự động cảnh báo khi "load trung bình vượt một ngưỡng nguy hiểm"
   và áp dụng cho nhiều server có số lõi khác nhau. Ngưỡng nên đặt theo giá trị tuyệt đối hay
   theo tỷ lệ với `nproc`? Vì sao?
   <details><summary>Đáp án</summary>Theo tỷ lệ với <code>nproc</code> (ví dụ cảnh báo khi
   <code>load1 / nproc > 1.5</code>), vì một ngưỡng tuyệt đối chung sẽ sai lệch hoàn toàn giữa
   server ít lõi (dễ báo động giả ở ngưỡng thấp không thực sự nguy hiểm) và server nhiều lõi
   (bỏ lọt tình huống quá tải thật vì ngưỡng tuyệt đối quá cao so với năng lực xử lý thực
   tế).</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.process-signals.lifecycle` — ý nghĩa các trạng thái process (`R`/`S`/`D`/`Z`) đọc
  được qua `ps`/`top`.
- `linux.process-signals.zombie-orphan` — cách phát hiện zombie tồn đọng, cũng đọc qua các
  công cụ này.

**Bài liên quan ngoài module:**
- `linux.performance.cpu-load`, `linux.performance.memory-swap`, `linux.performance.io` —
  phân tích sâu hơn về CPU/RAM/I/O (module `linux.performance`, chuyên sâu hơn bài này).

**Nguồn tham khảo:**
- [ps(1) — man7.org](https://man7.org/linux/man-pages/man1/ps.1.html) — ý nghĩa đầy đủ các
  cột và mã trạng thái.
- [proc_loadavg(5) — man7.org](https://man7.org/linux/man-pages/man5/proc_loadavg.5.html) —
  xác nhận load average tính cả process ở trạng thái `R` (run queue) và `D` (chờ I/O).
