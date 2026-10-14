---
id: networking.tcpip.ipv6-basics
title: "IPv6 cơ bản: định dạng địa chỉ, khác biệt chính với IPv4"
domain: networking
module: networking.tcpip
level: "vận hành"
prerequisites: ["networking.tcpip.ipv4-subnetting"]
applies_to:
  - "IPv6 — chuẩn chung, minh họa qua Linux (iproute2)"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man7/ipv6.7.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

IPv6 không còn là "công nghệ tương lai" — nhiều hạ tầng hiện đại (Kubernetes dual-stack, cloud
provider, ISP di động) đã chạy IPv6 thật, và máy Linux hiện đại LUÔN có ít nhất một địa chỉ
IPv6 (link-local) ngay cả khi không cố ý cấu hình gì. SE không cần thành chuyên gia IPv6 ngay,
nhưng cần đủ hiểu để KHÔNG hoảng khi thấy `inet6` trong output `ip addr`, và biết phân biệt loại
địa chỉ IPv6 nào đang hoạt động thật, loại nào chỉ tồn tại nội bộ không có tác dụng gì ra
ngoài.

## 2. Khái niệm cốt lõi

Địa chỉ IPv6 dài 128 bit (gấp 4 lần IPv4's 32 bit), viết dưới dạng 8 nhóm hex 4 chữ số, phân
tách bằng `:`:

```
2001:0db8:0000:0000:0000:ff00:0042:8329
```

Hai quy tắc rút gọn (chỉ áp dụng khi VIẾT, không đổi giá trị thật):
- Bỏ số 0 dẫn đầu mỗi nhóm: `0db8` → `db8`.
- Thay MỘT chuỗi nhóm `0000` LIÊN TIẾP bằng `::` (chỉ được dùng MỘT lần trong một địa chỉ).

Rút gọn ví dụ trên: `2001:db8::ff00:42:8329`.

Các loại địa chỉ IPv6 quan trọng cần phân biệt:

| Loại | Dải | Vai trò |
|---|---|---|
| Loopback | `::1` | Tương đương `127.0.0.1` của IPv4 |
| Link-local | `fe80::/10` | Chỉ hoạt động TRONG một segment mạng cục bộ, không định tuyến được |
| Global unicast | Tuỳ ISP/tổ chức cấp | Định tuyến được ra Internet, tương đương IP public của IPv4 |
| Unique local | `fc00::/7` | Tương đương IP private (`192.168.x.x`) của IPv4 |

## 3. Cách nó hoạt động

**Mọi interface IPv6 LUÔN có địa chỉ link-local, tự động, không cần DHCP/cấu hình gì** — đây
là khác biệt lớn nhất với IPv4 (nơi một interface có thể KHÔNG có IP nào nếu chưa cấu hình):
IPv6 interface tự sinh địa chỉ `fe80::/10` ngay khi lên (dựa trên địa chỉ MAC hoặc ngẫu nhiên,
tuỳ cấu hình), dùng cho giao tiếp cục bộ (ví dụ giao thức neighbor discovery, thay thế ARP của
IPv4). Thấy một dòng `inet6 fe80::.../64` trong `ip addr` KHÔNG có nghĩa máy đã "có IPv6 ra
Internet" — đây chỉ là địa chỉ nội bộ tự động, không định tuyến được ra ngoài segment mạng
hiện tại.

**`sin6_scope_id` — lý do link-local cần "biết đi qua interface nào" khi dùng**: vì MỌI
interface đều có thể có địa chỉ `fe80::...` (và về lý thuyết có thể trùng giữa hai interface
khác nhau, vì nó chỉ cần duy nhất TRONG PHẠM VI một segment), một số lệnh/API cần chỉ định RÕ
interface nào khi dùng link-local — ví dụ `ping -6 fe80::1%eth0` (dấu `%` + tên interface) khác
với global unicast (chỉ cần địa chỉ, không cần chỉ định interface vì nó duy nhất toàn cầu).

**IPv6 KHÔNG có NAT theo đúng nghĩa IPv4 (và về thiết kế là KHÔNG CẦN)**: không gian địa chỉ
IPv6 đủ lớn để MỖI thiết bị có một địa chỉ global unicast riêng, không cần "giả lập nhiều máy
dùng chung 1 IP public" như NAT IPv4 giải quyết. Trong thực tế, một số tổ chức vẫn dùng kỹ
thuật tương tự NAT cho IPv6 (NPTv6) vì lý do khác (ẩn cấu trúc mạng nội bộ, dễ đổi ISP), nhưng
đây KHÔNG phải nhu cầu THIẾT YẾU như với IPv4 (nơi NAT ra đời vì thực sự THIẾU địa chỉ).

## 4. Thực hành

Xem địa chỉ IPv6 thật trên interface (chạy thật — mọi máy Linux hiện đại đều có, không cần
cấu hình gì):

```bash
$ ip -6 addr show enp1s0
2: enp1s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    inet6 fe80::da43:6c5a:23b:6eaf/64 scope link noprefixroute
       valid_lft forever preferred_lft forever
```

`scope link` xác nhận đây CHÍNH XÁC là địa chỉ link-local — chỉ dùng được trong segment mạng
cục bộ này, không có tác dụng gì nếu cố dùng để kết nối ra ngoài. Máy này KHÔNG có địa chỉ
global unicast IPv6 (ISP/mạng hiện tại chưa cấp) — hoàn toàn bình thường, nhiều mạng (đặc biệt
mạng nội bộ doanh nghiệp/gia đình tại Việt Nam) vẫn chỉ chạy IPv4 cho traffic thật, IPv6
link-local tồn tại "nền" không ảnh hưởng gì.

Xem địa chỉ loopback IPv6 (tương đương `127.0.0.1`):

```bash
$ ip -6 addr show lo
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    inet6 ::1/128 scope host
       valid_lft forever preferred_lft forever
```

Xem cổng đang listen có hỗ trợ CẢ IPv4 và IPv6 không (dual-stack — mẫu phổ biến của service
hiện đại):

```bash
$ ss -tln
State  Recv-Q Send-Q Local Address:Port
LISTEN 0      10           0.0.0.0:7070
LISTEN 0      10              [::]:7070
```

Cùng port `7070` xuất hiện HAI LẦN: `0.0.0.0:7070` (lắng nghe mọi địa chỉ IPv4) và
`[::]:7070` (lắng nghe mọi địa chỉ IPv6, `[::]` là viết rút gọn của "mọi IPv6" tương đương
`0.0.0.0` của IPv4) — xác nhận service này cấu hình dual-stack, chấp nhận kết nối từ cả hai
loại địa chỉ. Lưu ý: trên Linux, mặc định `IPV6_V6ONLY=0` — một socket chỉ bind `[::]:PORT`
(không có dòng `0.0.0.0:PORT` riêng) THƯỜNG ĐÃ tự nhận được cả client IPv4 (qua địa chỉ
IPv4-mapped), không nhất thiết cần thấy đủ CẢ HAI dòng mới là dual-stack — thấy cả hai dòng
riêng (như ví dụ trên) thường là dấu hiệu ứng dụng chủ động bật `IPV6_V6ONLY=1` và tự mở hai
socket độc lập.

## 5. Lỗi thường gặp và cách chẩn đoán

**Thấy `inet6 fe80::...` trong `ip addr`, hoảng tưởng máy "đã có IPv6 ra Internet" rồi cấu hình
thêm không cần thiết**
- Nguyên nhân: nhầm link-local (tự động, chỉ dùng nội bộ) với global unicast (cần cấp phát,
  định tuyến được ra ngoài) — hai loại hoàn toàn khác về khả năng dùng.
- Cách xác nhận: nhìn `scope` trong output — `scope link` là link-local, `scope global` mới là
  địa chỉ dùng được ra ngoài.
- Cách xử lý: không cần làm gì nếu không có nhu cầu IPv6 thật ra Internet — link-local tồn tại
  mặc định, vô hại, không cần "tắt" hay lo lắng.

**Một ứng dụng chỉ bind `127.0.0.1` (IPv4) nhưng client thử kết nối qua `::1` (IPv6 loopback),
thất bại**
- Nguyên nhân: `127.0.0.1` và `::1` là HAI địa chỉ khác nhau hoàn toàn (IPv4 vs IPv6) — bind
  chỉ một trong hai không tự động chấp nhận kết nối qua loại kia, trừ khi ứng dụng/OS cấu hình
  dual-stack rõ ràng.
- Cách xác nhận: `ss -tln` xem ứng dụng đang listen đúng ở `127.0.0.1` hay `[::1]` hay cả hai
  (như ví dụ `0.0.0.0`/`[::]` ở mục 4, nhưng cho riêng loopback).
- Cách xử lý: cấu hình ứng dụng bind đúng cả hai nếu cần hỗ trợ cả IPv4 và IPv6 client, hoặc
  xác nhận rõ client/ứng dụng nào đang cố dùng loại địa chỉ không được hỗ trợ.

**Dùng `ping -6 fe80::1` (không chỉ định interface) trên máy có nhiều interface, báo lỗi hoặc
không phản hồi**
- Nguyên nhân: link-local không duy nhất TOÀN MÁY (chỉ duy nhất trong TỪNG segment) — không
  chỉ định interface, hệ thống không biết nên gửi qua interface nào.
- Cách xác nhận: lỗi dạng "invalid argument" hoặc tương tự khi thiếu scope id.
- Cách xử lý: luôn chỉ định interface khi dùng link-local: `ping -6 fe80::1%eth0` (cú pháp
  `%<interface>`).

## 6. Tình huống thực tế

Một ứng dụng containerized (chạy trong Kubernetes, cấu hình dual-stack) báo lỗi ngẫu nhiên
"connection refused" từ MỘT SỐ client nhưng không phải tất cả.

1. Kiểm tra `ss -tln` trên pod — service CHỈ listen `0.0.0.0:8080` (IPv4), KHÔNG có `[::]:8080`
   — xác nhận service KHÔNG hỗ trợ IPv6 dù cluster đã bật dual-stack.
2. Kiểm tra DNS resolution từ phía client gặp lỗi: một số client (đặc biệt chạy trên mạng ISP
   di động hiện đại, ưu tiên IPv6 theo policy "Happy Eyeballs") nhận được CẢ bản ghi A (IPv4)
   VÀ AAAA (IPv6) cho service này, và THỬ IPv6 TRƯỚC — kết nối tới cổng IPv6 không có ai listen
   → "connection refused" ngay, dù IPv4 vẫn hoạt động tốt nếu được thử.
3. Xác nhận giả thuyết: `dig AAAA <service-domain>` trả về một bản ghi AAAA (do DNS tự động
   cấu hình cho mọi service trong cluster dual-stack, không phân biệt service có thực sự lắng
   nghe IPv6 hay không).
4. Hai hướng xử lý: (a) sửa ứng dụng để bind CẢ `0.0.0.0` và `::` (dual-stack thật, giải quyết
   gốc) — đây là hướng ưu tiên; (b) nếu chưa sửa được code ngay, tạm thời xoá bản ghi AAAA khỏi
   DNS cho service này để client chỉ thử IPv4 — giải pháp tạm, không xử lý được trường hợp
   client KHÁC cố tình chỉ dùng IPv6.
5. Áp dụng (a), redeploy, xác nhận `ss -tln` thấy cả `0.0.0.0:8080` và `[::]:8080`, test lại
   từ client trước đó gặp lỗi — thành công.
6. Ghi vào runbook: trong môi trường dual-stack (Kubernetes hoặc bất kỳ hạ tầng nào tự cấp cả
   AAAA/A), MỌI service PHẢI listen đúng cả hai họ địa chỉ nếu DNS tự động cấp cả hai bản ghi —
   không để DNS "hứa" một khả năng mà service không thực sự cung cấp.

## 7. Tự kiểm tra

**Câu 1**: `ip addr` hiển thị một interface có `inet6 fe80::1234:5678:9abc:def0/64 scope link`.
Địa chỉ này có dùng được để kết nối tới một server ở ngoài Internet không?

a) Có, vì IPv6 không cần NAT nên mọi loại địa chỉ đều định tuyến được ra Internet
b) Có, nhưng chỉ nếu router hỗ trợ NPTv6 để dịch địa chỉ link-local ra ngoài
c) Không. `scope link` xác nhận đây là địa chỉ link-local, chỉ hoạt động trong phạm vi segment
   mạng cục bộ, không định tuyến được ra ngoài
