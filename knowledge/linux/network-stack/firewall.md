---
id: linux.network-stack.firewall
title: "Firewall trên Linux: iptables/nftables/firewalld/ufw cơ bản"
domain: linux
module: linux.network-stack
level: "vận hành"
prerequisites: ["linux.network-stack.tools"]
applies_to:
  - "Ubuntu 22.04 LTS — nftables là backend kernel mặc định (iptables-nft tương thích ngược qua cùng backend), ufw là frontend quản lý của Ubuntu/Debian"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man8/iptables.8.html"
  - "https://manpages.debian.org/bookworm/nftables/nft.8.en.html"
  - "https://manpages.ubuntu.com/manpages/jammy/en/man8/ufw.8.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Bài `networking.nat-firewall.firewall-concepts` đã học KHÁI NIỆM firewall (stateful vs
stateless, thứ tự rule). Bài này đi vào CÔNG CỤ CỤ THỂ trên Linux — hiện có 4 công cụ phổ biến
cùng tồn tại (`iptables`, `nftables`, `firewalld`, `ufw`), dễ gây nhầm lẫn vì chúng không độc
lập mà XẾP TẦNG lên nhau. Một SE cần biết công cụ nào đang THỰC SỰ áp dụng rule trên một máy cụ
thể trước khi debug "vì sao traffic bị chặn" — sửa nhầm tầng (ví dụ sửa trực tiếp `nftables`
trong khi `ufw` đang quản lý) dễ bị GHI ĐÈ lại ở lần `ufw reload` tiếp theo.

> **Lưu ý:** máy viết bài không có quyền sudo không-mật-khẩu, nên MỌI lệnh THAY ĐỔI hoặc ĐỌC
> rule firewall (`iptables -L`, `nft list ruleset`, `ufw status`, `firewall-cmd`) đều báo lỗi
> thiếu quyền — các ví dụ output của riêng những lệnh này trong bài là **output minh hoạ** theo
> man page chính thức, đánh dấu rõ. Các lệnh ĐỌC kernel state KHÔNG cần sudo
> (`/proc/sys/net/ipv4/ip_forward`, `lsmod`, file cấu hình `/etc/default/ufw`) chạy THẬT.

## 2. Khái niệm cốt lõi

**Quan hệ xếp tầng giữa 4 công cụ** (từ THẤP lên CAO):

```
kernel netfilter (nf_tables)
        ↑
    nftables (nft) ←── iptables-nft (lệnh iptables cũ, dịch sang nf_tables ở backend)
        ↑
    firewalld / ufw  (frontend quản lý rule ở mức cao, sinh ra rule nft/iptables bên dưới)
```

**`iptables`** (trên Ubuntu 22.04 là `iptables-nft`, KHÔNG phải backend `iptables-legacy` cũ):
cú pháp cổ điển, tổ chức theo CHAIN (`INPUT`/`OUTPUT`/`FORWARD`) và TABLE (`filter`/`nat`...).

**`nftables`**: framework THAY THẾ `iptables` ở tầng kernel, cú pháp MỚI, gọn hơn, hỗ trợ set/
map (nhóm nhiều giá trị match trong 1 rule) — là backend THẬT SỰ xử lý packet trên kernel hiện
đại, dù người dùng gõ lệnh `iptables` hay `nft`.

**`ufw`** (Uncomplicated Firewall — mặc định trên Ubuntu/Debian) và **`firewalld`** (mặc định
trên RHEL/Fedora): đều là FRONTEND quản lý ở mức CAO — người dùng gõ rule đơn giản
(`ufw allow 22/tcp`), frontend tự SINH RA rule `nftables`/`iptables` tương ứng bên dưới. Không
nên sửa trực tiếp rule `nft`/`iptables` khi đang dùng `ufw`/`firewalld` quản lý — lần
`reload`/`restart` tiếp theo của frontend có thể GHI ĐÈ mất thay đổi thủ công đó.

