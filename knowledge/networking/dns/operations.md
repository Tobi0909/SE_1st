---
id: networking.dns.operations
title: "Vận hành DNS: zone file, TTL, caching, troubleshooting (dig/nslookup)"
domain: networking
module: networking.dns
level: "vận hành"
prerequisites: ["networking.dns.fundamentals"]
applies_to:
  - "DNS (BIND zone file format), dig/nslookup/host (dnsutils, Ubuntu 22.04 LTS)"
status: draft
sources:
  - "https://www.rfc-editor.org/rfc/rfc1035"
  - "https://www.rfc-editor.org/rfc/rfc2308"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Bài trước giải thích DNS hoạt động ra sao; bài này tập trung vào công việc VẬN HÀNH thực tế:
đọc một zone file để biết cấu hình domain, dùng `dig`/`nslookup`/`host` đúng cách để chẩn đoán
(không phải chỉ gõ tên domain rồi nhìn kết quả), và hiểu rõ SOA record — nơi chứa các tham số
quyết định hành vi CACHE/RETRY của toàn bộ resolver trên thế giới đối với domain đó.

## 2. Khái niệm cốt lõi

Zone file là file văn bản định nghĩa TOÀN BỘ record của một domain, định dạng chuẩn BIND (RFC
1035):

```
$TTL 3600
@   IN  SOA   ns1.example.com. admin.example.com. (
            2024010101  ; serial
            3600        ; refresh
            900         ; retry
            604800      ; expire
            86400 )     ; minimum TTL
@   IN  NS    ns1.example.com.
@   IN  A     203.0.113.10
www IN  CNAME @
```

SOA (Start of Authority) — record ĐẦU TIÊN và QUAN TRỌNG NHẤT của mỗi zone, 5 tham số theo
đúng thứ tự:

| Tham số | Ý nghĩa |
|---|---|
| serial | Số phiên bản zone — TĂNG mỗi lần sửa, để secondary server biết khi nào cần đồng bộ lại |
| refresh | Secondary server kiểm tra lại primary sau bao lâu (có bản mới không) |
| retry | Nếu kiểm tra thất bại, thử lại sau bao lâu |
| expire | Secondary coi dữ liệu đã cache là HẾT HIỆU LỰC nếu không đồng bộ được trong bao lâu |
| minimum | TTL dùng cho NEGATIVE CACHING — "domain/record không tồn tại" (`NXDOMAIN`/`NODATA`) được cache bao lâu (xem ghi chú RFC 2308 ở mục 3) |

> **Ghi chú chuẩn hoá quan trọng:** RFC 1035 (gốc, 1987) định nghĩa `minimum` vừa là "TTL mặc
> định cho record không khai báo riêng" VỪA liên quan tới negative caching — hai vai trò lẫn
> vào nhau. RFC 2308 (1998) TÁCH RÕ lại: vai trò "TTL mặc định" chuyển hẳn sang directive
> `$TTL` riêng (dòng đầu zone file, ví dụ `$TTL 3600` ở trên), còn `minimum` trong SOA từ đó
> CHỈ còn đúng MỘT vai trò — TTL cho negative caching. Tài liệu/phần mềm DNS hiện đại (BIND từ
> lâu) đều theo chuẩn RFC 2308 này, đây là lý do bảng trên chỉ ghi `minimum` = negative caching,
> không lặp lại vai trò "TTL mặc định" (đã thuộc về `$TTL`).

## 3. Cách nó hoạt động

**`serial` KHÔNG tự tăng — quên tăng số này là lỗi vận hành phổ biến nhất khi sửa zone file
tay**: cơ chế đồng bộ giữa primary/secondary DNS server dựa HOÀN TOÀN vào so sánh số `serial`
— secondary chỉ đồng bộ lại khi thấy `serial` trên primary LỚN HƠN số nó đang có. Sửa nội dung
zone file (thêm/đổi record) nhưng QUÊN tăng `serial` khiến secondary KHÔNG BAO GIỜ nhận thay
đổi mới, dù file trên primary đã đúng — một trong những lỗi "tôi sửa rồi mà sao vẫn chưa có
tác dụng" kinh điển nhất khi quản trị DNS bằng tay (không qua giao diện quản lý tự động tính
`serial` hộ).