d) Không thể xác định chỉ từ `scope link`, cần kiểm tra thêm bằng traceroute

**Đáp án: c** — Không. `scope link` xác nhận đây là địa chỉ link-local, chỉ hoạt động trong
phạm vi segment mạng cục bộ, không định tuyến được ra ngoài. IPv6 bỏ NAT ở địa chỉ global
unicast, không có nghĩa MỌI loại địa chỉ (kể cả link-local) đều định tuyến ra ngoài được (loại
a); NPTv6 dịch địa chỉ global, không áp dụng cho link-local — link-local vẫn không định tuyến
được dù có NPTv6 (loại b); `scope link` đã đủ để xác định phạm vi, không cần traceroute (loại
d).

---

**Câu 2**: Viết rút gọn của địa chỉ `2001:0db8:0000:0000:0000:0000:0000:0001` là gì?

a) `2001:db8:0:0:1`
b) `2001:0db8::0001`
c) `2001:db8:0000::1`
d) `2001:db8::1`

**Đáp án: d** — `2001:db8::1` — bỏ số 0 dẫn đầu mỗi nhóm, và thay toàn bộ chuỗi nhóm `0000`
liên tiếp bằng `::` (chỉ dùng một lần trong một địa chỉ). `2001:db8:0:0:1` thiếu một nhóm (chỉ
còn 5 nhóm thay vì phải đại diện đủ 8, không hợp lệ nếu không dùng `::` — loại a); `2001:0db8::
0001` giữ lại số 0 dẫn đầu không cần thiết ở cả nhóm đầu và nhóm cuối (loại b); `2001:db8:0000::
1` còn sót một nhóm `0000` chưa được gộp vào `::`, trong khi toàn bộ 5 nhóm 0 liên tiếp phải gộp
chung một lần (loại c).

