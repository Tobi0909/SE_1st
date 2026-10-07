---
id: devops.terraform.fundamentals
title: "Terraform: provider, resource, state"
domain: devops
module: devops.terraform
level: "vận hành"
prerequisites: []
applies_to:
  - "Terraform 1.x (OpenTofu tương thích cú pháp) — cú pháp minh hoạ; không có Terraform
    cài trên máy demo, output lấy theo tài liệu chính thức developer.hashicorp.com/terraform"
status: draft
sources:
  - "https://developer.hashicorp.com/terraform/intro"
  - "https://developer.hashicorp.com/terraform/language/state"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Click chuột trong AWS Console tạo được 1 server trong 2 phút. Tạo lại đúng cấu hình đó —
cùng VPC, security group, IAM role, tag — sau 3 tháng thì không ai nhớ đã làm gì. Terraform
giải quyết bằng cách mô tả **toàn bộ hạ tầng trong file code** (Infrastructure as Code):
version-controlled, review được qua PR, reproduce được bất kỳ lúc nào. Điểm khác biệt so với
shell script: Terraform biết **trạng thái hiện tại** — không tạo lại resource đã tồn tại, chỉ
thay đổi phần khác biệt giữa code và thực tế. Bài này xây dựng mental model: provider là
"biết nói chuyện với ai", resource là "tạo cái gì", state là "đang có gì".

## 2. Khái niệm cốt lõi

> Tất cả lệnh và output trong bài này là **minh hoạ** — Terraform không cài trên máy demo.

**Infrastructure as Code (IaC)**: mô tả hạ tầng bằng file code (`.tf`), lưu trong git. Thay
vì click UI hoặc gọi API thủ công, Terraform đọc file và tự tạo/sửa/xoá resource để khớp
với trạng thái mong muốn.

