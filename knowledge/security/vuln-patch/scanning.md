---
id: security.vuln-patch.scanning
title: "Vulnerability scanning: CVE, công cụ quét cơ bản"
domain: security
module: security.vuln-patch
level: "vận hành"
prerequisites: []
applies_to:
  - "Trivy (container/image scanning), OpenVAS/Greenbone (network scanning); CVE/CVSS là tiêu chuẩn chung không phụ thuộc công cụ"
status: draft
sources:
  - "https://www.first.org/cvss/v3.1/specification-document"
  - "https://nvd.nist.gov/vuln-metrics/cvss"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Mọi phần mềm đều có lỗ hổng — điều duy nhất không chắc là lúc nào chúng được phát hiện và
công bố. Khi CVE mới được công bố, attacker thường có exploit trong vài ngày; team vận hành
cần biết hệ thống của mình có bị ảnh hưởng không, mức nghiêm trọng là bao nhiêu, và ưu tiên
vá theo thứ tự nào.

Vulnerability scanner tự động hóa công việc đó: quét danh sách package đã cài, so với database
CVE, trả về danh sách lỗ hổng kèm điểm CVSS để team triage và quyết định.

## 2. Khái niệm cốt lõi

### CVE và NVD

**CVE** (Common Vulnerabilities and Exposures) là định danh duy nhất cho từng lỗ hổng:

```
CVE-2024-23897   ← CVE-YEAR-ID
    │      │
    │      └─ số thứ tự (có thể dài hơn 4 chữ số nếu nhiều CVE trong năm)
    └─ năm phát hiện/công bố
```

**NVD** (National Vulnerability Database, nvd.nist.gov) là nguồn tra cứu chính: mỗi CVE có
mô tả, điểm CVSS, CPE (danh sách sản phẩm bị ảnh hưởng), và link exploit/patch.

### CVSS v3.1 — điểm đánh giá mức nghiêm trọng

CVSS (Common Vulnerability Scoring System) cho mỗi CVE một điểm 0.0–10.0:

| Severity | Score Range | Ý nghĩa thực tế |
|----------|-------------|-----------------|
| None | 0.0 | Không ảnh hưởng |
| Low | 0.1–3.9 | Khó khai thác, ảnh hưởng nhỏ |
| Medium | 4.0–6.9 | Cần điều kiện nhất định |
| High | 7.0–8.9 | Nghiêm trọng, nên vá sớm |
| Critical | 9.0–10.0 | Khai thác dễ, ảnh hưởng lớn — vá ngay |

**Base Score** gồm 8 yếu tố bất biến theo thời gian (nguồn: FIRST CVSS v3.1 specification):

- **Attack Vector (AV)**: Network / Adjacent / Local / Physical — càng xa (Network) càng nguy
- **Attack Complexity (AC)**: Low / High — Low dễ khai thác hơn
- **Privileges Required (PR)**: None / Low / High — None nguy hiểm nhất
- **User Interaction (UI)**: None / Required
- **Scope (S)**: Unchanged / Changed — Changed = exploit thoát ra ngoài component bị lỗi
- **Confidentiality/Integrity/Availability (C/I/A)**: High / Low / None

Ví dụ CVE có AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H → điểm 9.8 Critical (Log4Shell điển hình).

### Các loại scanner

| Scanner | Quét cái gì | Dùng khi nào |
|---------|-------------|--------------|
| **Trivy** | Container image, filesystem, repo | CI/CD, quét image trước push |
| **OpenVAS/Greenbone** | Host/network (network-based) | Audit định kỳ toàn hạ tầng |
| **Nessus** | Host/network (commercial) | Audit có hỗ trợ thương mại |
| **Nuclei** | Web app, template-based | Quét web, có thể tùy chỉnh template |
| **`apt audit` / `dnf check-update --security`** | Package đã cài (Linux) | Nhanh, không cần tool ngoài |

