---
id: networking.http-lb.http-fundamentals
title: "HTTP/HTTPS: method, status code, header quan trọng"
domain: networking
module: networking.http-lb
level: "nền tảng"
prerequisites: []
applies_to:
  - "HTTP/1.1, HTTP/2 (RFC 9110/9112/9113) — minh họa qua curl trên domain công khai"
status: verified
sources:
  - "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods"
  - "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

HTTP là giao thức tầng Application phổ biến nhất mà SE chạm tới hằng ngày — từ debug API nội
bộ, cấu hình reverse proxy, tới đọc log web server. "Lỗi 502" và "lỗi 504" nghe giống nhau
nhưng chỉ ra hai nguyên nhân HOÀN TOÀN khác nhau; method `PUT` và `PATCH` tưởng như thay thế
nhau được nhưng có ngữ nghĩa khác biệt quan trọng khi thiết kế API. Nắm chắc method/status
code/header không phải để "thuộc bài" — mà để đọc đúng một dòng log hoặc output `curl` và biết
ngay vấn đề nằm ở đâu trong chuỗi client → proxy → backend.

## 2. Khái niệm cốt lõi

**Method** — hành động client muốn thực hiện:

| Method | Ý nghĩa | Idempotent? |
|---|---|---|
| `GET` | Lấy dữ liệu, không đổi trạng thái | Có |
| `HEAD` | Như `GET` nhưng không trả body (chỉ header) | Có |
| `POST` | Tạo mới / gửi dữ liệu xử lý | KHÔNG |
| `PUT` | Thay thế TOÀN BỘ tài nguyên | Có |
| `PATCH` | Sửa MỘT PHẦN tài nguyên | KHÔNG |
| `DELETE` | Xoá tài nguyên | Có |

**Idempotent** nghĩa là gọi NHIỀU LẦN cho kết quả CUỐI CÙNG giống như gọi MỘT LẦN — không phải
"không có tác dụng phụ". `DELETE /users/5` gọi lần 2 vẫn "thành công" theo nghĩa user 5 vẫn
không tồn tại (dù lần đầu mới thực sự xoá) — đây là lý do `DELETE`/`PUT` được coi là an toàn để
RETRY TỰ ĐỘNG khi mạng lỗi, còn `POST` thì KHÔNG (retry có thể tạo bản ghi trùng).

**Status code** — 5 nhóm theo chữ số đầu:

| Nhóm | Ý nghĩa | Ví dụ |
|---|---|---|
| 1xx | Thông tin tạm thời, chưa phải kết quả cuối | `100 Continue` |
| 2xx | Thành công | `200 OK`, `201 Created`, `204 No Content` |
| 3xx | Cần thêm hành động (redirect) | `301`/`302`, `304 Not Modified` |
| 4xx | LỖI PHÍA CLIENT | `400`, `401`, `403`, `404`, `429` |
| 5xx | LỖI PHÍA SERVER | `500`, `502`, `503`, `504` |

## 3. Cách nó hoạt động

**`301` vs `302` vs `307`/`308` — khác nhau ở tính VĨNH VIỄN và việc GIỮ NGUYÊN method**: `301`
(permanent) báo client/browser NÊN nhớ và dùng URL mới cho mọi lần sau (ảnh hưởng cache, SEO).
`302`/`307` (temporary) không nên nhớ lâu dài. Riêng `307`/`308` CAM KẾT giữ nguyên method gốc
khi redirect (nếu request gốc là `POST`, redirect cũng phải `POST`) — còn `301`/`302` theo lịch
sử (và hành vi thực tế của nhiều client) có thể bị đổi thành `GET` khi redirect, gây lỗi khó
hiểu nếu API thiết kế dựa vào giữ nguyên method qua redirect.

**`502 Bad Gateway` và `504 Gateway Timeout` chỉ xảy ra khi có MỘT LỚP TRUNG GIAN (proxy/load
balancer)** — đây là điểm quan trọng cho module này: cả hai mã lỗi đều nghĩa là "backend có vấn
đề", nhưng do PROXY tạo ra, không phải backend tự trả. `502` = proxy GỬI request tới backend
nhưng nhận về response KHÔNG HỢP LỆ (hoặc backend đóng kết nối đột ngột). `504` = proxy gửi
request nhưng backend KHÔNG PHẢN HỒI KỊP trong thời gian chờ — khác biệt quan trọng khi debug:
`502` gợi ý backend CRASH/trả sai định dạng; `504` gợi ý backend QUÁ CHẬM (query DB chậm, deadlock,
quá tải) — hai hướng điều tra khác nhau hoàn toàn.

