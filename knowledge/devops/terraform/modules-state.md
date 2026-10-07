---
id: devops.terraform.modules-state
title: "Terraform module và quản lý state an toàn (remote backend, lock)"
domain: devops
module: devops.terraform
level: "chuyên sâu"
prerequisites: ["devops.terraform.fundamentals"]
applies_to:
  - "Terraform 1.x — cú pháp minh hoạ; không có Terraform cài trên máy demo"
status: draft
sources:
  - "https://developer.hashicorp.com/terraform/language/modules"
  - "https://developer.hashicorp.com/terraform/language/state/backends"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Khi hạ tầng lớn hơn — nhiều môi trường (dev/staging/prod), nhiều team — hai vấn đề nổi lên:
(1) code lặp lại (cùng pattern VPC+subnet+SG nhân ra 5 môi trường), (2) state file local bị
mất hoặc hai người `apply` cùng lúc gây conflict. **Module** giải quyết vấn đề tái sử dụng
code. **Remote backend với state locking** giải quyết vấn đề state an toàn và cộng tác.
Bài này xây dựng kỹ năng cần thiết để dùng Terraform trong team, không chỉ trên máy cá nhân.

## 2. Khái niệm cốt lõi

> Tất cả ví dụ trong bài này là **minh hoạ** — Terraform không cài trên máy demo.

**Module**: tập hợp `.tf` file trong một thư mục, đóng gói pattern tái sử dụng. Mọi thư mục
Terraform đều là module — khi gọi từ nơi khác thì gọi là "child module", nơi gọi là "root
module".

**Remote backend**: thay vì lưu `terraform.tfstate` trên máy local, lưu trên hệ thống tập
trung (S3, GCS, Azure Blob, Terraform Cloud). Lợi ích: không mất state, chia sẻ được giữa
team, encrypt at-rest.

**State locking**: khi một `terraform apply` đang chạy, backend lock state để ngăn người
khác chạy apply cùng lúc. Tránh race condition gây state corrupt. Với S3 backend, lock dùng
DynamoDB table.

**`terraform_remote_state`**: data source đọc output từ state của workspace khác — cách
truyền giá trị giữa hai Terraform project (ví dụ: project `network` tạo VPC, project `app`
đọc VPC ID từ state của `network`).

**Workspace**: nhiều state độc lập từ cùng config. Thường dùng cho dev/staging/prod. Mỗi
workspace có file state riêng trên backend.

## 3. Cách nó hoạt động

### Module

**Tạo module tái sử dụng**:

```
# Cấu trúc thư mục
modules/
└── vpc/
    ├── main.tf        # resource definitions
    ├── variables.tf   # input variables
    └── outputs.tf     # output values
```

```hcl
# modules/vpc/variables.tf
variable "cidr_block" {
  type        = string
  description = "CIDR block cho VPC"
}

variable "environment" {
  type    = string
  default = "staging"
}

variable "public_subnet_count" {
  type    = number
  default = 2
}
```

```hcl
# modules/vpc/main.tf
resource "aws_vpc" "this" {
  cidr_block = var.cidr_block
  tags = { Environment = var.environment }
}

resource "aws_subnet" "public" {
  count      = var.public_subnet_count   # tạo N subnet
  vpc_id     = aws_vpc.this.id
  cidr_block = cidrsubnet(var.cidr_block, 8, count.index)
    # cidrsubnet("10.0.0.0/16", 8, 0) → "10.0.0.0/24"
    # cidrsubnet("10.0.0.0/16", 8, 1) → "10.0.1.0/24"
}
```

```hcl
# modules/vpc/outputs.tf
output "vpc_id" {
  value = aws_vpc.this.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id   # list tất cả subnet ID
}
```

**Gọi module từ root**:

```hcl
# infra/production/main.tf
module "vpc" {
  source = "../../modules/vpc"   # đường dẫn relative đến module

  cidr_block          = "10.0.0.0/16"
  environment         = "production"
  public_subnet_count = 3
}

# Dùng output của module:
resource "aws_instance" "web" {
  subnet_id = module.vpc.public_subnet_ids[0]
}
```