**Trivy** là lựa chọn phổ biến nhất cho container vì miễn phí, có thể tích hợp CI/CD, và
quét cả image layer, filesystem, Git repo.

### False positive trong vulnerability scanning

Scanner báo lỗ hổng không có nghĩa là **exploitable**: package có thể bị ảnh hưởng về lý
thuyết nhưng code path lỗi không được gọi trong ứng dụng, hoặc đã có mitigating control
(WAF, network segmentation).

## 3. Cách nó hoạt động

Scanner so sánh danh sách package/dependency của target với CVE database:

```
Target system / image
   │
   ├─ List installed packages (dpkg -l, rpm -qa, pip list, npm ls...)
   │
   ▼
[Scanner engine]
   │
   ├─ Match against CVE database (NVD + vendor advisories)
   │
   ▼
Report: package@version → CVE-ID, CVSS score, fixed-in version
```

Trivy dùng thêm **OS-specific advisory feeds** (Ubuntu USN, RHEL RHSA, Debian DSA) để có
thông tin vá chính xác hơn NVD (vì distro backport patch về version cũ mà NVD không track).

## 4. Thực hành

**Quét image Docker với Trivy** (output minh họa — Trivy không cài trên máy demo):

```bash
# Quét image, chỉ hiện HIGH và CRITICAL
trivy image --severity HIGH,CRITICAL nginx:1.24

# Output:
# nginx:1.24 (debian 12.0)
# =====================================
# Total: 4 (HIGH: 3, CRITICAL: 1)
#
# ┌──────────────┬───────────────┬──────────┬─────────────────────┬──────────────┐
# │   Library    │ Vulnerability │ Severity │ Installed Version   │ Fixed Version│
# ├──────────────┼───────────────┼──────────┼─────────────────────┼──────────────┤
# │ openssl      │ CVE-2024-XXXX │ CRITICAL │ 3.0.9-1             │ 3.0.11-1     │
# │ libexpat1    │ CVE-2023-XXXX │ HIGH     │ 2.5.0-1             │ 2.5.0-1+deb  │
# └──────────────┴───────────────┴──────────┴─────────────────────┴──────────────┘
```

> **Output minh họa** — định dạng lấy từ tài liệu Trivy; CVE ID là placeholder.

**Kiểm tra security update trên Ubuntu** (chạy thật):

```bash
# Xem package nào có security update đang pending
apt list --upgradable 2>/dev/null | grep -i security
```

Kết quả thực tế từ máy demo:

```
Listing...
```

Không có pending security update trên máy demo (đã up to date). Trên hệ thống production
thực tế thường thấy output như:

```
libssl3/jammy-security 3.0.2-0ubuntu1.18 amd64 [upgradable from: 3.0.2-0ubuntu1.16]
```

> Dòng trên: output minh họa — máy demo không có pending update.

**Quét filesystem với Trivy** (output minh họa):

