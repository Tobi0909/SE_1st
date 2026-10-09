---
id: sre.postmortem.writing
title: "Viết postmortem blameless: timeline, root cause, action item"
domain: sre
module: sre.postmortem
level: "chuyên sâu"
prerequisites: ["sre.incident-response.process"]
applies_to:
  - "Nguyên lý chung; ví dụ tham chiếu Google SRE Book và mẫu postmortem thực tế"
status: verified
sources:
  - "https://sre.google/sre-book/postmortem-culture/"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Mỗi incident P1/P2 đều là cơ hội học: hệ thống có lỗ hổng gì, quy trình nào bị thiếu, giả định
nào bị sai. Nhưng cơ hội đó chỉ được khai thác nếu team ngồi lại phân tích đúng cách — không phải
để tìm người có lỗi, mà để tìm điều kiện nào khiến hệ thống dễ bị hỏng.

Google SRE tóm gọn triết lý này bằng một câu: **"The cost of failure is education."** (Devin
Carraway). Không viết postmortem = bỏ phí học phí đắt nhất có thể.

Ngược lại, postmortem viết sai — đổ lỗi cho cá nhân, action item không có người nhận, không ai
đọc lại — còn tệ hơn không viết: tạo ảo giác "đã xử lý" trong khi vấn đề gốc rễ vẫn còn đó,
chờ tái hiện lần sau.

## 2. Khái niệm cốt lõi

**Blameless postmortem** — phân tích incident không quy kết lỗi cho cá nhân. Nguyên tắc: mọi
người trong incident đều có good intentions và ra quyết định tốt nhất với thông tin họ có lúc đó.
Nếu một kỹ sư deploy code lỗi lúc 2 giờ sáng gây P1, câu hỏi đúng không phải "tại sao anh A
careless?" mà là "quy trình deploy nào cho phép code chưa test lên production lúc 2 giờ sáng?".

**Khi nào viết postmortem?** (theo Google SRE):
- User bị ảnh hưởng rõ ràng (downtime, data loss, degradation vượt ngưỡng)
- On-call engineer phải can thiệp thủ công (rollback, reroute traffic)
- Thời gian giải quyết vượt SLO đã định
- Monitoring không phát hiện được (engineer tình cờ phát hiện)
- Bất kỳ stakeholder nào yêu cầu

**Mục tiêu của postmortem không phải là root cause** — "root cause" là một fiction. Incident thực
tế luôn có **nhiều contributing factors** đan xen: code bug + deploy lúc cao điểm + alert không
nhạy + runbook thiếu bước + on-call mới chưa quen hệ thống. Tìm "one root cause" và fix nó rồi
tuyên bố xong là bỏ sót phần còn lại.

## 3. Cách nó hoạt động

### Cấu trúc postmortem chuẩn

| Mục | Nội dung | Ghi chú |
|-----|----------|---------|
| **Summary** | 3-5 dòng mô tả incident, impact, và resolution | Người không biết gì cũng hiểu được |
| **Timeline** | Mọi sự kiện quan trọng theo thứ tự thời gian | Từ Scribe's notes; ISO 8601 |
| **Impact** | Số user, service, doanh thu bị ảnh hưởng; thời gian | Cụ thể, có số liệu |
| **Contributing factors** | Các điều kiện cho phép incident xảy ra | Không phải "ai sai" |
| **Root cause analysis** | 5 whys hoặc fault tree cho từng factor | Kỹ thuật đào sâu |
| **Action items** | Việc cần làm, có chủ sở hữu và deadline | SMART, track trong issue tracker |
| **Lessons learned** | Điều gì đã hoạt động tốt, điều gì chưa | Bao gồm cả tích cực |

### Xây dựng timeline từ Scribe's notes

Timeline là phần quan trọng nhất và khó làm nhất. Nguyên liệu thô là notes của Scribe trong
incident — đây là lý do Scribe phải ghi timestamp chính xác cho mọi sự kiện.

Từ notes thô, timeline của postmortem cần:
- **Mốc bắt đầu thật sự**: khi nào hệ thống bắt đầu bất thường (không phải khi alert fire — có
  thể alert fire muộn hơn sự cố thật 5-10 phút)
