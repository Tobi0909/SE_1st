---
id: linux.network-stack.dns-resolution
title: "DNS resolution trên Linux: resolv.conf, nsswitch, systemd-resolved"
domain: linux
module: linux.network-stack
level: "vận hành"
prerequisites: ["linux.network-stack.tools", "networking.dns.fundamentals"]
applies_to:
  - "Ubuntu 22.04 LTS với systemd-resolved (mặc định từ Ubuntu 18.04+) — các distro khác (hoặc Ubuntu cũ) có thể dùng resolv.conf tĩnh trực tiếp, không qua stub resolver"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man5/resolv.conf.5.html"
  - "https://man7.org/linux/man-pages/man5/nsswitch.conf.5.html"
  - "https://man7.org/linux/man-pages/man1/resolvectl.1.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Bài `networking.dns.fundamentals`/`.operations` đã học DNS ở mức GIAO THỨC (resolver vs
authoritative, zone, TTL). Bài này trả lời câu hỏi KHÁC: trên một máy Linux CỤ THỂ, khi một
ứng dụng gọi "resolve tên miền", request đó ĐI QUA ĐƯỜNG NÀO trước khi tới được DNS server? Trên
hệ thống hiện đại (systemd-resolved), đường đi này có thêm một tầng TRUNG GIAN (stub resolver)
mà nhiều người vận hành không biết tồn tại — dẫn tới debug sai hướng khi DNS "có vẻ" không hoạt
động như mong đợi.

## 2. Khái niệm cốt lõi

**`/etc/resolv.conf`**: file cấu hình resolver TRUYỀN THỐNG, chứa `nameserver` (IP DNS server)
và `search` (domain tự động thêm vào tên ngắn). Trên hệ thống dùng `systemd-resolved`, file này
THƯỜNG là một SYMLINK trỏ tới `/run/systemd/resolve/stub-resolv.conf` — nội dung thực tế LUÔN
chỉ ghi `nameserver 127.0.0.53` (địa chỉ LOOPBACK cố định của stub resolver), KHÔNG phải DNS
server thật mà máy đang dùng.

**`nsswitch.conf`**: quyết định THỨ TỰ tra cứu cho các loại thông tin hệ thống (không chỉ DNS)
— dòng `hosts:` định nghĩa thứ tự resolve TÊN MÁY: `files` (tra `/etc/hosts` trước), `mdns4_minimal`
(mDNS — tên `.local` trong mạng LAN), `dns` (DNS thật, sau cùng).

**`systemd-resolved`**: service chạy NGẦM, đóng vai trò STUB RESOLVER — mọi ứng dụng gọi
resolve tên đều gửi request tới `127.0.0.53:53` (chính service này, KHÔNG phải DNS server
thật), `systemd-resolved` rồi mới chuyển tiếp (forward) request đó tới DNS server THẬT đã cấu
hình (qua DHCP hoặc thủ công), nhận kết quả, CACHE lại, rồi trả về cho ứng dụng.

| Lệnh | Tác dụng |
|---|---|
| `resolvectl status` | Xem DNS server thật đang dùng cho từng interface |
| `resolvectl dns` | Chỉ xem danh sách DNS server (gọn hơn `status`) |
| `resolvectl query <tên>` | Resolve một tên, hiện rõ qua protocol nào (DNS/mDNS/LLMNR) |
| `resolvectl flush-caches` | Xoá cache DNS của `systemd-resolved` |

## 3. Cách nó hoạt động

**`cat /etc/resolv.conf` trên máy dùng `systemd-resolved` KHÔNG cho biết DNS server thật** —
đây là điểm gây nhầm lẫn phổ biến NHẤT của bài này: người debug mở `/etc/resolv.conf`, thấy
`nameserver 127.0.0.53`, kết luận SAI rằng "DNS server là localhost" hoặc "cấu hình DNS bị
lỗi". Thực chất `127.0.0.53` là địa chỉ CỐ ĐỊNH của stub resolver NGAY TRÊN máy đó — DNS server
THẬT (ví dụ do DHCP cấp) chỉ xem được bằng `resolvectl status`/`resolvectl dns`, không phải đọc
trực tiếp `resolv.conf`.

**Thứ tự trong `nsswitch.conf` áp dụng CHO MỌI chương trình dùng hàm thư viện chuẩn
(`getaddrinfo`/`gethostbyname`), không chỉ riêng DNS** — đây là lý do một tên trong
`/etc/hosts` LUÔN được ưu tiên trước DNS (vì `files` đứng trước `dns` trong dòng `hosts:`) —
thêm một dòng vào `/etc/hosts` là cách NHANH để ghi đè tạm thời một tên miền cho mục đích test,
không cần đổi gì ở DNS server thật.

