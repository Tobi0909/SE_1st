---
id: networking.tls-pki.troubleshooting
title: "Chẩn đoán lỗi TLS/SSL thường gặp (expired cert, chain, SNI)"
domain: networking
module: networking.tls-pki
level: "vận hành"
prerequisites: ["networking.tls-pki.pki-cert-mgmt"]
applies_to:
  - "openssl, curl — Ubuntu 22.04 LTS"
status: draft
sources:
  - "https://www.rfc-editor.org/rfc/rfc6066"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Hai bài trước xây nền tảng (handshake, PKI) — bài này tổng hợp QUY TRÌNH CHẨN ĐOÁN khi TLS
"bị lỗi" trong thực tế. "SSL error" là thông báo MƠ HỒ NHẤT trong vận hành — có thể là 1 trong
ít nhất 4 nguyên nhân hoàn toàn khác nhau (hết hạn, thiếu chain, sai hostname/SNI, cipher không
tương thích — đã học ở bài 1). Biết ĐÚNG LỆNH để phân biệt nhanh 4 loại này trong vài giây,
thay vì đoán, là kỹ năng vận hành thực tế quan trọng nhất của cả module.

## 2. Khái niệm cốt lõi

Quy trình chẩn đoán CÓ THỨ TỰ (từ đơn giản/phổ biến tới phức tạp hơn):

```
1. Chứng chỉ còn hạn không?        → openssl x509 -noout -enddate
2. Hostname đúng chưa?              → openssl verify -verify_hostname / curl -v
3. Chain đầy đủ chưa?                → openssl s_client -showcerts (đếm số cert)
4. Cipher suite có chung không?      → openssl s_client -cipher <cipher>
```

**SNI (Server Name Indication)**: phần MỞ RỘNG của TLS, cho phép client báo TRƯỚC domain nó
muốn kết nối tới NGAY TRONG `ClientHello` (trước khi handshake mã hoá) — cần thiết khi NHIỀU
domain (với NHIỀU chứng chỉ khác nhau) cùng chia sẻ một IP/port (ảo hoá tên miền ở tầng TLS,
tương tự virtual host của HTTP nhưng ở tầng TLS).

## 3. Cách nó hoạt động

**Thiếu SNI khiến server không biết trả CHỨNG CHỈ NÀO nếu nhiều domain dùng chung IP** — nếu
`openssl s_client` không chỉ định `-servername` (SNI), với server host NHIỀU domain trên CÙNG
IP (phổ biến với CDN/shared hosting), server có thể trả về chứng chỉ SAI (của domain KHÁC,
hoặc chứng chỉ "default") — gây hiểu lầm "chứng chỉ bị cấu hình sai" trong khi THỰC RA chỉ là
thiếu `-servername` khi TEST, không phải lỗi THẬT của server.

**"hostname mismatch" và "unable to get local issuer certificate" là HAI lỗi HOÀN TOÀN khác
nhau dù cả hai đều làm TLS "thất bại"**: mismatch nghĩa là CHUỖI TIN CẬY ổn (chain hợp lệ, CA
tin cậy), nhưng TÊN trong chứng chỉ (CN/SAN) KHÔNG KHỚP domain đang truy cập — sai ĐỐI TƯỢNG.
"unable to get local issuer" nghĩa là KHÔNG lần được chuỗi tới CA tin cậy (thiếu intermediate,
hoặc CA thực sự không được tin cậy) — sai ở CHUỖI, không liên quan gì tới tên domain. Hai lỗi
đòi hỏi 2 hướng sửa HOÀN TOÀN khác nhau (đổi/mở rộng SAN của chứng chỉ, vs. bổ sung
intermediate hoặc đổi CA).

