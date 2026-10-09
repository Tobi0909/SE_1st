---
id: networking.nat-firewall.acl-security-groups
title: "ACL và security group trên thiết bị mạng/cloud"
domain: networking
module: networking.nat-firewall
level: "vận hành"
prerequisites: ["networking.nat-firewall.firewall-concepts"]
applies_to:
  - "Khái niệm chung network ACL/security group — minh họa theo AWS VPC (phổ biến nhất)"
status: verified
sources:
  - "https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-group-vs-network-acl.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** không có môi trường cloud (AWS VPC) thật để tạo Security
> Group/Network ACL thật trong lúc viết bài này. Toàn bộ cấu hình trong bài đánh dấu **minh
> hoạ**, dựng theo đúng mô hình và field chuẩn trong tài liệu chính thức AWS VPC Docs — PHẢI
> tự kiểm chứng trên tài khoản AWS/console thật trước khi áp dụng.

## 1. Vì sao cần biết

Bài trước học firewall ở tầng OS (iptables/nftables, chạy TRÊN một máy cụ thể). Trên hạ tầng
cloud/thiết bị mạng chuyên dụng, có THÊM một lớp kiểm soát traffic KHÁC NẰM NGOÀI máy — Security
Group (SG) và Network ACL. Hai cơ chế này DỄ NHẦM vì cùng "lọc traffic theo IP/port", nhưng khác
nhau về STATEFUL/STATELESS và CẤP ĐỘ áp dụng — nhầm lẫn dẫn tới cấu hình dư thừa (mở cả hai
chiều cho SG không cần thiết) hoặc thiếu sót (quên mở chiều về cho NACL).

## 2. Khái niệm cốt lõi

Minh hoạ theo AWS VPC (mô hình phổ biến nhất, nhiều cloud khác có khái niệm tương đương):

| | Security Group | Network ACL |
|---|---|---|
| Cấp độ áp dụng | INSTANCE (máy ảo cụ thể) | SUBNET (toàn bộ mạng con) |
| Trạng thái | STATEFUL — tự cho phép traffic phản hồi | STATELESS — phải khai báo cả 2 chiều |
| Loại rule | CHỈ allow (không có deny tường minh) | CẢ allow và deny |
| Thứ tự xử lý | Không quan trọng (không có "thứ tự", mọi rule allow được xét) | CÓ thứ tự (theo số rule, dừng ở rule đầu khớp) |

## 3. Cách nó hoạt động

**Security Group "chỉ allow" vì nó hoạt động theo nguyên lý DEFAULT DENY** — không cần rule
"deny" tường minh vì MẶC ĐỊNH mọi traffic đã bị chặn trừ khi có rule allow — khác hẳn Network
ACL (có thể có traffic PASS qua rule allow TRƯỚC rồi bị DENY bởi rule SAU, cần thứ tự). Đây là
lý do thứ tự KHÔNG quan trọng với Security Group (chỉ cần "có ít nhất 1 rule allow khớp" là
đủ), nhưng QUAN TRỌNG SỐNG CÒN với Network ACL (rule số nhỏ hơn được xét TRƯỚC, dừng ngay khi
khớp — một rule DENY số nhỏ đặt nhầm trước rule ALLOW cần thiết sẽ chặn traffic đó, dù rule
ALLOW "đúng" vẫn tồn tại ở số lớn hơn).

**Hai lớp Security Group + Network ACL hoạt động THEO THỨ TỰ CỐ ĐỊNH, không phải "chọn một"**
— nhưng thứ tự này ĐẢO NGƯỢC tuỳ CHIỀU traffic: với traffic ĐI VÀO (Internet → instance),
traffic PHẢI QUA Network ACL (cấp subnet) TRƯỚC, rồi MỚI qua Security Group (cấp instance).
Với traffic ĐI RA (instance → Internet), thứ tự NGƯỢC LẠI: qua Security Group TRƯỚC, rồi mới
qua Network ACL. Traffic bị chặn ở lớp ĐẦU (theo đúng chiều) sẽ KHÔNG BAO GIỜ tới được lớp thứ
hai để kiểm tra tiếp. Đây là lý do khi debug "traffic không tới được instance", cần xác định
ĐÚNG CHIỀU trước khi kiểm tra cả hai lớp theo đúng thứ tự tương ứng — không chỉ xem Security
Group (dễ nghĩ tới trước vì gần instance hơn) mà quên NACL.

**"Stateful" của Security Group nghĩa là KHÔNG cần rule outbound riêng cho response — nhưng
CHỈ áp dụng cho ĐÚNG kết nối đã match inbound rule**: ví dụ SG cho phép inbound port 443 từ
mọi nơi — response từ port 443 đó tự động được phép ra, KHÔNG cần rule outbound riêng. NHƯNG
nếu instance đó cần tự KẾT NỐI RA (ví dụ gọi API bên ngoài, không phải response cho request
đến), đó là một "kết nối MỚI" theo chiều khác — vẫn cần rule OUTBOUND riêng cho phép, "stateful"
không có nghĩa là "mọi traffic ra đều tự động được phép".