---

**Câu 3**: Vì sao IPv6 về thiết kế KHÔNG cần NAT như IPv4, dù một số tổ chức vẫn dùng kỹ thuật
tương tự (NPTv6)?

a) Không gian địa chỉ IPv6 (128 bit) đủ lớn để cấp một địa chỉ global unicast riêng cho mỗi thiết bị, không cần "giả lập nhiều máy dùng chung 1 IP" như NAT IPv4 giải quyết
b) Vì IPv6 cấm hoàn toàn việc dùng NAT ở mức giao thức, thiết bị hỗ trợ NAT sẽ không tương
   thích chuẩn
c) Vì NPTv6 thực chất là một dạng NAT bắt buộc để IPv6 hoạt động được qua Internet công khai
d) Vì mọi thiết bị IPv6 đều dùng chung một địa chỉ global unicast cấp bởi ISP, không cần địa
   chỉ riêng từng thiết bị

**Đáp án: a** — Không gian địa chỉ IPv6 (128 bit) đủ lớn để cấp một địa chỉ global unicast
RIÊNG cho mỗi thiết bị, không cần "giả lập nhiều máy dùng chung 1 IP" như NAT IPv4 giải quyết
(NAT ra đời vì IPv4 thực sự THIẾU địa chỉ). NPTv6 (nếu dùng) phục vụ mục đích khác (ẩn cấu trúc
mạng, dễ đổi ISP), không phải vì thiếu địa chỉ. IPv6 không cấm NAT ở mức giao thức, chỉ là
không CẦN nó (loại b); NPTv6 là lựa chọn tuỳ chọn, không bắt buộc để IPv6 hoạt động (loại c);
mỗi thiết bị IPv6 thường có địa chỉ global unicast riêng, không dùng chung một địa chỉ (loại d).

