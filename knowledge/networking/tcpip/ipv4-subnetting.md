---
id: networking.tcpip.ipv4-subnetting
title: "Địa chỉ IPv4 và subnetting (CIDR)"
domain: networking
module: networking.tcpip
level: "nền tảng"
prerequisites: ["networking.tcpip.osi-tcpip-model"]
applies_to:
  - "IPv4, CIDR (Classless Inter-Domain Routing) — chuẩn chung mọi hệ thống mạng hiện đại"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man7/ip.7.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

"Máy A ping được máy B nhưng không ping được máy C, cả hai cùng trong văn phòng" — câu trả lời
thường nằm ở việc B và C thuộc hai SUBNET khác nhau, và không có route (hoặc route sai) giữa
chúng. Subnetting không phải bài toán toán học trừu tượng — nó quyết định TRỰC TIẾP hai máy có
"nhìn thấy nhau" trực tiếp (cùng subnet, giao tiếp qua Ethernet/ARP) hay phải đi qua router
(khác subnet). Đọc sai một địa chỉ CIDR dẫn tới cấu hình sai IP, hoặc chẩn đoán sai nguyên nhân
"không kết nối được" khi vấn đề thực ra chỉ là thiếu route.

## 2. Khái niệm cốt lõi

Một địa chỉ IPv4 CIDR gồm 2 phần: `<địa chỉ>/<số bit prefix>` — ví dụ `192.168.25.227/23`:

```
192.168.25.227/23
└──────┬──────┘ └┬┘
    địa chỉ    số bit mạng (prefix length)
```

`/23` nghĩa là 23 bit ĐẦU (trong 32 bit của địa chỉ IPv4) xác định MẠNG, 9 bit còn lại
(`32 - 23 = 9`) xác định HOST trong mạng đó. Số bit host quyết định SỐ ĐỊA CHỈ trong mạng:
`2^9 = 512` địa chỉ.

| Prefix | Subnet mask | Số địa chỉ | Số host dùng được |
|---|---|---|---|
| /24 | 255.255.255.0 | 256 | 254 |
| /23 | 255.255.254.0 | 512 | 510 |
| /16 | 255.255.0.0 | 65536 | 65534 |

"Host dùng được" = tổng số địa chỉ TRỪ 2 (địa chỉ ĐẦU là network address — đại diện cả mạng,
không gán cho host nào; địa chỉ CUỐI là broadcast address — gửi cho TOÀN BỘ host trong mạng).

## 3. Cách nó hoạt động

**Hai máy "cùng subnet" hay "khác subnet" quyết định bởi phép AND giữa IP và subnet mask, KHÔNG
phải nhìn bằng mắt các số octet giống/khác nhau**: để biết hai IP có cùng mạng không, tính
`IP AND mask` cho cả hai, nếu kết quả (network address) GIỐNG NHAU thì cùng mạng. Ví dụ
`192.168.25.227/23` và `192.168.24.50/23`: mask `/23` = `255.255.254.0` — AND cả hai IP với
mask này đều ra `192.168.24.0` → CÙNG mạng, dù octet thứ 3 khác nhau (`25` vs `24`) — đây
chính là lý do không thể chỉ nhìn "giống 3 octet đầu" để kết luận cùng subnet, phải tính đúng
theo prefix length.

**Cùng subnet → giao tiếp TRỰC TIẾP qua Ethernet (ARP); khác subnet → PHẢI qua router (default
gateway)**: khi máy A gửi gói tin tới máy B, trước tiên nó tính xem B có cùng subnet với A
không (theo đúng phép AND ở trên). Nếu CÙNG, A dùng ARP để tìm MAC của B, gửi trực tiếp qua
Ethernet — không cần router. Nếu KHÁC, A không gửi trực tiếp được — nó gửi gói tin tới
default gateway (router), để gateway định tuyến tiếp. Đây là lý do thiếu/sai cấu hình default
gateway chỉ ảnh hưởng tới giao tiếp LIÊN MẠNG, không ảnh hưởng gì tới giao tiếp giữa các máy
CÙNG subnet.

