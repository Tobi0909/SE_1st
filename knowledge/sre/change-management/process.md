---
id: sre.change-management.process
title: "Quản lý thay đổi: change request, kế hoạch rollback"
domain: sre
module: sre.change-management
level: "vận hành"
prerequisites: []
applies_to:
  - "Nguyên lý chung; tham chiếu Google SRE Book (Release Engineering) và ITIL 4 change management"
status: draft
sources:
  - "https://sre.google/sre-book/release-engineering/"
  - "https://sre.google/sre-book/embracing-risk/"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Nghiên cứu của Google SRE và nhiều tổ chức khác đều chỉ ra cùng một điều: **phần lớn incident
production được gây ra bởi một thay đổi** — deploy code, thay đổi config, scale-up, migration
schema, cập nhật dependency. "If it ain't broke, don't fix it" không phải lựa chọn vì business
luôn cần tính năng mới. Nhưng không kiểm soát cách thay đổi xảy ra thì mỗi deploy đều là roulette.

Change management không phải bureaucracy để làm chậm team — mà là **hệ thống để deploy nhanh và
an toàn**: biết mình đang thay đổi gì, có kế hoạch nếu hỏng, và mọi người liên quan đều biết.

## 2. Khái niệm cốt lõi

**Phân loại thay đổi** (theo ITIL 4, được SRE team nhiều tổ chức áp dụng):

| Loại | Định nghĩa | Ví dụ | Quy trình |
|------|-----------|-------|-----------|
| **Standard** | Rủi ro thấp, đã được pre-approve, lặp đi lặp lại | Rotate secret, bump minor version đã kiểm | Tự làm, ghi log |
| **Normal** | Cần review, schedule trước | Deploy feature mới, schema migration | RFC → review → approve → deploy |
| **Emergency** | Cần làm ngay, không kịp quy trình thường | Hotfix P1 đang incident | Deploy → retrospective sau |

**Request for Change (RFC)** — tài liệu mô tả thay đổi trước khi thực hiện. RFC tốt trả lời:
1. **Thay đổi gì?** — service/component/version nào, commit nào
2. **Rủi ro là gì?** — điều gì có thể sai, xác suất và impact
3. **Rollback plan là gì?** — cụ thể làm gì nếu hỏng, trong bao lâu
4. **Ai cần biết?** — team bị ảnh hưởng, on-call, stakeholder
5. **Verify thành công bằng cách nào?** — metric nào, endpoint nào, trong bao lâu

**Error budget và change freeze** (từ Google SRE Book): khi team đang burn error budget (SLO vi
phạm hoặc gần vi phạm), ngừng deploy tính năng mới cho đến khi reliability phục hồi. Deploy trong
lúc đang có vấn đề = xếp chồng rủi ro.

**Change window** — khung thời gian cho phép deploy. Chọn window khi traffic thấp nhất, team đủ
người trực, không gần sự kiện lớn. Ví dụ: 10:00-16:00 Thứ 2-4, tránh 17:00+ và thứ 6.

## 3. Cách nó hoạt động

### RFC tối giản nhưng đủ

Không cần form phức tạp — một RFC có thể chỉ là comment trong ticket deployment:

```
## RFC: Deploy payment-service v2.5.0
**Thay đổi**: payment-service 2.4.1 → 2.5.0 (commit a1b2c3d)
**Nội dung**: thêm retry logic cho card expired, fix race condition trong refund flow
**Rủi ro**: medium — thay đổi logic payment quan trọng; đã test trên staging 2 ngày

**Rollback plan**:
- Nếu error_rate > 1% trong 10 phút đầu: rollback về 2.4.1 ngay
- Lệnh: kubectl rollout undo deployment/payment-service -n production
- Thời gian rollback: ~3 phút (từ lần trước đo được)

**Verify thành công**:
- error_rate < 0.1% sau 15 phút
- latency p99 < 500ms
- Chạy thủ công 5 test payment qua staging card

**Ai biết**: on-call B, payment team, product manager C
**Thời gian deploy**: Thứ 3, 14:00 (traffic thấp nhất theo Grafana)
```

### Rollback plan — không được mơ hồ

Rollback plan thường gặp tệ nhất: **"Rollback nếu có vấn đề."** Quá mơ hồ — vấn đề gì? Làm
rollback như thế nào? Trong bao lâu? Ai quyết định?

Rollback plan tốt cần:
- **Trigger rõ ràng**: "error_rate > 1%" hay "latency p99 > 2s kéo dài 5 phút" — không phải
  "nếu có vấn đề"
- **Lệnh cụ thể**: copy-paste được, không phải "chạy rollback script"
- **Time budget**: "nếu sau 30 phút chưa ổn định, trigger rollback" — không phải vô thời hạn
- **Owner**: ai ra quyết định rollback nếu engineer triển khai không có mặt

### Progressive rollout — giảm blast radius

Thay vì deploy 100% traffic cùng lúc, deploy theo phần nhỏ dần:

```
Canary: 1% traffic → quan sát 10 phút
Stage 1: 10% → quan sát 15 phút
Stage 2: 50% → quan sát 15 phút
Full: 100%
```

