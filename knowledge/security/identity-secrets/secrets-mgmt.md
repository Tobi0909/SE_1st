---
id: security.identity-secrets.secrets-mgmt
title: "Quản lý secret: Vault/KMS cơ bản, tránh hardcode credential"
domain: security
module: security.identity-secrets
level: "vận hành"
prerequisites: []
applies_to:
  - "Nguyên lý chung; ví dụ dùng HashiCorp Vault OSS và AWS KMS concept"
  - "Git 2.x cho phần phát hiện secret trong source code"
status: verified
sources:
  - "https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html"
  - "https://developer.hashicorp.com/vault/docs/concepts/seal"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Mật khẩu database, API key của third-party service, private key của TLS certificate — đây là
những thứ kẻ tấn công tìm đầu tiên sau khi vào được hệ thống. Nhưng vấn đề thực tế không phải
"bảo vệ server" mà là "secret đang ở đâu?" — trong source code, trong biến môi trường, trong
file config không được giới hạn quyền đọc, trong Slack message còn đó từ 2 năm trước.

Bài này trả lời: secret nên ở đâu, được truy cập như thế nào, và làm gì khi đã lỡ lộ.

## 2. Khái niệm cốt lõi

### Phân loại secret theo vòng đời

| Loại secret | Ví dụ | Vòng đời điển hình |
|-------------|-------|-------------------|
| **Static secret** | DB password, API key bên thứ ba | Tuần → tháng (cần rotation thủ công) |
| **Dynamic secret** | Vault-generated DB credential | Phút → giờ (auto-expire) |
| **Encryption key** | KMS key, TLS private key | Năm (rotation theo compliance) |
| **Short-lived token** | JWT, OAuth access token | Giây → phút |

Dynamic secret là mục tiêu hướng tới: Vault tạo DB user mới với password ngẫu nhiên cho mỗi
request, lease 1 giờ. Khi service không còn cần, Vault revoke. Không có secret tồn tại đủ lâu
để kẻ tấn công khai thác.

### Tại sao hardcode nguy hiểm — git history vĩnh viễn

```bash
# Ai đó commit nhầm secret (output minh họa — đừng làm thật)
git commit -m "fix: add db config" # db.conf chứa DB_PASSWORD=s3cr3t

# Sau đó xóa file và commit lại
git rm db.conf && git commit -m "remove db.conf"
```

Secret vẫn tồn tại trong git history vĩnh viễn:

```
$ git log --all --oneline
a1b2c3d remove db.conf       ← người mới clone thấy file không còn
9f8e7d6 fix: add db config   ← nhưng secret vẫn ở đây
```

Ai clone repo đều có thể chạy `git show 9f8e7d6:db.conf` và thấy secret. Ngay cả khi xóa khỏi
remote repository — nếu ai đó đã `git clone` trước đó, họ vẫn có bản sao đầy đủ history.

**Giải pháp đúng**: không phải xóa file hay rewrite history — là **không bao giờ commit secret
vào git**. Rotate secret ngay khi phát hiện đã lộ, dù đã "xóa" rồi.

### Vault — kiến trúc cơ bản

HashiCorp Vault là secrets manager phổ biến nhất trong môi trường on-premises. Kiến trúc chính:

```
Client (app/user)
    │
    │ mTLS/token
    ▼
Vault Server
    ├── Auth Methods   ← "ai được phép?" (AppRole, K8s SA, AWS IAM, LDAP)
    ├── Secret Engines ← "lưu secret ở đâu?" (KV, Database, PKI, AWS)
    └── Policies       ← "được làm gì với secret nào?"
```