**CIDR (classless) thay thế hệ thống "class" cũ (A/B/C) vì lãng phí địa chỉ nghiêm trọng**:
trước CIDR, mạng chỉ có 3 kích thước cố định: Class A (`/8`, 16 triệu địa chỉ), Class B (`/16`,
65 nghìn), Class C (`/24`, 256). Một tổ chức cần 300 địa chỉ buộc phải lấy cả một Class B (lãng
phí 65000+ địa chỉ không dùng tới). CIDR cho phép chọn CHÍNH XÁC prefix length cần (ví dụ `/23`
cho 512 địa chỉ) — linh hoạt hơn nhiều, là chuẩn DUY NHẤT được dùng từ lâu, "class" giờ chỉ còn
giá trị lịch sử.

## 4. Thực hành

Xem địa chỉ IP thật của máy, đọc đúng prefix length (chạy thật):

```bash
$ ip addr show enp1s0 | grep inet
    inet 192.168.25.227/23 brd 192.168.25.255 scope global dynamic noprefixroute enp1s0
```

`/23` → mask `255.255.254.0`, `brd 192.168.25.255` (broadcast) đã được kernel TỰ TÍNH sẵn,
không cần tính tay. Tính lại bằng Python để xác nhận (`ipaddress` module — cách đáng tin cậy
hơn tính tay khi cần chắc chắn, đặc biệt với prefix lẻ không tròn octet như `/23`):

```bash
$ python3 -c "
import ipaddress
n = ipaddress.ip_network('192.168.24.0/23', strict=False)
print('Network:', n.network_address)
print('Broadcast:', n.broadcast_address)
print('Tổng địa chỉ:', n.num_addresses)
"
Network: 192.168.24.0
Broadcast: 192.168.25.255
Tổng địa chỉ: 512
```

Khớp CHÍNH XÁC với `brd 192.168.25.255` mà `ip addr` tự hiển thị — xác nhận công thức đúng.
Network address `192.168.24.0` (không phải `192.168.25.0` dù IP máy là `.25.227`) — đây là
minh chứng trực tiếp cho nguyên lý mục 3: `/23` gộp CẢ octet `24` và `25` vào một mạng duy
nhất.

Xem bảng route thật, xác nhận nguyên lý "cùng subnet đi trực tiếp, khác subnet qua gateway":

```bash
$ ip route show
default via 192.168.24.1 dev enp1s0 proto dhcp metric 100
192.168.24.0/23 dev enp1s0 proto kernel scope link src 192.168.25.227 metric 100
```

Dòng thứ hai (`scope link`) là route TỰ ĐỘNG kernel tạo cho mạng cùng subnet (`192.168.24.0/23`
— đúng mạng của chính interface này) — mọi IP trong khoảng `192.168.24.1` tới `192.168.25.254`
đi theo route này, TRỰC TIẾP qua `enp1s0`, không qua gateway. Dòng đầu (`default`) chỉ áp dụng
cho IP KHÔNG khớp route cụ thể nào khác — tức mọi IP ngoài subnet này, phải đi qua
`192.168.24.1`.

## 5. Lỗi thường gặp và cách chẩn đoán

**Gán sai subnet mask khi cấu hình tay, khiến hai máy "trông giống cùng mạng" nhưng thực ra
không phải**
- Nguyên nhân: nhìn octet giống nhau mà không tính đúng theo mask — ví dụ `192.168.1.10/25` và
  `192.168.1.200/25` CÙNG octet đầu nhưng `/25` chia mạng `192.168.1.0/24` thành HAI nửa
  (`.0-.127` và `.128-.255`) — hai IP này thực ra ở HAI subnet khác nhau.
- Cách xác nhận: tính network address bằng `ipaddress` (Python) hoặc công cụ subnet calculator,
  không đoán bằng mắt.
- Cách xử lý: sửa lại mask cho đúng dự định, hoặc đổi IP sang đúng dải nếu mask là cố định theo
  quy hoạch mạng có sẵn.

