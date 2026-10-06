---
id: networking.vpn.types
title: "VPN: site-to-site vs remote access, IPsec vs SSL VPN cơ bản"
domain: networking
module: networking.vpn
level: "vận hành"
prerequisites: ["networking.tls-pki.handshake"]
applies_to:
  - "IPsec (RFC 4301), SSL VPN/OpenVPN, WireGuard — khái niệm chung"
  - "Ubuntu 22.04 LTS, NetworkManager (lệnh nmcli chạy thật)"
status: draft
sources:
  - "https://www.rfc-editor.org/rfc/rfc4301"
  - "https://www.wireguard.com/"
  - "https://openvpn.net/community-docs/community-articles/openvpn-2-6-manual.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** không dựng được một VPN tunnel thật hoàn chỉnh (cần 2 bên
> client+server, hoặc 2 gateway, vượt phạm vi một máy) trong lúc viết bài này — cấu hình
> OpenVPN/WireGuard/IPsec trong mục 4 đánh dấu **output minh hoạ** theo tài liệu chính thức.
> Lệnh `nmcli connection show` (liệt kê PROFILE VPN đã cấu hình sẵn trên máy, KHÔNG kết nối)
> chạy thật — không chủ động kết nối vào VPN thật của ai trong lúc viết bài.

## 1. Vì sao cần biết

VPN không phải một công nghệ DUY NHẤT — "VPN" là tên gọi chung cho nhiều cách khác nhau để tạo
một kênh riêng tư qua mạng công khai, mỗi cách phù hợp một tình huống khác hẳn nhau: nối hai
văn phòng với nhau (site-to-site) khác hoàn toàn về kiến trúc với việc một nhân viên làm việc
từ xa kết nối vào công ty (remote access). Chọn sai loại — ví dụ dùng site-to-site cho nhu cầu
remote access — gây phức tạp không cần thiết; chọn đúng loại nhưng sai công nghệ bên dưới
(IPsec vs SSL VPN vs WireGuard) ảnh hưởng tới khả năng tương thích thiết bị và độ phức tạp vận
hành.

## 2. Khái niệm cốt lõi

Theo MỤC ĐÍCH sử dụng:

| Loại | Kết nối giữa | Dùng khi |
|---|---|---|
| Site-to-site | HAI MẠNG (qua 2 gateway/router) | Nối văn phòng A với văn phòng B, hoặc on-prem với cloud VPC |
| Remote access | MỘT THIẾT BỊ CÁ NHÂN với MỘT MẠNG | Nhân viên làm việc từ xa truy cập tài nguyên công ty |

Theo CÔNG NGHỆ bên dưới:

| Công nghệ | Tầng hoạt động | Đặc điểm |
|---|---|---|
| IPsec | Tầng Network (IP) | Chuẩn lâu đời, mạnh cho site-to-site, cấu hình phức tạp (AH/ESP, 2 mode) |
| SSL VPN (OpenVPN...) | Tầng Transport/Application | Dễ dùng qua firewall (thường chạy trên port 443 giống HTTPS), phổ biến cho remote access |
| WireGuard | Tầng Network, nhưng thiết kế lại từ đầu | Đơn giản hơn IPsec rất nhiều, dùng public key (giống SSH) thay vì PKI phức tạp |

## 3. Cách nó hoạt động

**IPsec có 2 "mode" phục vụ 2 mục đích khác nhau** — theo đúng RFC 4301: **Transport mode**
chỉ bảo vệ PHẦN DỮ LIỆU (payload) phía SAU IP header, giữ nguyên IP header gốc — dùng cho kết
nối HOST-TO-HOST (hai máy cụ thể nói chuyện trực tiếp). **Tunnel mode** BỌC TOÀN BỘ packet gốc
(bao gồm cả IP header gốc) vào TRONG một IP header MỚI — đây là mode BẮT BUỘC khi có một
SECURITY GATEWAY tham gia (site-to-site VPN giữa hai văn phòng LUÔN dùng tunnel mode, vì traffic
đi qua gateway, không phải host-to-host trực tiếp).