## 3. Cách nó hoạt động

**`ip_forward=0` (mặc định) khiến máy KHÔNG chuyển tiếp packet giữa các interface, bất kể rule
firewall cho phép gì** — đây là điều kiện CẦN đã học ở `networking.nat-firewall.nat-types` khi
giải thích NAT, áp dụng chung cho MỌI firewall Linux làm vai trò router/NAT: dù rule `FORWARD`/
forward chain cho phép traffic, kernel vẫn DROP nếu `ip_forward` chưa bật ở tầng thấp hơn rule.

**`ufw`/`firewalld` không "thay thế" `nftables`, mà SINH RA rule `nftables` — kiểm tra bằng
`nft list ruleset` vẫn thấy được rule thật, dù người quản lý chỉ gõ lệnh `ufw`** — hiểu đúng
điều này giúp debug đúng tầng: nếu `ufw allow` không có hiệu lực như mong đợi, kiểm tra TIẾP
bằng `nft list ruleset` để xem rule THẬT đã được sinh ra đúng chưa, không chỉ tin vào output của
`ufw status` (có thể đúng về Ý ĐỊNH nhưng sai ở BƯỚC DỊCH sang rule thật).

**Thứ tự rule quyết định kết quả (first-match-wins), đã học ở `networking.nat-firewall`, áp
dụng NGUYÊN VẸN cho cả `iptables`/`nftables`** — một rule DENY đặt TRƯỚC một rule ALLOW tổng
quát hơn (ví dụ) vẫn thắng nếu nó khớp trước, dù rule ALLOW "có vẻ" đúng ý định hơn — đọc rule
theo ĐÚNG THỨ TỰ xuất hiện, không theo độ "quan trọng" cảm nhận.

## 4. Thực hành

Đọc trạng thái kernel liên quan tới firewall/forwarding — chạy THẬT, không cần sudo:

```bash
$ cat /proc/sys/net/ipv4/ip_forward
0
```

`0` — máy này KHÔNG được cấu hình làm router/NAT, đúng với vai trò máy desktop thông thường.

```bash
$ lsmod | grep -E "nf_tables|nf_conntrack|iptable"
nf_tables             380928  0
libcrc32c              12288  1 nf_tables
nfnetlink              20480  1 nf_tables
```

`nf_tables` đã load (framework nftables đang hoạt động ở tầng kernel) — nhưng `nf_conntrack`
KHÔNG xuất hiện trong kết quả này, nghĩa là module theo dõi connection state (stateful) CHƯA
được load VÀO LÚC KIỂM TRA — chỉ xác nhận "chưa thấy load", không chứng minh "sẽ không bao giờ
load" (module có thể được load theo yêu cầu khi cần, giống lưu ý đã rút ra ở module
`networking.nat-firewall`).

Đọc cấu hình mặc định của `ufw` (file cấu hình đọc được không cần sudo, dù lệnh `ufw status`
CẦN sudo):

```bash
$ cat /etc/default/ufw | grep -i default_
DEFAULT_INPUT_POLICY="DROP"
DEFAULT_OUTPUT_POLICY="ACCEPT"
DEFAULT_FORWARD_POLICY="DROP"
DEFAULT_APPLICATION_POLICY="SKIP"
```

Đọc: policy mặc định của `ufw` trên Ubuntu là DROP mọi INPUT/FORWARD không khớp rule nào (chặn
theo mặc định, chỉ cho phép traffic đã CHO PHÉP rõ ràng — đúng nguyên tắc "deny by default" đã
học ở `networking.nat-firewall.firewall-concepts`), nhưng ACCEPT mọi OUTPUT (máy được tự do kết
nối RA ngoài).

Các lệnh dưới đây báo lỗi THẬT khi chạy không có sudo trên máy demo (xác nhận giới hạn quyền,
không phải minh hoạ):

```bash
$ sudo -n ufw status
sudo: a password is required
$ nft list ruleset
Operation not permitted (you must be root)
```