**Header không chỉ là "metadata phụ" — một số header ĐIỀU KHIỂN TRỰC TIẾP hành vi client/
proxy**: `Content-Type` báo client cách PARSE body (sai `Content-Type` khiến JSON bị hiểu
thành text thường); `Cache-Control` quyết định client có dùng NGAY bản cache mà KHÔNG CẦN hỏi
lại server hay không (còn "fresh" hay đã "stale"); `ETag` dùng để HỎI LẠI server một cách có
điều kiện khi cache đã stale (`If-None-Match` — nếu nội dung chưa đổi, server trả `304 Not
Modified` thay vì gửi lại toàn bộ body). `Location` (đi kèm 3xx) báo URL MỚI client phải theo.
Với reverse proxy (bài tiếp
theo module này), header `X-Forwarded-For`/`X-Forwarded-Proto` là cách DUY NHẤT backend biết IP
THẬT của client gốc (vì về mặt kết nối TCP, backend chỉ thấy IP của chính proxy).

## 4. Thực hành

Xem đầy đủ header response THẬT (chạy thật qua `curl`):

```bash
$ curl -sI https://example.com
HTTP/2 200
date: Tue, 06 Oct 2026 00:37:26 GMT
content-type: text/html; charset=utf-8
server: cloudflare
last-modified: Sun, 04 Oct 2026 20:44:03 GMT
allow: GET, HEAD
accept-ranges: bytes
age: 3
cf-cache-status: HIT
```

Đọc: `HTTP/2 200` — dùng HTTP/2, thành công. `cf-cache-status: HIT` — response này được trả từ
CACHE của Cloudflare (CDN), không phải origin server thật xử lý ngay lúc đó — `age: 3` xác nhận
thêm (bản cache đã tồn tại 3 giây).

Xem redirect THẬT (`301`, kèm header `Location` — đúng khớp lý thuyết mục 3):

```bash
$ curl -sI http://github.com
HTTP/1.1 301 Moved Permanently
Content-Length: 0
Location: https://github.com/
```

Redirect từ `http://` sang `https://` — mẫu RẤT phổ biến, bắt buộc toàn bộ traffic dùng HTTPS.

Xem lỗi `404` THẬT và gửi `POST` THẬT kèm xem server nhận đúng dữ liệu gì (qua httpbin.org —
dịch vụ public chuyên để "soi" lại chính request gửi tới):

```bash
$ curl -sI https://example.com/nonexistent-page-xyz
HTTP/2 404
(... các header khác như date/server/age tương tự ví dụ 200 ở trên, đã bỏ để gọn ...)

$ curl -s -X POST https://httpbin.org/post -d "name=test" \
    -H "Content-Type: application/x-www-form-urlencoded"
{
  "form": { "name": "test" },
  "headers": {
    "Content-Type": "application/x-www-form-urlencoded",
    "Host": "httpbin.org",
    "User-Agent": "curl/7.81.0"
  },
  "url": "https://httpbin.org/post"
}
```

(Response thật của httpbin còn có thêm field `args`, `data`, `files`, `json`, `origin` — đã
rút gọn ở trên, chỉ giữ 3 field liên quan trực tiếp tới điều đang minh hoạ: `form`, `headers`,
`url`.)

httpbin.org "echo" lại CHÍNH XÁC những gì nó nhận — xác nhận `curl` gửi đúng `Content-Type`,
đúng body form-encoded, và server nhận được đúng field `name=test` — cách hữu ích để TỰ KIỂM
TRA một request mình gửi có đúng định dạng mong đợi không, trước khi gửi tới API thật.

## 5. Lỗi thường gặp và cách chẩn đoán