**AH và ESP khác nhau ở việc có MÃ HOÁ hay chỉ XÁC THỰC** — AH (Authentication Header) chỉ
cung cấp TÍNH TOÀN VẸN + xác thực nguồn gốc (chống giả mạo/sửa đổi), KHÔNG mã hoá — dữ liệu
vẫn đọc được nếu bị chặn giữa đường, chỉ không sửa được mà không bị phát hiện. ESP
(Encapsulating Security Payload) cung cấp CẢ hai: mã hoá (bí mật) VÀ xác thực — theo đúng RFC,
ESP đủ cho PHẦN LỚN yêu cầu bảo mật thực tế, đây là lý do ESP BẮT BUỘC phải được hỗ trợ còn AH
chỉ là TÙY CHỌN trong các implementation IPsec hiện đại — hầu hết VPN thực tế dùng ESP, ít khi
cần AH riêng.

**SSL VPN "dễ qua firewall" vì chạy GIỐNG HTTPS thông thường, không cần mở port đặc biệt**:
IPsec cần các giao thức/port riêng (ESP là một protocol IP riêng, không phải TCP/UDP thông
thường — nhiều firewall doanh nghiệp/NAT chặn hoặc xử lý sai) — đây là lý do IPsec đôi khi "khó
đi qua" một số mạng công cộng (hotel WiFi, 4G hạn chế). SSL VPN (OpenVPN) có thể chạy HOÀN TOÀN
trên TCP port 443 — với firewall/NAT, nó "trông giống" một kết nối HTTPS bình thường, dễ đi qua
hơn nhiều, đổi lại là overhead cao hơn (đóng gói thêm một tầng TLS).

## 4. Thực hành

Xem profile VPN ĐÃ CẤU HÌNH SẴN trên máy (chạy thật, chỉ LIỆT KÊ, không kết nối — tên profile
dưới đây đã ẨN DANH HOÁ, thay cho tên thật có chứa username/domain công ty cá nhân):

```bash
$ nmcli -t -f NAME,TYPE connection show
Wired connection 1:ethernet
work-remote-ssl-primary:vpn
work-remote-ssl-backup:vpn
```

Hai profile VPN kiểu `vpn` (NetworkManager) đã được cấu hình sẵn trên máy này — tên gọi dạng
`sslvpn-...` (tên thật trên máy, dạng tương tự ví dụ trên) cho biết đây là cấu hình SSL VPN
(thường kết nối tới hạ tầng công ty), đúng khớp mô hình "remote access" đã học ở mục 2 (một
máy cá nhân kết nối vào mạng công ty, không phải
nối hai mạng với nhau).

Cấu hình WireGuard — **output minh hoạ**, minh hoạ đúng điểm "đơn giản, dùng public key" đã
nói ở mục 2:

```ini
# /etc/wireguard/wg0.conf (phía client)
[Interface]
PrivateKey = <private-key-của-client>
Address = 10.8.0.2/24

[Peer]
PublicKey = <public-key-của-server>
Endpoint = vpn.example.com:51820
AllowedIPs = 10.8.0.0/24
```

So sánh với cấu hình OpenVPN (SSL VPN) — **output minh hoạ**, phức tạp hơn vì cần CHỨNG CHỈ
(PKI, đã học ở module trước) thay vì chỉ 1 khoá:

```ini
# client.ovpn
client
remote vpn.example.com 443
proto tcp
dev tun
ca ca.crt
cert client.crt
key client.key
```

Đọc: OpenVPN cần CẢ `ca.crt` (CA root để verify server), `client.crt`+`client.key` (chứng chỉ
+ key của client) — nặng hơn WireGuard (chỉ cần 1 private key + 1 public key của peer), đúng
khớp nhận định "WireGuard đơn giản hơn nhiều" ở mục 2.

## 5. Lỗi thường gặp và cách chẩn đoán

**VPN site-to-site "chập chờn" khi đi qua một số mạng công cộng, nhưng ổn định trên mạng văn
phòng**
- Nguyên nhân: nếu dùng IPsec, một số NAT/firewall ở mạng công cộng xử lý SAI protocol ESP
  (không phải TCP/UDP tiêu chuẩn) — đúng hạn chế đã nêu ở mục 3.