**Thiếu default gateway, máy không kết nối được RA NGOÀI subnet nhưng vẫn ping được máy cùng
mạng**
- Nguyên nhân: đúng khớp nguyên lý mục 3 — giao tiếp cùng subnet không cần gateway, chỉ giao
  tiếp khác subnet (bao gồm ra Internet) mới cần.
- Cách xác nhận: `ip route show` không có dòng `default via ...`; `ping` một IP cùng subnet
  thành công nhưng `ping 8.8.8.8` (ngoài subnet) thất bại hoặc báo "Network is unreachable".
- Cách xử lý: thêm route default đúng (`ip route add default via <gateway-ip>`), hoặc kiểm tra
  lại cấu hình DHCP nếu đáng lẽ phải tự nhận route này.

**Đặt prefix quá nhỏ (ví dụ `/30`, chỉ 4 địa chỉ) cho một mạng cần phát triển thêm máy**
- Nguyên nhân: không tính trước nhu cầu mở rộng, hết địa chỉ trong subnet khi thêm máy mới.
- Cách xác nhận: không thêm được IP mới trong dải đó (đã dùng hết `2^(32-prefix) - 2` host khả
  dụng).
- Cách xử lý: quy hoạch lại với prefix lớn hơn (dành nhiều bit host hơn) TRƯỚC khi hết chỗ,
  việc đổi subnet sau khi đã có nhiều máy đang dùng tốn công hơn nhiều so với quy hoạch đúng từ
  đầu.

## 6. Tình huống thực tế

Team mạng báo "máy chủ mới (IP `192.168.25.50/24`) không ping được tới máy chủ cũ
(`192.168.24.10/24`) dù cùng đặt trong một phòng rack, cùng switch".

1. Cả hai IP "nhìn" giống nhau ở 2 octet đầu (`192.168`), nhưng khác octet thứ 3 (`25` vs
   `24`) — với mask `/24` (`255.255.255.0`), network address của máy mới là `192.168.25.0`,
   của máy cũ là `192.168.24.0` — HAI mạng KHÁC NHAU, dù nằm vật lý cùng switch.
2. Xác nhận bằng `ip route` trên máy mới: không có route riêng cho `192.168.24.0/24`, chỉ có
   route cho mạng của chính nó (`192.168.25.0/24`) và route default. Gói tin tới
   `192.168.24.10` sẽ bị coi là "khác subnet", gửi qua default gateway — nếu gateway đó
   KHÔNG biết đường tới `192.168.24.0/24` (ví dụ đó là một mạng cách ly riêng), gói tin sẽ bị
   drop hoặc đi vòng không tới đích.
3. Giải pháp phụ thuộc Ý ĐỊNH ban đầu: nếu HAI máy chủ này ĐÁNG LẼ phải giao tiếp trực tiếp
   (cùng chức năng, cùng rack), nên đổi lại để CÙNG subnet — cách đơn giản nhất là đổi máy mới
   sang `192.168.24.x/24` (chỉ đổi IP của MÁY MỚI, không ảnh hưởng máy khác). Phương án "quy
   hoạch lại cả hai thành `/23`" như ở mục 4 cũng khả thi nhưng NẶNG HƠN nhiều: đổi mask của
   mạng `/24` cũ sang `/23` làm đổi CẢ network/broadcast address của TOÀN BỘ máy đang dùng dải
   đó — phải migrate cấu hình đồng loạt (không chỉ máy mới), nên chỉ chọn hướng này khi đã xác
   định rõ nhu cầu gộp subnet lâu dài, không phải giải pháp nhanh cho một sự cố đơn lẻ.
4. Nếu HAI máy chủ CỐ Ý ở hai subnet khác nhau (ví dụ phân vùng bảo mật), vấn đề không phải
   "lỗi" mà là THIẾU ROUTE hợp lệ giữa hai subnet — cần thêm route (hoặc cấu hình routing ở
   gateway/firewall giữa hai mạng) nếu giao tiếp này THỰC SỰ cần được phép.
5. Sau khi xác định đúng ý định (giả sử cần gộp), đổi quy hoạch mạng, cập nhật IP máy mới, xác
   nhận `ping` thành công.