Nếu bất kỳ stage nào có metric xấu, rollback chỉ ảnh hưởng phần đã deploy. Google SRE gọi đây
là "exponential rollout starting from one cluster."

### Post-change verification

Sau deploy, không tuyên bố thành công ngay. Verify chủ động trong 15-30 phút:

```bash
# Kiểm tra deployment đã rollout xong (output minh họa — kubectl cần cluster thật)
kubectl rollout status deployment/payment-service -n production --timeout=120s

# Kiểm tra HTTP health endpoint sau deploy (chạy thật với example.com)
for i in 1 2 3; do
  curl -s -o /dev/null -w "Try $i: HTTP %{http_code} | %{time_total}s\n" https://example.com
  sleep 5
done
```

## 4. Thực hành

**Review thay đổi trước khi deploy** (chạy thật):

```bash
# Xem log commit sẽ được deploy
git log --oneline HEAD~5..HEAD
```

Kết quả thực tế:

```
8935073 knowledge: thêm module sre.postmortem (1 bài)
616c75e knowledge: thêm module sre.incident-response (2 bài)
b7ff68c knowledge: thêm module security.identity-secrets (2 bài)
eb0f0b3 knowledge: thêm module security.os-hardening (2 bài)
75b30bd knowledge: thêm module devops.terraform (2 bài)
```

Trong deployment pipeline thực, lệnh này cho thấy chính xác những gì sẽ lên production — dễ
catch "ơ có commit X cũng sẽ lên cùng, commit đó đã test chưa?".

**Template checklist deploy** (lưu trong wiki team, dùng trước mỗi deploy):

```markdown
## Deploy Checklist — [service] [version]

Trước deploy:
- [ ] RFC đã được review bởi ít nhất 1 người khác
- [ ] Staging đã test ít nhất 1 ngày
- [ ] Rollback plan đã xác định lệnh cụ thể + trigger
- [ ] On-call biết về deploy này
- [ ] Change window phù hợp (không peak, không thứ 6 chiều)

Trong deploy:
- [ ] Monitoring dashboard mở sẵn
- [ ] Rollback lệnh copy sẵn vào clipboard
- [ ] Không làm việc khác song song

Sau deploy (15 phút):
- [ ] Error rate bình thường
- [ ] Latency p99 trong ngưỡng
- [ ] Không có log bất thường
- [ ] Tuyên bố deploy thành công trong channel incident
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Deploy vào thứ 6 chiều** — nếu có vấn đề, team không đủ người trực cuối tuần, rollback quyết
định chậm. Nhiều team áp dụng hard rule: không deploy code sau 15:00 thứ 6.

**Rollback chưa bao giờ được test** — team nghĩ biết rollback nhưng khi cần thì gặp lỗi không
biết fix. Quy tắc: mỗi deployment pipeline nên test rollback path ít nhất một lần trước khi cần
dùng thật. Thêm smoke test rollback vào staging flow.

**"Chỉ là config change nhỏ thôi"** — config change thường không có code review, không có staging,
deploy trực tiếp. Config sai giá trị timeout, tắt nhầm feature flag — đây là nguyên nhân của nhiều
P1 "không ngờ tới". Config change cần cùng quy trình với code change.

**Không thông báo trước khi deploy** — on-call đang investigate metric lạ, thực ra là người khác
đang deploy. Mất 20 phút "debugging" phantom problem. Quy tắc: luôn post vào channel on-call trước
khi bắt đầu deploy.

## 6. Tình huống thực tế

**Tình huống**: Team muốn deploy feature phân tích tín dụng mới cho payment service vào thứ 2.

**RFC tốt** (được viết thứ 5 tuần trước):

```
## RFC: Deploy credit-scoring-v2 cho payment-service
Thay đổi: thêm module credit-scoring, payment-service 3.1.0 → 3.2.0
Rủi ro: HIGH — chạm vào logic quyết định credit limit, lỗi = từ chối đơn hàng sai
Staging: test 3 ngày, 200 test case, 0 failure

Rollback: nếu credit_denial_rate tăng > 2× baseline trong 15 phút đầu
→ kubectl rollout undo deployment/payment-service -n prod (đã test, ~4 phút)
→ Owner rollback: B (on-call thứ 2)

Verify: credit_denial_rate ≈ baseline ± 10% sau 30 phút, không có error log mới