- Cách xác nhận: test trên một mạng khác (ví dụ 4G) xem có ổn định hơn/kém hơn mạng hiện tại,
  thử bật NAT-Traversal (NAT-T, đóng gói ESP trong UDP) nếu IPsec client hỗ trợ.
- Cách xử lý: bật NAT-T nếu chưa có, hoặc với remote access (không phải site-to-site), cân
  nhắc đổi sang SSL VPN (dễ qua NAT/firewall hơn, như đã học).

**Chọn IPsec site-to-site nhưng dùng SAI mode (transport thay vì tunnel), traffic không đi
đúng qua VPN**
- Nguyên nhân: Transport mode KHÔNG bọc IP header gốc — không phù hợp khi cần ĐỊNH TUYẾN cả
  một DẢI MẠNG qua VPN (như site-to-site luôn cần) — chỉ phù hợp host-to-host.
- Cách xác nhận: kiểm tra cấu hình IPsec policy, xác nhận đang dùng `tunnel` không phải
  `transport`.
- Cách xử lý: đổi đúng sang tunnel mode cho mọi kết nối site-to-site qua gateway.

**Cấu hình WireGuard nhưng không thấy tài liệu/hỗ trợ cho "chứng chỉ" như IPsec/OpenVPN quen
dùng**
- Nguyên nhân: không phải thiếu sót — WireGuard CHỦ Ý không dùng PKI phức tạp, chỉ cần cặp
  khoá public/private (tương tự SSH key) — đơn giản hơn theo đúng thiết kế, không phải tính
  năng còn thiếu.
- Cách xác nhận: đọc tài liệu chính thức WireGuard xác nhận mô hình key-based, không có khái
  niệm "chứng chỉ" trong thiết kế.
- Cách xử lý: làm theo đúng mô hình key-based của WireGuard (tạo cặp khoá, trao đổi public key
  giữa 2 bên), không cố áp mô hình PKI của IPsec/OpenVPN vào.

## 6. Tình huống thực tế

Một công ty có nhân viên làm việc từ xa cần truy cập hệ thống nội bộ, và riêng biệt, cần nối
văn phòng chính với một văn phòng chi nhánh mới mở — team phải chọn giải pháp VPN cho CẢ HAI
nhu cầu.

1. Phân tích nhu cầu 1 (nhân viên remote): đây là REMOTE ACCESS (một thiết bị cá nhân, không
   cố định, cần kết nối/ngắt linh hoạt, nhiều thiết bị khác nhau — laptop công ty, đôi khi máy
   cá nhân). SSL VPN hoặc WireGuard đều phù hợp; chọn SSL VPN (OpenVPN) vì cần hỗ trợ TỐT đa
   dạng hệ điều hành/thiết bị cũ mà nhân viên có thể dùng, và dễ đi qua mạng công cộng (quán
   cafe, nhà riêng, hotel WiFi) nhờ chạy trên port 443.
2. Phân tích nhu cầu 2 (nối 2 văn phòng): đây là SITE-TO-SITE (hai mạng CỐ ĐỊNH, ít thay đổi,
   traffic liên tục và cần hiệu năng cao vì có nhiều người dùng chung). IPsec tunnel mode phù
   hợp hơn — hai gateway CỐ ĐỊNH (không có vấn đề NAT di động như remote access), hiệu năng
   IPsec (xử lý ở tầng kernel/network) thường tốt hơn SSL VPN cho traffic LIÊN TỤC lớn.
3. Triển khai riêng biệt: SSL VPN server cho nhân viên remote (tích hợp với hệ thống xác thực
   công ty — mỗi nhân viên có tài khoản/chứng chỉ riêng); IPsec site-to-site giữa 2 gateway
   văn phòng (một lần cấu hình, ít thay đổi).
4. Test: nhân viên remote kết nối từ nhiều mạng khác nhau (nhà, 4G, quán cafe) — xác nhận ổn
   định qua SSL VPN. Traffic giữa 2 văn phòng qua IPsec — xác nhận tốc độ và độ ổn định cho
   lượng truy cập liên tục.
5. Document rõ 2 giải pháp riêng biệt, không gộp chung "một VPN cho tất cả" — vì bản chất 2
   nhu cầu khác nhau hoàn toàn về kiến trúc.