**CNAME tạo ra một CHUỖI phân giải — client phải "theo" chuỗi đó tới cùng để lấy IP thật**:
`www.example.com CNAME example.com` nghĩa là "để biết IP của `www.example.com`, hãy tra tiếp
`example.com`". Nếu `example.com` LẠI là CNAME tới một domain khác nữa, chuỗi tiếp tục — client/
resolver phải đi theo TOÀN BỘ chuỗi (thường có giới hạn số bước để tránh loop vô hạn) tới khi
gặp một record `A`/`AAAA` thật. CNAME không thể cùng tồn tại với record khác CÙNG TÊN (ví dụ
không thể có cả `CNAME` và `MX` cho đúng `www.example.com`) — đây là ràng buộc trong chuẩn DNS,
không phải hạn chế tùy ý của một phần mềm cụ thể.

**"Negative caching" — DNS CŨNG cache việc "domain KHÔNG TỒN TẠI"**, dùng giá trị `minimum` của
SOA: khi resolver hỏi một domain không tồn tại (hoặc không có record loại được hỏi), authoritative
trả lời `NXDOMAIN`, và resolver CACHE CẢ câu trả lời "không tồn tại" này trong khoảng thời gian
bằng `minimum` (SOA). Đây là lý do một domain MỚI TẠO đôi khi "chưa phân giải được" ngay dù đã
cấu hình đúng — nếu trước đó có ai (hoặc chính bạn) đã lỡ hỏi domain đó khi NÓ CHƯA TỒN TẠI,
`NXDOMAIN` đã bị cache, phải chờ hết `minimum` TTL mới tự hết.

## 4. Thực hành

So sánh `dig`, `nslookup`, `host` cho CÙNG một truy vấn — ba công cụ, output khác định dạng
nhưng CÙNG dữ liệu (chạy thật):

```bash
$ dig +short example.com
172.66.147.243
104.20.23.154

$ nslookup example.com
Server:		127.0.0.53
Address:	127.0.0.53#53

Non-authoritative answer:
Name:	example.com
Address: 172.66.147.243

$ host example.com
example.com has address 172.66.147.243
```

Chú ý dòng `Non-authoritative answer` trong `nslookup` — đây CHÍNH LÀ xác nhận trực tiếp khái
niệm đã học ở bài trước: `127.0.0.53` chỉ là RESOLVER (stub cục bộ), KHÔNG phải authoritative
server của `example.com` — nó trả lời từ cache/qua quá trình recursive, không phải "sự thật
gốc".

Xem SOA record thật, đối chiếu đúng 5 tham số theo thứ tự đã học ở mục 2:

```bash
$ dig +short SOA example.com
elliott.ns.cloudflare.com. dns.cloudflare.com. 2416374680 10000 2400 604800 1800
```

Đọc theo đúng thứ tự: primary `elliott.ns.cloudflare.com.`, email admin
`dns.cloudflare.com.` (dấu `.` thay cho `@` theo quy ước DNS), `serial=2416374680`,
`refresh=10000`, `retry=2400`, `expire=604800` (7 ngày), `minimum=1800` (30 phút — TTL cho
negative caching của domain này).

Theo dõi một chuỗi CNAME THẬT tới khi ra record `A`:

```bash
$ dig www.github.com +noall +answer
www.github.com.		3487	IN	CNAME	github.com.
github.com.		27	IN	A	20.205.243.166
```

`dig` tự "theo" chuỗi CNAME và hiển thị CẢ hai bước: `www.github.com` là alias của
`github.com`, và `github.com` mới có record `A` thật — đúng khớp cơ chế đã học ở mục 3. Chú ý
TTL khác nhau giữa 2 record (`3487` vs `27`) — mỗi record trong chuỗi có TTL riêng, resolver
phải tôn trọng CẢ HAI khi quyết định cache bao lâu cho từng phần của chuỗi.

