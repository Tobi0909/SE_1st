---
id: sre.incident-response.roles
title: "Vai trò trong incident: Incident Commander, Scribe"
domain: sre
module: sre.incident-response
level: "chuyên sâu"
prerequisites: ["sre.incident-response.process"]
applies_to:
  - "Nguyên lý chung; tham chiếu Google SRE Book và PagerDuty Incident Response Process"
status: verified
sources:
  - "https://sre.google/sre-book/managing-incidents/"
  - "https://response.pagerduty.com/before/different_roles/"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Trong incident nhỏ (1-2 người), ai làm gì thường tự phân công được. Khi incident leo thang —
thêm team, thêm stakeholder, kéo dài nhiều tiếng — không có vai trò rõ ràng thì mọi người đều
làm mọi thứ: kỹ sư vừa debug vừa trả lời câu hỏi của CEO vừa cập nhật status page. Kết quả:
không ai làm tốt cái gì cả.

Phân vai không phải bureaucracy của công ty lớn — là cơ chế để mỗi người tập trung vào đúng
nhiệm vụ, giảm cognitive load, tăng tốc độ phối hợp.

## 2. Khái niệm cốt lõi

Google SRE gọi đây là **"Recursive Separation of Responsibilities"** — chia trách nhiệm rõ
ràng để trao quyền tự chủ cho từng người trong phạm vi của họ.

**5 vai trò cốt lõi** (không phải lúc nào cũng cần đủ 5 người — 1 người có thể kiêm nhiệm):

| Vai trò | Tập trung vào | Không làm |
|---------|--------------|-----------|
| **Incident Commander (IC)** | Điều phối toàn bộ | Trực tiếp sửa hệ thống |
| **Ops Lead** | Thực thi thay đổi kỹ thuật | Điều phối comm, quyết định scope |
| **Scribe** | Ghi chép timeline | Phán đoán kỹ thuật |
| **Subject Matter Expert (SME)** | Tư vấn domain cụ thể | Tự ý thay đổi ngoài phạm vi IC phân công |
| **Communications Lead** | Giao tiếp ngoài | Kỹ thuật chi tiết |

## 3. Cách nó hoạt động

### Incident Commander (IC)

IC là **single source of truth** về trạng thái hiện tại của incident và bước tiếp theo. IC:
- Mở incident doc, set severity, assign vai trò
- Phân công nhiệm vụ cụ thể cho Ops và SME
- Quyết định escalate thêm ai
- Quyết định khi nào incident resolved
- **Không** trực tiếp sửa hệ thống — làm vậy là bỏ trống ghế IC

Phong cách IC hiệu quả: ngắn gọn, trực tiếp. Không phải "Bạn có thể kiểm tra cái gì đó không?",
mà là "A, kiểm tra Nginx error log trên server prod-web-01 và cho tôi biết trong 3 phút."

**IC không cần là kỹ sư giỏi nhất team** — IC cần biết hỏi ai, quyết định nhanh, và giữ bình
tĩnh dưới áp lực. Kỹ sư giỏi nhất nên là SME hoặc Ops.

### Ops Lead

Ops Lead là người **duy nhất thực hiện thay đổi hệ thống** trong incident (trừ khi IC ủy quyền
rõ ràng cho người khác). Mọi thay đổi đều report lại cho IC và ghi vào incident doc.

Ops report về IC theo format **CAN** (từ PagerDuty IRP):
- **C**ondition: "payment-service đang trả 503, tất cả pod đang Restart"
- **A**ctions: "đang rollback từ v2.4.0 về v2.3.9"
- **N**eeds: "cần xác nhận từ IC trước khi tôi restart database"

Format này giúp IC nắm trạng thái nhanh mà không cần giải thích dài.

### Scribe

Scribe ghi lại **mọi sự kiện quan trọng** vào incident doc theo timestamp:

```
09:42 - Alert fire: payment error_rate 5.2%
09:44 - [tên A] khai báo P1, [tên B] là IC, [tên C] là Ops
09:47 - Ops xác nhận: payment-service v2.4.0 deploy lúc 09:30 (B)
09:48 - IC yêu cầu rollback (A)
09:51 - Rollback xong, monitoring error_rate
09:54 - error_rate < 0.1%, service phục hồi (C)
09:55 - IC khai báo resolved
```

Scribe không cần giỏi kỹ thuật — cần gõ nhanh và theo dõi sát cuộc gọi. Timeline này là nguyên
liệu thô quan trọng nhất cho postmortem sau này.

### Subject Matter Expert (SME)

