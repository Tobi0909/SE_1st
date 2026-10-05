---
id: networking.diagnostic-tools.mtr-traceroute
title: "mtr/traceroute: chẩn đoán đường đi và mất gói"
domain: networking
module: networking.diagnostic-tools
level: "vận hành"
prerequisites: ["networking.diagnostic-tools.tcpdump-wireshark"]
applies_to:
  - "mtr, traceroute — chuẩn chung mọi distro Linux"
status: draft
sources:
  - "https://manpages.ubuntu.com/manpages/jammy/man8/mtr.8.html"
  - "https://man7.org/linux/man-pages/man8/traceroute.8.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** `mtr`/`traceroute` cần gửi gói ICMP/UDP với TTL tăng dần,
> đòi hỏi raw socket (tương tự `tcpdump`) — môi trường viết bài không có quyền này (`mtr` bị
> treo/không phản hồi khi thử thật, không giả định). Output hop-by-hop trong bài đánh dấu
> **output minh hoạ** theo tài liệu chính thức. Riêng `ping` (dùng binary có sẵn capability
> `cap_net_raw`) CHẠY THẬT, dùng làm phần đối chiếu RTT cơ bản.

## 1. Vì sao cần biết

`ping` cho biết "tới được đích hay không, mất bao lâu" — nhưng KHÔNG cho biết gói tin đi qua
BAO NHIÊU chặng (hop), hay CHẶNG NÀO gây trễ/mất gói nếu có vấn đề. Khi một kết nối "chậm"
hoặc "chập chờn" mà cả nguồn và đích đều có vẻ khoẻ, vấn đề thường nằm ở MỘT ĐOẠN GIỮA đường
truyền (một router, một liên kết WAN cụ thể) — `mtr`/`traceroute` là công cụ DUY NHẤT chỉ ra
ĐÚNG đoạn đó, thay vì chỉ biết "có vấn đề" một cách mơ hồ.

## 2. Khái niệm cốt lõi

`traceroute` và `mtr` dựa trên một kỹ thuật chung: lợi dụng trường TTL (Time To Live) của IP
— gửi gói với TTL tăng dần (1, 2, 3...), mỗi router trên đường đi GIẢM TTL đi 1, và khi TTL về
0, router đó gửi lại ICMP "Time Exceeded" cho nguồn — từ đó biết được CHÍNH XÁC router nào ở
hop thứ mấy.

| Công cụ | Đặc điểm |
|---|---|
| `traceroute` | Chạy MỘT LẦN, in danh sách hop, không lặp lại đo nhiều lần |
| `mtr` | Kết hợp `traceroute` + `ping` — LẶP LẠI đo nhiều lần cho MỖI hop, thống kê `Loss%`/`Avg`/`Best`/`Wrst`/`StDev` |

`mtr` có 2 chế độ: TƯƠNG TÁC (mặc định, cập nhật liên tục trên terminal) và REPORT (`-r`, chạy
đủ N chu kỳ rồi in kết quả tổng hợp và thoát — phù hợp cho script/log).

## 3. Cách nó hoạt động

**`mtr` mạnh hơn `traceroute` vì ĐO LẶP LẠI — một lần đo KHÔNG đủ để kết luận "hop nào có vấn
đề"**: `traceroute` chỉ gửi vài gói (thường 3) cho MỖI hop rồi chuyển sang hop tiếp, cho một
"ảnh chụp" tại MỘT THỜI ĐIỂM — nếu đúng lúc đó có nhiễu tạm thời, dễ kết luận SAI hop nào có
vấn đề. `mtr` gửi LIÊN TỤC trong suốt thời gian chạy, tích luỹ thống kê `Loss%` theo THỜI GIAN
DÀI HƠN cho từng hop — một hop có `Loss%` cao ỔN ĐỊNH qua nhiều chu kỳ đáng tin hơn nhiều so
với một lần `traceroute` thấy mất gói ở đó.

**`Loss%` cao ở MỘT hop giữa đường không LUÔN LUÔN có nghĩa hop đó "có vấn đề"** — điểm hay
gây hiểu lầm: nhiều router CỐ TÌNH giới hạn tốc độ xử lý/trả lời gói ICMP "Time Exceeded" (rate
limiting cho mục đích bảo mật/giảm tải CPU router), khiến hop đó HIỂN THỊ loss cao trong khi
traffic THẬT (không phải gói dò ICMP/UDP của `mtr`) vẫn đi qua ĐÓ hoàn toàn bình thường. Dấu
hiệu đáng tin cậy hơn: `Loss%` cao LIÊN TỤC từ MỘT HOP CỤ THỂ trở đi (lan sang TẤT CẢ hop phía
SAU nó, không tự hồi phục) — khác với loss "cao ở một hop giữa đường nhưng hop CUỐI (đích) vẫn
0%" (thường chỉ là rate-limit ICMP ở hop đó, không phải vấn đề thật).