**Module từ Terraform Registry** (không phải local):

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"   # registry source
  version = "~> 5.0"

  name = "my-vpc"
  cidr = "10.0.0.0/16"
  azs  = ["ap-southeast-1a", "ap-southeast-1b"]
}
```

Sau khi thêm module mới, phải chạy `terraform init` lại để tải module về.

### Remote Backend

**S3 backend với DynamoDB locking** (phổ biến với AWS):

```hcl
# versions.tf
terraform {
  backend "s3" {
    bucket         = "my-company-tfstate"
    key            = "production/terraform.tfstate"
    region         = "ap-southeast-1"
    encrypt        = true              # encrypt state at-rest bằng S3 SSE
    dynamodb_table = "terraform-locks" # table cho state locking
  }
}
```

DynamoDB table cần có primary key là `LockID` (string). Tạo một lần bằng AWS CLI hoặc
Terraform (bootstrap) rồi tất cả workspace dùng chung.

**Khi có người đang apply**, người khác `apply` sẽ thấy:

```
# output minh hoạ
Error: Error acquiring the state lock

  Lock Info:
    ID:        abc123
    Path:      production/terraform.tfstate
    Operation: OperationTypeApply
    Who:       user@machine
    Created:   2026-10-07 09:15:00 UTC

Terraform acquires a state lock to protect the state from being written
by multiple users at the same time. Please resolve the issue above and
try again. For most commands, you can disable locking with the
"-lock=false" flag, but this is not recommended.
```

**Force-unlock** (chỉ dùng khi chắc chắn không có apply nào đang chạy):

```bash
terraform force-unlock abc123   # ID từ thông báo lỗi
```

### Workspace

```bash
terraform workspace list         # liệt kê workspace
terraform workspace new staging  # tạo workspace mới
terraform workspace select prod  # chuyển sang workspace prod
terraform workspace show         # workspace hiện tại
```

Dùng `terraform.workspace` trong config để thay đổi giá trị theo môi trường:

```hcl
resource "aws_instance" "web" {
  instance_type = terraform.workspace == "production" ? "t3.medium" : "t3.micro"
}
```

### `terraform_remote_state`

```hcl
# Đọc output từ state của project network
data "terraform_remote_state" "network" {
  backend = "s3"
  config = {
    bucket = "my-company-tfstate"
    key    = "network/terraform.tfstate"
    region = "ap-southeast-1"
  }
}

resource "aws_instance" "web" {
  subnet_id = data.terraform_remote_state.network.outputs.public_subnet_ids[0]
}
```

## 4. Thực hành

**Cấu trúc multi-environment điển hình**:

```
infra/
├── modules/
│   ├── vpc/           # module tái sử dụng
│   └── webserver/
├── environments/
│   ├── staging/
│   │   ├── main.tf    # gọi modules với param staging
│   │   └── terraform.tfvars
│   └── production/
│       ├── main.tf    # gọi modules với param production
│       └── terraform.tfvars
└── bootstrap/
    └── main.tf        # tạo S3 bucket + DynamoDB cho backend
```

Thư mục riêng cho mỗi environment (thay vì workspace) khi config giữa staging và production
khác nhau đáng kể — dễ review và ít nhầm lẫn "đang ở workspace nào" hơn.

**Thứ tự bootstrap project mới**:
1. Tạo S3 bucket + DynamoDB bằng AWS CLI hoặc Terraform local state (thư mục `bootstrap/`)
2. Commit config backend vào `versions.tf`
3. Chạy `terraform init` — Terraform hỏi có migrate state local lên S3 không → yes
4. Xoá state local (`*.tfstate` trên máy), đảm bảo mọi thứ đọc từ S3

**Sensitive variable — tránh lộ secret**:

```hcl
variable "db_password" {
  type      = string
  sensitive = true   # Terraform che giấu trong plan output và logs
}
```

Truyền qua env var `TF_VAR_db_password` hoặc từ secret manager, không commit vào
`terraform.tfvars`.

## 5. Lỗi thường gặp và cách chẩn đoán

**`Error: Module not installed`** sau khi thêm module block: cần chạy `terraform init` lại
để Terraform tải module về. Module local cũng cần `init` lại nếu thêm mới.

**State lock không tự release** sau khi apply fail hoặc bị interrupt: lock vẫn còn trên
DynamoDB. Kiểm tra DynamoDB table trong AWS Console — nếu không có apply nào đang chạy, dùng
`terraform force-unlock <lock-id>`. Không force-unlock khi không chắc chắn.

**`count.index` out of range** khi xoá một item từ giữa list: Terraform dùng index 0,1,2...
— nếu xoá phần tử ở giữa, tất cả phần tử sau bị tính toán lại, có thể trigger replace.
Dùng `for_each` với map thay vì `count` với list khi cần delete một item cụ thể:

```hcl
variable "subnets" {
  type = map(string)
  default = {
    "public-a" = "10.0.0.0/24"
    "public-b" = "10.0.1.0/24"
  }
}