## 4. Thực hành (minh hoạ cấu hình — không có môi trường cloud thật trong lúc viết bài)

Cấu hình Security Group điển hình cho một web server (chỉ cần rule ALLOW, không cần nghĩ tới
chiều response):

```
Security Group: web-sg
Inbound:
  - Type: HTTP (80),  Source: 0.0.0.0/0
  - Type: HTTPS (443), Source: 0.0.0.0/0
  - Type: SSH (22),   Source: 203.0.113.0/24   (chỉ IP văn phòng)
Outbound:
  - Type: All traffic, Destination: 0.0.0.0/0   (mặc định AWS: outbound mở hết)
```

Chú ý: KHÔNG có rule inbound cho "response của port 80/443" — stateful tự xử lý (mục 3).
KHÔNG có rule outbound riêng cho "trả lời request" — cũng tự động theo stateful.

Cấu hình Network ACL cho CÙNG mục đích — chú ý phải khai báo CẢ HAI chiều, VÀ đúng thứ tự số
rule:

```
Network ACL: web-subnet-nacl
Inbound:
  100  ALLOW  TCP  80    0.0.0.0/0
  110  ALLOW  TCP  443   0.0.0.0/0
  120  ALLOW  TCP  22    203.0.113.0/24
  *    DENY   ALL        0.0.0.0/0        (rule mặc định, luôn ở cuối)
Outbound:
  100  ALLOW  TCP  1024-65535  0.0.0.0/0   (ephemeral port — PHẢI có, cho response của client)
  *    DENY   ALL             0.0.0.0/0
```

Đọc kỹ dòng outbound `1024-65535` — đây CHÍNH LÀ hệ quả của STATELESS: client bên ngoài kết
nối TỪ một ephemeral port (thường trong dải này, đã học khái niệm ephemeral port ở bài
`networking.tcpip.tcp-udp`), server phải trả response VỀ ĐÚNG port đó — NACL không tự biết
"đây là response", phải mở nguyên CẢ DẢI ephemeral port cho outbound, khác hẳn Security Group
(không cần khai báo gì thêm nhờ stateful).

## 5. Lỗi thường gặp và cách chẩn đoán

**Mở Security Group đúng, nhưng vẫn không truy cập được instance từ ngoài**
- Nguyên nhân: quên kiểm tra Network ACL ở cấp SUBNET — traffic bị NACL chặn TRƯỚC KHI tới
  được Security Group để kiểm tra.
- Cách xác nhận: kiểm tra NACL của subnet chứa instance đó, xác nhận có rule ALLOW đúng port/
  nguồn, và rule đó KHÔNG bị một rule DENY số nhỏ hơn chặn trước.
- Cách xử lý: sửa đúng rule NACL (thêm rule ALLOW với số THỨ TỰ nhỏ hơn mọi rule DENY liên
  quan) — nhớ cả outbound cho ephemeral port range.

**Cấu hình Network ACL inbound đúng nhưng quên outbound, client vẫn không nhận được response**
- Nguyên nhân: tâm lý quen với Security Group (stateful, không cần nghĩ tới outbound riêng)
  mang nhầm sang NACL (stateless, PHẢI khai báo outbound riêng cho response).
- Cách xác nhận: traffic request tới được instance (xác nhận qua log/metric) nhưng response
  không tới được client.
- Cách xử lý: thêm rule outbound cho phép dải ephemeral port (thường `1024-65535`, tuỳ hệ
  điều hành client có thể khác) — đây là rule DỄ QUÊN NHẤT khi làm việc với NACL.

**Đặt rule DENY số nhỏ (ưu tiên cao) trong NACL trước rule ALLOW cần thiết, vô tình chặn traffic
hợp lệ**
- Nguyên nhân: không nắm nguyên lý "số rule nhỏ hơn được xét trước, dừng ở rule đầu khớp" của
  NACL — khác Security Group (không có khái niệm thứ tự).
- Cách xác nhận: xem lại toàn bộ rule NACL theo đúng THỨ TỰ SỐ, không chỉ xem "có rule ALLOW
  đúng không" mà bỏ qua vị trí tương đối với rule DENY khác.
- Cách xử lý: luôn đặt rule ALLOW cụ thể cần thiết ở số THẤP HƠN mọi rule DENY tổng quát có thể
  vô tình khớp trước.

## 6. Tình huống thực tế

Một API server trên AWS, Security Group đã mở đúng port 443 cho mọi nguồn, nhưng team audit an
ninh phát hiện: traffic từ MỘT dải IP đáng ngờ cụ thể vẫn truy cập được, trong khi họ đã thêm
rule DENY cho dải đó ở Security Group.

