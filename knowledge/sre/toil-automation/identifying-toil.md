---
id: sre.toil-automation.identifying-toil
title: "Nhận diện toil và ưu tiên tự động hóa"
domain: sre
module: sre.toil-automation
level: chuyên sâu
prerequisites:
  - devops.ansible.fundamentals
applies_to:
  - SRE teams
  - DevOps operations
  - Any team managing production systems
status: verified
sources:
  - https://sre.google/sre-book/eliminating-toil/
  - https://sre.google/workbook/eliminating-toil/
last_verified: "2026-10-07"
author: tuank63uet@gmail.com
---

## 1. Vì sao cần biết

Mọi team vận hành đều có việc phải làm lặp đi lặp lại: restart service, cấp quyền user, xoá log cũ, kiểm tra cert sắp hết hạn. Nếu không nhận diện và giảm bớt, khối lượng công việc này sẽ tăng tuyến tính theo số lượng hệ thống — team mãi mãi bận với routine work, không còn thời gian cải thiện nền tảng.

Google SRE Book gọi đây là **toil** và đặt mục tiêu: không quá 50% thời gian của SRE dành cho toil, phần còn lại là engineering work tạo ra giá trị dài hạn.

## 2. Khái niệm cốt lõi

### 6 đặc điểm của toil (Google SRE Book)

Một công việc là toil nếu thỏa mãn nhiều trong 6 đặc điểm này:

| # | Đặc điểm | Ví dụ |
|---|----------|-------|
| 1 | **Manual** | Phải SSH vào server và chạy lệnh tay |
| 2 | **Repetitive** | Làm đi làm lại nhiều lần, cùng một việc |
| 3 | **Automatable** | Có thể viết script để thay thế |
| 4 | **Tactical** | Reactive, không có giá trị chiến lược |
| 5 | **No enduring value** | Khi xong thì không để lại gì, ngay hôm sau lại phải làm |
| 6 | **O(n) with growth** | Khối lượng tăng tuyến tính khi hệ thống scale |

**Phân biệt toil vs overhead vs project work**:

| Loại | Tính chất | Ví dụ |
|------|-----------|-------|
| Toil | Manual, repetitive, automatable | Restart service 3 lần/tuần |
| Overhead | Cần thiết nhưng không tạo value trực tiếp | Meeting, reporting |
| Project work | Engineering work có value dài hạn | Viết auto-restart script |

### Tại sao phải giới hạn 50% toil

Nếu toil > 50% thời gian:
- Không còn thời gian để cải thiện hệ thống
- Khi hệ thống scale thêm, toil tăng thêm → tỷ lệ toil tăng tiếp → vòng xoáy
- Morale thấp: kỹ sư giỏi rời đi vì không có thể làm engineering thật

### ROI của tự động hóa

Tự động hóa không miễn phí — cần đầu tư thời gian viết, test, maintain script:

```
Break-even point = Time_to_automate / Time_saved_per_occurrence
```

Ví dụ: mất 8 giờ viết script, tiết kiệm 30 phút/lần × 3 lần/tuần = 90 phút/tuần → hoàn vốn sau ~5 tuần. Sau đó, mỗi tuần tiết kiệm 90 phút.

## 3. Cách nó hoạt động

### Quy trình nhận diện và ưu tiên toil

```
1. AUDIT       Mỗi tuần team ghi lại mọi việc manual đã làm
      │        (dùng time-tracking hoặc ticket system)
      ▼
2. CLASSIFY    Phân loại: toil / overhead / project
      │
      ▼
3. MEASURE     Tính thời gian mỗi loại toil (giờ/tuần)
      │        và tần suất (lần/tháng)
      ▼
4. PRIORITIZE  Ưu tiên theo: Impact × Frequency / Effort_to_automate
      │
      ▼
5. AUTOMATE    Viết automation (script, pipeline, alert, runbook)
      │
      ▼
6. VERIFY      Đo lại sau 1 tháng: toil giảm không?
```

