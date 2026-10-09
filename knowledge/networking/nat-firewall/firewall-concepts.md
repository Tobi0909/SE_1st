---
id: networking.nat-firewall.firewall-concepts
title: "Firewall: stateful vs stateless, zone, thứ tự rule"
domain: networking
module: networking.nat-firewall
level: "vận hành"
prerequisites: ["networking.nat-firewall.nat-types"]
applies_to:
  - "Linux netfilter (iptables/nftables), firewalld, ufw — Ubuntu 22.04 LTS"
status: verified
sources:
  - "https://www.netfilter.org/projects/nftables/manpage.html"
  - "https://man7.org/linux/man-pages/man8/iptables.8.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** thêm/sửa rule firewall thật cần quyền root — máy viết bài
> không có sudo không-mật-khẩu. Lệnh THAY ĐỔI rule đánh dấu **output minh hoạ** theo tài liệu
> chính thức (netfilter.org). Lệnh ĐỌC trạng thái kernel hiện tại chạy thật.

## 1. Vì sao cần biết

"Rule đã thêm đúng cú pháp, test vẫn không có tác dụng" là một trong những sự cố firewall gây
nhiều thời gian debug nhất — thường không phải vì rule SAI, mà vì THỨ TỰ rule sai, hoặc nhầm
lẫn giữa firewall STATEFUL (tự nhớ kết nối) và STATELESS (xét từng gói độc lập). Hiểu đúng ba
khái niệm — stateful/stateless, zone, và thứ tự xử lý rule — là nền tảng để viết firewall rule
ĐÚNG Ý ĐỊNH ngay từ đầu, không phải thử-sai nhiều lần.

## 2. Khái niệm cốt lõi

| Khái niệm | Ý nghĩa |
|---|---|
| Stateful firewall | Nhớ TRẠNG THÁI kết nối (qua conntrack) — tự cho phép traffic PHẢN HỒI của một kết nối đã được phép |
| Stateless firewall | Xét MỖI gói ĐỘC LẬP, không nhớ gì — phải tự khai báo rule cho CẢ hai chiều |
| Zone (firewalld) | Nhóm interface theo MỨC ĐỘ TIN CẬY (ví dụ `public`, `internal`, `trusted`), mỗi zone có bộ rule riêng |
| Policy mặc định (default policy) | Hành vi áp dụng khi KHÔNG rule nào khớp (`ACCEPT` hoặc `DROP`) |

Nguyên tắc thứ tự: hầu hết firewall (iptables, nftables) xử lý rule THEO THỨ TỰ TỪ TRÊN XUỐNG,
DỪNG NGAY khi gặp rule ĐẦU TIÊN khớp (trừ khi rule đó dùng target không chung cục như `LOG`).

## 3. Cách nó hoạt động

**Stateful tiết kiệm công sức đáng kể — chỉ cần khai báo CHIỀU ĐI, chiều VỀ tự động được
phép**: với firewall stateful (mặc định của iptables/nftables hiện đại qua module conntrack),
một rule `ct state established,related accept` cho phép TOÀN BỘ traffic PHẢN HỒI của bất kỳ
kết nối đã được chấp nhận trước đó — không cần viết rule riêng cho traffic đi VỀ. Ngược lại,
firewall STATELESS (ví dụ Network ACL kiểu AWS — xem bài tiếp theo trong module) phải khai báo
CẢ HAI chiều tường minh: cho phép request VÀO port 80 KHÔNG tự động cho phép response TỪ port
80 đi RA — phải thêm rule riêng cho chiều đó.