**`-checkend` hữu ích để KIỂM TRA TỰ ĐỘNG, nhưng không thay thế được việc ĐỌC THỰC TẾ ngày hết
hạn khi debug SỰ CỐ ĐÃ XẢY RA** — khi sự cố đã xảy ra (không phải kiểm tra phòng ngừa), cần
biết CHÍNH XÁC server đang serve CHỨNG CHỈ NÀO ngay bây giờ (`openssl s_client` kết nối TRỰC
TIẾP tới server, không phải đọc file cấu hình tĩnh) — vì có thể server ĐANG serve một chứng chỉ
KHÁC với file mà admin NGHĨ đã deploy (ví dụ deploy nhầm đường dẫn, hoặc một load balancer khác
đang serve chứng chỉ cũ).

## 4. Thực hành

Minh hoạ ĐÚNG 2 lỗi phân biệt ở mục 3 bằng PKI đã tạo trong bài trước (CA/server cert tự tạo
thật, không phải giả lập output):

Lỗi "chuỗi không tin cậy" — verify chứng chỉ server bằng một CA KHÔNG LIÊN QUAN (không phải CA
đã ký nó):

```bash
$ openssl verify -CAfile wrong_ca.crt server.crt
CN = app.se-dojo.local
error 20 at 0 depth lookup: unable to get local issuer certificate
error server.crt: verification failed
```

`error 20` — chính xác mã lỗi kinh điển "unable to get local issuer certificate" — xảy ra vì
`wrong_ca.crt` không phải CA đã ký `server.crt`, không lần được chuỗi tới nó.

Lỗi "hostname mismatch" — verify ĐÚNG CA (chuỗi hợp lệ) nhưng SAI hostname mong đợi:

```bash
$ openssl verify -CAfile ca.crt -verify_hostname api.se-dojo.local server.crt
CN = app.se-dojo.local
error 62 at 0 depth lookup: hostname mismatch
error server.crt: verification failed

$ openssl verify -CAfile ca.crt -verify_hostname app.se-dojo.local server.crt
server.crt: OK
```

So sánh TRỰC TIẾP: CÙNG MỘT chứng chỉ, CÙNG MỘT CA đúng — chỉ đổi hostname kỳ vọng từ
`api.se-dojo.local` sang ĐÚNG `app.se-dojo.local` (tên thật trong CN của chứng chỉ) là chuyển
từ `error 62` sang `OK` — xác nhận TRỰC TIẾP đây là lỗi KHÁC HẲN với lỗi chuỗi tin cậy ở trên
(mã lỗi khác: `62` vs `20`), đúng khớp phân biệt đã nêu ở mục 3.

Xem đủ chain mà server GỬI (không phải chỉ chứng chỉ cuối) bằng `-showcerts`:

```bash
$ openssl s_client -connect example.com:443 -servername example.com -showcerts 2>/dev/null \
    | grep -c "BEGIN CERTIFICATE"
4
```

`4` xác nhận server gửi tới 4 chứng chỉ trong chain (server cert + nhiều intermediate, bao gồm
cả bản cross-sign để tương thích với client cũ hơn — phổ biến với CDN lớn như Cloudflare). Chỉ
cần `1` (CHỈ server cert, thiếu toàn bộ intermediate) là đã đủ để gây lỗi "unable to get local
issuer certificate" cho client không có sẵn các intermediate đó trong máy.

## 5. Lỗi thường gặp và cách chẩn đoán

**Browser báo lỗi TLS nhưng `curl`/`openssl s_client` từ server khác lại chạy OK**
- Nguyên nhân phổ biến: thiếu SNI khi test (`openssl s_client` không chỉ định `-servername`),
  hoặc đang test từ một MÁY KHÁC có danh sách CA tin cậy khác (ví dụ máy dev đã tự cài CA nội
  bộ, browser người dùng cuối chưa có).
- Cách xác nhận: luôn thêm `-servername <đúng-domain>` khi test bằng `openssl s_client`; hỏi
  rõ "lỗi từ đâu, máy nào" trước khi kết luận "server bị lỗi" dựa trên 1 lần test không đại
  diện.