**Nhầm `502` và `504` là "giống nhau, cứ restart backend là xong"**
- Nguyên nhân: không phân biệt "backend trả lỗi/crash" (502) với "backend quá chậm, chưa kịp
  trả" (504) — hai nguyên nhân gốc khác nhau, restart chỉ giải quyết được 502 do crash, không
  giải quyết 504 do query chậm/deadlock.
- Cách xác nhận: xem log của PROXY (nginx/HAProxy — bài tiếp theo) phân biệt rõ hai loại lỗi;
  nếu là 504, kiểm tra thời gian xử lý thật của backend (APM, log query DB).
- Cách xử lý: 502 → xem log backend tìm lý do crash/response sai định dạng; 504 → tìm điểm
  nghẽn hiệu năng backend (query chậm, lock, tài nguyên), không chỉ restart.

**Dùng `POST` cho một hành động CẦN retry an toàn (ví dụ "xác nhận thanh toán"), gây tạo bản
ghi trùng khi mạng lỗi và client tự động gửi lại**
- Nguyên nhân: `POST` không idempotent — gọi 2 lần (do retry) tạo 2 bản ghi, khác hẳn
  `PUT`/`DELETE` (gọi nhiều lần an toàn).
- Cách xác nhận: log server thấy nhiều request GIỐNG NHAU (cùng dữ liệu, timestamp gần nhau)
  tạo ra nhiều bản ghi.
- Cách xử lý: thêm cơ chế "idempotency key" (client gửi kèm 1 ID duy nhất cho mỗi lần thao
  tác, server dùng để phát hiện và từ chối request trùng) nếu hành động đó BẮT BUỘC dùng
  `POST` nhưng cần an toàn khi retry.

**Redirect `301` từ HTTP sang HTTPS khiến API POST bị đổi thành GET, mất dữ liệu gửi đi**
- Nguyên nhân: nhiều HTTP client (và theo lịch sử một số browser) tự đổi method thành `GET`
  khi theo `301`/`302` — hành vi "an toàn" theo quán tính cũ, dù spec không bắt buộc.
- Cách xác nhận: log server thấy request đến bằng `GET` thay vì `POST` như client gốc gửi,
  đúng vào các endpoint có redirect HTTP→HTTPS.
- Cách xử lý: đảm bảo CLIENT gọi thẳng HTTPS ngay từ đầu (không qua HTTP rồi redirect) cho mọi
  API endpoint quan trọng, không trông chờ client "giữ đúng method" qua `301`/`302`.

## 6. Tình huống thực tế

Một API nội bộ báo lỗi ngẫu nhiên: một số client nhận `504 Gateway Timeout`, số khác nhận
`502 Bad Gateway`, cho CÙNG một endpoint.

1. Thu thập log từ PROXY (nằm trước API) — phân loại: request nhận `504` đều có thời gian CHỜ
   rất lâu (gần đúng giá trị timeout cấu hình) trước khi lỗi; request nhận `502` thì lỗi RẤT
   NHANH, ngay sau khi gửi.
2. Giả thuyết: đây là HAI vấn đề khác nhau xảy ra đồng thời, không phải một nguyên nhân. `504`
   (chờ lâu rồi timeout) gợi ý một số request bị "mắc" ở backend — kiểm tra APM/log DB, phát
   hiện một truy vấn cụ thể (liên quan tới MỘT loại dữ liệu nhất định) bị deadlock ngẫu nhiên.
3. `502` (lỗi nhanh) gợi ý backend TRẢ VỀ response không hợp lệ hoặc đóng kết nối đột ngột —
   kiểm tra log backend, phát hiện một lỗi unhandled exception trong code khiến process worker
   crash giữa lúc xử lý (không phải mọi request, chỉ với một số input cụ thể gây lỗi code).
4. Xử lý riêng biệt từng nguyên nhân: sửa deadlock DB (thêm index/thay đổi thứ tự lock) cho
   vấn đề 504; sửa exception handling trong code cho vấn đề 502 — hai bản fix hoàn toàn khác
   nhau, không có "một fix chung" vì bản chất hai lỗi khác nhau.
5. Theo dõi lại sau khi deploy cả hai fix — xác nhận cả `502` và `504` đều giảm về gần 0.
6. Ghi vào runbook: KHÔNG gộp chung `502`/`504` thành "lỗi backend nói chung" khi điều tra —
   luôn tách riêng theo đúng mã lỗi, vì mỗi mã chỉ ra một LOẠI vấn đề khác nhau cần hướng điều
   tra khác nhau.