**`systemd-resolved` CACHE kết quả DNS** — một thay đổi DNS record (ví dụ sau khi sửa zone
file ở `networking.dns.operations`) có thể KHÔNG thấy hiệu lực ngay trên máy client dù TTL đã
hết, vì cache cục bộ của `systemd-resolved` chưa tự làm mới — `resolvectl flush-caches` buộc
xoá cache, resolve lại từ đầu.

## 4. Thực hành

Xác nhận `/etc/resolv.conf` là symlink quản lý bởi `systemd-resolved`, và nội dung chỉ là stub:

```bash
$ cat /etc/resolv.conf
# This is /run/systemd/resolve/stub-resolv.conf managed by man:systemd-resolved(8).
# Do not edit.
...
nameserver 127.0.0.53
options edns0 trust-ad
search .
```

Xem DNS server THẬT đang dùng (khác hẳn `127.0.0.53` ở trên) — xác nhận đúng mục 3:

```bash
$ resolvectl status
Global
       Protocols: -LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported
resolv.conf mode: stub

Link 2 (enp1s0)
    Current Scopes: DNS
         Protocols: +DefaultRoute +LLMNR -mDNS -DNSOverTLS DNSSEC=no/unsupported
Current DNS Server: 192.168.24.1
       DNS Servers: 192.168.24.1
```

`Current DNS Server: 192.168.24.1` — đây mới là DNS server THẬT (gateway của mạng, cấp qua
DHCP), không phải `127.0.0.53` thấy trong `resolv.conf`.

Xem thứ tự tra cứu hostname:

```bash
$ grep hosts /etc/nsswitch.conf
hosts:          files mdns4_minimal [NOTFOUND=return] dns
```

`files` đứng ĐẦU — mọi tên trong `/etc/hosts` được dùng TRƯỚC khi hỏi DNS, đúng khớp mục 3.

Xác nhận dòng `127.0.0.53%lo:53` trong `ss -tln` (đã thấy ở bài
`linux.network-stack.tools`) chính là service `systemd-resolved` đang LISTEN để nhận request từ
mọi ứng dụng trên máy:

```bash
$ ss -tln | grep 53
LISTEN 0      4096   127.0.0.53%lo:53    0.0.0.0:*
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Đọc `/etc/resolv.conf`, thấy `nameserver 127.0.0.53`, kết luận "DNS bị cấu hình sai thành
localhost"**
- Nguyên nhân: không biết `127.0.0.53` là địa chỉ CỐ ĐỊNH của stub resolver trên máy dùng
  `systemd-resolved` — đây là hành vi BÌNH THƯỜNG, không phải lỗi.
- Cách xác nhận: `systemctl is-active systemd-resolved` — nếu service này đang chạy, xác nhận
  đúng đang ở mô hình stub resolver.
- Cách xử lý: dùng `resolvectl status`/`resolvectl dns` để xem DNS server THẬT, không đọc trực
  tiếp `resolv.conf` trên hệ thống dùng `systemd-resolved`.

**Sửa DNS record, chờ qua TTL nhưng máy client vẫn trả kết quả CŨ**
- Nguyên nhân: cache cục bộ của `systemd-resolved` trên CHÍNH máy client chưa tự làm mới — khác
  với cache ở DNS server trung gian (đã học ở `networking.dns.operations`), đây là cache THÊM
  một tầng nữa ngay trên máy đang test.
- Cách xác nhận: `resolvectl query <tên>` xem kết quả hiện tại; nếu vẫn là giá trị CŨ dù DNS
  server đã có bản ghi mới (xác nhận bằng `dig @<dns-server> <tên>` trực tiếp, bỏ qua cache
  local), xác nhận đúng nguyên nhân.
- Cách xử lý: `resolvectl flush-caches` trên máy client để xoá cache, resolve lại từ đầu.

**Thêm dòng vào `/etc/hosts` để test nhưng ứng dụng vẫn resolve ra IP CŨ (DNS thật)**
- Nguyên nhân khả năng cao: ứng dụng dùng cơ chế resolve KHÁC không tuân theo `nsswitch.conf`
  (ví dụ một số ứng dụng tự implement DNS resolver riêng trong code, không gọi qua
  `getaddrinfo` của hệ thống) — hiếm gặp nhưng là nguyên nhân hay bị bỏ qua khi debug.
- Cách xác nhận: test bằng một công cụ chuẩn trước (`getent hosts <tên>` — gọi đúng qua
  `nsswitch.conf`) để xác nhận `/etc/hosts` CÓ hoạt động đúng ở tầng hệ thống; nếu đúng mà ứng
  dụng cụ thể vẫn sai, vấn đề nằm ở CHÍNH ứng dụng đó.
- Cách xử lý: với ứng dụng tự resolve riêng, phải cấu hình DNS server của chính ứng dụng đó
  (hoặc dùng công cụ chặn ở tầng mạng), không thể sửa qua `/etc/hosts`.

## 6. Tình huống thực tế

Một dịch vụ nội bộ vừa được migrate sang server mới (IP mới), team đã cập nhật DNS record,
nhưng một nhân viên vẫn kết nối nhầm vào server CŨ dù đã chờ qua thời gian TTL công bố:

1. Yêu cầu nhân viên chạy `resolvectl query <tên-service>` — kết quả trả về IP CŨ, xác nhận
   vấn đề nằm ở phía CLIENT, không phải DNS server đã cập nhật sai.
2. Yêu cầu chạy thêm `dig @<ip-dns-server> <tên-service>` (hỏi TRỰC TIẾP DNS server, bỏ qua mọi
   cache trung gian) — kết quả trả về IP MỚI đúng, xác nhận DNS server đã cập nhật đúng, vấn đề
   100% nằm ở cache phía client.
3. Yêu cầu chạy `resolvectl flush-caches` trên máy nhân viên đó.
4. Chạy lại `resolvectl query <tên-service>` — xác nhận giờ trả về IP MỚI, vấn đề đã giải quyết.
5. Ghi vào runbook migration: sau khi đổi DNS record cho dịch vụ nội bộ, luôn hướng dẫn người
   dùng chủ động `resolvectl flush-caches` (hoặc đơn giản là reboot) nếu vẫn gặp vấn đề sau khi
   TTL đã hết — không chỉ trông chờ cache tự hết hạn đúng lúc.

## 7. Tự kiểm tra

1. `/etc/resolv.conf` trên máy dùng `systemd-resolved` cho thấy `nameserver 127.0.0.53`. Đây có
   phải DNS server thật đang dùng không? Nếu không, làm sao biết DNS server thật?
   <details><summary>Đáp án</summary>Không — <code>127.0.0.53</code> là địa chỉ cố định của
   STUB RESOLVER (chính <code>systemd-resolved</code> chạy trên máy đó), không phải DNS server
   thật. Dùng <code>resolvectl status</code> hoặc <code>resolvectl dns</code> để xem DNS server
   THẬT (ví dụ cấp qua DHCP).</details>

2. Thêm một dòng vào `/etc/hosts` để override tạm thời một tên miền. Dòng này có được ưu tiên
   trước DNS không? Vì sao?
   <details><summary>Đáp án</summary>Có — dòng <code>hosts: files mdns4_minimal ... dns</code>
   trong <code>nsswitch.conf</code> đặt <code>files</code> (tức <code>/etc/hosts</code>) ĐỨNG
   TRƯỚC <code>dns</code>, nên mọi chương trình dùng hàm resolve chuẩn của hệ thống sẽ thấy
   <code>/etc/hosts</code> trước khi hỏi DNS.</details>

3. Sau khi sửa DNS record và đợi qua TTL, một máy client vẫn trả về IP cũ dù `dig` hỏi TRỰC TIẾP
   DNS server cho kết quả đúng. Vấn đề nằm ở đâu, và cách xử lý?
   <details><summary>Đáp án</summary>Cache cục bộ của <code>systemd-resolved</code> ngay TRÊN
   máy client đó (một tầng cache THÊM so với DNS server) — chưa tự làm mới. Dùng
   <code>resolvectl flush-caches</code> để xoá cache, resolve lại từ đầu.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.network-stack.tools` — đã thấy dòng `127.0.0.53%lo:53` trong `ss -tln`, bài này giải
  thích đúng ý nghĩa.

**Bài liên quan ngoài module:**
- `networking.dns.fundamentals`/`.operations` — nền tảng giao thức DNS (resolver, zone, TTL)
  mà bài này áp dụng cụ thể vào kiến trúc Linux.

**Nguồn tham khảo:**
- [resolv.conf(5) — man7.org](https://man7.org/linux/man-pages/man5/resolv.conf.5.html) — cú
  pháp `nameserver`/`search`.
- [nsswitch.conf(5) — man7.org](https://man7.org/linux/man-pages/man5/nsswitch.conf.5.html) —
  thứ tự tra cứu `hosts`.
- [resolvectl(1) — man7.org](https://man7.org/linux/man-pages/man1/resolvectl.1.html) —
  `status`/`dns`/`query`/`flush-caches`.