- Cách xử lý: tái hiện ĐÚNG môi trường gặp lỗi (đúng domain qua SNI, đúng máy/danh sách CA)
  trước khi kết luận nguyên nhân.

**Đổi chứng chỉ mới, verify từ dòng lệnh vẫn thấy chứng chỉ CŨ**
- Nguyên nhân: `openssl s_client` kết nối tới SERVER ĐANG CHẠY thật (không đọc file cấu hình
  tĩnh) — nếu server chưa RELOAD sau khi đổi file chứng chỉ, nó vẫn serve cert CŨ đã nạp vào bộ
  nhớ.
- Cách xác nhận: so sánh `enddate`/`subject` giữa file MỚI trên đĩa và kết quả
  `openssl s_client` kết nối TRỰC TIẾP — khác nhau xác nhận server chưa reload.
- Cách xử lý: reload/restart đúng service đang serve TLS (nginx/haproxy/application server),
  không chỉ thay file rồi coi là xong.

**Lỗi "hostname mismatch" dù chứng chỉ ĐÚNG LÀ của domain đó, chỉ khác chữ hoa/thường hoặc
www./không www.**
- Nguyên nhân: SAN (Subject Alternative Name) trong chứng chỉ khai báo CHÍNH XÁC một số tên cụ
  thể (ví dụ chỉ `example.com`, không có `www.example.com`) — client truy cập tên KHÔNG nằm
  trong danh sách đó bị coi là mismatch, dù "về bản chất" cùng một website.
- Cách xác nhận: `openssl x509 -in cert.crt -noout -text | grep -A2 "Subject Alternative Name"`
  xem ĐẦY ĐỦ danh sách tên được chứng chỉ bao phủ.
- Cách xử lý: yêu cầu CA cấp chứng chỉ có SAN bao phủ ĐỦ mọi biến thể tên cần dùng
  (`example.com` VÀ `www.example.com`), hoặc dùng wildcard (`*.example.com`) nếu phù hợp.

## 6. Tình huống thực tế

Một API gateway báo lỗi TLS ngẫu nhiên — một số request thành công, một số thất bại với lỗi
"certificate verify failed", cho CÙNG một domain, gần như cùng thời điểm.

1. `openssl s_client -connect api.example.com:443 -servername api.example.com` nhiều lần liên
   tiếp — phát hiện: có lúc trả về Certificate A (đúng, hạn dài), có lúc trả về Certificate B
   (một chứng chỉ CŨ, đã hết hạn) — XÁC NHẬN TRỰC TIẾP có sự KHÔNG ĐỒNG NHẤT giữa các lần kết
   nối.
2. Giả thuyết: có NHIỀU server đứng sau một load balancer (round-robin — đã học ở module
   `networking.http-lb`), và chỉ MỘT TRONG SỐ CHÚNG chưa được cập nhật chứng chỉ mới trong lần
   gia hạn gần đây — request rơi vào server đó bị lỗi, server khác thì không.
3. Xác nhận bằng cách kết nối TRỰC TIẾP tới TỪNG backend (bỏ qua load balancer, nếu có quyền
   truy cập mạng nội bộ) — tìm đúng server còn chứng chỉ cũ.
4. Deploy chứng chỉ mới lên ĐÚNG server còn thiếu, reload service TLS trên server đó.
5. Test lại bằng cách gọi nhiều lần qua load balancer — xác nhận KHÔNG còn request nào trả về
   Certificate B (cũ) nữa.
6. Ghi vào runbook: với hệ thống NHIỀU backend TLS termination đứng sau load balancer, quy
   trình gia hạn/deploy chứng chỉ PHẢI có bước XÁC NHẬN ĐỒNG BỘ trên TOÀN BỘ backend (không chỉ
   deploy rồi coi là xong một nơi) — kiểm tra bằng cách gọi NHIỀU LẦN liên tiếp qua load
   balancer để phát hiện sự không đồng nhất, tương tự cách debug ở bước 1.