---

**Câu 4**: Vì sao `ping -6 fe80::1` (không chỉ định interface) có thể báo lỗi trên một máy có
nhiều network interface?

a) Vì lệnh `ping -6` không hỗ trợ địa chỉ link-local, phải luôn dùng global unicast
b) Địa chỉ link-local chỉ duy nhất trong phạm vi một segment mạng, không duy nhất trên toàn máy nếu có nhiều interface
c) Vì `fe80::1` là địa chỉ dự trữ không được gán cho interface thực tế nào
d) Vì hệ thống luôn ưu tiên route IPv4 trước, gây xung đột khi ping một địa chỉ IPv6 link-local

**Đáp án: b** — Địa chỉ link-local chỉ duy nhất TRONG PHẠM VI một segment mạng, không duy nhất
trên toàn máy nếu có nhiều interface — hệ thống cần biết gửi qua interface nào (chỉ định qua cú
pháp `%<interface>`), thiếu thông tin này gây lỗi hoặc không rõ hành vi. `ping -6` vẫn hỗ trợ
link-local bình thường, vấn đề là thiếu chỉ định interface (loại a); `fe80::1` chỉ là một ví dụ
địa chỉ hợp lệ trong dải link-local, không phải địa chỉ dự trữ đặc biệt (loại c); đây không liên
quan tới route IPv4 (loại d).

