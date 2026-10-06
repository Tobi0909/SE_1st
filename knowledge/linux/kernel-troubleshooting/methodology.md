---
id: linux.kernel-troubleshooting.methodology
title: "Phương pháp luận troubleshooting Linux tổng hợp (bài capstone)"
domain: linux
module: linux.kernel-troubleshooting
level: "chuyên sâu"
prerequisites:
  - "linux.performance.case-study"
  - "linux.filesystem-storage.troubleshooting"
  - "linux.network-stack.troubleshooting"
  - "linux.kernel-troubleshooting.kernel-logs"
applies_to:
  - "Bài capstone — tổng hợp phương pháp, không giới hạn distro cụ thể; các lệnh ví dụ lấy từ Ubuntu 22.04 nhưng phương pháp áp dụng chung"
status: draft
sources:
  - "https://www.brendangregg.com/linuxperf.html"
  - "https://man7.org/linux/man-pages/man1/journalctl.1.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Các module trước đã dạy từng CÔNG CỤ riêng lẻ (systemd, filesystem, network, performance, kernel
log). Trong thực tế, một sự cố trên server hiếm khi chỉ nằm đúng trong một lĩnh vực — thường thấy
triệu chứng ở lớp này (ví dụ "service không khởi động được") nhưng nguyên nhân gốc lại nằm ở lớp
khác (ví dụ đĩa đầy, hoặc port đã bị giữ). Bài capstone này dạy PHƯƠNG PHÁP — thứ tự tư duy, câu
hỏi cần đặt ở mỗi bước, và cách không bị bẫy bởi "triệu chứng nổi" khi "nguyên nhân thật" nằm
sâu hơn. Phương pháp không thay thế kiến thức công cụ (vẫn cần biết đúng lệnh để chạy) — nó là
khung giúp chọn đúng lệnh và không bỏ sót tầng.

## 2. Khái niệm cốt lõi

**Nguyên tắc "từ triệu chứng vào nguyên nhân gốc" (root cause)**: một triệu chứng có thể có nhiều
nguyên nhân, và một nguyên nhân có thể biểu hiện qua nhiều triệu chứng. Mục tiêu của troubleshooting
là tìm NGUYÊN NHÂN GỐC (thứ gây ra vấn đề nếu không sửa sẽ lặp lại), không chỉ giải quyết triệu
chứng bề mặt.

**Khung USE (Utilization-Saturation-Errors)** — áp dụng cho MỌI tài nguyên hệ thống:
- **Utilization**: tài nguyên đang dùng bao nhiêu phần trăm capacity? (CPU, RAM, disk I/O, network)
- **Saturation**: tài nguyên có đang bị đặt hàng CHỜ không? (load average > nproc, queue đầy,
  I/O wait cao)
- **Errors**: có lỗi nào được ghi nhận không? (kernel log, SMART error, network error counter)

**Thứ tự ưu tiên khi không có hướng dẫn cụ thể:**
1. Kiểm tra tài nguyên CẠN KIỆT (đĩa đầy, RAM hết, CPU load quá cao) — thường gây nhiều triệu chứng
   đa dạng và dễ bỏ qua nhất.
2. Kiểm tra service/process có thực sự ĐANG CHẠY không (systemd status, PID còn sống).
3. Kiểm tra NETWORK ở tầng THẤP NHẤT trước (có kết nối không → firewall → port có LISTEN không).
4. Kiểm tra LOG — application log, system log, kernel log.
5. Tái hiện vấn đề trong môi trường kiểm soát nhỏ hơn, nếu có thể.

**Một quy tắc quan trọng: đặt câu hỏi "đã từng hoạt động chưa?"** — nếu CÓ (regression), tìm điều
gì ĐÃ THAY ĐỔI. Nếu CHƯA BAO GIỜ (new setup), tìm điều gì THIẾU. Hai hướng điều tra hoàn toàn
khác nhau.

## 3. Cách nó hoạt động

**Quy trình gợi ý cho sự cố "service X không hoạt động":**