- **Đầy đủ sự kiện kỹ thuật** (deploy, config change, traffic spike) trước incident
- **Mỗi quyết định** được đưa ra và tại sao (information available at that time)
- **Thời điểm phát hiện** vs thời điểm resolution (gap = MTTR)

```
# Ví dụ timeline tốt
02:10 - payment-service v2.4.0 deploy (commit 7a3f9c2, CI xanh)
02:23 - error_rate bắt đầu tăng từ 0.1% → 0.8% (chưa vượt ngưỡng alert)
02:31 - error_rate vượt 3%, Alertmanager fire "payment_high_error_rate"
02:33 - B (on-call) nhận PagerDuty alert, check Grafana dashboard
02:35 - B khai báo P1, tạo incident doc, ping IC (A)
02:38 - A xác nhận payment-service v2.4.0 là thay đổi gần nhất
02:39 - A quyết định rollback về v2.3.9 (không debug tiếp — 8 phút downtime rồi)
02:43 - Rollback xong, error_rate về 0.05%
02:45 - A khai báo incident resolved

# MTTA: 02:31 → 02:33 = 2 phút | MTTR: 02:31 → 02:45 = 14 phút
```

### 5 Whys — kỹ thuật đào contributing factors

5 Whys là hỏi "tại sao?" lặp đi lặp lại tới khi không còn "why?" có ý nghĩa nữa:

```
Why 1: Tại sao payment service trả 503?
→ Memory leak trong v2.4.0 làm pod OOMKilled sau ~13 phút

Why 2: Tại sao code có memory leak được merge?
→ Code review không phát hiện vì reviewer không quen phần code đó

Why 3: Tại sao reviewer không quen code đó?
→ Payment service do một người chính viết, không có cross-training

Why 4: Tại sao không có cross-training?
→ Team không có quy trình onboarding kỹ thuật cho payment service

Why 5: Tại sao deploy không bị chặn bởi integration test?
→ Integration test cho memory usage chưa được viết
```

Kết quả: không phải 1 root cause mà **3 contributing factors** cần action item riêng:
- Thiếu cross-training trên payment service
- Thiếu integration test cho memory usage
- Alert ngưỡng quá cao (13 phút memory leak mới fire)

### Action items — chất lượng hơn số lượng

Action item tốt cần:
- **Chủ sở hữu cụ thể** (tên người, không phải "team backend")
- **Deadline** (ngày thật, không phải "sớm thôi")
- **Priority** (P1 action items block tái diễn → ưu tiên cao)
- **Trackable** (ticket trong issue tracker, không phải chỉ trong doc)

```
# Action item TỐT
- [ ] Viết integration test kiểm tra memory không vượt 512MB sau 100 req liên tục
      Owner: A | Deadline: 2026-10-14 | Priority: High | Ticket: INFRA-1042

# Action item TỆ
- [ ] Cải thiện quy trình code review
      (không rõ ai làm, làm gì cụ thể, khi nào xong)
```

## 4. Thực hành

**Tính MTTA và MTTR** từ timestamp trong timeline (chạy thật):

```bash
# Tính số giây giữa 2 timestamp ISO 8601
python3 -c "
from datetime import datetime
alert = datetime.fromisoformat('2026-10-07T02:31:00+07:00')
ack   = datetime.fromisoformat('2026-10-07T02:33:00+07:00')
resolved = datetime.fromisoformat('2026-10-07T02:45:00+07:00')
print(f'MTTA: {int((ack-alert).total_seconds()//60)} phút')
print(f'MTTR: {int((resolved-alert).total_seconds()//60)} phút')
"
```

Kết quả thực tế:

```
MTTA: 2 phút
MTTR: 14 phút
```

Script này giúp tính MTTA/MTTR chính xác từ bất kỳ cặp timestamp nào trong timeline, không cần
tính tay (dễ sai khi qua nửa đêm).

**Template action item tracking** trong incident doc:

