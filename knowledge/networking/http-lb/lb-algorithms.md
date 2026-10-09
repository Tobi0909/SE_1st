---
id: networking.http-lb.lb-algorithms
title: "Thuật toán load balancing và health check"
domain: networking
module: networking.http-lb
level: "vận hành"
prerequisites: ["networking.http-lb.reverse-proxy"]
applies_to:
  - "Nginx upstream, HAProxy — minh họa cơ chế bằng load balancer Python tối giản"
status: verified
sources:
  - "https://nginx.org/en/docs/http/ngx_http_upstream_module.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** tương tự bài trước, không cài Nginx/HAProxy thật. Demo
> round-robin ở mục 4 dùng một load balancer Python tối giản (~15 dòng, `itertools.cycle`) gọi
> THẬT tới 2 backend thật trên `127.0.0.1` — kết quả round-robin là THẬT, không dựng. Cấu hình
> Nginx/HAProxy cho least_conn/ip_hash/health check đánh dấu **output minh hoạ** theo tài liệu
> chính thức (nginx.org).

## 1. Vì sao cần biết

Có nhiều backend chưa đủ — phải quyết định request MỚI nên gửi tới backend NÀO. Chọn sai thuật
toán cho đúng tình huống gây hậu quả thật: round-robin cho một app CẦN session dính (sticky)
sẽ làm user liên tục bị "đăng xuất" vì mỗi request rơi vào backend khác nhau; ip_hash cho một
hệ thống có traffic tới từ MỘT NAT gateway chung (nhiều user, cùng IP) sẽ dồn hết tải vào MỘT
backend. Hiểu đúng cơ chế từng thuật toán — không chỉ tên gọi — là điều kiện để chọn đúng.

## 2. Khái niệm cốt lõi

| Thuật toán | Cơ chế chọn backend | Phù hợp khi |
|---|---|---|
| Round robin | Lần lượt, theo thứ tự xoay vòng | Backend đồng nhất về khả năng xử lý |
| Weighted round robin | Như trên, nhưng backend "mạnh" nhận NHIỀU request hơn theo tỷ lệ | Backend có cấu hình khác nhau (ví dụ 1 server mạnh gấp đôi) |
| Least connections | Backend đang có ÍT kết nối đang xử lý nhất | Request có thời gian xử lý KHÔNG đều nhau |
| IP hash | Hash theo IP client → LUÔN cùng 1 backend | Cần session "dính" (sticky) mà KHÔNG dùng cookie |

Health check: load balancer TỰ ĐỘNG gửi request kiểm tra định kỳ tới mỗi backend, LOẠI nó khỏi
pool nếu không phản hồi đúng (tránh gửi traffic thật tới backend đã chết).

## 3. Cách nó hoạt động

**Round robin ĐƠN GIẢN nhưng giả định "mọi request tốn THỜI GIAN XỬ LÝ như nhau" — giả định
này THƯỜNG SAI trong thực tế**: nếu một request ngẫu nhiên mất 10 giây (ví dụ một query báo
cáo nặng) trong khi các request khác chỉ mất 50ms, round-robin vẫn tiếp tục gửi request MỚI
tới backend đang "mắc" request nặng đó theo đúng thứ tự xoay vòng — backend đó dần dồn ứ, dù
các backend khác đang rảnh. **Least connections** giải quyết đúng vấn đề này: nó LUÔN chọn
backend có ÍT request ĐANG XỬ LÝ nhất tại THỜI ĐIỂM quyết định, tự động "tránh" backend đang
bị dồn ứ mà không cần biết TRƯỚC request nào sẽ nặng.