## 5. Lỗi thường gặp và cách chẩn đoán

**Sửa zone file, reload DNS server, nhưng secondary/resolver khác vẫn không nhận thay đổi**
- Nguyên nhân: quên tăng `serial` trong SOA record — secondary server chỉ đồng bộ khi thấy số
  này LỚN HƠN số đang có (mục 3), không dựa vào nội dung file đã đổi hay chưa.
- Cách xác nhận: `dig SOA <domain>` trên cả primary và secondary, so sánh giá trị `serial` —
  nếu giống nhau dù đã sửa file, xác nhận đúng nguyên nhân.
- Cách xử lý: luôn tăng `serial` MỖI LẦN sửa zone file (quy ước phổ biến: dùng định dạng
  `YYYYMMDDnn` để dễ đọc và đảm bảo luôn tăng), hoặc dùng công cụ quản lý DNS tự động tính hộ
  thay vì sửa tay.

**Domain mới đăng ký không phân giải được dù NS/record đã đúng, đợi rất lâu mới tự hết**
- Nguyên nhân: `NXDOMAIN` của domain (khi chưa tồn tại) đã bị một resolver cache TRƯỚC KHI
  domain được kích hoạt hoàn toàn — negative caching (mục 3) giữ nguyên câu trả lời "không tồn
  tại" tới khi hết TTL `minimum` trong SOA.
- Cách xác nhận: domain phân giải được từ MỘT SỐ nơi (resolver chưa từng hỏi/cache NXDOMAIN)
  nhưng không được từ nơi khác (đã cache NXDOMAIN).
- Cách xử lý: không có cách ép resolver bên thứ ba xoá cache — chỉ có thể chờ đủ thời gian
  `minimum` TTL; để tránh vấn đề này cho domain mới, kiểm tra kỹ KHÔNG hỏi DNS domain đó cho
  tới khi chắc chắn mọi record đã cấu hình xong.

**Tạo CNAME cho một tên đã có record khác (ví dụ MX), gây lỗi cấu hình zone**
- Nguyên nhân: vi phạm ràng buộc chuẩn DNS — một tên không được có CẢ CNAME và bất kỳ loại
  record khác (trừ một số ngoại lệ DNSSEC).
- Cách xác nhận: công cụ validate zone file (ví dụ `named-checkzone`) báo lỗi cấu hình rõ ràng
  trước khi reload thành công.
- Cách xử lý: tách riêng — nếu cần cả "alias" và record khác cho cùng một tên về logic, dùng
  giải pháp khác (ví dụ record `A` trực tiếp thay vì CNAME, hoặc cấu trúc lại domain).

## 6. Tình huống thực tế

Team vận hành DNS nội bộ (self-hosted BIND) nhận báo cáo: một record vừa thêm vào zone file
không xuất hiện trên bất kỳ client nào, dù đã `rndc reload` (lệnh BIND để nạp lại zone).

1. `dig SOA <domain> @<primary-server>` — serial vẫn là số CŨ, dù đã sửa file và reload —
   nghi ngờ ngay lỗi "quên tăng serial", nhưng xác nhận file zone ĐÃ reload thành công (log
   BIND không báo lỗi parse).
2. Mở lại zone file — phát hiện: file ĐÃ sửa đúng record mới, NHƯNG dòng SOA vẫn giữ `serial`
   cũ (người sửa quên tăng số này trước khi reload).
3. `rndc reload` với serial KHÔNG đổi — BIND coi đây là "không có gì mới" ở một số trường hợp
   cấu hình (tuỳ chế độ, một số server vẫn áp dụng thay đổi cục bộ ngay nhưng secondary/
   resolver khác dựa vào serial để quyết định đồng bộ sẽ không nhận được).
4. Sửa: tăng `serial` lên giá trị mới (lớn hơn giá trị cũ), reload lại.
5. Xác nhận: `dig SOA <domain>` giờ trả `serial` mới, các resolver/secondary khác bắt đầu nhận
   đồng bộ sau khoảng thời gian `refresh` (hoặc ngay nếu dùng cơ chế NOTIFY — BIND có thể gửi
   thông báo chủ động cho secondary khi serial đổi, không cần chờ hết `refresh`).