```markdown
## Action Items

| ID | Mô tả | Owner | Deadline | Priority | Ticket | Status |
|----|-------|-------|----------|----------|--------|--------|
| A1 | Integration test memory ≤ 512MB sau 100 req | A | 2026-10-14 | High | INFRA-1042 | Open |
| A2 | Cross-training: B và C làm quen payment service code | B | 2026-10-28 | Med | INFRA-1043 | Open |
| A3 | Hạ alert threshold error_rate từ 3% xuống 1% | C | 2026-10-10 | High | MON-234 | Open |
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Timeline "quá sạch"** — viết lại theo kết quả biết sau, không phải quyết định thật lúc đó.
Ví dụ: "02:39 — B rollback để fix memory leak" (nhưng lúc 02:39 B chưa biết là memory leak — chỉ
biết rollback có thể giúp). Timeline tốt phản ánh **information available at each moment**, không
phải hindsight.

**Chỉ tìm một root cause** — "root cause là memory leak trong v2.4.0" rồi close postmortem. Bỏ
sót: tại sao code review không bắt? tại sao không có integration test? tại sao alert ngưỡng cao
vậy? Fix một điểm, 3 điểm còn lại vẫn đang chờ incident tiếp theo.

**Action items không có deadline/owner** — trong postmortem review meeting mọi người agree thật,
nhưng không ai theo dõi. 3 tháng sau cũng không xong. Action item không có owner thật sự là
không có action item.

**Viết postmortem ngay trong incident** — quá sớm, thông tin chưa đủ. Thời điểm lý tưởng: 24-48
giờ sau incident, khi team đã ngủ đủ giấc và có thể suy nghĩ rõ ràng hơn.
<!-- TODO-VERIFY: khung "24-48 giờ" là convention phổ biến trong SRE community; Google SRE Book không chỉ rõ số giờ cụ thể — verify qua PagerDuty IRP hoặc nguồn chính thức khác -->

## 6. Tình huống thực tế

**Tình huống**: Tiếp nối incident từ bài `sre.incident-response.process` — payment service v2.4.0
rollback lúc 02:43, incident resolved 02:45. Hôm sau, A (IC) viết postmortem.

**Phần contributing factors** của postmortem đó:

```
## Contributing Factors

1. **Memory leak trong payment-service v2.4.0** [immediate cause]
   - NewRelic sau đó xác nhận: goroutine leak trong HTTP client pool, xuất hiện
     dưới load > 50 req/giây. CI chỉ test với 10 req/giây.

2. **Alert ngưỡng 3% error_rate quá cao** [detection delay]
   - Từ lúc error_rate > 0% (02:23) đến lúc alert fire (02:31): 8 phút user bị lỗi
     mà không có ai biết. Ngưỡng 1% sẽ cho phép detect sớm hơn ~5 phút.

3. **CI load test không cover production load pattern** [prevention gap]
   - Payment service nhận ~200 req/giây peak, CI chỉ test 10. Bug chỉ tái hiện ở ≥50.