**IP hash tạo "session dính" KHÔNG CẦN cookie, nhưng dễ "lệch tải" nếu nhiều client dùng
CHUNG một IP qua PAT**: hash dựa trên IP client đảm bảo CÙNG client luôn rơi vào CÙNG backend —
hữu ích khi backend lưu session trong RAM cục bộ (không dùng session store chung như Redis).
NHƯỢC ĐIỂM: nếu hàng trăm user cùng ở một văn phòng/mạng ra Internet qua PAT/Masquerade (nhiều
IP private ↔ 1 IP public — đã học ở bài `networking.nat-firewall.nat-types`), TẤT CẢ request
của họ hash ra CÙNG một giá trị → dồn hết vào MỘT backend duy nhất, các backend khác rảnh —
"cân bằng tải" theo tên gọi nhưng THỰC TẾ không cân bằng gì trong tình huống này.

**Health check CẦN phân biệt "backend chết hẳn" và "backend đang xử lý CHẬM"** — nếu health
check chỉ kiểm tra "server có TRẢ LỜI không" (ví dụ ping TCP) mà không kiểm tra NỘI DUNG response
đúng nghĩa (ví dụ gọi đúng một endpoint `/health` trả về trạng thái thật của ứng dụng, không chỉ
xác nhận process đang chạy), một backend có thể "còn sống" ở tầng TCP nhưng ỨNG DỤNG BÊN TRONG
đã treo/lỗi — health check nông cạn sẽ tiếp tục gửi traffic thật tới một backend đã hỏng về mặt
chức năng.

## 4. Thực hành

Demo round-robin THẬT bằng load balancer Python (dùng `itertools.cycle` xoay vòng giữa 2
backend) tới 2 backend thật, mỗi backend tự báo tên mình:

```bash
$ for i in 1 2 3 4 5 6; do curl -s http://127.0.0.1:8090/req; echo; done
{"served_by": "backend-A", "path": "/req"}
{"served_by": "backend-B", "path": "/req"}
{"served_by": "backend-A", "path": "/req"}
{"served_by": "backend-B", "path": "/req"}
{"served_by": "backend-A", "path": "/req"}
{"served_by": "backend-B", "path": "/req"}
```

Xác nhận ĐÚNG round-robin: 6 request liên tiếp, xoay vòng CHÍNH XÁC `A, B, A, B, A, B` — không
lệch, không ngẫu nhiên, đúng khớp cơ chế "lần lượt theo thứ tự" đã học ở mục 2.

Cấu hình `least_conn` và `ip_hash` trong Nginx — **output minh hoạ** theo cú pháp chính thức:

```nginx
# Least connections — ưu tiên khi request có thời gian xử lý không đều
upstream backend_uneven_load {
    least_conn;
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
}

# IP hash — session dính không cần cookie
upstream backend_sticky {
    ip_hash;
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
}

# Weighted round robin — server mạnh hơn nhận nhiều request hơn
upstream backend_weighted {
    server 10.0.0.1:8080 weight=3;   # nhận 3/4 traffic
    server 10.0.0.2:8080 weight=1;   # nhận 1/4 traffic
}
```

Cấu hình health check — tự loại backend lỗi khỏi pool (**output minh hoạ**):

```nginx
upstream backend {
    server 10.0.0.1:8080 max_fails=3 fail_timeout=30s;
    server 10.0.0.2:8080 max_fails=3 fail_timeout=30s;
}
```

Đọc đúng: `max_fails=3` — sau 3 lần thất bại LIÊN TIẾP, backend bị đánh dấu "down" trong
`fail_timeout=30s` (30 giây không gửi traffic tới nó nữa), rồi TỰ ĐỘNG thử lại — không cần can
thiệp tay để "đưa backend trở lại" sau khi nó phục hồi.

## 5. Lỗi thường gặp và cách chẩn đoán

**Dùng round-robin cho một ứng dụng lưu session TRONG RAM cục bộ (không dùng session store
chung), user liên tục bị "đăng xuất"**
- Nguyên nhân: mỗi request của CÙNG user có thể rơi vào backend KHÁC nhau (round-robin không
  quan tâm "ai gửi request") — backend B không có session được tạo ở backend A, coi như chưa
  đăng nhập.
- Cách xác nhận: tắt load balancer, test trực tiếp 1 backend — nếu không còn lỗi, xác nhận
  đúng vấn đề là thiếu session dính giữa nhiều backend.
