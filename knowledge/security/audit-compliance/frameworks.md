---
id: security.audit-compliance.frameworks
title: "Khung tuân thủ phổ biến: ý nghĩa với vận hành hằng ngày"
domain: security
module: security.audit-compliance
level: "chuyên sâu"
prerequisites: ["security.audit-compliance.audit-logging"]
applies_to:
  - "Nguyên lý chung; ví dụ PCI DSS v4.0, ISO 27001:2022, SOC 2"
status: draft
sources:
  - "https://www.pcisecuritystandards.org/standards/pci-dss/"
  - "https://www.first.org/cvss/v3.1/specification-document"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

"Compliance" thường bị coi là chuyện của team legal hay security manager. Nhưng khi audit
thực tế xảy ra, auditor sẽ hỏi thẳng vào người vận hành: "Chứng minh rằng chỉ có người được
ủy quyền mới truy cập được server này." Câu trả lời là log, config, và process — tất cả đều
do System Engineer quản lý.

Hiểu framework yêu cầu gì giúp SE vận hành đúng cách ngay từ đầu, không phải "vá" trước mỗi
kỳ audit.

## 2. Khái niệm cốt lõi

### Ba framework phổ biến nhất

| Framework | Ai cần | Trọng tâm | Kiểm tra bởi |
|-----------|--------|-----------|--------------|
| **PCI DSS** | Xử lý thanh toán thẻ | Bảo vệ cardholder data | QSA (Qualified Security Assessor) |
| **ISO 27001** | Bất kỳ tổ chức nào muốn chứng chỉ | ISMS toàn diện | Auditor độc lập (certification body) |
| **SOC 2** | SaaS/cloud provider bán cho doanh nghiệp | Trust Services Criteria | CPA firm |

### PCI DSS v4.0 — 12 yêu cầu

PCI DSS (Payment Card Industry Data Security Standard) bảo vệ cardholder data. Với SE, 6
requirement trực tiếp ảnh hưởng đến vận hành:

| Req | Tiêu đề | Việc SE phải làm |
|-----|---------|-----------------|
| 1 | Network security controls | Firewall, segmentation CDE khỏi internet |
| 2 | Secure configurations | Không dùng default password, hardening OS |
| 5 | Protect from malware | AV/EDR trên endpoint xử lý cardholder |
| 6 | Secure systems/software | Patch trong thời hạn theo CVSS |
| 10 | Log and monitor | Audit log, retain 12 tháng, review daily |
| 11 | Test security | Quarterly scan, annual pentest |

<!-- TODO-VERIFY: PCI DSS v4.0 có đúng 12 requirement — đây là số từ v3.2.1 giữ nguyên sang v4.0; xác nhận bằng tài liệu PCI SSC chính thức -->

**CDE** (Cardholder Data Environment): mạng/hệ thống lưu trữ hoặc xử lý dữ liệu thẻ. Segmentation
CDE khỏi phần còn lại giảm scope audit — chỉ cần chứng minh controls cho CDE, không phải toàn bộ hạ tầng.

### ISO 27001:2022 — ISMS

ISO 27001 định nghĩa một **Information Security Management System (ISMS)**: khung quản lý bảo
mật có hệ thống, không phải danh sách controls kỹ thuật. Phiên bản 2022 có 93 controls (giảm
từ 114 của 2013) trong 4 nhóm:

<!-- TODO-VERIFY: ISO 27001:2022 có 93 controls trong 4 nhóm (5A/5B/6/7/8) — xác nhận bằng tài liệu ISO chính thức; 2013 có 114 controls là số đã được xác nhận rộng rãi -->

- **Organizational** (37): chính sách, roles, supplier management
- **People** (8): vetting, training, disciplinary
- **Physical** (14): physical access, clear desk
- **Technological** (34): authentication, encryption, patching, audit logging, monitoring

Controls kỹ thuật (nhóm Technological) là phần SE trực tiếp implement.

### SOC 2 — Trust Services Criteria

SOC 2 dành cho nhà cung cấp dịch vụ (SaaS, cloud hosting) cần chứng minh cho khách hàng
doanh nghiệp rằng hệ thống của họ đáng tin. 5 Trust Services Criteria (TSC):