SME là kỹ sư có kiến thức sâu về một service/component cụ thể. IC gọi SME vào khi không tự
xác định được scope: "Đây có phải vấn đề của database không?"

SME:
- Chẩn đoán nhanh trong domain của mình
- Report kết quả về IC theo format CAN
- **Không tự ý thay đổi** — đề xuất với IC, đợi phê duyệt

Thường một SME có thể handle nhiều service liên quan. Cần nhiều SME chỉ khi incident span nhiều
domain độc lập.

### Communications Lead

Trong P1/P2, có người chuyên lo giao tiếp ngoài giúp IC và Ops tập trung hoàn toàn vào kỹ
thuật:
- **Internal**: cập nhật management và team không liên quan mỗi 30-60 phút
- **External**: draft status page update, customer email — IC chỉ cần review và approve

Nếu không có Comms Lead riêng, IC kiêm — nhưng cần conscious scheduling: "Cứ mỗi 30 phút tôi
sẽ gửi update, không trả lời ping liên tục."

## 4. Thực hành

**Template phân công vai trò** (thêm vào đầu incident doc):

```
## Incident #042 — Payment service down
Khai báo: 2026-10-07T09:44+07:00 | Severity: P1

Vai trò:
- IC: [tên A]
- Ops: [tên B]  
- Scribe: [tên C]
- SME/DB: [tên D] (nếu cần)
- Comms: [tên A kiêm] (IC kiêm nếu không có người riêng)

Kênh incident: #incident-042 (Slack/Teams)
```

**Rotation IC** trong incident dài (> 4 giờ):

```
# IC cũ chuyển giao cho IC mới — nói rõ ràng, không ngầm định
IC cũ: "A, tôi bàn giao IC cho bạn. Trạng thái hiện tại: [summary].
        Đang chờ kết quả từ B về database replication lag.
        Bạn có xác nhận nhận IC không?"
IC mới: "Xác nhận. Tôi là IC từ 14:00."
```

Handoff phải explicit — không bao giờ "tôi mệt rồi, A tiếp đi" rồi offline.

## 5. Lỗi thường gặp và cách chẩn đoán

**IC tự tay sửa hệ thống** — IC đang debug thì không ai đang coordinate. Ai quyết định
escalate? Ai biết trạng thái tổng thể? Nếu IC là kỹ sư giỏi nhất, giao IC cho người khác,
để kỹ sư giỏi nhất làm Ops.

**SME không report về IC** — SME tự ý restart service, fix xong mới báo. IC không biết trạng
thái thật sự, không thể điều phối. Quy tắc: mọi thay đổi phải được IC biết trước hoặc ngay sau.

**Không có Scribe** — incident kéo dài 4 tiếng, không ai ghi. Postmortem sau đó dựa vào trí
nhớ mờ nhạt của 5 người — kết quả là timeline không chính xác, action item thiếu.

**"Mọi người cần IC là kỹ sư giỏi nhất"** — nhầm lẫn này khiến kỹ sư giỏi nhất bị ghim vào
vai IC thay vì thực sự sửa vấn đề. IC cần kỹ năng điều phối và quyết định, không nhất thiết
là domain expert.

## 6. Tình huống thực tế

**Tình huống**: 5 người trong war room (3 online, 2 onsite), incident P1 database primary down.
Không ai tự nhận IC.

Dấu hiệu nguy hiểm: mọi người đang cùng lúc connect vào database, ai cũng hỏi "đã thử cái
này chưa?", không ai ghi chép. Đây là **bystander effect trong incident** — ai cũng nghĩ người
khác đang coordinate.

**Giải pháp**: senior nhất (hoặc on-call của hệ thống) nói thẳng:

```
"Tôi là IC cho incident này. B là Ops — chỉ B được thực hiện thay đổi DB.
C là Scribe — ghi lại mọi thứ vào doc. D và E là SME — cho tôi biết
CAN của DB primary và replica trong 5 phút."
```

Phân công xong trong 60 giây, mọi người có nhiệm vụ rõ ràng.

## 7. Tự kiểm tra

**Câu 1**: Tại sao IC không nên trực tiếp thực hiện thay đổi kỹ thuật trên hệ thống?

a) Vì IC không có quyền SSH vào server production  
b) Vì khi IC tự fix thì không còn ai giữ bức tranh toàn cảnh, điều phối escalation, và quyết định  
c) Vì IC cần tránh trách nhiệm pháp lý cho thay đổi  
d) Vì thay đổi phải được ít nhất 2 người thực hiện cùng lúc

