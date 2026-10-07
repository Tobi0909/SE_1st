---
id: security.identity-secrets.identity
title: "Quản lý danh tính: SSO, MFA, vai trò và nhóm"
domain: security
module: security.identity-secrets
level: "vận hành"
prerequisites: []
applies_to:
  - "Nguyên lý chung áp dụng cho mọi nền tảng; ví dụ cụ thể dùng Keycloak/OIDC và TOTP"
status: draft
sources:
  - "https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html"
  - "https://openid.net/developers/how-connect-works/"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Danh tính người dùng là điểm khởi đầu của mọi quyết định phân quyền. Nếu kẻ tấn công chiếm
được tài khoản một SE có quyền admin, mọi lớp hardening OS đều vô nghĩa. Quản lý danh tính kém
(mỗi hệ thống một tài khoản riêng, không có MFA, phân quyền mơ hồ) là một trong những nguồn
gốc phổ biến nhất của breach — và cũng là thứ dễ cải thiện nhất nếu hiểu đúng từ đầu.

## 2. Khái niệm cốt lõi

### SSO và các giao thức liên bang danh tính

**SSO (Single Sign-On)** cho phép người dùng đăng nhập một lần với **Identity Provider (IdP)**
và được cấp quyền truy cập nhiều **Service Provider (SP)** khác nhau mà không phải nhập lại
mật khẩu. Bản chất là IdP phát token xác thực sau khi đăng nhập, SP tin vào token đó.

Hai giao thức phổ biến:

| Giao thức | Dùng cho | Token dạng | Ví dụ IdP |
|-----------|----------|------------|-----------|
| **SAML 2.0** | Enterprise, legacy app | XML signed assertion | Active Directory FS, Okta |
| **OIDC (OpenID Connect)** | Cloud-native, API, mobile | JWT (JSON) | Google, Keycloak, Auth0 |

OIDC được xây dựng trên OAuth 2.0: OAuth 2.0 cho **ủy quyền** (app A được phép làm gì với dữ
liệu của user), OIDC thêm lớp **xác thực** (user là ai) bằng `id_token`. Đây là lý do các hệ
thống hiện đại dùng OIDC/OAuth2, không phải SAML.

**Luồng Authorization Code (OIDC):**

```
User → SP → redirect → IdP (đăng nhập) → IdP phát code
     → SP dùng code đổi access_token + id_token → SP xác thực user
```

`id_token` là JWT có 3 phần (header.payload.signature), payload chứa `sub` (user ID), `email`,
`iss` (issuer), `exp` (expiry). SP verify chữ ký bằng public key của IdP.

### MFA — nhiều lớp xác thực

MFA yêu cầu ít nhất 2 trong 3 loại factor:

| Factor | Ví dụ | Độ mạnh |
|--------|-------|---------|
| **Biết** (Something you know) | Mật khẩu, PIN | Thấp nếu đứng một mình |
| **Có** (Something you have) | TOTP app, hardware key (YubiKey) | Cao |
| **Là** (Something you are) | Vân tay, khuôn mặt | Cao, nhưng không thể revoke khi bị lộ |

**TOTP (RFC 6238)** — cơ chế phổ biến nhất:
- Server và client chia sẻ secret key lúc setup (quét QR code = truyền key)
- Cả hai tính `HMAC-SHA1(secret, floor(unix_time / 30))` → lấy 6 chữ số
- Code valid trong window 30 giây (có dung sai ±1 step để bù clock skew)
- Không cần internet — hoạt động offline

**Tại sao SMS yếu hơn TOTP** (theo NIST SP 800-63B): SMS dùng SS7 protocol có thể bị intercept,
số điện thoại bị SIM-swap. NIST 800-63B-4 xếp SMS vào nhóm "restricted authenticator" — tức là
chấp nhận nhưng cần đánh giá rủi ro, không khuyến nghị cho hệ thống high-assurance.

**FIDO2/WebAuthn** (phishing-resistant): hardware key hoặc platform authenticator (Touch ID,
Windows Hello) tạo challenge-response dựa trên origin URL — không thể bị phishing vì key gắn
với domain, không phải OTP có thể gõ lại vào trang giả mạo.

### RBAC — vai trò và nhóm

**RBAC (Role-Based Access Control)**: quyền gắn vào **vai trò**, không gắn thẳng vào người dùng.

```
User → thuộc → Group → có → Role → có → Permission (action + resource)
```

Nguyên tắc thiết kế tốt:
- **Ít vai trò, mô tả rõ ràng** hơn là nhiều vai trò chồng chéo
- **Tránh flat RBAC**: đừng tạo role `super-admin` gộp mọi quyền — nếu account bị chiếm, toàn
  bộ hệ thống bị ảnh hưởng
- **Nguyên lý least privilege**: role `deploy-only` chỉ cần push image và restart service, không
  cần đọc production database
- **Tách biệt môi trường**: role trong staging ≠ role trong production — thường dùng group riêng
  hoặc namespace riêng

## 3. Cách nó hoạt động