```bash
# Quét thư mục project (phát hiện CVE trong requirements.txt, package.json, go.sum...)
trivy fs --severity HIGH,CRITICAL /path/to/project

# Kết xuất JSON để tích hợp CI
trivy image --format json --output results.json myapp:latest
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Quét và không làm gì** — chạy Trivy trong CI nhưng kết quả chỉ là thông tin, không block
pipeline. Mọi lỗ hổng Critical/High không được theo dõi. Fix: thêm `--exit-code 1
--severity CRITICAL` để pipeline fail khi có Critical, bắt buộc team xử lý.

**Không phân biệt Base Score vs exploitability thực tế** — vá tất cả CVE theo thứ tự CVSS
mà không xét context: một CVE 9.8 trong library không dùng ít nguy hiểm hơn CVE 7.5 trong
component public-facing. Fix: ưu tiên theo **exposure** (accessible từ internet không?) và
**reachability** (code path lỗi có được gọi không?).

**Quét image cũ trong registry** — image đã build 6 tháng trước với base OS cũ, chứa hàng
trăm CVE, nhưng không ai quét vì "đã deploy rồi". Fix: quét định kỳ cả image trong registry
(không chỉ lúc build), dùng `trivy image` trong cron job.

**Bỏ qua distro backport** — CVE 7.0 trên Ubuntu 22.04 nhưng Ubuntu đã backport patch về
package version cũ (kiểu `openssl 3.0.2-0ubuntu1.18`). NVD vẫn hiện "affected" vì version số
thấp, nhưng thực tế đã được vá. Scanner biết distro advisory (như Trivy với `--db-repository`)
sẽ đánh dấu FIXED; scanner chỉ dùng NVD sẽ báo false positive.

## 6. Tình huống thực tế

**Tình huống**: Team chuẩn bị deploy image `myapp:v2.1.0` lên production. CI/CD chạy Trivy
scan và trả về:

```
CRITICAL: 1, HIGH: 12, MEDIUM: 47, LOW: 103
```

**Cách xử lý thực tế**:

1. **Triage Critical trước**: xem package nào, CVE nào, `Fixed Version` là gì
2. **Đánh giá exposure**: package đó có được gọi trong code của app không? (nếu là thư viện
   C không dùng trực tiếp, risk thấp hơn)
3. **Cập nhật base image**: đổi `FROM ubuntu:22.04` → `FROM ubuntu:22.04` với `apt upgrade`
   trong Dockerfile, hoặc bump lên `ubuntu:24.04`
4. **Re-scan**: build image mới, chạy lại Trivy — Critical phải về 0 trước khi deploy

HIGH: lên kế hoạch vá trong sprint tiếp theo. MEDIUM/LOW: ghi nhận, review hàng tháng.

## 7. Tự kiểm tra

**Câu 1**: CVE-2024-23897 có điểm CVSS Base Score 9.8. Điều này có nghĩa là nên vá ngay mà
không cần xét gì thêm không?

a) Đúng — Critical (9.0–10.0) luôn phải vá ngay lập tức bất kể hoàn cảnh  
b) Không — phải xét thêm exposure (có accessible từ internet không?), có exploit public
   không, và hệ thống đó có trong scope không trước khi ưu tiên  
c) Không — điểm CVSS Base không liên quan đến mức độ nguy hiểm thực tế  
d) Đúng, nhưng chỉ khi Attack Vector là Network

**Đáp án: b** — CVSS Base Score phản ánh mức nghiêm trọng của lỗ hổng trong điều kiện lý
tưởng (không tính context triển khai). Thực tế cần xét: service có exposed ra internet không?
Đã có exploit public chưa? Team có bandwidth vá không? Một CVE 9.8 trong service chỉ accessible
nội bộ kín ít nguy hiểm hơn CVE 7.0 trên web server public. CVSS Environmental Score cho phép
điều chỉnh theo context triển khai.

---

**Câu 2**: Trivy scan image cho kết quả CVE với `Fixed Version: 3.0.11-1` nhưng trên Ubuntu
scanner khác báo `FIXED`. Mâu thuẫn này giải thích thế nào?

a) Hai scanner dùng database CVE khác nhau nên kết quả không nhất quán  
b) Ubuntu backport patch về version cũ (e.g., `3.0.2-0ubuntu1.18`) — NVD không track backport
   nên báo affected, nhưng scanner biết Ubuntu advisory (USN) biết đã vá  
c) Trivy báo sai, nên dùng scanner Ubuntu  
d) Fixed Version trong Trivy là upstream version, không phải distro package version

**Đáp án: b** — Distro như Ubuntu/Debian/RHEL backport security fix về package version cũ
của họ thay vì upgrade lên upstream mới nhất. Ví dụ: OpenSSL upstream fixed in 3.1.x, nhưng
Ubuntu 22.04 fix trong `3.0.2-0ubuntu1.18` (version Ubuntu thấp hơn upstream fix). Scanner chỉ
dùng NVD thấy version `3.0.2` < `3.0.11` → báo affected. Scanner biết Ubuntu Security Notices
(USN) thấy package đã có advisory mark FIXED → đúng. Trivy dùng cả hai nguồn, nên cần chú ý
cột "Status" trong kết quả.

---

**Câu 3**: CVSS Base Score của CVE-XXXX-1234 là 9.8 với AV:N/AC:L/PR:N/UI:N. Điều gì làm
điểm cao như vậy?

a) Scope Changed (thoát khỏi sandbox) kết hợp với C:H/I:H/A:H  
b) Attack Vector là Network, Attack Complexity thấp, không cần Privileges và User Interaction,
   Impact cao — nghĩa là exploit từ internet, dễ thực hiện, không cần điều kiện gì  
c) CVSS 9.x chỉ có thể đạt được khi lỗ hổng là Remote Code Execution  
d) Điểm cao vì CVE mới được công bố, chưa có patch

**Đáp án: b** — CVSS v3.1 tính điểm dựa trên 8 metric. AV:N (tấn công qua network, không cần
physical access) + AC:L (không cần điều kiện đặc biệt) + PR:N (không cần quyền trước) + UI:N
(không cần người dùng click gì) = khả năng khai thác tối đa. Kết hợp C:H/I:H/A:H = ảnh hưởng
toàn diện → điểm Base gần 10. RCE thường đạt điểm này nhưng không phải điều kiện duy nhất.

---

**Câu 4**: Lệnh nào trên Ubuntu kiểm tra nhanh security update đang pending mà không cần cài
tool ngoài?

a) `apt list --upgradable 2>/dev/null | grep security`  
b) `apt-get check --security`  
c) `dpkg --list | grep -i cve`  
d) `uname -r | grep security`

**Đáp án: a** — `apt list --upgradable` liệt kê tất cả package có update, kèm tên repo nguồn.
Package từ `jammy-security` repo là security update. Lọc bằng `grep security` cho danh sách
nhanh. Không cần cài thêm gì. Lệnh b/c/d không tồn tại hoặc không liên quan đến security
update. Để xem chi tiết hơn: `apt-get -s upgrade | grep "^Inst.*security"`.

---

**Câu 5**: Tại sao nên thêm `--exit-code 1 --severity CRITICAL` khi chạy Trivy trong CI/CD?

a) Để Trivy chạy nhanh hơn bằng cách bỏ qua LOW/MEDIUM  
b) Để pipeline fail và chặn deploy khi phát hiện lỗ hổng Critical — bắt buộc team xử lý
   thay vì chỉ xem kết quả rồi bỏ qua  
c) Vì Trivy mặc định không quét CRITICAL, cần flag này để bật  
d) Để tạo report riêng cho CRITICAL thay vì in ra stdout

**Đáp án: b** — Không có `--exit-code 1`, Trivy luôn exit code 0 (success) dù tìm thấy lỗ
hổng — CI pipeline tiếp tục bình thường. Thêm `--exit-code 1` khiến Trivy trả về non-zero
exit code khi có ít nhất 1 lỗ hổng ở severity đã chỉ định → pipeline fail → deploy bị chặn.
Đây là cách enforce security gate trong CI, không chỉ "scan for information."

## 8. Bài liên quan và nguồn tham khảo

**Bài tiếp theo trong module:**
- `security.vuln-patch.patch-mgmt` — sau khi biết CVE nào cần vá, bài này hướng dẫn chu
  trình vá có kiểm soát và ứng phó khi zero-day bùng nổ

**Bài liên quan:**
- `security.network-security.ids-ips` — IDS/IPS phát hiện exploit attempt realtime (xem thêm)
- `security.audit-compliance.audit-logging` — log scan kết quả và patch activity (xem thêm)
- `devops.artifact-management.repos` — quét image trong private registry (xem thêm)

**Nguồn tham khảo:**
- [FIRST — CVSS v3.1 Specification Document](https://www.first.org/cvss/v3.1/specification-document)
- [NVD — CVSS Metrics](https://nvd.nist.gov/vuln-metrics/cvss)