**Đáp án: b** — IC là người duy nhất giữ toàn bộ bức tranh: ai đang làm gì, trạng thái từng
component, khi nào cần thêm người, khi nào resolved. Khi IC tự tay sửa hệ thống, IC rơi vào
trạng thái focus hẹp của kỹ sư debug — bỏ trống vai trò điều phối. Không ai biết tình trạng
tổng thể, escalation không được quyết định, comms trở nên im lặng.

---

**Câu 2**: Format CAN report có nghĩa là gì và ai dùng nó?

a) Create, Archive, Notify — dùng bởi Comms Lead  
b) Condition, Actions, Needs — dùng bởi Ops/SME để report ngắn gọn về IC  
c) Check, Analyze, Neutralize — dùng bởi IC để ra quyết định  
d) Code, Admin, Network — phân loại loại vấn đề kỹ thuật

**Đáp án: b** — CAN là Condition (trạng thái hiện tại), Actions (đang làm gì), Needs (cần gì từ
IC). Ops và SME dùng format này để brief IC trong vài câu ngắn — IC nhận đủ thông tin để quyết
định mà không phải hỏi thêm. Ví dụ: "DB replica lag 45 phút (C), đang check binlog (A), cần IC
quyết định có promote replica không (N)."

---

**Câu 3**: Trong incident P1 kéo dài 6 tiếng, IC cần làm gì khi muốn nghỉ?

a) Offline mà không cần thông báo vì đã có team  
b) Nhờ người khác làm IC từ từ trong vòng 30 phút  
c) Explicit handoff: nói rõ cho IC mới về trạng thái, đang chờ gì, và IC mới xác nhận nhận  
d) Ghi chú vào doc rồi offline là đủ

**Đáp án: c** — Handoff IC phải explicit và bilateral: IC cũ mô tả trạng thái đầy đủ, IC mới
xác nhận bằng lời/text "Tôi xác nhận nhận IC từ [thời điểm]." Silent handoff — chỉ ghi doc hay
ngầm định "A tiếp đi" — tạo khoảng trống không có IC, đặc biệt nguy hiểm trong incident đang
diễn ra. Google SRE Book nhấn mạnh rõ ràng handoff protocol.

---

**Câu 4**: Scribe cần kỹ năng gì nhất?

a) Hiểu sâu về hệ thống để ghi chính xác nguyên nhân kỹ thuật  
b) Theo dõi nhanh và ghi timestamp chính xác cho mọi sự kiện quan trọng  
c) Biết viết postmortem để có thể kết hợp ghi chép và phân tích  
d) Có quyền truy cập vào tất cả hệ thống để verify thông tin trước khi ghi

**Đáp án: b** — Scribe cần gõ nhanh, tập trung vào cuộc gọi, và ghi timestamp chính xác — không
phải hiểu sâu kỹ thuật. Thực tế, Scribe không cần verify thông tin kỹ thuật — chỉ cần ghi đúng
những gì người khác nói và làm. Chính xác về kỹ thuật là trách nhiệm của Ops/SME; Scribe là
recorder trung thực, không phải analyst.

---

**Câu 5**: "Bystander effect" trong incident response là gì?

a) Các engineer bên ngoài team bị ảnh hưởng không chịu tham gia incident  
b) Khi nhiều người có mặt nhưng không ai tự nhận vai trò, mọi người đều cho rằng người khác đang coordinate  
c) Người dùng tự xử lý vấn đề thay vì báo cáo  
d) SME tham gia incident mà không có IC mời

**Đáp án: b** — Bystander effect (từ tâm lý học xã hội) xảy ra khi trách nhiệm phân tán: khi
nhiều người có mặt, từng cá nhân ít có khả năng chủ động hành động, vì nghĩ người khác sẽ làm.
Trong incident có 5+ người không có IC rõ ràng, ai cũng chờ ai đó khai báo IC — kết quả là mất
5-10 phút quý báu. Giải pháp: on-call của service bị ảnh hưởng tự động là IC mặc định cho đến
khi có người khác nhận.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước trong module:**
- `sre.incident-response.process` — vòng đời incident, severity, detection, triage, mitigation

**Bài liên quan ngoài module (xem thêm):**
- `sre.postmortem.writing` — sau incident: viết postmortem blameless với timeline từ Scribe
- `monitoring.alerting-design.principles` — alert tốt giúp Detection nhanh, giảm MTTA
- `sre.change-management.process` — thay đổi có kiểm soát giảm xác suất incident do deploy

**Nguồn tham khảo:**
- [Google SRE Book — Managing Incidents](https://sre.google/sre-book/managing-incidents/)
- [PagerDuty Incident Response — Roles](https://response.pagerduty.com/before/different_roles/)