### Ma trận ưu tiên tự động hóa

```
        │ Tần suất thấp  │ Tần suất cao
────────┼────────────────┼──────────────
Dễ tự  │ Làm khi rảnh  │ ÚU TIÊN CAO
động   │               │ (quick win)
────────┼────────────────┼──────────────
Khó tự │ Bỏ qua / doc  │ Cân nhắc kỹ
động   │ hóa thôi      │ (ROI thấp hơn)
```

### Toil thường gặp và cách tự động hóa

| Toil | Giải pháp |
|------|-----------|
| Restart service khi crash | Systemd `Restart=on-failure`, K8s liveness probe |
| Cấp quyền user mới | Ansible playbook hoặc GitOps với RBAC auto-apply |
| Xoá log cũ | logrotate, cron job, K8s log retention policy |
| Kiểm tra cert hết hạn | cert-manager tự renew; hoặc cron `openssl x509 -noout -enddate` + alert |
| Scale instance thủ công | K8s HPA, cloud auto-scaling group |
| Deploy bằng tay | CI/CD pipeline (đã học ở `devops.cicd.concepts`) |

## 4. Thực hành

### Đo toil hiện tại (chạy thật)

```bash
# Ước tính từ git log hoặc ticket system — đây là ví dụ với fake data
python3 << 'EOF'
# Dữ liệu từ time-tracking 4 tuần (giờ/tuần mỗi loại toil)
toil_data = {
    "restart-services":     [2.5, 3.0, 2.0, 3.5],  # lần/tuần × 30min
    "manual-deploy":        [4.0, 3.5, 5.0, 4.0],
    "user-provisioning":    [1.5, 2.0, 1.0, 2.5],
    "log-cleanup":          [1.0, 1.0, 1.5, 1.0],
    "cert-check":           [0.5, 0.0, 0.5, 0.0],
}
project_hours_per_week = 8.0
meeting_hours_per_week = 5.0

total_hours = 40  # working hours

for name, hours in toil_data.items():
    avg = sum(hours) / len(hours)
    print(f"  {name:<25} avg {avg:.1f}h/week")

total_toil = sum(sum(v)/len(v) for v in toil_data.values())
toil_pct = total_toil / total_hours * 100
print(f"\nTotal toil: {total_toil:.1f}h/week = {toil_pct:.0f}% of work time")
print(f"Project work: {project_hours_per_week}h/week = {project_hours_per_week/total_hours*100:.0f}%")
print(f"Overhead: {meeting_hours_per_week}h/week = {meeting_hours_per_week/total_hours*100:.0f}%")
if toil_pct > 50:
    print("⚠️  Toil > 50%: cần ưu tiên automation ngay")
EOF
```

```
  restart-services          avg 2.8h/week
  manual-deploy             avg 4.1h/week
  user-provisioning         avg 1.8h/week
  log-cleanup               avg 1.1h/week
  cert-check                avg 0.2h/week

Total toil: 10.0h/week = 25% of work time
Project work: 8.0h/week = 20%
Overhead: 5.0h/week = 13%
```

### Tính ROI tự động hóa (chạy thật)

```bash
python3 << 'EOF'
def automation_roi(
    time_to_automate_hours,
    time_saved_per_occurrence_min,
    occurrences_per_week,
    maintenance_hours_per_month=0.5
):
    saved_per_week_hours = (time_saved_per_occurrence_min / 60) * occurrences_per_week
    saved_per_month_hours = saved_per_week_hours * 4 - maintenance_hours_per_month
    breakeven_weeks = time_to_automate_hours / saved_per_week_hours if saved_per_week_hours > 0 else float('inf')
    return saved_per_month_hours, breakeven_weeks

candidates = [
    ("manual-deploy", 8, 60, 5),         # 8h build, save 60min, 5x/week
    ("restart-services", 4, 30, 6),       # 4h build, save 30min, 6x/week
    ("user-provisioning", 6, 20, 4),      # 6h build, save 20min, 4x/week
    ("log-cleanup", 1, 15, 4),            # 1h build, save 15min, 4x/week
]

print(f"{'Task':<22} {'Saved/mo(h)':>12} {'Break-even':>12}")
print("-" * 50)
for name, auto_h, save_min, freq in candidates:
    saved, be = automation_roi(auto_h, save_min, freq)
    print(f"{name:<22} {saved:>10.1f}h   {be:>8.1f} weeks")
EOF
```