resource "aws_subnet" "this" {
  for_each   = var.subnets
  cidr_block = each.value
  tags       = { Name = each.key }
}
# Xoá "public-b" → chỉ subnet public-b bị destroy, public-a không bị ảnh hưởng
```

**Circular dependency**: resource A tham chiếu B, B tham chiếu A → Terraform không tính
được thứ tự. Fix: tách thành data source hoặc dùng `depends_on` thủ công để chỉ định
dependency rõ ràng khi không thể tham chiếu trực tiếp.

## 6. Tình huống thực tế

**Tình huống**: team 5 người cùng dùng Terraform, state lưu local, đã có 2 lần conflict khi
2 người apply cùng lúc, state bị corrupt. Muốn migrate sang remote backend.

**Kế hoạch migrate không downtime**:

1. **Tạo S3 bucket + DynamoDB** trên AWS (1 lần, bằng AWS CLI):
   ```bash
   # output minh hoạ
   aws s3api create-bucket --bucket my-tfstate --region ap-southeast-1 \
     --create-bucket-configuration LocationConstraint=ap-southeast-1
   aws s3api put-bucket-versioning --bucket my-tfstate \
     --versioning-configuration Status=Enabled
   aws dynamodb create-table --table-name terraform-locks \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST
   ```

2. **Thêm backend config** vào `versions.tf`:
   ```hcl
   terraform {
     backend "s3" {
       bucket         = "my-tfstate"
       key            = "production/terraform.tfstate"
       region         = "ap-southeast-1"
       encrypt        = true
       dynamodb_table = "terraform-locks"
     }
   }
   ```

3. **Chạy `terraform init`** — Terraform tự detect state local và hỏi migrate:
   ```
   # output minh hoạ
   Do you want to copy existing state to the new backend? (yes/no): yes
   Successfully configured the backend "s3"!
   ```

4. **Xoá state local**: `rm terraform.tfstate terraform.tfstate.backup` sau khi xác nhận
   state đã lên S3 (`terraform show` vẫn hoạt động).

5. **Thêm vào `.gitignore`**: `*.tfstate` (đề phòng ai đó commit lại).

6. **Thông báo team** chạy `terraform init` lại — sau đó mọi `apply` đều lock S3, hết xung đột.

## 7. Tự kiểm tra

**Câu 1**: Sau khi thêm `module "vpc" { source = "../../modules/vpc" }` vào config, bước
tiếp theo bắt buộc phải làm trước `terraform plan` là?

a) `terraform validate`  
b) `terraform init`  
c) `terraform refresh`  
d) Không cần làm gì thêm — plan tự detect module

**Đáp án: b** — `terraform init` tải module về thư mục `.terraform/modules/`. Không init
thì Terraform không biết module ở đâu và `plan` sẽ lỗi "Module not installed". Kể cả module
local (không cần download) cũng cần `init` lại để Terraform cập nhật dependency graph.
`validate` chạy được nhưng cũng cần init trước nếu module chưa được cài.

---

**Câu 2**: Tại sao nên dùng `for_each` với map thay vì `count` với list khi cần xoá một
resource cụ thể?

a) `for_each` nhanh hơn vì chạy song song  
b) `count` dùng index số, xoá phần tử giữa list làm index của các phần tử sau thay đổi →
   Terraform tính toán lại và có thể destroy/recreate chúng; `for_each` dùng key string, xoá
   một key không ảnh hưởng các key khác  
c) `for_each` hỗ trợ nhiều provider hơn `count`  
d) `count` không dùng được trong module

**Đáp án: b** — `count = 3` tạo resource với địa chỉ `resource.name[0]`, `[1]`, `[2]`. Xoá
phần tử index 1 → index 2 trở thành 1 → Terraform thấy resource `[1]` bị thay đổi (đổi từ
giá trị cũ sang giá trị mới) và resource `[2]` bị xoá — có thể trigger unexpected replace.
`for_each` với key `"public-a"`, `"public-b"`: xoá `"public-b"` chỉ xoá đúng resource đó,
`"public-a"` hoàn toàn không bị ảnh hưởng.

---

**Câu 3**: State locking trong Terraform giải quyết vấn đề gì?

a) Tránh người ngoài đọc được nội dung state file  
b) Tránh hai `terraform apply` chạy cùng lúc trên cùng state, gây race condition và
   có thể làm state corrupt  
c) Mã hoá state file trước khi lưu lên S3  
d) Ngăn apply nếu state không khớp với thực tế (drift)

**Đáp án: b** — lock là mutual exclusion: khi apply bắt đầu, backend ghi entry lock (ví dụ
item DynamoDB). Apply thứ hai thấy lock, dừng và thông báo ai đang giữ lock. Sau khi apply
đầu xong, lock được xoá. Không liên quan đến encryption (đó là `encrypt = true` riêng), đọc
state (plan cũng lock nhưng read-lock), hay state drift detection (đó là `terraform refresh`).

---

**Câu 4**: `terraform.workspace` trong config Terraform cho phép làm gì?

a) Đổi tên backend bucket theo môi trường  
b) Tham chiếu tên workspace hiện tại trong config, dùng để thay đổi giá trị resource
   (ví dụ: instance_type khác nhau giữa prod và staging)  
c) Tự động chọn `terraform.tfvars` đúng theo môi trường  
d) Tạo state file riêng tự động mà không cần remote backend

**Đáp án: b** — `terraform.workspace` là built-in variable trả về tên workspace hiện tại
(string). Dùng được trong expression: `terraform.workspace == "production" ? "t3.large" :
"t3.micro"`. Workspace tự động tạo state file riêng trên backend (key khác: `env:/staging/`
prefix với S3), nhưng backend config vẫn phải khai báo tường minh. `tfvars` không tự chọn
theo workspace — phải truyền `-var-file=staging.tfvars` tay.
<!-- TODO-VERIFY: định dạng key prefix chính xác khi dùng workspace với S3 backend (thường là "env:/<workspace>/terraform.tfstate" — cần đối chiếu với docs S3 backend hiện tại) -->

---

**Câu 5**: `data "terraform_remote_state"` dùng để làm gì và khi nào nên dùng?

a) Import resource từ state cũ sang state mới  
b) Đọc output từ state của một Terraform project khác, dùng để truyền giá trị
   giữa hai project độc lập (ví dụ: đọc VPC ID từ project `network`)  
c) Backup state file từ remote về local  
d) Sync state với thực tế (tương đương `terraform refresh`)

**Đáp án: b** — khi dự án lớn tách thành nhiều Terraform project (network, database, app),
cần truyền output từ project này sang project khác mà không gộp chung vào 1 state. Project
`app` dùng `data "terraform_remote_state" "network"` để đọc `outputs.vpc_id` từ state của
project `network`. Khác `terraform import` (đưa resource vào quản lý), `terraform refresh`
(sync state với thực tế), và backup (không có data source nào làm việc này).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan ngoài module (xem thêm):**
- `devops.cicd.tools` — `terraform plan` chạy trong CI (trên PR), `apply` khi merge vào main
- `devops.gitops.principles` — GitOps dùng Terraform với reconciliation tự động (Atlantis,
  Terraform Cloud, env0)
- `devops.ansible.roles` — Terraform provision infra (VM, network), Ansible configure bên
  trong VM — phân công rõ, không overlap

**Nguồn tham khảo:**
- [Terraform Language — Modules](https://developer.hashicorp.com/terraform/language/modules)
- [Terraform Language — State Backends](https://developer.hashicorp.com/terraform/language/state/backends)