**Provider**: plugin giúp Terraform giao tiếp với một nền tảng cụ thể (AWS, GCP, Azure,
Kubernetes, GitHub...). Provider định nghĩa các resource type có thể dùng. Lấy từ
[Terraform Registry](https://registry.terraform.io).

**Resource**: đơn vị cơ bản trong Terraform — một thứ cần tạo (EC2 instance, S3 bucket,
DNS record, Kubernetes deployment...). Khai báo bằng block `resource "type" "name"`.

**State file (`terraform.tfstate`)**: file JSON ghi lại tất cả resource Terraform đang
quản lý, kèm metadata (ID thực tế trên provider). Đây là **source of truth** để Terraform
biết hiện tại hạ tầng đang như thế nào. Không xoá tay file này.

**Plan / Apply**: quy trình 3 bước của Terraform:
- `terraform init`: tải provider plugins
- `terraform plan`: so sánh state + code → tạo execution plan (diff hạ tầng)
- `terraform apply`: thực thi plan, cập nhật hạ tầng và state file

**Idempotent**: chạy `apply` nhiều lần với cùng config → kết quả như nhau. Nếu resource
đã đúng trạng thái, Terraform báo "No changes" và không làm gì.

## 3. Cách nó hoạt động

**Cấu trúc file cơ bản**:

```hcl
# versions.tf — khai báo Terraform version và required providers
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"        # ~> 5.0 nghĩa là >= 5.0, < 6.0
    }
  }
}

# main.tf — provider config và resources
provider "aws" {
  region = "ap-southeast-1"     # Singapore
}

resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"

  tags = {
    Name        = "main-vpc"
    Environment = "production"
  }
}

resource "aws_subnet" "public" {
  vpc_id            = aws_vpc.main.id   # tham chiếu attribute của resource khác
  cidr_block        = "10.0.1.0/24"
  availability_zone = "ap-southeast-1a"

  tags = {
    Name = "public-subnet"
  }
}
```

**Tham chiếu giữa resource**: `aws_vpc.main.id` — Terraform tự suy ra dependency, tạo VPC
trước rồi mới tạo subnet. Không cần khai báo thứ tự tay.

**Output của `terraform plan`** (output minh hoạ):

```
Terraform used the selected providers to generate the following execution plan.
Resource actions are indicated with the following symbols:
  + create

Terraform will perform the following actions:

  # aws_vpc.main will be created
  + resource "aws_vpc" "main" {
      + cidr_block = "10.0.0.0/16"
      + id         = (known after apply)
      + tags       = {
          + "Environment" = "production"
          + "Name"        = "main-vpc"
        }
    }

  # aws_subnet.public will be created
  + resource "aws_subnet" "public" {
      + vpc_id     = (known after apply)
      + cidr_block = "10.0.1.0/24"
      + id         = (known after apply)
    }

Plan: 2 to add, 0 to change, 0 to destroy.
```

`+` = tạo mới, `~` = sửa in-place, `-/+` = xoá rồi tạo lại (replace), `-` = xoá.

**`terraform apply`** xác nhận plan rồi thực thi, cập nhật `terraform.tfstate`.

**Variables — tham số hoá config**:

```hcl
# variables.tf
variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "staging"
}

variable "vpc_cidr" {
  type = string
}

# Dùng trong resource:
resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr
  tags = {
    Environment = var.environment
  }
}
```

Truyền giá trị: file `terraform.tfvars`, env var `TF_VAR_vpc_cidr`, hoặc flag `-var`.

**Outputs — export giá trị sau apply**:

```hcl
# outputs.tf
output "vpc_id" {
  description = "ID của VPC vừa tạo"
  value       = aws_vpc.main.id
}
```

Dùng để truyền giá trị giữa các Terraform workspace, hoặc đọc từ script bên ngoài.

## 4. Thực hành

**Quy trình làm việc điển hình**:

```bash
# 1. Khởi tạo — tải providers (chạy 1 lần khi mới clone hoặc thêm provider)
terraform init

# 2. Format và validate
terraform fmt          # tự format file .tf theo chuẩn
terraform validate     # kiểm tra cú pháp và logic cơ bản (không cần credentials)

# 3. Xem diff hạ tầng
terraform plan
terraform plan -out=tfplan   # lưu plan vào file để apply sau

# 4. Apply
terraform apply                  # hỏi xác nhận (yes/no)
terraform apply -auto-approve    # không hỏi (dùng trong CI/CD)
terraform apply tfplan           # apply từ file plan đã lưu

# 5. Xem state
terraform show                   # in state hiện tại
terraform state list             # liệt kê resource đang quản lý
terraform output                 # in giá trị output

# 6. Xoá toàn bộ
terraform destroy                # xoá mọi resource trong state
```

**Cấu trúc thư mục chuẩn**:

```
infra/
├── versions.tf        # required_version, required_providers
├── main.tf            # provider config + resource chính
├── variables.tf       # khai báo variable
├── outputs.tf         # output values
├── terraform.tfvars   # giá trị variable (KHÔNG commit nếu chứa secret)
└── .terraform/        # providers đã tải (gitignored)
   └── providers/
```

**`.gitignore` cho Terraform**:

```gitignore
.terraform/
*.tfstate
*.tfstate.backup
terraform.tfvars      # nếu chứa secrets (API key, password)
tfplan
```

## 5. Lỗi thường gặp và cách chẩn đoán

**`Error: No valid credential sources found`**: Terraform không có credentials để gọi API
provider. Fix: set env var (`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`, hoặc `gcloud auth
application-default login` cho GCP), hoặc cấu hình trong `provider` block.

**`Error: Inconsistent dependency lock file`**: file `.terraform.lock.hcl` (lock file của
provider versions) không khớp với versions.tf. Fix: `terraform init -upgrade`.

**Resource bị destroy và tạo lại không mong muốn** (`-/+` trong plan): một số attribute
của resource không thể sửa in-place — thay đổi nó buộc Terraform phải xoá và tạo lại.
Ví dụ: đổi `availability_zone` của EC2. Xem kỹ plan, dùng `lifecycle { create_before_destroy
= true }` nếu cần giảm downtime.

**State drift**: thực tế (ai đó sửa tay trên console) khác với state file. `terraform plan`
sẽ thấy diff. Fix: `terraform refresh` để sync state với thực tế, hoặc `terraform import`
để đưa resource tạo ngoài Terraform vào quản lý.

**`terraform.tfstate` bị commit lên git**: state có thể chứa secrets (password DB, private
key). Luôn `.gitignore` state file; dùng remote backend (S3, Terraform Cloud) để lưu state
an toàn.

## 6. Tình huống thực tế

**Tình huống**: team đang tạo server tay qua AWS Console. Mỗi lần tạo môi trường mới
(staging, UAT) mất 2 giờ và hay thiếu bước. Muốn chuyển sang Terraform.

**Chiến lược migrate**:

1. **Import resource hiện có** vào Terraform state (không xoá đi tạo lại):
   ```hcl
   import {
     to = aws_instance.web
     id = "i-0abc123def456"   # ID thực tế trên AWS
   }
   resource "aws_instance" "web" { ... }
   ```
   Terraform 1.5+ hỗ trợ `import` block trong config (thay cho lệnh `terraform import`).

2. **Dùng `terraform plan` để verify**: sau khi import, chạy `plan` — nếu ra "No changes"
   thì config đang match thực tế. Nếu có diff, sửa config để match trước khi apply.

3. **Tách môi trường bằng workspace hoặc thư mục riêng**:
   - `terraform workspace new staging` — cùng config, state riêng.
   - Hoặc thư mục `infra/staging/`, `infra/production/` — đơn giản hơn khi config
     staging và production khác nhau nhiều.

4. **Remote state ngay từ đầu** — đừng để state local lâu dài:
   ```hcl
   terraform {
     backend "s3" {
       bucket = "my-terraform-state"
       key    = "production/terraform.tfstate"
       region = "ap-southeast-1"
     }
   }
   ```
   State lưu trên S3, encrypt at-rest, locking qua DynamoDB — không sợ mất hay conflict.

## 7. Tự kiểm tra

**Câu 1**: `terraform plan` và `terraform apply` khác nhau như thế nào?

a) `plan` chạy nhanh hơn vì không cần credentials  
b) `plan` chỉ đọc state và tính toán diff, không thay đổi hạ tầng; `apply` thực thi diff đó  
c) `plan` tạo resource tạm, `apply` xác nhận giữ lại  
d) Hai lệnh giống nhau, `apply` chỉ thêm bước xác nhận