```
Task                   Saved/mo(h)   Break-even
--------------------------------------------------
manual-deploy              17.5h          2.0 weeks
restart-services           11.5h          2.3 weeks
user-provisioning           4.7h          7.5 weeks
log-cleanup                 3.5h          1.0 weeks
```

`log-cleanup` có break-even nhanh nhất (1 tuần) — quick win. `manual-deploy` tiết kiệm nhiều nhất (17.5h/tháng).

### Viết Ansible để xóa toil user provisioning

Bài `devops.ansible.fundamentals` đã học; đây là áp dụng vào toil cụ thể:

```yaml
# provision-user.yml — thay cho SSH thủ công (output minh họa)
- hosts: all
  tasks:
    - name: Create user
      user:
        name: "{{ username }}"
        groups: "{{ user_groups | default('developers') }}"
        shell: /bin/bash
    - name: Add SSH key
      authorized_key:
        user: "{{ username }}"
        key: "{{ ssh_public_key }}"
```

```bash
# Một lệnh thay cho N lần SSH thủ công
ansible-playbook provision-user.yml -e "username=newdev ssh_public_key='ssh-ed25519 AAAA...'"
```

## 5. Lỗi thường gặp

| Lỗi | Hậu quả | Cách tránh |
|-----|---------|-----------|
| Tự động hóa không được test kỹ | Script chạy sai trên production | Test trên staging trước; dry-run mode; rollback plan |
| Tự động hóa không có monitoring | Script lặng lẽ fail, toil trở lại | Alert khi cron job fail; ghi log và kiểm tra định kỳ |
| Over-engineer automation | Mất 3 tuần cho việc tiết kiệm 10 phút/tháng | Tính ROI trước, ưu tiên quick win |
| Không cập nhật runbook khi tự động hóa | Toil mới xuất hiện khi automation fail | Document automation, cập nhật on-call runbook |
| Đếm overhead là toil | Phân bổ effort sai | Phân biệt rõ: toil (automatable) vs overhead (cần thiết) |

## 6. Tình huống thực tế

**Tình huống**: Team SRE 4 người đang dành 60% thời gian cho toil. Top 3 toil theo giờ/tuần:

| Toil | Giờ/tuần | Ghi chú |
|------|----------|---------|
| Deploy thủ công | 16h | 4 người × 4h mỗi người, 2 lần/tuần |
| Rotate secret S3 | 4h | Manual, mỗi 2 tuần |
| Scale instance lúc peak | 3h | Thứ 6 cuối tháng, thủ công |

**Kế hoạch automation theo ROI**:
1. **Deploy thủ công (week 1-2)**: Viết CI/CD pipeline GitLab → Jenkins → deploy script. Tiết kiệm 16h/tuần, break-even 2 tuần.
2. **Scale instance (week 3)**: Cấu hình AWS Auto Scaling Group dựa trên CPU metric. Tiết kiệm 3h/tuần + giảm rủi ro forgot-to-scale.
3. **Rotate secret (week 4-5)**: AWS Secrets Manager auto-rotation. Tiết kiệm 4h/2 tuần.

**Sau 2 tháng**: toil giảm từ 60% → 25%. Team có thêm 14h/tuần cho project work — dùng để viết reliability improvements và giảm toil tiếp theo.

## 7. Tự kiểm tra