1. **Security** (bắt buộc): logical/physical access controls, monitoring, incident response
2. **Availability**: uptime SLA, disaster recovery
3. **Processing Integrity**: xử lý dữ liệu đầy đủ, chính xác, đúng thời gian
4. **Confidentiality**: bảo vệ thông tin nhạy cảm
5. **Privacy**: PII theo GDPR/CCPA

Hầu hết công ty chỉ scope **Security** (CC — Common Criteria). SE implement: access control,
network security, vulnerability management, change management, logging.

**Type I vs Type II**:
- SOC 2 Type I: kiểm tra controls được thiết kế đúng tại một thời điểm (point-in-time)
- SOC 2 Type II: kiểm tra controls hoạt động hiệu quả trong một khoảng thời gian (thường 6-12 tháng)

Khách hàng enterprise thường yêu cầu Type II — có nghĩa là process và controls phải nhất quán
theo thời gian, không phải "clean up" trước ngày audit.

## 3. Cách nó hoạt động

### Audit trail: từ requirement đến evidence

Compliance audit hoạt động theo nguyên lý "trust but verify": auditor yêu cầu evidence cho
từng control. SE cung cấp:

```
Control requirement: "Mọi privileged access phải được log và review"
     │
     ├─ Evidence 1: auditd config + log retention policy
     ├─ Evidence 2: log sample từ /var/log/audit/ hoặc SIEM
     └─ Evidence 3: ticket/record của weekly log review
```

Không có log = không có evidence = finding (lỗi trong audit report).

### Common controls mà SE triển khai

Dù framework nào, các controls sau đều xuất hiện:

```
1. Access control     → SSH key only (no password), MFA, least privilege
2. Audit logging      → auditd, centralized SIEM, retention ≥ 12 tháng (PCI)
3. Patch management   → CVE tracking, patch SLA theo CVSS severity
4. Network security   → segmentation, firewall rules, no default credentials
5. Change management  → mọi thay đổi production đều có ticket và approval
6. Incident response  → runbook, on-call, post-mortem documented
```

### PCI DSS Requirement 10 — chi tiết log

Với đội vận hành hệ thống thanh toán, Req 10 quy định cụ thể:

- Log **mọi** truy cập vào CDE: admin access, failed login attempts, use of privileged accounts
- Retain log **12 tháng** (3 tháng gần nhất phải có ngay khi audit, 9 tháng còn lại có thể ở archive)
- **Review daily**: automated SIEM alert, không cần người ngồi đọc thủ công

## 4. Thực hành

**Kiểm tra nhanh các control cơ bản** (chạy thật):

```bash
# 1. SSH password auth còn bật không? (nên là no)
grep "PasswordAuthentication" /etc/ssh/sshd_config 2>/dev/null || echo "no sshd_config"
```

Kết quả thực tế:

```
no sshd_config
```

SSH server không cài trên máy demo. Trên server production, kết quả mong muốn:
`PasswordAuthentication no` — nếu thấy `yes` hoặc không có dòng này (mặc định `yes`), đây là
finding.

```bash
# 2. Xem ai có quyền sudo
getent group sudo
```

Kết quả thực tế (đã ẩn danh):

```
sudo:x:27:ops-user
```

Chỉ `ops-user` trong group sudo — một user duy nhất là tốt. Nếu thấy nhiều user technical không
cần sudo, đây là least-privilege violation.

```bash
# 3. Kiểm tra login gần nhất
last -10 | head -8
```

Kết quả thực tế (đã ẩn danh):

```
ops-user  pts/0   192.168.24.10    Wed Oct  7 07:48   still logged in
reboot    system  6.8.0-138        Wed Oct  7 07:46   still running
ops-user  pts/0   192.168.24.10    Tue Oct  6 07:35 - 17:35  (10:00)
```

Login từ một IP nội bộ duy nhất — không có gì đáng ngờ.

**Tự checklist trước audit** (output minh họa — danh sách control cần verify):

```bash
# PCI DSS Req 10: audit log retention
ls -lh /var/log/audit/  # phải có đủ 3 tháng gần nhất

# Access control: không có unused accounts
awk -F: '($3 >= 1000 && $7 != "/usr/sbin/nologin" && $7 != "/bin/false") {print $1}' /etc/passwd

# Network: không có port không cần thiết mở ra ngoài
ss -tlnp | grep -v "127.0.0\|::1"

# Patch: bao lâu rồi chưa update?
apt-get -s upgrade | grep "^[0-9]" | tail -1   # "X upgraded, Y installed..."
```