**`mtr -r` (report mode) phù hợp để LƯU LOG/SO SÁNH theo thời gian, chế độ tương tác phù hợp
để XEM TRỰC TIẾP lúc đang điều tra**: report mode in kết quả gọn, dễ parse bằng script hoặc
lưu vào hệ thống giám sát để SO SÁNH xu hướng (ví dụ chạy định kỳ, phát hiện khi một tuyến
đường bắt đầu xấu đi) — chế độ tương tác phù hợp hơn khi đang NGỒI THEO DÕI trực tiếp một sự
cố đang diễn ra.

## 4. Thực hành

`ping` THẬT trước, lấy baseline RTT cơ bản (không cho biết hop nào, nhưng là bước đầu tiên hợp
lý trước khi cần chi tiết hơn):

```bash
$ ping -c 3 192.168.25.227
--- 192.168.25.227 ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2028ms
rtt min/avg/max/mdev = 0.018/0.025/0.030/0.005 ms
```

RTT cực thấp (`~0.025ms`) vì gói tới IP của CHÍNH MÁY được kernel route NỘI BỘ qua interface
`lo`, không ra card mạng thật (về bản chất tương tự loopback, nhưng không phải cùng khái niệm
địa chỉ `127.0.0.1` đã học ở bài `networking.tcpip.ipv6-basics` — ở đây chỉ là gói gửi tới IP
LAN của chính máy, kernel tự nhận ra và không đẩy ra ngoài). Với một đích THẬT qua nhiều hop,
RTT sẽ cao hơn và biến động nhiều hơn, đúng lúc đó `mtr`/`traceroute` mới cần thiết để biết hop
nào góp phần vào độ trễ/mất gói.

`traceroute` — **output minh hoạ**, chạy MỘT LẦN, in danh sách hop (không lặp lại đo như
`mtr`):

```bash
$ traceroute -n 8.8.8.8
traceroute to 8.8.8.8 (8.8.8.8), 30 hops max, 60 byte packets
 1  192.168.24.1  0.823 ms  0.791 ms  0.775 ms
 2  10.50.0.1  2.104 ms  2.055 ms  2.301 ms
 3  203.0.113.1  * * *
 4  203.0.113.50  16.102 ms  15.987 ms  16.221 ms
 5  8.8.8.8  16.305 ms  16.198 ms  16.401 ms
```

Mỗi hop có 3 giá trị RTT (3 gói dò mặc định) — hop 3 hiện `* * *` (không phản hồi cả 3 lần,
có thể do rate-limit hoặc mất gói thật, KHÔNG phân biệt được chỉ với `traceroute` một lần chạy
— đây đúng là hạn chế đã nêu ở mục 3, cần `mtr` để đo lặp lại và có thống kê `Loss%` đáng tin
hơn).

`mtr` report mode — **output minh hoạ** theo đúng cấu trúc cột chuẩn (`Loss%`, `Snt`, `Last`,
`Avg`, `Best`, `Wrst`, `StDev`):

```bash
$ mtr -r -n -c 10 8.8.8.8
Start: 2026-10-05T16:30:00+0700
HOST: tuantm5-PC              Loss%   Snt   Last   Avg  Best  Wrst StDev
  1.|-- 192.168.24.1           0.0%    10    0.8   0.9   0.7   1.5    0.2
  2.|-- 10.50.0.1               0.0%    10    2.1   2.3   1.9   3.8    0.5
  3.|-- 203.0.113.1            40.0%    10   15.2  18.9  14.1  45.2   10.1
  4.|-- 203.0.113.50            0.0%    10   16.1  17.5  15.0  22.3    2.1
  5.|-- 8.8.8.8                 0.0%    10   16.3  17.8  15.2  23.0    2.3
```

Đọc đúng theo mục 3: hop 3 có `Loss%=40%` nhưng hop 4, 5 (SAU nó) đều `0%` — đây là dấu hiệu
ĐIỂN HÌNH của rate-limiting ICMP tại router hop 3, KHÔNG phải traffic thật bị mất qua đó (nếu
traffic thật mất tại hop 3, các hop SAU cũng phải thấy mất tương ứng, nhưng ở đây chúng hoàn
toàn khoẻ).