**Seal/Unseal**: Vault mã hóa toàn bộ storage backend bằng **master key**. Khi khởi động, Vault
ở trạng thái **Sealed** — không thể đọc bất kỳ secret nào. Unseal bằng cách cung cấp đủ số
lượng key shares (Shamir's Secret Sharing, ví dụ 3 trong 5 key holders). Sau khi unseal, Vault
giải mã master key vào RAM — mất điện hoặc restart là phải unseal lại.

**Auth Methods**: app xác thực với Vault bằng danh tính của chính nó, không phải bằng username/
password. Ví dụ:
- `AppRole`: app có `role_id` (public) + `secret_id` (private, rotate thường xuyên)
- `Kubernetes`: Pod dùng Service Account token được K8s cấp, Vault verify với K8s API
- `AWS IAM`: EC2/Lambda dùng instance profile, Vault verify với AWS STS

### KMS — mã hóa dữ liệu, không lưu secret

KMS (Key Management Service — AWS KMS, Google Cloud KMS, Azure Key Vault) không lưu secret theo
nghĩa thông thường. KMS lưu **encryption key** và thực hiện **envelope encryption**:

```
Data → plaintext
     + Data Encryption Key (DEK, sinh ngẫu nhiên)
     → encrypted_data

DEK + Master Key (trong KMS, không bao giờ rời KMS hardware)
   → encrypted_DEK

Lưu trữ: encrypted_data + encrypted_DEK (cả hai an toàn nếu KMS key không bị access)
Decrypt: gửi encrypted_DEK lên KMS → KMS trả về DEK → decrypt data local
```

KMS key không bao giờ rời khỏi KMS (HSM). Audit log mọi lần encrypt/decrypt — biết chính xác
ai dùng key lúc nào.

### Environment variable — tiện nhưng không đủ an toàn

```bash
# Cách hay thấy — không đủ an toàn
export DB_PASSWORD="s3cr3t"
./myapp
```

Vấn đề với env var (từ OWASP Secrets Management Cheat Sheet):
- **Được thừa kế bởi mọi child process** — nếu app spawn subprocess, subprocess thấy secret
- **Thường xuất hiện trong log** khi app crash và dump env (`/proc/<pid>/environ`)
- **Docker inspect** trả về env var của container nếu có quyền Docker socket
- **Không có audit trail** — không biết ai đọc, lúc nào

Thứ tự an toàn (tốt → kém):
1. **Vault agent / sidecar inject** → mount secret vào file với quyền chặt chẽ
2. **Secret trong file được giới hạn quyền** (`chmod 600`, chỉ process owner đọc được)
3. **Env var** (chấp nhận được cho dev/staging, không khuyến nghị cho production)
4. **Hardcode trong source code** — không bao giờ

## 3. Cách nó hoạt động

**Luồng app dùng Vault AppRole** (output minh họa — Vault không cài trên máy demo):

```
# 1. Admin tạo policy và role một lần
vault policy write myapp-policy - <<EOF
path "secret/data/myapp/*" {
  capabilities = ["read"]
}
EOF

vault auth enable approle
vault write auth/approle/role/myapp \
  token_policies="myapp-policy" \
  token_ttl=1h \
  secret_id_ttl=10m

# 2. App lấy token khi khởi động
ROLE_ID=$(vault read -field=role_id auth/approle/role/myapp/role-id)
SECRET_ID=$(vault write -field=secret_id -f auth/approle/role/myapp/secret-id)
TOKEN=$(vault write -field=token auth/approle/login \
  role_id=$ROLE_ID secret_id=$SECRET_ID)

# 3. App dùng token để đọc secret (token hết hạn sau 1 giờ)
vault kv get -field=password -token=$TOKEN secret/myapp/database
```

**Phát hiện secret trong git history** (chạy thật):

```bash
# Tìm pattern credential trong toàn bộ history
git log --all --oneline --diff-filter=A -- "*.env" "*.conf" "*config*" 2>/dev/null | head -5
```

Kết quả thực tế (repo này sạch, không tìm thấy gì):

```
$ git log --all --oneline --diff-filter=A -- "*.env" "*.conf" "*config*" 2>/dev/null | head -5
(no output)
```

Các tool phát hiện secret phổ biến: `git-secrets` (AWS), `truffleHog`, `detect-secrets` (Yelp),
`gitleaks` — chạy trong CI pipeline để chặn commit chứa secret trước khi merge.

## 4. Thực hành

**Kiểm tra file config không nên có quyền đọc rộng:**

```bash
# Tìm file có thể là config chứa credential và world-readable
find /etc /opt /var/www -name "*.conf" -o -name "*.ini" -o -name "*.env" \
  2>/dev/null | xargs ls -la 2>/dev/null | grep " -rw-r--r--\| -rwxr-xr-x" | head -10
```

File config chứa database password không nên có permission `644` — chỉ cần `640` (owner + group)
hoặc `600` (owner only).

**Pattern `.gitignore` cho secret files:**

```
# Thêm vào .gitignore ngay từ đầu project
.env
.env.*
*.pem
*.key
*_secret*
config/secrets.yml
config/credentials.yml.enc    # trừ khi đây là Rails encrypted credentials
```

**Kiểm tra biến môi trường của process đang chạy** (thật — xem process của chính shell):

```bash
# /proc/<pid>/environ lưu env var lúc process khởi động, null-delimited
tr '\0' '\n' < /proc/$$/environ | grep -v "^$" | head -5
```

Kết quả thực tế (rút gọn, username ẩn danh hóa):

```
SHELL=/bin/bash
USER=sysops-user
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOME=/home/sysops-user
LANG=en_US.UTF-8
```

Không có credential nào lộ ra trong `/proc/$$/environ` — đây là shell sạch. Nếu app set env var
credential trước khi fork subprocess, subprocess sẽ thấy credential trong `/proc/<child-pid>/environ`.

## 5. Lỗi thường gặp và cách chẩn đoán

**"Tôi đã xóa secret khỏi git rồi"** — như đã phân tích ở mục 2, history không mất. Giải pháp
thực tế khi lỡ commit secret: (1) **Rotate ngay** credential bị lộ — đây là ưu tiên số 1,
(2) Thông báo nếu có khả năng bị khai thác, (3) Sau đó mới xem xét rewrite history với
`git filter-branch`/`git filter-repo` — nhưng rewrite history không giúp gì nếu ai đó đã clone.

**Vault token hết hạn giữa request** — token TTL quá ngắn hoặc app không renew. Giải pháp:
dùng Vault agent (sidecar) tự động renew token, app chỉ đọc từ file được agent cập nhật.

**Secret rotation phá ứng dụng** — rotation cần **zero-downtime**: tạo credential mới, deploy
app đọc credential mới, verify hoạt động, rồi mới revoke credential cũ. Không revoke trước khi
deploy.

## 6. Tình huống thực tế

**Tình huống**: nhận thông báo từ GitHub "We found a potential secret in your repository" —
AWS access key `AKIA...` trong file `scripts/deploy.sh`, pushed cách đây 3 ngày.

Thứ tự hành động đúng:

```
1. ROTATE NGAY (ưu tiên tuyệt đối, trước khi làm bất kỳ điều gì khác):
   → AWS Console → IAM → User → Security credentials → Deactivate key AKIA...
   → Tạo key mới, update ứng dụng dùng key mới

2. Kiểm tra xem key đã bị dùng chưa:
   → AWS CloudTrail: filter theo AccessKeyId = AKIA...
   → Tìm action lạ từ IP không quen

3. Xử lý git history (sau khi đã rotate):
   → Thông báo team: history sắp bị rewrite
   → git filter-repo --invert-paths --path scripts/deploy.sh
   → Force push (coordinate với team)

4. Phòng ngừa tái phát:
   → Thêm deploy.sh vào .gitignore hoặc dùng env var
   → Cài gitleaks trong CI pipeline
   → Thêm pre-commit hook: git secrets --install
```

Bước 1 và 2 là quan trọng nhất. Bước 3 là cleanup, không phải giải pháp bảo mật.

## 7. Tự kiểm tra

**Câu 1**: Tại sao "xóa file chứa secret khỏi git và commit lại" KHÔNG giải quyết vấn đề bảo mật?

a) Vì git sẽ tự động re-add file đã xóa  
b) Vì secret vẫn còn trong git history và ai clone repo cũng có thể xem  
c) Vì GitHub không cho phép xóa file đã push  
d) Vì commit mới cũng bị quét tự động bởi GitHub