## 5. Lỗi thường gặp và cách chẩn đoán

**"Cleanup" trước audit, không maintain thường xuyên** — một tuần trước audit mới vá patch,
xóa user không dùng, bật logging. SOC 2 Type II sẽ hỏi: "Cho xem log của 6 tháng trước" —
không có gì để show. Fix: treat compliance controls như production infrastructure: luôn bật,
luôn monitor, không phải "bật khi audit".

**CDE scope quá rộng** — với PCI DSS, nếu không segment đúng, toàn bộ hạ tầng trở thành CDE
và phải comply tất cả 12 requirement cho mọi server. Fix: thiết kế network segment riêng cho
hệ thống xử lý thẻ, chỉ cho phép traffic cần thiết vào CDE.

**Log retention không đủ** — PCI yêu cầu 12 tháng nhưng log rotate sau 7 ngày. Fix: cấu hình
log shipper (Filebeat/rsyslog) gửi về centralized storage với retention policy đúng.

**Không có change management record** — mọi thay đổi production (kể cả "nhỏ" như sửa config)
phải có ticket/approval. Auditor hỏi: "Thay đổi này ai approve?" — không có ticket = finding.

## 6. Tình huống thực tế

**Tình huống**: Công ty vừa ký hợp đồng với khách hàng enterprise yêu cầu SOC 2 Type II. Audit
period: 6 tháng tới. SE được giao implement controls.

**Các việc cần làm ngay** (Priority 1 — Security TSC):

```
1. Access control:
   - Enforce SSH key-only (disable password auth)
   - Setup MFA cho console/jump host
   - Review và cleanup unused accounts

2. Audit logging:
   - Cài auditd trên mọi server
   - Setup centralized syslog (ELK/Splunk)
   - Cấu hình retention ≥ 12 tháng

3. Vulnerability management:
   - Weekly Trivy scan cho containers
   - Patch Critical trong 24h, High trong 7 ngày
   - Track evidence (ticket per CVE)

4. Change management:
   - Mọi production change qua ticket system
   - Require 1 peer approval trước khi apply

5. Incident response:
   - Document runbook cho top 5 incident type
   - Chỉ định on-call rotation và escalation path
```

Sau 6 tháng duy trì nhất quán, auditor có evidence thật để cấp SOC 2 Type II certificate.

## 7. Tự kiểm tra

**Câu 1**: Sự khác biệt giữa SOC 2 Type I và Type II là gì?

a) Type I kiểm tra hệ thống production, Type II kiểm tra staging  
b) Type I kiểm tra controls được thiết kế đúng tại một thời điểm; Type II kiểm tra controls
   vận hành hiệu quả trong một khoảng thời gian (thường 6–12 tháng)  
c) Type I dành cho SaaS, Type II dành cho on-premises  
d) Type I rẻ hơn và đủ cho enterprise customer

**Đáp án: b** — Type I là snapshot ("controls được thiết kế đúng tại ngày X"). Type II là
proof of operation ("controls hoạt động hiệu quả từ tháng X đến tháng Y"). Enterprise customer
thường yêu cầu Type II vì nó chứng minh process nhất quán theo thời gian, không phải "prepare
trước 1 tuần rồi pass". Implication cho SE: controls phải maintain thường xuyên, không phải
chỉ cleanup trước audit.

---

**Câu 2**: Trong PCI DSS, "CDE scope" ảnh hưởng thế nào đến khối lượng compliance work?

a) CDE scope càng lớn thì audit càng rẻ vì có nhiều system để show  
b) CDE là chỉ áp dụng cho team phát triển, không liên quan đến vận hành  
c) CDE scope lớn = nhiều hệ thống phải comply tất cả 12 requirements — phân đoạn mạng đúng
   để thu hẹp CDE giảm đáng kể effort compliance  
d) CDE không liên quan đến network segmentation