So sánh: nếu loss LAN RA tất cả hop từ một điểm trở đi — **output minh hoạ** cho tình huống
THẬT có vấn đề:

```bash
  3.|-- 203.0.113.1            25.0%    10   15.2  18.9  14.1  45.2   10.1
  4.|-- 203.0.113.50           24.0%    10   16.1  17.5  15.0  22.3    2.1
  5.|-- 8.8.8.8                 23.0%    10   16.3  17.8  15.2  23.0    2.3
```

Ở đây loss LAN SANG mọi hop sau hop 3 — đúng dấu hiệu vấn đề THẬT tại/sau hop 3, không phải
rate-limit.

## 5. Lỗi thường gặp và cách chẩn đoán

**Thấy MỘT hop giữa đường có `Loss%` cao, lập tức báo "đường truyền tới ISP X bị lỗi"**
- Nguyên nhân: nhầm rate-limiting ICMP (phổ biến, vô hại) với vấn đề đường truyền THẬT — như
  giải thích ở mục 3, cần nhìn các hop PHÍA SAU trước khi kết luận.
- Cách xác nhận: nếu hop CUỐI (đích thật) và các hop SAU hop nghi ngờ đều `0%` hoặc loss thấp
  tương đương baseline, nhiều khả năng chỉ là rate-limit tại ĐÚNG hop đó, không lan truyền.
- Cách xử lý: chỉ báo cáo/điều tra sâu khi loss LAN RA các hop sau, hoặc khi chính HOP ĐÍCH
  (ứng dụng/server thật cần tới) cũng thể hiện loss đáng kể.

**Chạy `mtr` chế độ tương tác trong script tự động, script bị "treo" không thoát**
- Nguyên nhân: chế độ mặc định của `mtr` là TƯƠNG TÁC (chạy liên tục, không tự thoát) — không
  phù hợp để gọi từ script.
- Cách xác nhận: script gọi `mtr <host>` không có cờ `-r`, process `mtr` không bao giờ tự kết
  thúc.
- Cách xử lý: luôn dùng `-r` (report mode) kèm `-c <số chu kỳ>` khi gọi từ script/automation.

**So sánh kết quả `mtr` của hai lần chạy KHÁC THỜI ĐIỂM và kết luận "đường truyền đã xấu đi"**
- Nguyên nhân: điều kiện mạng (đặc biệt route qua Internet công cộng) có thể THAY ĐỔI tự nhiên
  theo thời gian/tải — một lần đo đơn lẻ không đủ để kết luận XU HƯỚNG.
- Cách xác nhận: chạy `mtr -r` NHIỀU LẦN trong các khoảng thời gian khác nhau, hoặc dùng công
  cụ giám sát chạy định kỳ và lưu lịch sử, trước khi kết luận có xu hướng xấu đi thật.
- Cách xử lý: thiết lập giám sát `mtr` ĐỊNH KỲ (không chỉ chạy tay một lần khi có sự cố) nếu
  cần theo dõi chất lượng một tuyến đường quan trọng lâu dài.

## 6. Tình huống thực tế

Người dùng tại một chi nhánh báo "truy cập hệ thống nội bộ ở trụ sở chính rất chậm, đôi khi
mất kết nối", nhưng `ping` tới server trụ sở vẫn trả lời (chỉ RTT cao hơn bình thường).

1. `mtr -r -n -c 50 <ip-server-tru-so>` từ máy tại chi nhánh — chạy đủ lâu (50 chu kỳ) để có
   thống kê đáng tin, không chỉ một lần `ping` đơn lẻ.
2. Kết quả: các hop đầu (trong mạng LAN chi nhánh) đều `0%` loss, RTT thấp. Từ MỘT HOP CỤ THỂ
   (router biên của ISP cung cấp đường truyền WAN) trở đi, `Loss%` tăng lên `~15%` và LAN RA
   TẤT CẢ hop sau đó, bao gồm cả hop đích (server trụ sở) — đúng dấu hiệu vấn đề THẬT, không
   phải rate-limit (loss không "dừng lại" ở một hop rồi hồi phục).
3. Thu thập thêm bằng chạy `mtr` vào các thời điểm khác trong ngày — xác nhận loss CAO HƠN rõ
   rệt vào giờ cao điểm (buổi sáng, giờ nhiều người làm việc), gợi ý vấn đề liên quan TẢI của
   đường truyền WAN, không phải lỗi cấu hình cố định.