**Đáp án: b** — `git log` và `git show <commit>` cho phép xem nội dung của bất kỳ commit nào
trong history, kể cả commit đã không còn là HEAD. Khi ai clone repository, họ nhận toàn bộ
history. Secret bị expose cần được **rotate** (vô hiệu hóa credential cũ, tạo mới), không chỉ
"xóa" khỏi file hiện tại.

---

**Câu 2**: Vault ở trạng thái "Sealed" nghĩa là gì?

a) Vault đang bị tấn công và tự động khóa  
b) Vault chưa được unseal sau khi khởi động — không thể đọc hoặc ghi bất kỳ secret nào  
c) Vault đang trong chế độ maintenance  
d) Các client không thể kết nối tới Vault API

**Đáp án: b** — Khi Vault khởi động, nó đọc dữ liệu mã hóa từ storage backend nhưng chưa có
master key để giải mã, nên ở trạng thái Sealed. Mọi API call đều trả về `503 Service Unavailable`.
Unseal bằng cách cung cấp đủ key shares (hoặc tự động với Auto Unseal dùng KMS). Đây là thiết
kế có chủ ý: nếu server bị restart bất ngờ, secret không tự động accessible.

---

**Câu 3**: Envelope encryption trong KMS hoạt động như thế nào?

a) KMS mã hóa trực tiếp toàn bộ dữ liệu cần lưu  
b) App tạo DEK ngẫu nhiên để mã hóa data, KMS mã hóa DEK bằng master key — chỉ encrypted_DEK gửi lên KMS  
c) KMS tạo một copy mã hóa của toàn bộ dữ liệu để backup  
d) Data được mã hóa hai lần: một lần bằng app key, một lần bằng KMS key