6. Ghi vào runbook: khi cấp IP cho máy mới, LUÔN xác nhận đúng subnet dự định (dựa vào tính
   network address, không dựa vào "nhìn octet giống nhau") trước khi đưa vào vận hành — tránh
   lặp lại nhầm lẫn location vật lý (cùng rack/switch) với subnet logic (có thể khác hoàn toàn).

## 7. Tự kiểm tra

**Câu 1**: Hai IP `10.0.5.100/22` và `10.0.6.50/22` có cùng subnet không? (Gợi ý: `/22` = mask
`255.255.252.0`)

a) Không, vì octet thứ ba khác nhau (5 vs 6) nên luôn thuộc hai subnet khác nhau trừ khi dùng
   VLSM đặc biệt
b) Có — `/22` gộp 4 octet thứ-3 liên tiếp (4, 5, 6, 7 đều rơi vào cùng một block) vào một mạng
c) Không thể xác định nếu không biết thêm địa chỉ gateway của mạng
d) Có, nhưng chỉ vì hai địa chỉ nằm trong cùng dải `/24` kề nhau (`10.0.5.0/24` và
   `10.0.6.0/24`)

**Đáp án: b** — Có. `/22` gộp 4 octet thứ-3 liên tiếp (`4, 5, 6, 7` trong trường hợp này rơi vào
cùng một block 4-số) vào một mạng — tính `AND` cả hai IP với mask `/22` đều ra network address
`10.0.4.0`, xác nhận cùng mạng dù octet thứ 3 khác nhau (`5` vs `6`). Octet thứ 3 khác nhau
không tự động nghĩa là khác subnet khi mask gộp nhiều octet (loại a); kết luận tính được trực
tiếp từ IP và mask, không cần gateway (loại c); việc gộp mạng theo `/22` không đơn thuần là hai
dải `/24` kề nhau — phải đúng khối 4-số bắt đầu từ `4` (loại d, vô tình đúng ở ví dụ này nhưng
sai về nguyên lý: khối `/22` không phải lúc nào cũng là 2 dải `/24` liền kề đang xét).

---

**Câu 2**: Một mạng `/27` có tổng bao nhiêu địa chỉ? Bao nhiêu host dùng được?

a) Tổng 64 địa chỉ, host dùng được 62
b) Tổng 32 địa chỉ, host dùng được 32
c) Tổng 32 địa chỉ (`2^(32-27) = 2^5 = 32`), host dùng được 30
d) Tổng 16 địa chỉ, host dùng được 14

**Đáp án: c** — Tổng `2^(32-27) = 2^5 = 32` địa chỉ. Host dùng được: `32 - 2 = 30` (trừ network
address và broadcast address). Con số 64/62 là của `/26`, không phải `/27` (loại a); quên trừ 2
địa chỉ network/broadcast thì sai (loại b); con số 16/14 là của `/28` (loại d).

---

**Câu 3**: Máy A (`172.16.1.5/24`) và máy B (`172.16.1.200/24`) cùng subnet. Máy A có cần default
gateway để ping được máy B không?

a) Có, mọi gói tin luôn phải qua default gateway trước khi tới bất kỳ máy nào trong mạng
b) Chỉ cần gateway nếu hai máy nằm trên hai switch vật lý khác nhau, dù cùng subnet logic
c) Không cần, nhưng chỉ vì cả hai máy dùng cùng một dải DHCP nên switch tự định tuyến nội bộ
d) Không cần — cùng subnet giao tiếp trực tiếp qua Ethernet/ARP, không đi qua gateway

**Đáp án: d** — Không cần. Cùng subnet thì giao tiếp TRỰC TIẾP qua Ethernet/ARP, không đi qua
gateway — default gateway chỉ cần cho giao tiếp RA NGOÀI subnet hiện tại. Gói tin trong cùng
subnet không bắt buộc qua gateway (loại a); việc có cần gateway hay không phụ thuộc vào subnet
logic (IP/mask), không phụ thuộc số switch vật lý (loại b); lý do đúng là cùng subnet IP, không
liên quan tới việc dùng chung dải DHCP (loại c).

