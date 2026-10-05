---
id: networking.diagnostic-tools.ss-netstat
title: "ss/netstat: kiểm tra socket, cổng đang nghe/kết nối"
domain: networking
module: networking.diagnostic-tools
level: "vận hành"
prerequisites: []
applies_to:
  - "ss (iproute2), netstat (net-tools, deprecated nhưng vẫn phổ biến) — Ubuntu 22.04 LTS"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man8/ss.8.html"
  - "https://man7.org/linux/man-pages/man8/netstat.8.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

"Service đã start chưa?", "Có ai đang chiếm port 8080 không?", "Server này có đang mở kết nối
ra IP lạ nào không?" — tất cả trả lời được bằng MỘT lệnh: `ss`. Đây là công cụ đầu tiên cần
chạy khi debug bất kỳ sự cố liên quan network/service trên một máy Linux, trước khi nghĩ tới
`tcpdump` hay `mtr` (các bài sau trong module này) — vì `ss` cho câu trả lời NGAY LẬP TỨC về
trạng thái socket hiện tại, không cần bắt gói hay gửi traffic thử.

## 2. Khái niệm cốt lõi

`ss` (socket statistics, từ `iproute2`) là công cụ HIỆN ĐẠI thay thế `netstat` (từ `net-tools`,
đã deprecated trên nhiều distro nhưng vẫn còn trong một số script cũ/tài liệu cũ). Cờ cốt lõi
(dùng được cho cả hai lệnh, cú pháp gần giống nhau):

| Cờ | Ý nghĩa |
|---|---|
| `-t` | Chỉ hiện socket TCP |
| `-u` | Chỉ hiện socket UDP |
| `-l` | Chỉ hiện socket đang LISTEN |
| `-n` | Numeric — không resolve tên domain/service (nhanh hơn, tránh treo chờ DNS) |
| `-p` | Hiện PID/tên process đang giữ socket |
| `-a` | Hiện TẤT CẢ (cả listening và không) |

Kết hợp phổ biến nhất: `ss -tlnp` (TCP, listening, numeric, kèm process) — câu trả lời nhanh
nhất cho "cái gì đang lắng nghe port nào, process nào".

## 3. Cách nó hoạt động