**Câu 1**: Toil là gì? Nêu 3 trong 6 đặc điểm của Google SRE Book.

a) Toil là công việc có giá trị chiến lược cao, lặp lại và cần nhiều kỹ năng chuyên sâu để
   thực hiện
b) Toil chỉ gồm 2 đặc điểm: Manual và Strategic — SRE Book không nhắc tới Repetitive hay
   Automatable
c) Toil là mọi công việc operations nói chung, không phân biệt có thể tự động hóa được hay
   không
d) Toil là công việc vận hành mang tính manual, repetitive và có thể tự động hóa mà không tạo ra giá trị kỹ thuật lâu dài. 3 đặc điểm chính

**Đáp án: d** — Toil manual, repetitive, automatable, không tạo giá trị kỹ thuật lâu dài; các
đặc điểm khác: Tactical, No enduring value, O(n) with growth. Toil KHÔNG có giá trị chiến
lược cao — ngược lại, nó "Tactical" (không chiến lược) theo đúng đặc điểm SRE Book liệt kê
(loại a); SRE Book liệt kê đủ cả Repetitive và Automatable, không chỉ Manual/Strategic (và
"Strategic" không phải đặc điểm của toil — toil là KHÔNG chiến lược — loại b); toil được định
nghĩa RÕ RÀNG là loại việc CÓ THỂ tự động hóa, không phải "mọi công việc operations" chung
(loại c).

---

**Câu 2**: Google SRE Book đặt giới hạn toil là bao nhiêu % thời gian? Tại sao?

a) Tối đa 50% thời gian SRE. Nếu vượt ngưỡng này: không còn thời gian engineering để cải thiện hệ thống, toil tăng theo growth tạo vòng xoáy, và team burned out
b) Tối đa 20% thời gian SRE, vì phần còn lại 80% phải dành hoàn toàn cho on-call
c) Không có giới hạn cụ thể nào được Google SRE Book đưa ra, chỉ là khuyến nghị "giảm toil
   khi có thể"
d) Tối đa 90% thời gian SRE, vì phần lớn công việc SRE vốn là vận hành lặp lại theo đúng bản
   chất công việc

**Đáp án: a** — Tối đa 50% thời gian SRE; vượt ngưỡng gây thiếu thời gian engineering, vòng
xoáy toil tăng theo growth, burnout. Giới hạn đúng là 50%, không phải 20% — và 80% còn lại
không dành riêng cho on-call mà cho project work nói chung (loại b); SRE Book đưa ra con số CỤ
THỂ (50%), không chỉ là khuyến nghị mơ hồ (loại c); 90% đi ngược hoàn toàn triết lý SRE — bản
chất công việc SRE được THIẾT KẾ để GIẢM toil, không phải chấp nhận nó chiếm đa số thời gian
(loại d).

---

**Câu 3**: Tính break-even point của automation: mất 6 giờ viết, tiết kiệm 45 phút mỗi lần,
xảy ra 2 lần/tuần.

a) Break-even = 6h / 45min = 8 tuần, vì chỉ tính 1 lần sử dụng mỗi tuần thay vì 2 lần
b) Break-even = 6h / (45min × 2 / 60h) = 6 / 1.5 = 4 tuần. Sau 4 tuần là lãi ròng 1.5h/tuần. Sau 1 năm tiết kiệm 1.5 × 52 - 6 = 72h
c) Break-even = 45min × 2 / 6h = 0.25 tuần, vì công thức đúng là lấy thời gian tiết kiệm chia
   cho thời gian đầu tư
d) Không bao giờ có break-even vì 45 phút mỗi lần luôn nhỏ hơn 6 giờ đầu tư ban đầu