6. Ghi vào runbook/script: TỰ ĐỘNG tăng `serial` (ví dụ bằng script tiền xử lý trước khi commit
   zone file, dùng định dạng `YYYYMMDDnn` dựa trên ngày hiện tại) — loại bỏ hoàn toàn khả năng
   con người quên bước này.

## 7. Tự kiểm tra

1. Bạn sửa một record IP trong zone file, reload DNS server thành công (không lỗi), nhưng
   QUÊN tăng `serial`. Điều gì xảy ra với secondary DNS server của domain đó?
   <details><summary>Đáp án</summary>Secondary KHÔNG đồng bộ lại — nó chỉ đồng bộ khi thấy
   <code>serial</code> trên primary LỚN HƠN số nó đang lưu. Vì serial không đổi, secondary coi
   như "không có gì mới", tiếp tục trả lời dữ liệu CŨ.</details>

2. `dig +short SOA example.com` trả về 5 số sau tên hai server. Số thứ 4 (expire) có ý nghĩa
   gì?
   <details><summary>Đáp án</summary>Khoảng thời gian (giây) secondary server coi dữ liệu đã
   cache là HẾT HIỆU LỰC hoàn toàn nếu không đồng bộ được với primary trong suốt khoảng đó —
   sau <code>expire</code>, secondary ngừng trả lời cho zone này (coi như không còn đáng tin)
   thay vì tiếp tục phục vụ dữ liệu quá cũ.</details>

3. Một domain mới đăng ký đã cấu hình NS/A record đúng, nhưng một resolver cụ thể vẫn trả
   NXDOMAIN nhiều giờ sau. Nguyên nhân khả năng cao nhất là gì?
   <details><summary>Đáp án</summary>Negative caching — resolver đó đã hỏi domain này TRƯỚC
   KHI nó được cấu hình xong, nhận NXDOMAIN và cache lại trong khoảng thời gian bằng
   <code>minimum</code> TTL của SOA. Phải chờ hết khoảng đó, resolver mới hỏi lại và nhận được
   kết quả đúng.</details>

4. `www.example.com` là CNAME tới `example.com`. Có thể thêm thêm một record `MX` cho đúng
   tên `www.example.com` không?
   <details><summary>Đáp án</summary>Không. Theo chuẩn DNS, một tên có CNAME thì KHÔNG được có
   bất kỳ loại record khác cho CÙNG TÊN đó (trừ một số ngoại lệ DNSSEC) — đây là ràng buộc của
   chuẩn, không phải hạn chế riêng của một DNS server cụ thể.</details>

5. Vì sao `nslookup` hiển thị dòng "Non-authoritative answer" cho hầu hết truy vấn thông
   thường từ máy cá nhân?
   <details><summary>Đáp án</summary>Vì máy cá nhân hỏi qua một RESOLVER (ví dụ stub cục bộ
   127.0.0.53, hoặc DNS của ISP) — resolver này không phải authoritative server của domain
   đang hỏi, nó chỉ trả lời từ dữ liệu đã cache hoặc vừa đi hỏi recursive hộ, nên được đánh dấu
   "non-authoritative" để phân biệt với câu trả lời trực tiếp từ chính authoritative
   server.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.dns.fundamentals` — nền tảng hierarchy/resolver/authoritative mà bài này áp
  dụng vào vận hành thực tế (zone file, SOA, troubleshooting).

**Bài liên quan ngoài module:**
- `linux.network-stack.dns-resolution` — góc nhìn phía CLIENT trên Linux (resolv.conf,
  nsswitch, systemd-resolved), khác với góc nhìn vận hành SERVER của bài này.

**Nguồn tham khảo:**
- [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035) — đặc tả chính thức định dạng zone file,
  SOA, CNAME, các ràng buộc chuẩn DNS.
- [RFC 2308](https://www.rfc-editor.org/rfc/rfc2308) — định nghĩa lại vai trò SOA `minimum`
  (negative caching) và giới thiệu directive `$TTL`.