- Cách xử lý: đổi sang `ip_hash` (đơn giản, không cần sửa code) HOẶC tốt hơn: chuyển session
  sang store CHUNG (Redis/Memcached) để MỌI thuật toán load balancing đều hoạt động đúng,
  không phụ thuộc "dính" vào đúng 1 backend.

**Dùng `ip_hash`, phát hiện MỘT backend luôn quá tải còn backend khác luôn rảnh**
- Nguyên nhân: nhiều client thật đang dùng CHUNG một IP public (qua NAT — văn phòng, 4G cùng
  nhà mạng) — tất cả hash vào CÙNG backend, đúng hiện tượng đã giải thích ở mục 3.
- Cách xác nhận: xem log backend quá tải, thấy traffic đến từ RẤT ÍT IP khác nhau nhưng số
  lượng request lớn bất thường trên mỗi IP.
- Cách xử lý: nếu không THỰC SỰ cần session dính theo IP, đổi sang `least_conn`; nếu cần dính
  session, chuyển sang cơ chế dính theo COOKIE (sticky session qua cookie, không phụ thuộc IP
  client) kết hợp session store chung.

**Health check chỉ kiểm tra TCP connect thành công, không phát hiện ứng dụng bên trong đã
treo**
- Nguyên nhân: health check "nông" (chỉ xác nhận port mở) không phản ánh đúng trạng thái THẬT
  của ứng dụng — process có thể còn chạy (port vẫn mở) nhưng logic xử lý đã deadlock/treo.
- Cách xác nhận: backend vẫn "healthy" theo load balancer nhưng request thật tới nó đều
  timeout/lỗi.
- Cách xử lý: cấu hình health check gọi ĐÚNG một endpoint `/health` do ỨNG DỤNG tự trả lời
  (không chỉ TCP connect) — endpoint đó nên tự kiểm tra các phụ thuộc quan trọng (DB connect
  được không...) trước khi trả "healthy".

## 6. Tình huống thực tế

Một dịch vụ có 4 backend, dùng round-robin, team nhận báo cáo "lúc nào cũng có 1 server load
cao bất thường so với 3 server còn lại", dù cấu hình round-robin đã đúng và traffic tổng thể
không tăng.

1. Theo dõi CPU/response time từng backend qua thời gian — xác nhận ĐÚNG MỘT backend (ví dụ
   backend số 2) liên tục cao hơn hẳn 3 backend khác.
2. Loại trừ nguyên nhân cấu hình: xác nhận round-robin weight đều nhau (`weight=1` cho cả 4),
   không có lý do backend 2 "nên" nhận nhiều traffic hơn theo thiết kế.
3. Điều tra ĐẶC ĐIỂM traffic: phát hiện một API endpoint CỤ THỂ (ví dụ `/reports/export`) có
   thời gian xử lý trung bình GẤP 20 LẦN các endpoint khác (query DB nặng) — và do round-robin
   không phân biệt "request nặng/nhẹ", những request này rải NGẪU NHIÊN qua 4 backend theo
   đúng vòng xoay, NHƯNG tình cờ backend 2 đang nhận tỷ lệ cao request loại này hơn do THỨ TỰ
   gọi API thực tế của client (không phải lỗi load balancer).
4. Nhận ra: đây chính xác là hạn chế đã học ở mục 3 — round-robin giả định mọi request "nặng"
   như nhau, không đúng với thực tế có endpoint nặng hơn hẳn.
5. Đổi thuật toán sang `least_conn` — backend đang xử lý request nặng (còn đang mở kết nối) sẽ
   TỰ ĐỘNG nhận ít request mới hơn cho tới khi xử lý xong, cân bằng tải tốt hơn round-robin cho
   đúng tình huống có độ nặng request không đều.
6. Theo dõi lại sau khi đổi — xác nhận tải giữa 4 backend đồng đều hơn rõ rệt. Ghi vào runbook:
   với hệ thống có endpoint ĐỘ NẶNG KHÔNG ĐỒNG ĐỀU, ưu tiên `least_conn` hơn round-robin ngay
   từ đầu, không cần đợi phát hiện lệch tải mới đổi.