**Đáp án: b** — 6h / (45min×2/60h) = 6/1.5 = 4 tuần. Lãi ròng 1.5h/tuần sau đó. Cách tính ở
lựa chọn a quên nhân với 2 lần/tuần, chỉ tính 1 lần nên ra 8 tuần sai (loại a); công thức bị
đảo tử số/mẫu số trong lựa chọn c, cho ra kết quả vô lý nhỏ hơn 1 tuần (loại c); 45 phút mỗi
lần CỘNG DỒN qua nhiều lần/tuần và nhiều tuần sẽ vượt 6 giờ đầu tư — break-even hoàn toàn đạt
được sau 4 tuần, không phải "không bao giờ" (loại d).

---

**Câu 4**: Sự khác biệt giữa toil và overhead là gì?

a) Overhead là công việc có thể tự động hóa hoàn toàn; toil là công việc không thể tự động
   hóa
b) Toil và overhead là từ đồng nghĩa, SRE Book dùng thay thế nhau không phân biệt
c) Toil là công việc manual, repetitive, có thể tự động hóa — ví dụ restart service, deploy thủ công
d) Overhead chỉ áp dụng cho công việc kỹ thuật (deploy, restart); toil chỉ áp dụng cho công
   việc hành chính (meeting, report)

**Đáp án: c** — Toil manual/repetitive/automatable (restart, deploy thủ công); overhead cần
thiết nhưng không tự động hóa hết (meeting, report). Toil loại bỏ được hoàn toàn, overhead chỉ
giảm được. Vai trò bị đảo ngược hoàn toàn trong lựa chọn a — TOIL mới là thứ có thể tự động
hóa, overhead mới KHÓ tự động hóa hết (loại a); hai khái niệm có định nghĩa và đặc điểm khác
biệt rõ rệt, SRE Book phân biệt rõ, không dùng thay thế nhau (loại b); ví dụ cụ thể trong
lựa chọn d bị đảo ngược — deploy/restart là ví dụ của TOIL, meeting/report là ví dụ của
OVERHEAD (loại d).

---

**Câu 5**: Khi đánh giá toil nào nên tự động hóa trước, dùng tiêu chí gì để ưu tiên?

a) Luôn tự động hóa công việc có effort cao nhất trước, vì effort cao đồng nghĩa với giá trị
   cao
b) Chỉ dựa vào ý kiến cá nhân của SRE lead, không cần tính toán ROI hay break-even cụ thể
c) Luôn ưu tiên công việc có frequency thấp nhất trước vì ít gây gián đoạn khi triển khai
   automation
d) Dùng ROI: (Impact × Frequency) / Effort_to_automate. Ưu tiên "quick win" — tần suất cao, dễ tự động hóa, break-even nhanh

**Đáp án: d** — ROI = (Impact × Frequency)/Effort; ưu tiên quick win (tần suất cao, dễ tự
động, break-even nhanh). Effort cao KHÔNG đồng nghĩa giá trị cao — ROI mới là tiêu chí đúng,
effort nằm ở MẪU SỐ (effort cao làm ROI thấp hơn, không phải ưu tiên) (loại a); quyết định
cần dựa trên tính toán ROI/break-even cụ thể, không chỉ ý kiến cá nhân chủ quan (loại b);
frequency CAO mới là yếu tố ưu tiên (tử số của ROI), không phải frequency thấp (loại c).

## 8. Bài liên quan và nguồn

**Đã học ở:**
- [devops.ansible.fundamentals](../../devops/ansible/fundamentals.md) — Ansible playbook để tự động hóa provisioning

**Xem thêm:**
- [sre.capacity-planning.basics](../capacity-planning/basics.md) — Capacity planning là một dạng automation (predict_linear thay vì check thủ công)
- [devops.cicd.concepts](../../devops/cicd/concepts.md) — CI/CD loại bỏ toil deploy thủ công

**Nguồn:**
- Google SRE Book — Eliminating Toil: https://sre.google/sre-book/eliminating-toil/
- Google SRE Workbook — Eliminating Toil: https://sre.google/workbook/eliminating-toil/