1. Kiểm tra lại Security Group — phát hiện: KHÔNG CÓ "DENY" nào trong SG cả, vì Security Group
   THEO ĐỊNH NGHĨA chỉ có rule ALLOW (mục 2-3) — ai đó đã cố thêm một rule tưởng là "deny"
   nhưng thực ra SG không hỗ trợ khái niệm này, rule đó không có tác dụng hoặc đã bị từ chối
   khi tạo.
2. Xác nhận lại kiến trúc đúng: muốn CHẶN một dải IP cụ thể trong khi vẫn cho phép traffic khác
   qua port 443, phải dùng NETWORK ACL (hỗ trợ DENY), không phải Security Group.
3. Thiết kế lại ở cấp NACL của subnet: thêm rule DENY cho dải IP đáng ngờ ở SỐ THỨ TỰ THẤP (ưu
   tiên cao, ví dụ `90`), ĐẶT TRƯỚC rule ALLOW chung cho port 443 (ví dụ `100`) — đảm bảo dải
   IP đó bị chặn TRƯỚC khi traffic có cơ hội khớp rule ALLOW tổng quát.
4. Test lại: traffic từ dải IP đáng ngờ bị chặn đúng ở tầng NACL; traffic từ các nguồn khác vẫn
   qua được port 443 bình thường (cả NACL và Security Group đều cho phép).
5. Đối chiếu lại toàn bộ NACL outbound — xác nhận vẫn còn đủ rule cho ephemeral port range (bài
   học mục 5), không bị ảnh hưởng bởi thay đổi mới.
6. Ghi vào runbook: Security Group KHÔNG BAO GIỜ dùng để "chặn" (deny) một nguồn cụ thể — đây
   là nhầm lẫn kiến trúc phổ biến. Mọi nhu cầu DENY tường minh phải thực hiện ở Network ACL,
   đúng thứ tự ưu tiên số rule.

## 7. Tự kiểm tra

1. Bạn muốn thêm một rule "deny" trong Security Group để chặn một IP cụ thể. Điều này có khả
   thi không?
   <details><summary>Đáp án</summary>Không. Security Group THEO ĐỊNH NGHĨA chỉ hỗ trợ rule
   ALLOW (hoạt động theo nguyên lý default-deny — mọi thứ không được allow tường minh đã bị
   chặn sẵn). Muốn DENY tường minh một nguồn cụ thể, phải dùng Network ACL.</details>

2. Traffic từ Internet tới một instance trong subnet phải đi qua Security Group và Network ACL
   theo thứ tự nào?
   <details><summary>Đáp án</summary>Network ACL (cấp subnet) TRƯỚC, Security Group (cấp
   instance) SAU — traffic bị NACL chặn sẽ không bao giờ tới được Security Group để kiểm tra
   tiếp.</details>

3. Security Group cho phép inbound port 80. Có cần thêm rule outbound riêng để instance trả
   response cho request đó không?
   <details><summary>Đáp án</summary>Không cần — Security Group là STATEFUL, tự động cho phép
   traffic phản hồi của một kết nối đã match rule inbound, không cần khai báo outbound
   riêng.</details>

4. Network ACL cho phép inbound port 443 nhưng KHÔNG có rule outbound cho dải ephemeral port.
   Điều gì xảy ra?
   <details><summary>Đáp án</summary>Request tới được instance, nhưng RESPONSE không gửi ra
   được cho client — vì Network ACL là STATELESS, không tự nhận biết "đây là response", cần
   rule outbound riêng cho phép dải ephemeral port (thường client dùng để nhận response).
   </details>

5. Trong Network ACL, rule số `50 DENY all 0.0.0.0/0` đứng TRƯỚC rule số `100 ALLOW TCP 443
   0.0.0.0/0`. Traffic HTTPS hợp lệ có qua được không?
   <details><summary>Đáp án</summary>Không — Network ACL xét rule theo THỨ TỰ SỐ tăng dần,
   dừng ở rule ĐẦU TIÊN khớp. Rule <code>50 DENY all</code> khớp TRƯỚC (số nhỏ hơn, mọi traffic
   đều khớp "all") và chặn ngay, traffic không bao giờ được xét tới rule
   <code>100</code>.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.nat-firewall.firewall-concepts` — nền tảng stateful/stateless và nguyên tắc thứ
  tự rule mà bài này áp dụng vào ngữ cảnh cloud cụ thể.

**Bài liên quan ngoài module:**
- `networking.tcpip.tcp-udp` — khái niệm ephemeral port, cần thiết để hiểu tại sao NACL
  outbound cần mở dải port đó.

**Nguồn tham khảo:**
- [AWS VPC Docs — Security Groups vs Network ACLs](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-group-vs-network-acl.html)
  — tài liệu chính thức, bảng so sánh stateful/stateless, cấp độ áp dụng, loại rule.