## 7. Tự kiểm tra

1. Hệ thống có endpoint A (xử lý 50ms) và endpoint B (xử lý 5 giây, ít gọi hơn nhiều). Thuật
   toán nào PHÙ HỢP HƠN round-robin cho tình huống này, và vì sao?
   <details><summary>Đáp án</summary><code>least_conn</code> — vì nó chọn backend theo SỐ KẾT
   NỐI ĐANG XỬ LÝ thực tế, tự tránh dồn request mới vào backend đang "mắc" request B (xử lý
   lâu), khác với round-robin chỉ xoay vòng theo thứ tự mà không quan tâm backend nào đang bận
   hơn.</details>

2. Một công ty có 200 nhân viên cùng ra Internet qua MỘT IP public (NAT). Dùng `ip_hash` cho
   load balancer của một dịch vụ công ty này dùng, điều gì có khả năng xảy ra?
   <details><summary>Đáp án</summary>TẤT CẢ request từ 200 nhân viên sẽ hash vào CÙNG một
   backend (vì cùng IP nguồn), dồn hết tải vào một server dù có nhiều backend khác đang rảnh —
   "cân bằng tải" theo tên nhưng thực tế không cân bằng trong tình huống NAT chung IP.</details>

3. Vì sao health check chỉ kiểm tra "port có mở không" (TCP connect) có thể KHÔNG đủ để phát
   hiện một backend đã hỏng?
   <details><summary>Đáp án</summary>Process/port có thể vẫn đang chạy (TCP connect vẫn thành
   công) nhưng LOGIC XỬ LÝ bên trong ứng dụng đã treo/deadlock — health check "nông" chỉ xác
   nhận tầng TCP, không phản ánh đúng khả năng ứng dụng THỰC SỰ xử lý request. Cần health check
   gọi đúng endpoint ứng dụng tự kiểm tra và trả lời.</details>

4. Trong cấu hình Nginx `server 10.0.0.1:8080 weight=3;` và `server 10.0.0.2:8080 weight=1;`,
   tỷ lệ traffic mỗi server nhận là bao nhiêu?
   <details><summary>Đáp án</summary>Server đầu (<code>weight=3</code>) nhận khoảng 3/4 (75%)
   traffic, server sau (<code>weight=1</code>) nhận khoảng 1/4 (25%) — tỷ lệ theo đúng trọng số
   tương đối giữa các server.</details>

5. Một ứng dụng lưu session trong RAM cục bộ của từng backend (không dùng session store
   chung). Đổi từ round-robin sang `ip_hash` có giải quyết được vấn đề "user bị đăng xuất liên
   tục" không? Đây có phải giải pháp TỐT NHẤT không?
   <details><summary>Đáp án</summary>Có giải quyết được (vì cùng client luôn rơi vào cùng
   backend, nơi session của họ được lưu) — NHƯNG không phải giải pháp tốt nhất về dài hạn, vì
   vẫn giữ nhược điểm của <code>ip_hash</code> (lệch tải khi nhiều client dùng chung IP qua
   NAT). Giải pháp tốt hơn là chuyển session sang store CHUNG (Redis/Memcached), để mọi thuật
   toán load balancing đều hoạt động đúng mà không cần "dính" theo IP.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.http-lb.reverse-proxy` — nền tảng cơ chế proxy mà load balancer là một dạng mở
  rộng (chọn GIỮA NHIỀU backend, không chỉ chuyển tiếp tới MỘT backend).

**Bài liên quan ngoài module:**
- `networking.nat-firewall.nat-types` — cơ chế NAT là nguyên nhân khiến nhiều client thật
  "trông giống" cùng một IP, ảnh hưởng trực tiếp tới `ip_hash`.

**Nguồn tham khảo:**
- [Nginx ngx_http_upstream_module](https://nginx.org/en/docs/http/ngx_http_upstream_module.html)
  — cú pháp chính thức `least_conn`, `ip_hash`, `weight`, `max_fails`/`fail_timeout`.