Deploy window: Thứ 2, 11:00-13:00 (traffic thấp nhất của tuần theo Grafana 4 tuần gần nhất)
Notify: #on-call #payment-team #product
```

**Kết quả**: Deploy thứ 2, 11:15. 11:45 — credit_denial_rate ổn, latency không đổi. 11:50 — B
tuyên bố deploy thành công trong #on-call. Không incident.

Nếu không có RFC, deploy lúc 17:00 thứ 6, và rollback plan là "rollback nếu có vấn đề" — khả
năng cao đây sẽ trở thành postmortem tuần sau.

## 7. Tự kiểm tra

**Câu 1**: Phân loại nào sau đây là "emergency change" theo ITIL 4?

a) Deploy tính năng mới đã được test kỹ trên staging 2 tuần  
b) Rotate API key định kỳ theo lịch tháng  
c) Hotfix tắt tính năng đang gây P1 incident hiện tại, không kịp qua quy trình thường  
d) Schema migration đã lên kế hoạch 3 tuần trước

**Đáp án: c** — Emergency change là thay đổi cần thực hiện ngay lập tức vì rủi ro không hành động
lớn hơn rủi ro của việc bỏ qua quy trình thường. Trong incident P1, mỗi phút có thêm user bị ảnh
hưởng — đây là tình huống emergency change điển hình. Sau đó viết retrospective/postmortem. Đáp án
a là normal change, b là standard change, d là normal change.

---

**Câu 2**: Rollback plan nào dưới đây là đủ tốt?

a) "Rollback về version trước nếu có vấn đề sau deploy"  
b) "Nếu error_rate > 2% trong 10 phút sau deploy: chạy `kubectl rollout undo deployment/payment -n prod`, thông báo #on-call, owner: B"  
c) "DevOps team sẽ handle rollback nếu cần"  
d) "Hỏi tech lead trước rồi quyết định"

**Đáp án: b** — Rollback plan tốt phải có trigger cụ thể (error_rate > 2%), lệnh chính xác (không
phải "chạy script rollback"), thời gian kích hoạt (trong 10 phút), và owner rõ tên người. Ba đáp
án còn lại đều mơ hồ: không biết khi nào rollback, không biết làm gì cụ thể, hoặc không biết ai
ra quyết định. Dưới áp lực incident, mơ hồ = chậm trễ = downtime kéo dài.

---

**Câu 3**: Theo Google SRE, khi nào nên ngừng deploy tính năng mới?

a) Khi team đang bận sprint planning  
b) Khi đang burn error budget hoặc SLO đang bị vi phạm  
c) Khi có hơn 2 engineer vắng mặt  
d) Khi production đang có hơn 5 deploy pending

**Đáp án: b** — Error budget là cơ chế của SRE để cân bằng velocity và reliability. Khi SLO bị
vi phạm (đang burn qua budget), mỗi deploy thêm đều xếp chồng rủi ro lên hệ thống đang không ổn.
Google SRE Book: error budget cạn → freeze new features, tập trung vào reliability work. Đây là
cơ chế tự động đặt ra giới hạn tốc độ thay đổi dựa trên dữ liệu thực tế, không phải cảm tính.

---

**Câu 4**: Tại sao "progressive rollout" (canary → 10% → 50% → 100%) tốt hơn deploy toàn bộ cùng lúc?

a) Vì hệ thống CI/CD không hỗ trợ deploy toàn bộ cùng lúc  
b) Vì giảm blast radius: nếu có lỗi, chỉ phần nhỏ user bị ảnh hưởng trong khi rollback nhanh hơn  
c) Vì phân phối tải deploy đều hơn cho hệ thống  
d) Vì các deployment tool yêu cầu progressive deploy theo standard

**Đáp án: b** — Progressive rollout giảm blast radius: khi 1% canary gặp lỗi, 99% user không bị
ảnh hưởng, và rollback 1% cực nhanh. Deploy toàn bộ cùng lúc = toàn bộ user cùng bị ảnh hưởng
nếu có lỗi. Google SRE gọi đây là "exponential rollout" — bắt đầu từ cluster nhỏ, quan sát, rồi
mở rộng dần. Trade-off: deploy mất thời gian hơn, nhưng safer cho critical services.

---

**Câu 5**: Config change (thay đổi cấu hình, không phải code) nên được đối xử như thế nào trong change management?

a) Nhẹ hơn code change vì không cần build/deploy  
b) Nhanh hơn code change vì không cần test  
c) Cùng quy trình với code change — review, staging test, rollback plan  
d) Chỉ cần thông báo sau khi thay đổi xong

**Đáp án: c** — Config change là nguồn gây incident thường bị đánh giá thấp vì không cần CI/CD.
Nhưng config sai (timeout quá thấp, tắt nhầm circuit breaker, connection pool quá nhỏ) có thể gây
P1 chỉ sau vài giây áp dụng. Thiếu code review + thiếu staging test = không ai catch lỗi trước
khi lên production. Cùng quy trình với code change là nguyên tắc tối giản nhưng hiệu quả.

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan:**
- `sre.incident-response.process` — khi change management thất bại: incident response là tuyến phòng thủ tiếp theo
- `sre.postmortem.writing` — sau incident từ bad change: bài học để cải thiện quy trình
- `devops.cicd.concepts` — pipeline là nơi thực thi change management: gating, staging, rollback
- `monitoring.sli-slo.error-budget` — error budget quyết định khi nào được/không được deploy

**Nguồn tham khảo:**
- [Google SRE Book — Release Engineering](https://sre.google/sre-book/release-engineering/)
- [Google SRE Book — Embracing Risk (Error Budget)](https://sre.google/sre-book/embracing-risk/)