**Đáp án: c** — CDE (Cardholder Data Environment) là mọi hệ thống xử lý/lưu trữ/truyền dẫn
dữ liệu thẻ. Nếu không segment, toàn bộ mạng nội bộ có thể trở thành CDE. Phân đoạn đúng
(firewall chặt giữa CDE và non-CDE, không có lateral movement) cho phép khai báo scope nhỏ hơn
— chỉ CDE cần 12 requirements, phần còn lại không. Đây là lý do "network segmentation" là
control cả bảo mật lẫn compliance.

---

**Câu 3**: PCI DSS Requirement 10 yêu cầu giữ log trong bao lâu?

a) 30 ngày  
b) 6 tháng  
c) 12 tháng (3 tháng gần nhất phải có ngay; 9 tháng còn lại có thể ở archive)  
d) 3 năm

**Đáp án: c** — PCI DSS Req 10 yêu cầu retain audit log ít nhất 12 tháng. 3 tháng gần nhất
phải "immediately available" cho audit (online, có thể query ngay). 9 tháng còn lại có thể ở
archive storage (offline, nhưng có thể restore khi cần). Implication: log shipper phải forward
sang centralized storage với retention ≥ 12 tháng, không chỉ rotate sau 7 ngày.
<!-- TODO-VERIFY: con số "3 tháng immediately available + 9 tháng archive" là từ PCI DSS v3.2.1 Req 10.7; cần xác nhận còn áp dụng trong v4.0 -->

---

**Câu 4**: SSH server có dòng `#PasswordAuthentication yes` (được comment out). Điều này có
nghĩa gì về mặt security?

a) Password authentication bị tắt vì dòng bị comment  
b) Password authentication đang BẬT — mặc định của OpenSSH là `yes`, comment chỉ là ghi chú
   không có hiệu lực; cần thêm dòng `PasswordAuthentication no` không có `#`  
c) Config không hợp lệ vì có `#`  
d) Bị tắt trên một số phiên bản OpenSSH và bật trên phiên bản khác

**Đáp án: b** — OpenSSH mặc định `PasswordAuthentication yes`. Dòng `#PasswordAuthentication yes`
là comment — không có tác dụng gì, chỉ là documentation cho giá trị mặc định. Để tắt cần thêm
dòng mới không có `#`: `PasswordAuthentication no`. Đây là lỗi rất phổ biến: operator nghĩ
"đã comment dòng yes là đã tắt" nhưng thực ra chưa tắt gì cả.

---

**Câu 5**: Auditor hỏi: "Chứng minh rằng patch được áp trong thời hạn." Evidence nào tốt nhất?

a) Chạy `apt list --upgradable` để show không có pending update  
b) Ticket per CVE: ngày CVE published, ngày assess, ngày patch apply, ngày verify — cho thấy
   process nhất quán và trong SLA  
c) Chạy Trivy scan và show kết quả "0 CRITICAL"  
d) Show `/var/log/dpkg.log` để prove package đã được install

**Đáp án: b** — `/var/log/dpkg.log` hay `apt list` chứng minh patch đã apply, nhưng không
chứng minh nó được apply *trong thời hạn*. Auditor cần thấy: CVE xuất hiện ngày nào, team
biết ngày nào, patch apply ngày nào, và khoảng cách đó có nằm trong SLA không. Ticket system
tạo audit trail đầy đủ cho từng CVE. SOC 2/PCI không chỉ hỏi "đã vá chưa" mà hỏi "process
vá có nhất quán không."

## 8. Bài liên quan và nguồn tham khảo

**Bài trước (prereq):**
- `security.audit-compliance.audit-logging` — implement audit log là control cốt lõi trong
  mọi framework

**Bài liên quan:**
- `security.vuln-patch.patch-mgmt` — evidence của patch SLA cho PCI/SOC 2 (đã học ở
  `security.vuln-patch.scanning` → `patch-mgmt`)
- `security.network-security.fundamentals` — network segmentation để thu hẹp PCI CDE scope (xem thêm)
- `sre.change-management.process` — change management record là evidence cho compliance (xem thêm)

**Nguồn tham khảo:**
- [PCI Security Standards Council — PCI DSS](https://www.pcisecuritystandards.org/standards/pci-dss/)
- [FIRST — CVSS v3.1 Specification](https://www.first.org/cvss/v3.1/specification-document)