**`ss` đọc dữ liệu qua Netlink socket (giao tiếp trực tiếp với kernel), `netstat` đọc qua
`/proc/net/tcp`/`/proc/net/udp` (file ảo, định dạng text)** — đây là khác biệt kỹ thuật chính
giải thích vì sao `ss` thường NHANH HƠN đáng kể trên máy có rất nhiều kết nối (hàng chục nghìn):
Netlink là giao diện nhị phân, tối ưu cho việc TRUY VẤN LỌC TRỰC TIẾP (ví dụ "chỉ lấy socket ở
state ESTABLISHED") NGAY TẠI KERNEL, còn `netstat` phải đọc TOÀN BỘ file `/proc` rồi tự lọc ở
phía user-space — chậm hơn khi số lượng socket lớn.

**Cần quyền root để `-p` (process) hiện ĐẦY ĐỦ** — `ss`/`netstat` xác định process bằng cách
đọc `/proc/<pid>/fd` để khớp với từng socket; đọc `/proc/<pid>` của một process KHÔNG CÙNG user
yêu cầu quyền root theo đúng permission thông thường của `/proc` (không phải một capability
Linux riêng biệt). Thiếu quyền, `ss -tlnp` vẫn chạy được nhưng cột process của socket thuộc
tiến trình user khác sẽ hiện trống — đây là giới hạn bảo mật của `/proc`, không phải lỗi.

**Trạng thái socket KHÁC NHAU giữa TCP và UDP vì bản chất giao thức khác nhau (đã học ở bài
`networking.tcpip.tcp-udp`)**: TCP có state machine đầy đủ (`LISTEN`, `SYN-SENT`, `ESTABLISHED`,
`TIME-WAIT`...) vì nó CÓ connection thật. UDP không có khái niệm "connection" ở tầng giao thức
— `ss -u` chỉ hiện socket đang TỒN TẠI (đã `bind()` hoặc `connect()` ở tầng OS), KHÔNG có cột
state ý nghĩa như TCP.

## 4. Thực hành

Xem mọi socket TCP đang LISTEN kèm process (chạy thật — cần `sudo` để thấy đầy đủ tên process
của mọi user, nhưng vẫn chạy được không cần quyền này, chỉ thiếu tên ở một số dòng):

```bash
$ ss -tlnp
State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process
LISTEN 0      10           0.0.0.0:7070      0.0.0.0:*
LISTEN 0      5          127.0.0.1:902       0.0.0.0:*
LISTEN 0      4096   127.0.0.53%lo:53        0.0.0.0:*
```

Đọc đúng: `127.0.0.53%lo:53` — service DNS stub (đã thấy ở bài `networking.dns.fundamentals`)
chỉ lắng nghe trên loopback (`%lo` = interface `lo`), KHÔNG lắng nghe toàn mạng — đúng chủ ý
thiết kế (stub resolver chỉ phục vụ chính máy này, không phải DNS server công khai).

Xem các kết nối TCP đã THIẾT LẬP (ESTABLISHED) — xác nhận ai đang nói chuyện với ai THẬT, ngay
lúc này:

```bash
$ ss -tn state established
Recv-Q Send-Q  Local Address:Port    Peer Address:Port
0      0      192.168.25.227:44982  140.82.112.26:443
24     0      192.168.25.227:40110   34.51.131.60:443
```

Cột `Recv-Q`/`Send-Q` khác 0 (ví dụ dòng 2, `Send-Q=24`) báo hiệu có DỮ LIỆU đang CHỜ gửi đi mà
chưa được bên kia xác nhận (ACK) — một con số LUÔN lớn kéo dài (không giảm về 0) là dấu hiệu
đáng ngờ (phía nhận chậm, hoặc đường truyền có vấn đề), khác với việc thấy giá trị này thoáng
qua một lần kiểm tra đơn lẻ.

So sánh `ss` và `netstat` cho CÙNG thông tin — xác nhận hai lệnh cho kết quả tương đương về nội
dung, chỉ khác tốc độ/cú pháp:

```bash
$ netstat -tlnp
(Not all processes could be identified, non-owned process info
 will not be shown, you would have to be root to see it all.)
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:7070            0.0.0.0:*               LISTEN      -
```

Cùng dữ liệu (`0.0.0.0:7070 LISTEN`) như `ss -tlnp` ở trên — khác định dạng cột, cùng ý nghĩa.
Dòng cảnh báo đầu ("Not all processes could be identified...") chính là hệ quả TRỰC TIẾP của
vấn đề quyền đã nêu ở mục 3 — `netstat` TỰ in cảnh báo rõ ràng khi thiếu quyền root, còn `ss`
chỉ lặng lẽ để trống cột Process, không cảnh báo gì.

## 5. Lỗi thường gặp và cách chẩn đoán

**Service báo "address already in use" khi start, không biết ai đang chiếm port**
- Nguyên nhân: một process KHÁC (có thể instance cũ chưa tắt hẳn, hoặc service khác) đã bind
  đúng port đó trước.
- Cách xác nhận: `ss -tlnp | grep :<port>` — cột Process (cần quyền phù hợp) cho biết CHÍNH
  XÁC PID/tên process đang chiếm.
- Cách xử lý: xác nhận đúng process đó có NÊN bị kill không (có thể là chính service cũ cần
  restart đúng cách qua `systemctl`, không nên kill tay rồi start tay gây mất đồng bộ trạng
  thái với service manager).

**`ss -tn` không hiện cột `Process` dù dùng đúng cờ `-p`**
- Nguyên nhân: quên thêm `-p` thật (chỉ `-tn` không đủ), hoặc thiếu quyền xem process của user
  khác (không có `sudo`).
- Cách xác nhận: thử lại với `sudo ss -tnp` — nếu giờ thấy đầy đủ, xác nhận đúng là vấn đề
  quyền.
- Cách xử lý: dùng `sudo` khi cần xem đầy đủ thông tin process của mọi user, không chỉ user
  hiện tại.

**Thấy rất nhiều socket ở trạng thái `TIME-WAIT`, lo ngại "rò rỉ" kết nối**
- Nguyên nhân: `TIME-WAIT` là trạng thái BÌNH THƯỜNG sau khi một kết nối TCP đóng đúng cách —
  hệ điều hành GIỮ socket ở trạng thái này một khoảng thời gian (thường 2×MSL — Maximum Segment
  Lifetime) để đảm bảo không có gói tin trễ của kết nối CŨ bị nhận lầm cho một kết nối MỚI dùng
  lại đúng 4-tuple đó.
- Cách xác nhận: `ss -tn state time-wait | wc -l` đếm số lượng — một con số LỚN nhưng ổn định
  (không tăng vô hạn) là bình thường với server xử lý nhiều request ngắn hạn.
- Cách xử lý: chỉ cần lo ngại nếu số lượng TĂNG LIÊN TỤC không dừng (dấu hiệu rò rỉ thật) —
  khi đó mới cần điều tra sâu hơn (ví dụ ứng dụng không đóng kết nối đúng cách, hoặc traffic
  tăng đột biến thật).

## 6. Tình huống thực tế

Một service web báo lỗi "port 8080 already in use" ngay sau khi deploy lại qua CI/CD, dù
deploy script đã gọi `systemctl stop myapp` trước khi start lại.

1. `ss -tlnp | grep :8080` — thấy MỘT process đang giữ port này, PID khác với PID service
   `myapp` hiện tại (service vừa start lại đã có PID mới).
2. `ps -p <PID cũ> -o pid,ppid,comm,args` — xác nhận đây là một INSTANCE CŨ của `myapp` chưa
   bị dừng hẳn, không phải service nào khác.
3. Điều tra: `systemctl stop myapp` đã chạy, nhưng service có cấu hình `Type=simple` với một
   process CON (forked ra từ process chính, không được systemd quản lý theo đúng cgroup) —
   `systemctl stop` chỉ dừng process CHÍNH, process con "sót lại" tiếp tục giữ port.
4. Dừng tay process sót lại (`kill <PID cũ>`) để giải phóng port ngay, start lại service —
   thành công tạm thời.
5. Xử lý gốc: sửa unit file service đúng `Type=forking` (nếu ứng dụng tự fork) kèm `PIDFile=`
   đúng, hoặc tốt hơn là sửa ứng dụng không tự fork (chạy `Type=simple` đúng nghĩa, mọi
   process con nằm trong cùng cgroup systemd quản lý) — để `systemctl stop` dừng ĐÚNG VÀ ĐỦ mọi
   process liên quan.
6. Ghi vào runbook: deploy script PHẢI có bước xác nhận port đã giải phóng THẬT (ví dụ chờ
   `ss -tln | grep :8080` trả về rỗng) trước khi start lại, không chỉ tin tưởng
   `systemctl stop` đã trả về exit code 0 là đủ — exit code 0 chỉ xác nhận lệnh dừng được GỬI
   đúng, không đảm bảo mọi process liên quan đã thực sự dừng.

## 7. Tự kiểm tra

1. `ss -tlnp` không hiện tên process ở một số dòng, chỉ hiện số (PID) hoặc để trống. Nguyên
   nhân phổ biến nhất là gì?
   <details><summary>Đáp án</summary>Thiếu quyền (không chạy bằng <code>sudo</code>) để xem
   thông tin process của user KHÁC — kernel giới hạn hiển thị chi tiết process cho user không
   sở hữu nó.</details>

2. Vì sao `ss` thường nhanh hơn `netstat` đáng kể trên server có hàng chục nghìn kết nối?
   <details><summary>Đáp án</summary><code>ss</code> dùng Netlink socket để truy vấn TRỰC TIẾP
   và LỌC NGAY tại kernel. <code>netstat</code> đọc toàn bộ file ảo <code>/proc/net/tcp</code>
   rồi tự lọc ở phía user-space — chậm hơn khi số lượng socket lớn.</details>

3. Thấy hàng trăm socket ở trạng thái `TIME-WAIT` trên một server xử lý nhiều request ngắn
   hạn. Đây có phải dấu hiệu rò rỉ kết nối cần xử lý ngay không?
   <details><summary>Đáp án</summary>Không nhất thiết — <code>TIME-WAIT</code> là trạng thái
   bình thường sau khi đóng kết nối TCP đúng cách, hệ điều hành giữ một khoảng thời gian để
   tránh nhận lầm gói trễ. Chỉ đáng lo khi số lượng TĂNG LIÊN TỤC không dừng, không phải chỉ vì
   số lượng tuyệt đối lớn tại một thời điểm.</details>

4. Một service TCP không có khái niệm "state" rõ ràng như TCP khi xem qua `ss -u`. Vì sao?
   <details><summary>Đáp án</summary>UDP là connectionless ở tầng giao thức — không có state
   machine kết nối như TCP (không có bắt tay, không có trạng thái ESTABLISHED thật).
   <code>ss -u</code> chỉ hiện socket đang tồn tại ở tầng OS, không có cột trạng thái mang ý
   nghĩa như TCP.</details>

5. Deploy script gọi `systemctl stop myapp` rồi start lại ngay, nhưng port cũ vẫn bị chiếm bởi
   một process con sót lại. Đây là lỗi của `systemctl stop` hay của cấu hình service?
   <details><summary>Đáp án</summary>Thường là lỗi CẤU HÌNH service (ví dụ sai
   <code>Type=</code>, thiếu <code>PIDFile=</code> cho service tự fork) — <code>systemctl
   stop</code> chỉ dừng đúng những gì systemd BIẾT là thuộc service đó theo cấu hình unit file;
   process con không được quản lý đúng cgroup có thể "sót lại" ngoài tầm kiểm soát.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.diagnostic-tools.tcpdump-wireshark` — khi `ss` xác nhận có kết nối nhưng cần
  xem CHI TIẾT nội dung trao đổi, bước tiếp theo là bắt gói.
- `networking.diagnostic-tools.mtr-traceroute` — khi vấn đề nằm ở ĐƯỜNG TRUYỀN (không phải
  socket cục bộ), cần công cụ khác.

**Bài liên quan ngoài module:**
- `networking.tcpip.tcp-udp` — nền tảng state machine TCP mà cột `State` của `ss` phản ánh.

**Nguồn tham khảo:**
- [ss(8) — man7.org](https://man7.org/linux/man-pages/man8/ss.8.html) — cú pháp đầy đủ các
  cờ, định dạng output.
- [netstat(8) — man7.org](https://man7.org/linux/man-pages/man8/netstat.8.html) — xác nhận
  chính thức "netstat mostly obsolete, replacement is ss".