---

**Câu 5**: Một service dual-stack chỉ bind `0.0.0.0` (không bind `::`). DNS cấp cả bản ghi A và
AAAA cho nó. Điều gì có thể xảy ra với client ưu tiên thử IPv6 trước?

a) Client sẽ tự động fallback sang IPv4 ngay lập tức mà không có lỗi nào xuất hiện
b) DNS sẽ tự động loại bỏ bản ghi AAAA khi phát hiện service không lắng nghe IPv6
c) Client thử kết nối qua địa chỉ IPv6 (từ bản ghi AAAA) nhưng service không lắng nghe ở đó — nhận "connection refused" ngay, dù dịch vụ vẫn hoạt động tốt qua IPv4 nếu được thử
d) Client sẽ treo vô thời hạn chờ phản hồi từ địa chỉ IPv6 vì không có timeout mặc định

**Đáp án: c** — Client thử kết nối qua địa chỉ IPv6 (từ bản ghi AAAA) nhưng service KHÔNG lắng
nghe ở đó — nhận "connection refused" ngay, dù dịch vụ vẫn hoạt động tốt qua IPv4 nếu được thử.
Giải pháp đúng là bind cả hai họ địa chỉ, không chỉ xoá bản ghi AAAA. Service không lắng nghe
IPv6 nên trả RST ngay lập tức chứ không fallback tự động êm thấm (loại a); DNS chỉ trả về bản
ghi đã cấu hình, không tự biết và không tự xoá AAAA (loại b); "connection refused" là phản hồi
ngay, không phải treo vô thời hạn (loại d).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.tcpip.ipv4-subnetting` — so sánh trực tiếp với cách địa chỉ/subnet IPv4 hoạt
  động, làm nền để hiểu khác biệt IPv6.
- `networking.tcpip.osi-tcpip-model` — vai trò tầng Internet mà cả IPv4 và IPv6 cùng đảm nhiệm.

**Nguồn tham khảo:**
- [ipv6(7) — man7.org](https://man7.org/linux/man-pages/man7/ipv6.7.html) — đặc tả IPv6 trên
  Linux, định dạng địa chỉ, link-local, loopback.