> Phần dưới đây là **output minh hoạ** theo cú pháp man page chính thức (`ufw(8)`, `nft(8)`),
> không chạy được trên máy demo.

Cho phép SSH, xem trạng thái (`ufw` — minh hoạ):

```
$ sudo ufw allow 22/tcp
Rule added
Rule added (v6)

$ sudo ufw status verbose
Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), disabled (routed)

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
22/tcp (v6)                ALLOW IN    Anywhere (v6)
```

Xem rule THẬT mà `ufw` đã sinh ra ở tầng `nftables` (`nft` — minh hoạ, xác nhận đúng mục 3: ufw
chỉ là frontend sinh rule nft):

```
$ sudo nft list ruleset | grep -A3 "chain ufw-user-input"
	chain ufw-user-input {
		tcp dport 22 accept
		...
	}
```

## 5. Lỗi thường gặp và cách chẩn đoán

**`ufw allow <port>` xong nhưng traffic vẫn bị chặn**
- Nguyên nhân khả năng cao: `ufw` chưa thực sự `enable` (service có thể cài sẵn nhưng chưa bật),
  hoặc rule bị một rule KHÁC đứng trước ghi đè (first-match-wins).
- Cách xác nhận: `sudo ufw status` xem "Status: active" chưa; nếu active, kiểm tra tiếp
  `sudo nft list ruleset` xem rule thật đã sinh đúng và đúng THỨ TỰ chưa.
- Cách xử lý: `sudo ufw enable` nếu chưa active; nếu rule đã đúng nhưng vẫn bị chặn, kiểm tra
  rule đứng TRƯỚC trong chain có DENY/REJECT khớp trước không.

**Sửa trực tiếp rule bằng `nft`/`iptables` trên máy đang dùng `ufw` quản lý, thay đổi "biến
mất" sau một thời gian**
- Nguyên nhân: `ufw reload`/restart (hoặc reboot) tự sinh lại TOÀN BỘ rule từ cấu hình của nó
  (`/etc/ufw/*.rules`), GHI ĐÈ mất thay đổi thủ công ở tầng `nft`/`iptables` không được `ufw`
  biết tới.
- Cách xác nhận: so sánh rule trước/sau một lần `ufw reload` — thay đổi thủ công sẽ mất.
- Cách xử lý: luôn sửa qua `ufw` (hoặc thêm rule tuỳ biến vào file cấu hình của `ufw`, ví dụ
  `/etc/ufw/before.rules`) khi `ufw` đang là công cụ quản lý chính — không sửa trực tiếp tầng
  dưới.

**NAT/forward không hoạt động dù rule `FORWARD`/`nftables` đã đúng**
- Nguyên nhân: `ip_forward=0` — điều kiện CẦN ở tầng kernel, độc lập với rule firewall (đã học
  ở mục 3 và `networking.nat-firewall.nat-types`).
- Cách xác nhận: `cat /proc/sys/net/ipv4/ip_forward` — nếu `0`, xác nhận đúng nguyên nhân.
- Cách xử lý: `sudo sysctl -w net.ipv4.ip_forward=1` (tạm thời) hoặc sửa
  `/etc/sysctl.conf`/`/etc/sysctl.d/` (vĩnh viễn, cần `sysctl -p` hoặc reboot để áp dụng).

## 6. Tình huống thực tế

Một server Ubuntu mới setup, team cấu hình `ufw allow 443/tcp` để mở HTTPS, nhưng health check
từ load balancer vẫn báo "connection timeout":

1. `sudo ufw status verbose` — xác nhận rule `443/tcp ALLOW IN` đã có và `Status: active`. Loại
   trừ được nguyên nhân "ufw chưa bật" hoặc "quên thêm rule".
2. Kiểm tra service có thực sự LISTEN trên port 443 chưa — `ss -tln | grep 443` (đã học ở
   `linux.network-stack.tools`) — PHÁT HIỆN: service KHÔNG LISTEN port 443 (service lỗi khi
   start, hoặc đang LISTEN port khác). Đây là nguyên nhân THẬT, không liên quan gì tới firewall.