**Đáp án: b** — Envelope encryption: (1) app sinh DEK ngẫu nhiên local, (2) mã hóa data với DEK,
(3) gửi DEK (nhỏ, vài byte) lên KMS để mã hóa bằng master key, (4) lưu cặp `(encrypted_data,
encrypted_DEK)`. Decrypt: gửi `encrypted_DEK` lên KMS → nhận lại DEK → decrypt data local.
KMS chỉ xử lý DEK nhỏ, không cần xử lý toàn bộ dữ liệu lớn qua mạng.

---

**Câu 4**: So với hardcode trong source code, environment variable an toàn hơn ở điểm nào và
vẫn có vấn đề gì?

a) Env var an toàn hoàn toàn vì chỉ OS mới đọc được  
b) Env var tốt hơn vì không vào git, nhưng vẫn bị thừa kế bởi subprocess và có thể lộ qua log/Docker inspect  
c) Env var và hardcode là như nhau về mặt bảo mật  
d) Env var an toàn hơn vì tự động mã hóa khi lưu

**Đáp án: b** — Env var tốt hơn hardcode (không vào git history, dễ rotate khi deploy), nhưng
không phải silver bullet: subprocess thừa kế env var, Docker `inspect` trả về env của container
nếu có quyền socket, một số logging framework log toàn bộ env khi crash. Env var chấp nhận được
cho non-production; production nên dùng vault injection hoặc mounted secret file với quyền
`600`.

---

**Câu 5**: Khi phát hiện AWS access key bị lộ trong git history, hành động đầu tiên là gì?

a) Rewrite git history để xóa commit chứa key  
b) Xóa repository và tạo repository mới  
c) Deactivate key bị lộ ngay lập tức và kiểm tra CloudTrail xem đã bị dùng chưa  
d) Thông báo cho toàn team trước khi làm gì

**Đáp án: c** — Rotate (deactivate + tạo mới) credential là ưu tiên số 1 — chặn kẻ tấn công
sử dụng key bị lộ. Kiểm tra CloudTrail là bước thứ hai để đánh giá thiệt hại. Rewrite history
và thông báo team là các bước cleanup sau, không thay thế được rotate. Xóa repository (b) phá
hủy tất cả code và history — không hợp lệ về mặt vận hành và cũng không giúp gì nếu ai đã clone.

## 8. Bài liên quan và nguồn tham khảo

**Bài trước trong module:**
- `security.identity-secrets.identity` — SSO, MFA, RBAC

**Bài liên quan ngoài module (xem thêm):**
- `security.os-hardening.checklist` — quyền file cho secret files (`chmod 600`)
- `devops.cicd.tools` — tích hợp secret scanning vào CI pipeline (gitleaks, detect-secrets)
- `container-k8s.k8s-workload.configmap-secret` — Secret resource trong K8s, base64 KHÔNG phải mã hóa
- `monitoring.logging.fundamentals` — audit log cho secret access events

**Nguồn tham khảo:**
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [HashiCorp Vault: Seal/Unseal concept](https://developer.hashicorp.com/vault/docs/concepts/seal)