## 7. Tự kiểm tra

**Câu 1**: Một client gửi `DELETE /orders/42` hai lần do mạng chập chờn (client tự động
retry). Điều gì xảy ra ở lần gọi thứ hai, và vì sao đây là hành vi AN TOÀN?

a) Lần gọi thứ hai sẽ trả lỗi 404, và đây là hành vi KHÔNG an toàn vì client không biết đơn
   hàng đã bị xoá
b) Lần gọi thứ hai sẽ tạo lại đơn hàng 42 mới, vì DELETE luôn kèm theo tái tạo tài nguyên tương
   tự
c) Lần gọi thứ hai an toàn chỉ vì server tự động phát hiện trùng request nhờ cơ chế idempotency
   key bắt buộc trong chuẩn HTTP
d) Lần gọi thứ hai vẫn trả kết quả "thành công" theo nghĩa đơn hàng 42 vẫn không tồn tại —
   không gây lỗi hay tác dụng phụ thêm, vì DELETE là idempotent. Đây là lý do retry tự động an
   toàn với DELETE/PUT nhưng KHÔNG an toàn với POST

**Đáp án: d** — Lần gọi thứ hai vẫn trả kết quả "thành công" theo nghĩa đơn hàng 42 vẫn không
tồn tại — không gây lỗi hay tác dụng phụ thêm, vì DELETE là idempotent. Đây là lý do retry tự
động an toàn với DELETE/PUT nhưng KHÔNG an toàn với POST. Trả 404 có thể xảy ra tuỳ triển khai
nhưng không phải điểm cốt lõi của tính "an toàn" — bản chất idempotent mới là lý do an toàn
(loại a); DELETE không tái tạo lại tài nguyên (loại b); không có "idempotency key bắt buộc
trong chuẩn HTTP" — tính an toàn của DELETE đến từ ĐỊNH NGHĨA method, không cần cơ chế key riêng
(loại c).

---

**Câu 2**: Client nhận `504 Gateway Timeout`. Vấn đề nằm ở PROXY hay BACKEND? Nên điều tra ở
đâu trước?

a) Về bản chất là PROXY tạo ra mã lỗi này (vì backend không phản hồi kịp trong thời gian chờ
   proxy quy định), nhưng NGUYÊN NHÂN GỐC thường nằm ở BACKEND (quá chậm xử lý) — nên điều tra
   hiệu năng backend (query DB, lock, tải) trước, không chỉ xem log proxy
b) Luôn là lỗi của proxy, cần tăng timeout cấu hình trên proxy ngay mà không cần xem backend
c) Luôn là lỗi của backend, proxy chỉ đơn thuần forward request không liên quan gì tới mã lỗi
   này
d) Không thể biết nguồn gốc, cần log cả hai phía đồng thời thì mới xác định được, không có thứ
   tự ưu tiên

**Đáp án: a** — Về bản chất là PROXY tạo ra mã lỗi này, nhưng NGUYÊN NHÂN GỐC thường nằm ở
BACKEND (quá chậm xử lý) — nên điều tra hiệu năng backend trước. Tăng timeout chỉ che giấu vấn
đề, không giải quyết nguyên nhân gốc ở backend (loại b); proxy có vai trò thật trong việc TẠO
mã lỗi 504 (do nó áp timeout), không hoàn toàn vô can (loại c); có thứ tự ưu tiên hợp lý — điều
tra backend trước vì đó thường là nguyên nhân gốc (loại d).

---

**Câu 3**: Vì sao `PUT` và `PATCH` không nên dùng thay thế nhau tuỳ ý khi thiết kế API, dù cả
hai đều "sửa" tài nguyên?

a) PUT chỉ sửa một phần, PATCH thay thế toàn bộ tài nguyên
b) PUT THAY THẾ TOÀN BỘ tài nguyên bằng dữ liệu gửi lên (field không gửi coi như bị xoá/reset).
   PATCH chỉ sửa MỘT PHẦN, giữ nguyên field không được đề cập. Dùng sai có thể vô tình xoá dữ
   liệu (dùng PUT khi ý định là PATCH) hoặc không áp dụng đúng thay đổi một phần