4. Liên hệ ISP cung cấp đường truyền, cung cấp CHÍNH XÁC kết quả `mtr` (hop nào, % loss, giờ
   nào) — dữ liệu cụ thể này giúp ISP xác định đúng đoạn cần kiểm tra, nhanh hơn nhiều so với
   báo cáo mơ hồ "mạng chậm".
5. ISP xác nhận và xử lý nghẽn tại điểm trung chuyển tương ứng với hop đã xác định.
6. Ghi vào runbook: với sự cố "mạng chậm" liên chi nhánh, LUÔN thu thập `mtr -r` (không chỉ
   `ping`) TRƯỚC KHI liên hệ ISP — dữ liệu hop-by-hop cụ thể giúp rút ngắn đáng kể thời gian
   ISP xác định và xử lý vấn đề so với báo cáo chung.

## 7. Tự kiểm tra

1. `mtr` cho thấy hop 5 có `Loss%=30%` nhưng hop 6, 7, 8 (đích) đều `0%`. Nên kết luận gì?
   <details><summary>Đáp án</summary>Nhiều khả năng là rate-limiting ICMP tại hop 5 (router đó
   cố tình giới hạn trả lời gói dò), KHÔNG phải vấn đề đường truyền thật — vì loss không lan
   sang các hop sau, traffic thật qua đó vẫn có thể hoàn toàn bình thường.</details>

2. Vì sao `mtr` được coi là đáng tin cậy hơn một lần `traceroute` đơn lẻ khi cần xác định hop
   nào THỰC SỰ có vấn đề?
   <details><summary>Đáp án</summary><code>mtr</code> đo LẶP LẠI liên tục, tích luỹ thống kê
   qua nhiều chu kỳ cho mỗi hop — một hop có loss cao ỔN ĐỊNH qua nhiều lần đo đáng tin hơn một
   lần <code>traceroute</code> chỉ gửi vài gói, dễ bị nhiễu tạm thời đánh lạc hướng.</details>

3. Một script tự động gọi `mtr 8.8.8.8` (không có cờ gì thêm) và bị treo vô thời hạn. Sửa thế
   nào?
   <details><summary>Đáp án</summary>Thêm cờ <code>-r</code> (report mode) kèm
   <code>-c &lt;số chu kỳ&gt;</code> — chế độ mặc định của <code>mtr</code> là tương tác, chạy
   liên tục không tự thoát, không phù hợp gọi từ script.</details>

4. Dấu hiệu nào phân biệt "loss do rate-limit ICMP tại một router" với "loss do vấn đề đường
   truyền thật"?
   <details><summary>Đáp án</summary>Rate-limit: loss cao CHỈ ở đúng hop đó, các hop SAU (bao
   gồm đích) vẫn khoẻ (0% hoặc thấp). Vấn đề thật: loss LAN RA tất cả hop từ điểm đó trở đi,
   bao gồm cả hop đích.</details>

5. Vì sao nên cung cấp kết quả `mtr -r` cụ thể cho ISP khi báo cáo sự cố mạng, thay vì chỉ nói
   "mạng chậm"?
   <details><summary>Đáp án</summary>Kết quả <code>mtr</code> chỉ ra CHÍNH XÁC hop nào (địa chỉ
   IP router cụ thể) đang có vấn đề và mức độ (% loss, RTT) — giúp ISP xác định đúng đoạn hạ
   tầng cần kiểm tra ngay, nhanh hơn nhiều so với việc tự điều tra lại từ đầu dựa trên báo cáo
   mơ hồ.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.diagnostic-tools.tcpdump-wireshark` — khi `mtr` xác nhận đường truyền ổn nhưng
  vấn đề vẫn còn, bước tiếp theo là xem chi tiết nội dung gói tin.
- `networking.diagnostic-tools.ss-netstat` — xác nhận trạng thái socket cục bộ trước khi nghi
  ngờ vấn đề đường truyền xa.

**Nguồn tham khảo:**
- [mtr(8) — manpages.ubuntu.com](https://manpages.ubuntu.com/manpages/jammy/man8/mtr.8.html)
  — cú pháp chính thức, chế độ report, ý nghĩa cờ `-n`/`-c`/`-r`.
- [traceroute(8) — man7.org](https://man7.org/linux/man-pages/man8/traceroute.8.html) — cú
  pháp cơ bản, cơ chế TTL/ICMP Time Exceeded.