```
Triệu chứng: "X không hoạt động / không kết nối được / chậm"
   │
   ├─ Hỏi: lần cuối hoạt động là khi nào?
   │   ├─ CÓ (regression): tìm thay đổi gần nhất (deploy, update, config change)
   │   └─ CHƯA (new setup): kiểm tra thiếu gì (dependency, port, quyền, config)
   │
   ├─ 1. Kiểm tra tài nguyên cạn kiệt
   │       df -h (đĩa đầy?) | free -h (RAM?) | uptime (load?) | ulimit -n (fd limit?)
   │
   ├─ 2. Kiểm tra service/process
   │       systemctl status X | journalctl -u X -n 50 | ps aux | grep X
   │
   ├─ 3. Kiểm tra network (nếu là service network)
   │       ss -tln | grep <port>           ← có LISTEN chưa?
   │       ss -tln | grep <port> vs 0.0.0.0 ← có bind đúng interface chưa?
   │       telnet/curl 127.0.0.1:<port>    ← từ loopback kết nối được không?
   │       ufw status / nft list ruleset   ← firewall chặn không? (cần root)
   │
   ├─ 4. Đọc log
   │       journalctl -u X -n 100 --no-pager   ← application log
   │       journalctl -k -p err --no-pager      ← kernel error log
   │       tail -n 50 /var/log/syslog           ← system log
   │
   └─ 5. Kiểm tra kernel/module nếu liên quan hardware/driver
           lsmod | grep <module>
           journalctl -k | grep <thiết-bị>
```

**Bẫy phổ biến: debug firewall trước khi kiểm tra service có LISTEN không** — thứ tự sai làm mất
nhiều thời gian nhất: nhiều SE debug firewall rất lâu cho một service thực ra chưa start, hoặc đang
LISTEN trên `127.0.0.1` thay vì `0.0.0.0`. `ss -tln` PHẢI được chạy trước khi sờ vào firewall —
xác nhận "không có gì để firewall chặn" hay "đang LISTEN sai interface".

**Tư duy phân kỳ vs hội tụ trong debug**: giai đoạn đầu là PHÂN KỲ — thu thập dữ liệu rộng, không
đưa ra kết luận sớm. Giai đoạn hai là HỘI TỤ — loại trừ dần giả thuyết bằng bằng chứng cụ thể.
Sai lầm hay gặp nhất là hội tụ QUÁ SỚM (commit vào 1 giả thuyết khi chưa có đủ bằng chứng), dẫn
tới "sửa sai chỗ" và tốn thêm thời gian.

## 4. Thực hành

Ba kịch bản debug ngắn áp dụng khung ở mục 3 — chạy thật trên máy demo:

**Kịch bản A — Kiểm tra tài nguyên:**

```bash
$ df -h / /home /var 2>/dev/null || df -h /
Filesystem      Size  Used Avail Use% Mounted on
/dev/nvme0n1p2  468G   68G  376G  16% /

$ free -h
               total        used        free      shared  buff/cache   available
Mem:            15Gi       7.1Gi       2.1Gi       512Mi       6.2Gi       7.8Gi

$ uptime
 13:45:01 up  6:10,  1 user,  load average: 0.89, 1.03, 0.98
```

Đọc: đĩa 16% — không vấn đề; RAM 7.8Gi available — không vấn đề; load ~1.0 trên máy 8 core
(`nproc` trả về 8) — load/core ≈ 0.12, rất thấp. Kết luận: tài nguyên cạn kiệt không phải nguyên
nhân trên máy này.

**Kịch bản B — Xác nhận service status theo đúng thứ tự:**

```bash
$ systemctl is-active ssh
active

$ ss -tln | grep :22
LISTEN 0      128    0.0.0.0:22   0.0.0.0:*
LISTEN 0      128       [::]:22      [::]:*
```

SSH đang active VÀ LISTEN trên `0.0.0.0:22` (mọi interface, cả IPv4 và IPv6) — nếu client không
kết nối được SSH, nguyên nhân KHÔNG phải service hay bind address, cần kiểm tra firewall hoặc
network routing tiếp theo.