---

**Câu 4**: Vì sao CIDR (classless) được coi là cải tiến so với hệ thống Class A/B/C cũ?

a) Class cũ chỉ có 3 kích thước mạng cố định (`/8`, `/16`, `/24`), buộc tổ chức cần số lượng địa chỉ nằm giữa các mức đó phải lấy dư thừa rất nhiều
b) Vì CIDR cho phép bỏ hoàn toàn subnet mask, router tự suy ra kích thước mạng từ địa chỉ IP
c) Vì CIDR chỉ áp dụng cho mạng nội bộ private, không ảnh hưởng tới cấp phát địa chỉ public
d) Vì Class A/B/C vẫn linh hoạt tương đương CIDR, chỉ khác ở cách ghi ký hiệu mask

**Đáp án: a** — Class cũ chỉ có 3 kích thước mạng cố định (/8, /16, /24), buộc tổ chức cần số
lượng địa chỉ nằm GIỮA các mức đó phải lấy dư thừa rất nhiều (lãng phí). CIDR cho phép chọn
CHÍNH XÁC prefix length cần, linh hoạt và tiết kiệm địa chỉ hơn nhiều. CIDR vẫn cần subnet mask
(ghi dưới dạng prefix length), không bỏ nó (loại b); CIDR áp dụng cho cả địa chỉ public và
private (loại c); Class cũ kém linh hoạt hơn CIDR về số lượng mức kích thước mạng có thể chọn
(loại d).

---

**Câu 5**: Bạn cần cấp một dải IP cho 100 máy, dự kiến tăng lên 150 trong năm tới. Nên chọn
prefix length nào, và vì sao không nên chọn đúng mức tối thiểu cho 100 máy hiện tại?

a) Nên chọn `/25` (126 host) vì đã đủ hơn 100 máy hiện tại, mở rộng sau bằng cách cấp thêm
   subnet mới liền kề
b) Nên chọn `/24` (254 host dùng được, đủ cho cả 100 hiện tại và 150 dự kiến), không chọn `/25`
c) Nên chọn `/23` để chắc chắn dư thừa gấp nhiều lần nhu cầu, tránh phải tính toán lại trong
   tương lai
d) Nên chọn `/26` (62 host) và chia thành 2 subnet riêng cho 100 máy hiện tại, nâng cấp khi cần

**Đáp án: b** — Nên chọn `/24` (254 host dùng được, đủ cho cả 100 hiện tại và 150 dự kiến),
không chọn `/25` (126 host — chỉ hơn 100 một chút, không đủ khi tăng lên 150). Luôn tính trước
nhu cầu mở rộng khi quy hoạch subnet, vì đổi lại sau khi đã có nhiều máy đang dùng tốn công hơn
nhiều so với chọn dư ngay từ đầu. `/25` không đủ khi tăng lên 150 máy, và cấp thêm subnet liền kề
sau này phức tạp hơn chọn đúng ngay từ đầu (loại a); `/23` dư thừa không cần thiết, lãng phí địa
chỉ (loại c); `/26` (62 host) còn nhỏ hơn cả nhu cầu hiện tại 100 máy, hoàn toàn không đủ (loại
d).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.tcpip.osi-tcpip-model` — vai trò tầng Internet (IP) mà bài này đi sâu hơn.
- `networking.tcpip.ipv6-basics` — IPv6 giải quyết đúng vấn đề "hết địa chỉ" mà IPv4/CIDR vẫn
  còn gặp phải ở quy mô toàn cầu.

**Bài liên quan ngoài module:**
- `networking.routing.static` — cách route table (đã thấy ở mục 4) được xây dựng và dùng để
  định tuyến liên mạng.

**Nguồn tham khảo:**
- [ip(7) — man7.org](https://man7.org/linux/man-pages/man7/ip.7.html) — đặc tả IPv4 trên
  Linux, cấu trúc địa chỉ và cách kernel xử lý.