**Thứ tự rule quyết định kết quả — rule ĐỨNG TRƯỚC thắng, dù rule sau "đúng hơn" về mặt logic**:
nếu rule 1 là `DROP all from 192.168.1.0/24` và rule 2 (ĐỨNG SAU) là `ACCEPT from 192.168.1.5`,
traffic từ `192.168.1.5` VẪN BỊ DROP — vì khớp rule 1 TRƯỚC, firewall dừng xử lý ngay, không
bao giờ chạy tới rule 2. Đây là lỗi cực kỳ phổ biến: thêm rule "ngoại lệ" cụ thể nhưng đặt SAU
rule tổng quát đã chặn từ trước — phải đặt rule NGOẠI LỆ (cụ thể hơn) TRƯỚC rule tổng quát.

**Zone (firewalld) giải quyết vấn đề "một máy có nhiều interface, mỗi interface mức tin cậy
khác nhau"**: một server có thể có interface nối mạng NỘI BỘ (tin cậy cao, có thể cho phép
nhiều traffic hơn) VÀ interface nối Internet (tin cậy thấp, cần chặt chẽ hơn) — firewalld cho
phép gán MỖI interface vào một ZONE riêng (`internal`, `public`...), mỗi zone có bộ rule độc
lập, thay vì phải viết rule phức tạp dựa theo interface trong một bộ rule chung duy nhất (cách
làm "thủ công" hơn của iptables/nftables truyền thống).

## 4. Thực hành

Kiểm tra trạng thái module conntrack (nền tảng của stateful firewall) đang hoạt động —
**lưu ý**: trên máy viết bài, module `nf_conntrack` CHƯA được load (do chưa có rule nào dùng
tới), chạy thật để xác nhận đúng trạng thái HIỆN TẠI (không phải lúc nào cũng sẵn sàng):

```bash
$ lsmod | grep -E 'nf_tables|nf_conntrack'
nf_tables             380928  0
libcrc32c              12288  2 nf_tables,sctp
nfnetlink              20480  1 nf_tables
```

Chỉ `nf_tables` (framework chung) và các module phụ trợ của nó được load — dòng `nf_conntrack`
KHÔNG xuất hiện trong kết quả (đã lọc rõ cả hai pattern cùng lúc), xác nhận máy này hiện KHÔNG
có bất kỳ rule firewall nào đang dùng connection tracking (đúng với một máy desktop không
tự cấu hình firewall riêng ngoài mặc định hệ thống).

Tạo firewall stateful cơ bản bằng `nft` — **output minh hoạ** theo đúng cú pháp chính thức
(netfilter.org), minh hoạ CẢ nguyên tắc thứ tự VÀ stateful:

```bash
$ nft add table inet myfilter
$ nft add chain inet myfilter input { type filter hook input priority 0 \; policy drop \; }

# Rule 1: cho phép traffic PHẢN HỒI của kết nối đã thiết lập (ĐẶT ĐẦU — áp dụng cho MỌI traffic về)
$ nft add rule inet myfilter input ct state established,related accept

# Rule 2: cho phép SSH mới (New connection) — chỉ cần khai báo CHIỀU ĐẾN
$ nft add rule inet myfilter input tcp dport 22 ct state new accept

# Policy drop (đã khai báo ở chain) tự động áp dụng cho MỌI thứ không khớp 2 rule trên
```

Xem toàn bộ ruleset hiện tại (**output minh hoạ**, cần root thật):

```bash
$ nft list ruleset
table inet myfilter {
	chain input {
		type filter hook input priority filter; policy drop;
		ct state established,related accept
		tcp dport 22 ct state new accept
	}
}
```

Minh hoạ lỗi THỨ TỰ sai (rule tổng quát chặn đứng TRƯỚC rule ngoại lệ) — **output minh hoạ**:

```bash
# SAI thứ tự — traffic từ 192.168.1.5 vẫn bị DROP dù có rule ACCEPT phía sau
$ nft add rule inet myfilter input ip saddr 192.168.1.0/24 drop
$ nft add rule inet myfilter input ip saddr 192.168.1.5 accept   # KHÔNG BAO GIỜ được chạy tới
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Thêm rule ACCEPT cho một IP cụ thể, đặt SAU rule DROP tổng quát đã chặn dải đó, rule không có
tác dụng**
- Nguyên nhân: đúng lỗi thứ tự đã minh hoạ ở mục 4 — firewall dừng xử lý ngay khi khớp rule
  DROP đứng trước, không bao giờ "nhìn thấy" rule ACCEPT phía sau.
- Cách xác nhận: đổi thứ tự (đặt ACCEPT TRƯỚC DROP) và test lại — nếu hoạt động đúng, xác
  nhận chính xác nguyên nhân là thứ tự.
- Cách xử lý: luôn đặt rule CỤ THỂ HƠN (ngoại lệ) TRƯỚC rule TỔNG QUÁT HƠN trong cùng một
  chain.

**Mở port cho request VÀO nhưng response không gửi được ra, trên firewall STATELESS (ví dụ
Network ACL)**
- Nguyên nhân: stateless không tự nhớ kết nối — mở port 80 chiều VÀO không tự động mở chiều RA
  cho response, khác hẳn hành vi stateful đã quen (mục 3).
- Cách xác nhận: traffic request tới được đích (xem bằng `tcpdump`) nhưng không có packet
  response đi ra được ghi nhận.
- Cách xử lý: với firewall stateless, PHẢI khai báo rule RIÊNG cho CẢ hai chiều — không trông
  chờ hành vi "tự động cho phép về" như stateful.

**Service mới deploy không truy cập được, firewall "không có rule nào chặn" theo kiểm tra ban
đầu**
- Nguyên nhân phổ biến: POLICY MẶC ĐỊNH của chain là `DROP`/`REJECT`, và chưa có rule ACCEPT
  tường minh cho service mới — không phải "có rule chặn", mà là THIẾU rule cho phép, rơi vào
  policy mặc định.
- Cách xác nhận: `nft list chain inet myfilter input` (hoặc tương đương) xem dòng `policy` của
  chain.
- Cách xử lý: thêm rule ACCEPT tường minh cho port/service mới, đặt TRƯỚC vị trí mà traffic đó
  sẽ "rơi" vào policy mặc định.

## 6. Tình huống thực tế

Một server mới cấu hình firewall bằng `nftables`, team báo "SSH vẫn vào được nhưng HTTP (port
80) không truy cập được dù đã thêm rule ACCEPT cho port 80".

1. `nft list ruleset` — xem toàn bộ chain, phát hiện thứ tự:
   ```
   ip saddr 203.0.113.0/24 drop
   tcp dport 80 accept
   tcp dport 22 accept
   ```
2. Xác nhận: IP của người đang test (`203.0.113.45`) rơi vào dải `203.0.113.0/24` bị DROP ở
   rule ĐẦU — traffic HTTP từ IP này KHÔNG BAO GIỜ chạy tới được rule `tcp dport 80 accept` phía
   sau, dù rule đó hoàn toàn đúng cú pháp.
3. Giải thích vì sao SSH "vẫn vào được": người quản trị đang SSH từ một IP KHÁC (không thuộc
   dải `203.0.113.0/24` bị chặn) — không phải vì SSH "miễn" khỏi rule DROP, chỉ là tình cờ
   không khớp rule đó.
4. Xác nhận ý định ban đầu của rule DROP (có thể là chặn một dải IP đáng ngờ cụ thể, không
   liên quan gì tới việc chặn HTTP) — sắp xếp lại: đặt rule `tcp dport 80 accept` TRƯỚC rule
   DROP dải IP (nếu ý định là "luôn cho phép HTTP công khai, riêng dải IP đó mới cần chặn các
   loại traffic khác"), hoặc làm rõ dải IP đó có thực sự cần chặn CẢ HTTP không.
5. Test lại sau khi sắp xếp đúng thứ tự — HTTP truy cập được từ mọi nguồn hợp lệ, dải IP đáng
   ngờ vẫn bị chặn cho các traffic khác theo đúng ý định.
6. Ghi vào runbook: khi thêm rule mới, LUÔN xem lại TOÀN BỘ ruleset theo đúng THỨ TỰ (không chỉ
   xem rule mới thêm có đúng cú pháp không) — một rule đúng cú pháp vẫn có thể vô dụng nếu đặt
   sai vị trí so với rule khác.

## 7. Tự kiểm tra

1. Firewall có 2 rule theo thứ tự: (1) `drop from 10.0.0.0/8`, (2) `accept from 10.0.5.20`.
   Traffic từ `10.0.5.20` có được accept không?
   <details><summary>Đáp án</summary>Không — traffic này khớp rule (1) TRƯỚC (vì
   <code>10.0.5.20</code> thuộc dải <code>10.0.0.0/8</code>) và bị drop ngay, không bao giờ
   được xét tới rule (2) phía sau.</details>

2. Trên firewall STATEFUL, bạn chỉ cần một rule `ct state established,related accept` để cho
   phép response của MỌI kết nối đã được chấp nhận, không cần khai báo riêng từng chiều. Vì
   sao điều này KHÔNG áp dụng được cho firewall STATELESS?
   <details><summary>Đáp án</summary>Stateless không có khái niệm "connection tracking" — mỗi
   gói được xét ĐỘC LẬP, không nhớ gói nào thuộc kết nối nào. Phải khai báo tường minh rule cho
   CẢ hai chiều (vào và ra) vì không có cơ chế tự động nhận biết "đây là response của một kết
   nối đã cho phép".</details>

3. Chain firewall có `policy drop` và KHÔNG có rule nào khớp một loại traffic cụ thể. Traffic
   đó bị xử lý thế nào?
   <details><summary>Đáp án</summary>Bị DROP — khi không rule nào khớp, traffic rơi vào
   POLICY MẶC ĐỊNH của chain (ở đây là <code>drop</code>). Đây không phải "không có rule nên
   được phép", mà ngược lại.</details>

4. Vì sao firewalld dùng khái niệm "zone" thay vì chỉ một bộ rule chung cho mọi interface?
   <details><summary>Đáp án</summary>Một máy có thể có nhiều interface với MỨC ĐỘ TIN CẬY khác
   nhau (ví dụ interface nội bộ vs interface ra Internet) — zone cho phép gán mỗi interface
   vào một mức tin cậy riêng, mỗi zone có bộ rule độc lập, tránh phải viết rule phức tạp dựa
   theo interface trong một bộ rule chung.</details>

5. Một rule ACCEPT mới thêm cho port 443 "không có tác dụng" dù cú pháp đúng. Hai hướng kiểm
   tra ĐẦU TIÊN hợp lý nhất là gì?
   <details><summary>Đáp án</summary>(1) Kiểm tra THỨ TỰ — có rule nào đứng TRƯỚC đã chặn/xử lý
   traffic đó trước khi tới được rule mới thêm không; (2) kiểm tra rule mới có được thêm vào
   ĐÚNG chain/table (ví dụ đúng hướng input/output/forward) không — một rule đúng cú pháp nhưng
   ở sai chain không có tác dụng cho traffic mong muốn.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `networking.nat-firewall.nat-types` — rule FORWARD cho traffic đã NAT cần tuân theo đúng
  nguyên tắc stateful/thứ tự đã học ở bài này.
- `networking.nat-firewall.acl-security-groups` — so sánh sâu hơn firewall stateful (security
  group) với ACL stateless trên môi trường cloud.

**Nguồn tham khảo:**
- [nftables man page — netfilter.org](https://www.netfilter.org/projects/nftables/manpage.html)
  — cú pháp chính thức table/chain/rule, `ct state`.
- [iptables(8) — man7.org](https://man7.org/linux/man-pages/man8/iptables.8.html) — khái niệm
  chain, policy mặc định, thứ tự xử lý rule.