## 7. Tự kiểm tra

1. `openssl verify` trả lỗi `error 20: unable to get local issuer certificate`. Đây là lỗi về
   TÊN domain hay về CHUỖI tin cậy?
   <details><summary>Đáp án</summary>Về CHUỖI tin cậy — không lần được chuỗi certificate tới
   một CA tin cậy (thiếu intermediate, hoặc CA không được tin cậy), KHÔNG liên quan gì tới tên
   domain trong chứng chỉ.</details>

2. `openssl verify` trả lỗi `error 62: hostname mismatch`, nhưng KHÔNG báo lỗi gì về chuỗi tin
   cậy. Điều này có nghĩa gì về trạng thái của chứng chỉ?
   <details><summary>Đáp án</summary>Chuỗi tin cậy HOÀN TOÀN ổn (CA hợp lệ, chain đầy đủ) —
   vấn đề DUY NHẤT là TÊN trong chứng chỉ (CN/SAN) không khớp với hostname đang kiểm tra. Hai
   vấn đề độc lập, có thể có lỗi này mà không có lỗi kia.</details>

3. Vì sao cần chỉ định `-servername <domain>` khi dùng `openssl s_client` để test một server
   host NHIỀU domain trên cùng IP?
   <details><summary>Đáp án</summary>Vì đó chính là cơ chế SNI — server cần biết TRƯỚC domain
   client muốn kết nối (gửi trong ClientHello) để trả về ĐÚNG chứng chỉ tương ứng. Thiếu
   <code>-servername</code>, server có thể trả về chứng chỉ SAI (của domain khác hoặc
   default), dễ gây hiểu lầm là lỗi cấu hình.</details>

4. Đổi file chứng chỉ mới trên server xong, `openssl s_client` kết nối trực tiếp vẫn thấy
   chứng chỉ CŨ. Bước tiếp theo hợp lý nhất là gì?
   <details><summary>Đáp án</summary>Reload/restart đúng service đang serve TLS (nginx/
   haproxy/application server) — service đang chạy giữ chứng chỉ CŨ trong bộ nhớ, thay file
   trên đĩa không tự động áp dụng cho tới khi service đọc lại.</details>

5. Một load balancer có nhiều backend TLS, chỉ MỘT backend chưa được gia hạn chứng chỉ. Triệu
   chứng client sẽ thấy là gì, và vì sao KHÓ tái hiện lỗi một cách ổn định?
   <details><summary>Đáp án</summary>Lỗi "certificate verify failed" NGẪU NHIÊN, chỉ xảy ra khi
   load balancer (theo thuật toán round-robin/khác) tình cờ chuyển request tới ĐÚNG backend
   chưa gia hạn — các lần request rơi vào backend khác (đã gia hạn) vẫn thành công bình thường,
   khiến lỗi "có lúc có, có lúc không" khó tái hiện ổn định nếu chỉ test một lần.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.tls-pki.handshake` — nền tảng các bước handshake mà lỗi trong bài này xảy ra.
- `networking.tls-pki.pki-cert-mgmt` — quy trình tạo/quản lý chứng chỉ, nguồn dữ liệu PKI
  dùng để minh hoạ lỗi ở bài này.

**Bài liên quan ngoài module:**
- `networking.http-lb.lb-algorithms` — khái niệm round-robin/nhiều backend ở bài đó (áp dụng
  cho phân phối tải nói chung) là bối cảnh nền cho tình huống thực tế mục 6 CỦA CHÍNH BÀI NÀY
  (nhiều backend TLS, chỉ một chưa gia hạn) — không phải nội dung TLS nằm trong bài kia.

**Nguồn tham khảo:**
- [RFC 6066 — TLS Extensions (SNI)](https://www.rfc-editor.org/rfc/rfc6066) — đặc tả chính
  thức Server Name Indication.