**Kịch bản C — Module và kernel log phối hợp:**

```bash
$ lsmod | grep sctp
sctp                  495616  15 sctp_diag

$ journalctl -k --no-pager -S "30 minutes ago" | grep sctp
Oct 06 09:36:43 demo-host kernel: sctp: Hash tables configured (bind 256/256)
```

Module `sctp` đang load (15 users) và log ghi nhận "Hash tables configured" — xác nhận module init
thành công. Nếu `lsmod` không thấy `sctp` nhưng ứng dụng cần SCTP, bước tiếp theo là `sudo modprobe
sctp` và kiểm tra kernel log sau đó.

## 5. Lỗi thường gặp và cách chẩn đoán

**"Service restart xong, nhưng 5 phút sau lại chết" — vòng lặp crash không rõ nguyên nhân**
- Nguyên nhân khả năng cao: application log không đủ, hoặc đọc log sai source (đọc systemd journal
  nhưng ứng dụng lại ghi vào file log riêng, hoặc ngược lại).
- Cách xác nhận: xác định CHÍNH XÁC ứng dụng đang ghi log ở đâu (`journalctl -u <service>` vs file
  trong `/var/log/<app>/`) — sau đó đọc log từ NGAY TRƯỚC lần crash cuối cùng, không phải toàn bộ.
  `journalctl -u <service> --since "5 minutes ago"` giúp thu hẹp.
- Cách xử lý: xác định được nguyên nhân từ log mới sửa được; restart đơn thuần không phải "xử lý",
  chỉ là tạm hoãn triệu chứng.

**"Debug từ sáng tới chiều không ra nguyên nhân, thử đủ mọi cách"**
- Nguyên nhân khả năng cao: đang làm ngược — thay vì "thu thập dữ liệu → đặt giả thuyết → loại
  trừ", đang "đoán nguyên nhân → sửa thử → không được → đoán lại" (debug theo trực giác không có
  hệ thống).
- Cách xử lý: dừng lại, liệt kê ra BẤT CỨ ĐIỀU GÌ đã biết chắc chắn (không phải giả thuyết) về
  tình trạng hệ thống, sau đó chạy đúng bước 1-4 theo khung ở mục 3 theo THỨ TỰ, ghi lại kết quả
  từng bước. Thường sau khi làm vậy, nguyên nhân rõ ràng trong vòng 15 phút.

## 6. Tình huống thực tế

Chuỗi debug hoàn chỉnh — "Web application không trả về response, client thấy timeout":

1. **Kiểm tra tài nguyên cạn kiệt**: `df -h` → đĩa `/var` 98% → TÌMTHẤY vấn đề tiềm ẩn. `free -h`
   → RAM đủ. `uptime` → load 0.5 (bình thường). → Đĩa đầy là nguyên nhân có khả năng cao nhất.

2. **Kiểm tra service**: `systemctl status nginx` → "active (running)". Process chạy, nhưng đĩa
   đầy — nhiều web server không ghi được access/error log thì từ chối handle request mới (tuỳ cấu
   hình), hoặc không tạo được file temp upload.

3. **Kiểm tra log**: `journalctl -u nginx -n 50 | grep -i "error\|warn\|fail"`:
   ```
   Oct 06 14:23:45 demo-host nginx[1234]: 2026/10/06 14:23:45 [crit] 1234#1234: *789 open() "/var/log/nginx/error.log" failed (28: No space left on device)
   ```
   Lỗi `No space left on device` — xác nhận: Nginx không ghi được log → từ chối request mới.

4. **Xử lý**: `du -sh /var/log/nginx/*.log*` → error.log không rotate 10GB. Xoá log cũ đã rotate
   (`/var/log/nginx/*.log.*.gz`), restart logrotate, `df -h` xác nhận đĩa giải phóng.