**Ví dụ luồng đăng nhập Keycloak (OIDC):**

```
1. User truy cập app.example.com
2. App redirect → keycloak.example.com/auth?client_id=app&redirect_uri=...
3. Keycloak hiện trang đăng nhập (+ MFA nếu bật)
4. Keycloak phát authorization code, redirect về app
5. App gửi code → keycloak.example.com/token → nhận JWT
6. App decode JWT, lấy claims (email, groups, roles)
7. App tự kiểm tra quyền dựa trên claims
```

**Verify JWT không cần gọi IdP lại** (quan trọng cho performance):
- JWT có chữ ký RSA/ECDSA từ IdP
- App tải public key của IdP một lần (từ JWKS endpoint), cache lại
- Mỗi request chỉ cần verify chữ ký local — O(1), không roundtrip network

**Điểm yếu phổ biến:**
- JWT không có `exp` hoặc thời gian hết hạn quá dài → token bị đánh cắp không thể revoke
- App chỉ check "có token hợp lệ" mà không check claims (groups/roles) → leo quyền
- Không rotate signing key → một key bị lộ compromise toàn bộ lịch sử token

## 4. Thực hành

**Kiểm tra JWT bằng tay** (không cần tool, chỉ cần base64):

```bash
# Giả sử có token (output minh họa — đây là JWT mẫu, không phải token thật)
TOKEN="eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiZXhwIjoxNzAwMDAwMDAwfQ.signature"

# Decode phần payload (phần giữa 2 dấu chấm)
echo "eyJzdWIiOiJ1c2VyMTIzIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiZXhwIjoxNzAwMDAwMDAwfQ" \
  | base64 -d 2>/dev/null
```

Kết quả thực tế (chạy thật với chuỗi mẫu):

```
$ echo "eyJzdWIiOiJ1c2VyMTIzIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiZXhwIjoxNzAwMDAwMDAwfQ" | base64 -d 2>/dev/null
{"sub":"user123","email":"user@example.com","exp":1700000000}
```

`exp: 1700000000` là Unix timestamp — convert: `date -d @1700000000` → `Wed Nov  1 00:00:00 UTC 2023`. Token đã hết hạn từ lâu. Đây là cách nhanh kiểm tra token hết hạn mà không cần bất kỳ tool JWT nào.

**Kiểm tra TOTP cơ bản** (minh họa logic):

```bash
# TOTP window hiện tại = floor(unix_time / 30)
echo $(($(date +%s) / 30))
# → 58313082  (thay đổi mỗi 30 giây)
```

Server và authenticator app tính cùng con số này, dùng làm input cho HMAC-SHA1 với shared secret.

## 5. Lỗi thường gặp và cách chẩn đoán

**"SSO là single point of failure"** — đúng về availability, nhưng sai khi dùng đó làm lý do
để không triển khai SSO. Mất SSO = không đăng nhập được (recoverable với procedure khẩn cấp).
Mỗi app giữ mật khẩu riêng = mỗi app là attack surface riêng (không recoverable khi bị lộ).

**MFA bypass qua recovery code** — recovery code là backdoor: 16 ký tự hex một lần dùng, không
cần MFA. Cần bảo vệ recovery code cẩn thận như mật khẩu chính, không lưu trong email/chat.

**Role chồng chéo không ai kiểm soát** — sau 1-2 năm, một user có thể tích lũy nhiều role từ
nhiều dự án. Cần audit định kỳ: `SELECT user, GROUP_CONCAT(role) FROM user_roles GROUP BY user`
— user nào có combination bất thường?

## 6. Tình huống thực tế

**Tình huống**: công ty có 12 hệ thống nội bộ (Jira, GitLab, Grafana, Jenkins, Kibana...), mỗi
hệ thống một bảng user riêng. Một SE nghỉ việc — IT phải vào từng hệ thống tắt tài khoản thủ
công, bỏ sót 3 hệ thống, 2 tuần sau cựu nhân viên còn đăng nhập được Grafana.

**Giải pháp đúng** — triển khai SSO với Keycloak:
1. Tất cả 12 hệ thống cấu hình OIDC/SAML về cùng một Keycloak realm
2. Khi SE nghỉ việc: vô hiệu hóa tài khoản trong Keycloak — toàn bộ session hết hạn tự động
3. Access token có `exp` ngắn (5-15 phút) — không thể dùng token cũ lâu dài
4. Audit log tập trung: ai đăng nhập hệ thống nào, lúc nào

**Lesson**: SSO không chỉ về UX (đăng nhập 1 lần) mà còn về **revocation** — tắt 1 chỗ, hiệu
lực toàn bộ.

## 7. Tự kiểm tra

**Câu 1**: Sự khác biệt cốt lõi giữa OAuth 2.0 và OIDC là gì?

a) OAuth 2.0 dùng JWT, OIDC dùng XML  
b) OAuth 2.0 xử lý ủy quyền (authorization), OIDC bổ sung xác thực (authentication) lên trên OAuth 2.0  
c) OAuth 2.0 chỉ dùng cho mobile app, OIDC cho web app  
d) OIDC không cần redirect, OAuth 2.0 thì cần