c) Cả hai hoàn toàn tương đương về hành vi, chỉ khác tên gọi theo convention của từng framework
d) PUT chỉ dùng được cho JSON, PATCH chỉ dùng được cho form-data

**Đáp án: b** — PUT THAY THẾ TOÀN BỘ tài nguyên bằng dữ liệu gửi lên. PATCH chỉ sửa MỘT PHẦN,
giữ nguyên field không được đề cập. Dùng sai có thể vô tình xoá dữ liệu hoặc không áp dụng đúng
thay đổi một phần. Vai trò PUT/PATCH bị đảo ngược hoàn toàn (loại a); hai method có hành vi
khác biệt rõ rệt, không tương đương (loại c); cả hai method không giới hạn theo định dạng body
cụ thể như JSON hay form-data (loại d).

---

**Câu 4**: Header `cf-cache-status: HIT` trong response nghĩa là gì? Response đó có được
origin server xử lý NGAY LÚC đó không?

a) Nghĩa là origin server vừa xử lý xong request này trong vài mili giây gần nhất và đánh dấu
   HIT
b) Nghĩa là CDN đang chuyển tiếp trực tiếp request tới origin mà không lưu gì cả
c) Nghĩa là response được trả từ CACHE của CDN (Cloudflare), KHÔNG phải origin server xử lý
   ngay lúc đó — origin chỉ xử lý một lần trước đó, CDN lưu lại và trả cho các request sau mà
   không cần hỏi lại origin
d) Nghĩa là client đã gửi trùng request 2 lần nên CDN trả cảnh báo HIT

**Đáp án: c** — Nghĩa là response được trả từ CACHE của CDN, KHÔNG phải origin server xử lý
ngay lúc đó. HIT nghĩa là KHÔNG cần hỏi lại origin lần này, trái với mô tả "vừa xử lý xong"
(loại a); chuyển tiếp trực tiếp không lưu gì là trạng thái MISS/BYPASS, không phải HIT (loại
b); HIT không liên quan gì tới việc client gửi trùng request (loại d).

---

**Câu 5**: Vì sao không nên để API quan trọng chỉ truy cập được qua HTTP rồi redirect `301`
sang HTTPS, đặc biệt với endpoint nhận `POST`?

a) Vì redirect 301 luôn bị cache vĩnh viễn bởi browser, khiến client không bao giờ cập nhật
   được endpoint mới
b) Vì HTTP không hỗ trợ truyền method POST qua redirect dưới bất kỳ hình thức nào, chuẩn HTTP
   cấm hoàn toàn
c) Vì 301 chỉ áp dụng cho GET theo đúng chuẩn RFC, các method khác sẽ bị server trả lỗi 405
   ngay khi redirect
d) Nhiều client/thư viện HTTP tự đổi method thành GET khi theo 301/302 redirect (hành vi lịch
   sử, dù không bắt buộc theo spec) — request POST gốc có thể bị mất dữ liệu hoặc không tới
   đúng endpoint xử lý khi đi qua redirect này. Nên gọi thẳng HTTPS ngay từ đầu

**Đáp án: d** — Nhiều client/thư viện HTTP tự đổi method thành GET khi theo 301/302 redirect
(hành vi lịch sử, dù không bắt buộc theo spec) — request POST gốc có thể bị mất dữ liệu hoặc
không tới đúng endpoint xử lý. Việc cache redirect không phải lý do chính gây mất dữ liệu POST
(loại a); HTTP không cấm hoàn toàn POST qua redirect — vấn đề là CÁCH một số client XỬ LÝ nó
(đổi thành GET), không phải lệnh cấm của chuẩn (loại b); 301 không bị giới hạn chỉ cho GET theo
RFC, và server không tự trả 405 khi redirect method khác (loại c).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.http-lb.reverse-proxy` — vai trò header `X-Forwarded-For`, nguyên nhân thật của
  `502`/`504` khi có lớp proxy.

**Nguồn tham khảo:**
- [MDN — HTTP methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods)
  — định nghĩa method, tính idempotent.
- [MDN — HTTP status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status)
  — 5 nhóm mã trạng thái, định nghĩa theo RFC 9110.