3. Kết luận quan trọng cho tư duy debug: `ufw`/firewall CHỈ kiểm soát traffic được PHÉP đi qua,
   không đảm bảo có service nào đang LẮNG NGHE ở đầu nhận — hai vấn đề HOÀN TOÀN khác nhau,
   nhưng triệu chứng quan sát được từ bên ngoài ("connection timeout"/"connection refused") dễ
   khiến người debug nhảy thẳng vào kiểm tra firewall trước, bỏ qua bước xác nhận service có
   đang chạy đúng không.
4. Sửa lỗi service (đúng cấu hình bind port), restart, `ss -tln | grep 443` xác nhận LISTEN
   đúng.
5. Test lại từ load balancer — thành công. Thêm vào checklist debug "connection timeout": LUÔN
   kiểm tra `ss -tln` (service có LISTEN không) TRƯỚC khi đi sâu vào kiểm tra rule firewall —
   thứ tự kiểm tra từ GẦN ứng dụng nhất ra ngoài, không ngược lại.

## 7. Tự kiểm tra

1. `ufw`/`firewalld` có "thay thế" `nftables` không, hay quan hệ giữa chúng là gì?
   <details><summary>Đáp án</summary>Không thay thế — <code>ufw</code>/<code>firewalld</code>
   là FRONTEND ở mức cao, tự SINH RA rule <code>nftables</code>/<code>iptables</code> thật bên
   dưới. Kiểm tra <code>nft list ruleset</code> vẫn thấy rule thật dù chỉ dùng lệnh
   <code>ufw</code>.</details>

2. Rule `FORWARD` cho phép traffic đi qua, nhưng NAT vẫn không hoạt động. Điều kiện tầng THẤP
   HƠN nào cần kiểm tra?
   <details><summary>Đáp án</summary><code>/proc/sys/net/ipv4/ip_forward</code> — nếu
   <code>0</code>, kernel không chuyển tiếp packet giữa interface bất kể rule firewall cho phép
   gì. Đây là điều kiện CẦN độc lập, ở tầng thấp hơn rule firewall.</details>

3. Vì sao không nên sửa trực tiếp rule `nft`/`iptables` trên một máy đang dùng `ufw` quản lý?
   <details><summary>Đáp án</summary>Vì <code>ufw</code> tự sinh lại TOÀN BỘ rule từ cấu hình
   của chính nó mỗi khi <code>reload</code>/restart — thay đổi thủ công ở tầng
   <code>nft</code>/<code>iptables</code> mà <code>ufw</code> không biết tới sẽ bị GHI ĐÈ mất ở
   lần reload tiếp theo.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.network-stack.tools` — `ss -tln` dùng để phân biệt "service không LISTEN" với "bị
  firewall chặn" ở mục 6.
- `linux.network-stack.troubleshooting` — tiếp tục chẩn đoán sâu hơn khi cả service LISTEN
  đúng và firewall đúng nhưng vẫn không kết nối được (MTU, bonding...).

**Bài liên quan ngoài module:**
- `networking.nat-firewall.firewall-concepts`/`.nat-types` — khái niệm stateful/thứ tự rule/
  `ip_forward` mà bài này áp dụng cụ thể vào công cụ Linux.

**Nguồn tham khảo:**
- [iptables(8) — man7.org](https://man7.org/linux/man-pages/man8/iptables.8.html) — cú pháp
  chain/table cổ điển.
- [nft(8) — manpages.debian.org](https://manpages.debian.org/bookworm/nftables/nft.8.en.html) —
  cú pháp nftables hiện đại.
- [ufw(8) — manpages.ubuntu.com](https://manpages.ubuntu.com/manpages/jammy/en/man8/ufw.8.html) —
  `allow`/`status`/policy mặc định.