## Action Items
A1: Hạ alert threshold → 1% | Owner: C | Due: 2026-10-09 | MON-234
A2: CI load test ≥ 100 req/giây cho payment-service | Owner: A | Due: 2026-10-16 | INFRA-1045
A3: Memory usage metric + alert cho pod restart | Owner: B | Due: 2026-10-14 | MON-235
```

Trong postmortem review meeting, team còn phát hiện thêm: không có ai rõ ràng là reviewer bắt buộc
cho payment-service code — A3 thêm thêm "cần ownership matrix cho các critical service".

## 7. Tự kiểm tra

**Câu 1**: "Blameless" trong blameless postmortem có nghĩa là gì?

a) Không ai bị phạt dù có lỗi rõ ràng — mọi mistake đều được bỏ qua  
b) Tập trung vào điều kiện hệ thống và quy trình cho phép incident xảy ra, thay vì quy kết cá nhân  
c) Giữ bí mật thông tin incident để không ai bị mất mặt  
d) Chỉ viết về lỗi hệ thống kỹ thuật, không đề cập quyết định của người

**Đáp án: b** — Blameless không có nghĩa là vô trách nhiệm hay bỏ qua lỗi. Có nghĩa là: khi kỹ
sư ra quyết định sai, câu hỏi đúng là "hệ thống, quy trình, thông tin nào khiến quyết định đó
có vẻ đúng lúc đó?" Tìm ra điều kiện đó → fix điều kiện đó. Nếu chỉ blaming cá nhân, người
tiếp theo ở cùng hoàn cảnh sẽ lặp lại quyết định tương tự.

---

**Câu 2**: Tại sao "root cause" thường là một cách nhìn không đầy đủ về incident?

a) Vì công cụ hiện tại không đủ khả năng tìm đúng root cause  
b) Vì incident thường có nhiều contributing factors đan xen, fix một cái không ngăn incident tái diễn  
c) Vì root cause thường nằm ở vendor/cloud provider ngoài tầm kiểm soát  
d) Vì tìm root cause mất quá nhiều thời gian, nên chỉ nên tìm immediate cause

**Đáp án: b** — Incident thực tế là hội tụ của nhiều điều kiện: lỗi code + deploy process lỏng +
alert không nhạy + on-call thiếu context. Nếu chỉ fix "lỗi code" (immediate cause), ba điều kiện
còn lại vẫn đang chờ incident tiếp theo với lỗi code khác kích hoạt. Postmortem tốt tìm và đánh
địa chỉ tất cả contributing factors có thể fix được.

---

**Câu 3**: Timeline trong postmortem nên phản ánh điều gì?

a) Trình tự đúng nhất theo phân tích sau sự kiện (hindsight)  
b) Information available at each moment — quyết định được đưa ra dựa trên thông tin có lúc đó, không phải kiến thức biết sau  
c) Chỉ các sự kiện kỹ thuật khách quan, không bao gồm quyết định con người  
d) Tóm tắt ngắn gọn để dễ đọc, bỏ bớt chi tiết không quan trọng

**Đáp án: b** — Giá trị của timeline là giúp team (và người đọc sau) hiểu: với thông tin X lúc
T1, người ra quyết định Y là hợp lý. Timeline "quá sạch" viết theo hindsight tạo ảo tưởng rằng
quyết định rõ ràng hơn thực tế, dễ dẫn đến blaming ("sao không biết mà rollback ngay?"). Timeline
trung thực là nền tảng của blameless culture.

---

**Câu 4**: Action item nào trong postmortem là đủ tốt?

a) "Cải thiện monitoring để phát hiện sự cố sớm hơn" — Owner: Team Ops  
b) "Viết alert rule error_rate > 1% cho payment-service, test với alertmanager-rules linter" — Owner: C — Due: 2026-10-10 — Ticket: MON-234  
c) "Fix memory leak trong payment-service" — đã xong qua rollback  
d) "Xem xét thêm integration test" — Owner: Tech Lead

**Đáp án: b** — Action item b có đủ 4 thành phần: mô tả cụ thể (rule nào, service nào, ngưỡng bao
nhiêu), owner rõ tên người, deadline ngày cụ thể, và ticket để track. Action item a quá chung
chung ("cải thiện" có nghĩa gì?). Action item c nhầm lẫn mitigation (rollback) với action item
ngăn tái diễn. Action item d thiếu deadline và mô tả mờ.

---

**Câu 5**: Khi nào là thời điểm tốt nhất để viết postmortem sau incident?

a) Ngay trong incident hoặc ngay sau khi resolved, khi mọi thứ còn nóng hổi  
b) 24-48 giờ sau incident, khi team đã nghỉ ngơi đủ và có thể suy nghĩ rõ ràng  
c) Cuối sprint tiếp theo, khi action items đã được estimate  
d) Sau khi toàn bộ action items từ postmortem đã xong

**Đáp án: b** — Viết ngay trong incident: quá sớm, thông tin chưa đầy đủ, team kiệt sức dễ bỏ
sót. Đợi quá lâu (cuối sprint, sau action items): chi tiết timeline mờ dần, khó reconstruct đúng.
24-48 giờ là balance: đủ để nghỉ ngơi và thu thập thêm data (log, metric), chưa mất chi tiết.
Scribe's notes từ incident là tài liệu thô quan trọng nhất trong giai đoạn này.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước trong chuỗi:**
- `sre.incident-response.process` — vòng đời incident, triage, mitigation; timeline raw từ Scribe
- `sre.incident-response.roles` — Scribe ghi notes là nguyên liệu thô quan trọng nhất cho postmortem

**Bài liên quan ngoài module:**
- `monitoring.alerting-design.principles` — alert threshold ảnh hưởng trực tiếp MTTA trong timeline
- `sre.change-management.process` — change management tốt giảm incident do deploy → ít postmortem hơn

**Nguồn tham khảo:**
- [Google SRE Book — Postmortem Culture: Learning from Failure](https://sre.google/sre-book/postmortem-culture/)