**Đáp án: b** — `plan` là read-only: đọc state hiện tại + cấu hình mong muốn → tính ra
execution plan (sẽ tạo/sửa/xoá gì). Không gọi bất kỳ API write nào. `apply` thực thi plan
đó, gọi API provider để thực sự thay đổi hạ tầng và cập nhật state file. `plan` vẫn cần
credentials để đọc trạng thái hiện tại từ provider (trừ `terraform validate` — không cần).

---

**Câu 2**: File `terraform.tfstate` chứa gì và tại sao không nên commit lên git public?

a) Chỉ chứa template config — an toàn commit  
b) Chứa trạng thái resource (ID, IP, metadata) — có thể lộ thông tin nhạy cảm như
   connection string DB, private key, hoặc cấu hình nội bộ  
c) Chứa credentials AWS/GCP theo mặc định  
d) File binary, không đọc được nên vô hại

**Đáp án: b** — state file là JSON ghi lại toàn bộ attribute của resource sau khi apply,
bao gồm cả giá trị sensitive (password DB, private key được Terraform tạo như TLS cert,
IP nội bộ...). Không nhất thiết chứa credentials AWS (credentials thường trong env var),
nhưng chứa đủ thông tin hạ tầng nội bộ để attacker lập bản đồ và tấn công. Dùng remote
backend (S3 với encryption, Terraform Cloud) và `.gitignore` state file.

---

**Câu 3**: Trong Terraform, `aws_subnet.public.vpc_id = aws_vpc.main.id` có ý nghĩa gì
ngoài việc gán giá trị?

a) Không có ý nghĩa gì thêm — chỉ là gán string  
b) Tạo implicit dependency: Terraform biết phải tạo `aws_vpc.main` TRƯỚC `aws_subnet.public`  
c) Tạo resource trong cùng availability zone  
d) Báo Terraform xoá subnet khi xoá VPC

**Đáp án: b** — tham chiếu `resource_type.name.attribute` tạo implicit dependency graph.
Terraform phân tích graph này để sắp xếp thứ tự thực thi đúng — subnet phụ thuộc VPC nên
VPC tạo trước. Khi destroy, thứ tự đảo ngược: subnet xoá trước, rồi VPC. Nếu không có
dependency (resource độc lập), Terraform tạo song song để tiết kiệm thời gian.

---

**Câu 4**: Ký hiệu `-/+` trong output `terraform plan` có nghĩa là?

a) Resource sẽ bị sửa in-place (một số attribute thay đổi)  
b) Resource sẽ bị xoá rồi tạo lại từ đầu (replace)  
c) Resource sẽ bị xoá và không tạo lại  
d) Resource mới sẽ được tạo, resource cũ được giữ lại song song

**Đáp án: b** — `-/+` là destroy + create (replace). Xảy ra khi attribute thay đổi nhưng
provider không hỗ trợ update in-place (ví dụ: đổi AMI của EC2, đổi storage type của RDS).
Terraform xoá resource cũ rồi tạo mới. Khác với `~` (update in-place) và `-` (destroy only)
và `+` (create only). Nếu thấy `-/+` ở resource quan trọng, cân nhắc `lifecycle {
create_before_destroy = true }` để giảm downtime.

---

**Câu 5**: `terraform init` cần chạy lại khi nào?

a) Mỗi lần chạy `terraform apply`  
b) Khi thêm/đổi provider, thêm module mới, hoặc clone repo lần đầu  
c) Khi có người khác thay đổi state file  
d) Chỉ cần chạy 1 lần duy nhất cho toàn bộ dự án

**Đáp án: b** — `init` tải provider plugins và modules về thư mục `.terraform/`. Cần chạy
lại khi: (1) clone repo lần đầu (`.terraform/` không commit vào git), (2) thêm provider mới
hoặc đổi version trong `required_providers`, (3) thêm `module` block mới. Không cần chạy
lại chỉ vì thay đổi resource config hay state — `plan`/`apply` không cần re-init nếu
provider đã tải.

## 8. Bài liên quan và nguồn tham khảo

**Bài tiếp theo trong module:**
- `devops.terraform.modules-state` — tổ chức code thành module tái sử dụng, remote backend,
  state locking

**Bài liên quan ngoài module (xem thêm):**
- `devops.ansible.fundamentals` — Terraform provision infra, Ansible configure: hai tool bổ
  sung nhau (Terraform giỏi tạo/xoá/thay thế resource, Ansible giỏi cấu hình bên trong)
- `devops.cicd.tools` — Terraform thường chạy trong CI/CD pipeline (plan trên PR, apply khi
  merge vào main)
- `devops.gitops.principles` — GitOps extend IaC: state mong muốn lưu trong git, agent tự
  sync thay vì người chạy `apply` tay

**Nguồn tham khảo:**
- [Terraform Introduction](https://developer.hashicorp.com/terraform/intro)
- [Terraform Language — State](https://developer.hashicorp.com/terraform/language/state)