5. **Nguyên nhân gốc**: `logrotate.conf` cho nginx bị comment-out do ai đó "sửa tạm" 3 tháng trước,
   dẫn tới log tích lũy không giới hạn. Sửa lại logrotate config, test `logrotate -f` → ghi vào
   runbook: giám sát disk usage `/var` bằng alert ngưỡng 80%.

6. **Bài học từ kịch bản này**: "timeout từ client" không tự nhiên gợi ý "đĩa đầy" — nếu bỏ qua
   bước 1 (kiểm tra tài nguyên) và nhảy thẳng vào debug network/firewall/code, sẽ mất nhiều thời
   gian trước khi tìm ra. Tài nguyên cạn kiệt luôn là bước FIRST.

## 7. Tự kiểm tra

1. "Service không kết nối được từ client bên ngoài." Trước khi kiểm tra firewall, cần xác nhận điều
   gì?
   <details><summary>Đáp án</summary>Service có thực sự LISTEN trên port đó không, và LISTEN trên
   interface nào — dùng <code>ss -tln | grep &lt;port&gt;</code>. Nếu không thấy dòng nào, service
   chưa start hoặc LISTEN sai port. Nếu thấy <code>127.0.0.1:&lt;port&gt;</code> thay vì
   <code>0.0.0.0:&lt;port&gt;</code>, service chỉ chấp nhận kết nối nội bộ — đây không phải vấn
   đề firewall.</details>

2. Một sự cố xảy ra và bạn cần hỏi "đã từng hoạt động chưa?" Trả lời "CÓ" dẫn hướng điều tra theo
   chiều nào?
   <details><summary>Đáp án</summary>Tìm điều gì ĐÃ THAY ĐỔI gần nhất — deploy mới, update package,
   thay đổi cấu hình, thêm user, sửa firewall rule... Câu hỏi cốt lõi là "regression: thứ gì đó đã
   hoạt động đúng và đã bị phá vỡ bởi thay đổi", không phải "tìm thứ còn thiếu".</details>

3. Sau khi chạy đủ 4 bước của khung mà vẫn không rõ nguyên nhân, bước tiếp theo nên là gì?
   <details><summary>Đáp án</summary>Cố gắng TÁI HIỆN vấn đề trong môi trường kiểm soát nhỏ hơn
   (ví dụ test trên máy staging, hoặc tái hiện với request/command cụ thể) — tái hiện được nghĩa là
   hiểu đủ về vấn đề để mô tả nó chính xác, và cho phép thay đổi một biến một lúc để loại trừ.
   Nếu không tái hiện được, vấn đề có thể là race condition hoặc intermittent — bước tiếp là thêm
   instrumentation (log chi tiết hơn, metric) rồi chờ xảy ra lần nữa.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan là TẤT CẢ các bài đã học — đây là bài capstone tổng hợp:**
- `linux.performance.case-study` — khung USE và end-to-end debug CPU/Memory/I-O.
- `linux.filesystem-storage.troubleshooting` — debug đĩa đầy, lỗi mount, inode.
- `linux.network-stack.troubleshooting` — MTU, bonding, ping không phải bằng chứng "mạng OK".
- `linux.network-stack.firewall` — kiểm tra firewall LUÔN sau khi xác nhận service đang LISTEN đúng.
- `linux.kernel-troubleshooting.kernel-logs` — `journalctl -k -p err` là bước quan trọng trong
  mọi quy trình debug liên quan hardware/driver/kernel module.
- `linux.boot-systemd.service-mgmt` — `systemctl status` và `journalctl -u` là điểm khởi đầu cho
  mọi debug service.

**Nguồn tham khảo:**
- [Linux Performance — Brendan Gregg](https://www.brendangregg.com/linuxperf.html) — bản đồ toàn
  diện các công cụ theo tầng hệ thống (CPU/Memory/Disk/Network), tài nguyên tham khảo chuẩn cho
  SE troubleshooting Linux chuyên nghiệp.
- [journalctl(1) — man7.org](https://man7.org/linux/man-pages/man1/journalctl.1.html) — `--since`,
  `--until`, `-u`, `-k`, `-p` để lọc log hiệu quả trong điều tra sự cố.