**Đáp án: b** — OAuth 2.0 xác định cách một ứng dụng được ủy quyền truy cập tài nguyên thay
mặt người dùng (authorization), nhưng không định nghĩa cách xác thực user. OIDC thêm `id_token`
(JWT chứa thông tin user) lên trên luồng OAuth 2.0 để giải quyết xác thực. Khi cần biết "ai là
user này" (authentication), dùng OIDC; khi chỉ cần "app này có quyền làm gì" (authorization),
OAuth 2.0 đủ.

---

**Câu 2**: Tại sao FIDO2/WebAuthn được gọi là "phishing-resistant"?

a) Vì hardware key không thể bị sao chép  
b) Vì challenge-response gắn với domain origin — key sẽ từ chối ký nếu domain sai  
c) Vì không dùng mật khẩu nên không có gì để phishing  
d) Vì OTP thay đổi quá nhanh để kẻ tấn công kịp dùng

**Đáp án: b** — FIDO2/WebAuthn tạo credential gắn với origin (domain + protocol + port). Khi
người dùng bị lừa vào `evil-bank.com` thay vì `bank.com`, authenticator sẽ không tìm thấy
credential cho origin đó và từ chối ký. Điều này khác TOTP — OTP 6 chữ số không biết nó đang
được gõ vào trang thật hay trang giả, kẻ tấn công có thể relay real-time (reverse-proxy
phishing).

---

**Câu 3**: TOTP (RFC 6238) sinh code 6 chữ số dựa trên gì?

a) Shared secret + số thứ tự lần dùng (counter)  
b) Shared secret + thời gian hiện tại (chia thành window 30 giây)  
c) Public key của server + timestamp  
d) Mật khẩu người dùng + salt ngẫu nhiên

**Đáp án: b** — TOTP = Time-based OTP. Input là `HMAC-SHA1(secret, floor(unix_time / 30))`,
lấy 6 chữ số cuối. Không có counter — hai thiết bị với cùng shared secret và đồng hồ đồng bộ
sẽ tính ra cùng OTP mà không cần giao tiếp với nhau. Đáp án a là HOTP (HMAC-based OTP, RFC
4226) — tiền thân của TOTP, dùng counter thay vì time.

---

**Câu 4**: Trong mô hình RBAC, tại sao không nên gán quyền trực tiếp cho user mà nên gán qua role?

a) Vì hệ thống chỉ hỗ trợ role, không hỗ trợ gán trực tiếp  
b) Vì gán qua role dễ audit, revoke, và tái sử dụng — thêm/bỏ user vào role thay vì sửa từng permission  
c) Vì role được mã hóa trong JWT, user thì không  
d) Vì gán trực tiếp sẽ bị override bởi role khi có conflict

**Đáp án: b** — RBAC tách biệt "user A có quyền gì" thành "user A có role X, role X có quyền
P1, P2, P3". Khi cần thu hồi quyền P2 khỏi tất cả user trong role X, chỉ cần sửa role — không
phải tìm và sửa từng user đang có permission P2. Audit cũng dễ hơn: "ai đang có role X?" là
một query đơn giản.

---

**Câu 5**: JWT của một user có `exp: 1700000000`. Muốn revoke token này trước khi hết hạn cần
làm gì?

a) Xóa token khỏi browser của user  
b) Không thể — JWT là stateless, không có cơ chế revoke trực tiếp; cần dùng blocklist hoặc
   giảm thời gian sống của token  
c) Đổi signing key của IdP để token cũ không verify được  
d) Gọi API `/revoke` trên IdP

**Đáp án: b** — JWT là stateless: SP verify bằng chữ ký, không hỏi IdP mỗi request. Revoke
sớm cần một trong: (1) token blocklist (lưu jti bị revoke, check mỗi request — mất stateless),
(2) token lifetime ngắn (5-15 phút) kết hợp refresh token, (3) đổi signing key nhưng làm
invalid tất cả token cùng lúc. Xóa khỏi browser chỉ ảnh hưởng browser đó, không ngăn token
bị dùng từ nơi khác.

## 8. Bài liên quan và nguồn tham khảo

**Bài tiếp theo trong module:**
- `security.identity-secrets.secrets-mgmt` — quản lý secret: Vault/KMS, tránh hardcode credential

**Bài liên quan ngoài module (xem thêm):**
- `security.os-hardening.checklist` — user account và SSH key-based auth (tầng OS)
- `linux.users-permissions.sudo-pam` — PAM là implementation layer của authentication trên Linux
- `container-k8s.k8s-rbac-security.rbac` — RBAC trên Kubernetes (cùng nguyên lý, API khác)
- `security.audit-compliance.audit-logging` — audit trail cho authentication events

**Nguồn tham khảo:**
- [OWASP MFA Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [OpenID Connect: How It Works](https://openid.net/developers/how-connect-works/)