6. Ghi vào runbook: LUÔN phân tích đúng loại nhu cầu (site-to-site hay remote access) TRƯỚC khi
   chọn công nghệ VPN — không có "công nghệ VPN tốt nhất" chung cho mọi tình huống, chỉ có lựa
   chọn ĐÚNG cho ĐÚNG nhu cầu.

## 7. Tự kiểm tra

1. Một công ty cần nối mạng nội bộ ở 2 chi nhánh cố định, traffic liên tục suốt ngày. Nên chọn
   site-to-site hay remote access? Vì sao?
   <details><summary>Đáp án</summary>Site-to-site — kết nối giữa HAI MẠNG cố định (qua
   gateway ở mỗi bên), đúng mô hình site-to-site. Remote access dành cho một THIẾT BỊ CÁ NHÂN
   kết nối vào một mạng, không phù hợp cho nhu cầu nối hai mạng với nhau.</details>

2. Phân biệt AH và ESP trong IPsec — cái nào cung cấp MÃ HOÁ (bí mật), cái nào CHỈ xác thực/
   toàn vẹn?
   <details><summary>Đáp án</summary>ESP cung cấp CẢ mã hoá và xác thực/toàn vẹn. AH CHỈ cung
   cấp xác thực/toàn vẹn, KHÔNG mã hoá — dữ liệu qua AH vẫn đọc được nếu bị chặn, chỉ không sửa
   được mà không bị phát hiện.</details>

3. Vì sao SSL VPN thường "dễ đi qua" firewall/NAT công cộng hơn IPsec?
   <details><summary>Đáp án</summary>SSL VPN (như OpenVPN) có thể chạy hoàn toàn trên TCP port
   443, trông giống một kết nối HTTPS bình thường với firewall/NAT. IPsec dùng protocol ESP
   riêng (không phải TCP/UDP tiêu chuẩn), nhiều firewall/NAT công cộng xử lý sai hoặc chặn
   protocol này.</details>

4. Một kết nối IPsec cần ĐỊNH TUYẾN cả một dải mạng qua VPN (site-to-site, qua gateway). Nên
   dùng Transport mode hay Tunnel mode?
   <details><summary>Đáp án</summary>Tunnel mode — bắt buộc khi có security gateway tham gia,
   vì nó bọc TOÀN BỘ IP header gốc vào trong một header mới, cho phép định tuyến cả dải mạng
   qua gateway. Transport mode chỉ phù hợp kết nối host-to-host trực tiếp, không bọc IP header
   gốc.</details>

5. Vì sao WireGuard không cần khái niệm "chứng chỉ" (certificate) như IPsec/OpenVPN?
   <details><summary>Đáp án</summary>WireGuard CHỦ Ý thiết kế đơn giản hơn, dùng mô hình cặp
   khoá public/private (tương tự SSH key) để xác thực giữa các peer, thay vì hệ thống PKI
   phức tạp (CA, chứng chỉ, chuỗi tin cậy) của IPsec/OpenVPN — đây là lựa chọn thiết kế có chủ
   đích, không phải tính năng còn thiếu.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan ngoài module:**
- `networking.tls-pki.pki-cert-mgmt` — PKI/chứng chỉ mà OpenVPN (SSL VPN) dùng, khác với mô
  hình key-based đơn giản của WireGuard.
- `networking.routing.static` — route table cần cấu hình đúng để traffic đi qua VPN tunnel
  (site-to-site) thay vì đi thẳng ra Internet.

**Nguồn tham khảo:**
- [RFC 4301 — IPsec Architecture](https://www.rfc-editor.org/rfc/rfc4301) — đặc tả chính thức
  Transport/Tunnel mode, AH/ESP.
- [WireGuard.com](https://www.wireguard.com/) — tài liệu chính thức, so sánh với IPsec/OpenVPN.
- [OpenVPN 2.6 Reference Manual](https://openvpn.net/community-docs/community-articles/openvpn-2-6-manual.html)
  — cú pháp file `.ovpn`, các directive `client`/`remote`/`ca`/`cert`/`key`.
