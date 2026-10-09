---
id: devops.git.fundamentals
title: "Git cơ bản: commit, branch, merge"
domain: devops
module: devops.git
level: "nền tảng"
prerequisites: []
applies_to:
  - "Git 2.x — chuẩn chung; ví dụ chạy thật trên Git 2.34.1 (Ubuntu 22.04)"
status: verified
sources:
  - "https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository"
  - "https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Git là nền tảng của mọi quy trình phát triển và vận hành hiện đại — CI/CD pipeline, Infrastructure
as Code, GitOps đều bắt đầu từ `git push`. Nhưng hầu hết lỗi Git không đến từ thiếu lệnh, mà đến
từ không hiểu mô hình lưu trữ: tại sao `git add` tách riêng với `git commit`, tại sao branch lại
"nhẹ" như vậy, và tại sao merge đôi khi tạo commit thêm còn đôi khi thì không. Bài này xây dựng
đúng mental model đó — hiểu cơ chế → dùng đúng công cụ, không đoán mò.

## 2. Khái niệm cốt lõi

**Ba khu vực của Git**:

```
Working directory  →  Staging area (Index)  →  Repository (.git/)
     (đã sửa)           (git add)               (git commit)
```

- **Working directory**: cây thư mục bạn đang chỉnh sửa trực tiếp.
- **Staging area (Index)**: "phòng chờ commit" — chứa snapshot NHỮNG GÌ sẽ vào commit tiếp theo.
  `git add` là bước chuyển từng thay đổi vào đây, không phải vào repository luôn.
- **Repository (`.git/`)**: lịch sử commit không thay đổi. `git commit` đóng gói staging area
  thành 1 commit mới, lưu vĩnh viễn.

Lý do tách `add` khỏi `commit`: bạn có thể sửa 5 file nhưng chỉ muốn commit 3, để lại 2 file
tiếp tục chỉnh. Staging area là nơi kiểm soát chính xác nội dung từng commit.

**Commit = snapshot, không phải diff**: Git lưu toàn bộ trạng thái file tại thời điểm commit
(nội dung giống file cũ thì chia sẻ chung, không lưu trùng). Mỗi commit có SHA-1 hash duy nhất
định danh, không thể thay đổi nội dung commit mà giữ nguyên hash.

**Branch = con trỏ nhẹ đến commit**: branch không phải "bản sao thư mục" — chỉ là 1 file text
chứa SHA của commit đầu nhánh. Tạo branch mới = tốn thêm đúng 1 file ~40 byte, tức thì.

**HEAD**: con trỏ đặc biệt chỉ "bạn đang ở đâu". Thường HEAD trỏ vào tên branch (→ branch trỏ
vào commit). Khi `git checkout <commit-hash>` trực tiếp, HEAD trỏ thẳng vào commit → "detached
HEAD state" — commit mới sẽ không thuộc branch nào.

## 3. Cách nó hoạt động

**Vòng đời thay đổi qua `git status`**:

```
$ git status
On branch master
Untracked files:
  feature.txt

$ git add feature.txt
$ git status
On branch master
Changes to be committed:
    new file:   feature.txt
```

`git add` chuyển file từ "Untracked" → "Changes to be committed" (staged). Sau `git commit`:

```
[master 367372f] add feature
 1 file changed, 1 insertion(+)
```

**Branch và lịch sử rẽ nhánh**:

```bash
# Tạo và checkout branch mới
git branch feature/login
git checkout feature/login
# (hoặc gộp lại: git checkout -b feature/login)

# Commit trên feature branch
echo "login page" > login.txt && git add . && git commit -m "add login page"

# Commit thêm trên master (sau khi checkout master)
git checkout master
echo "hotfix" > fix.txt && git add . && git commit -m "hotfix on master"
```

Lúc này, lịch sử đã rẽ nhánh:

```
$ git log --oneline --all --graph
* 6e336d5 hotfix on master
| * fc745fa add login page
|/
* 367372f add feature
* 9a3c794 first commit
```

**Merge — 2 kiểu**:

1. **Fast-forward**: khi nhánh đích không có commit mới nào sau khi nhánh nguồn rẽ ra — Git chỉ
   dịch con trỏ branch về phía trước, không tạo merge commit. Lịch sử thẳng.

2. **Three-way merge**: khi cả hai nhánh đều có commit mới (như ví dụ trên) — Git tìm điểm chung
   (common ancestor), tính hợp nhất 3 phía, tạo 1 merge commit có 2 parent:

```
$ git merge feature/login --no-ff -m "Merge branch feature/login"
$ git log --oneline --all --graph
*   cdf6658 Merge branch feature/login
|\
| * fc745fa add login page
* | 6e336d5 hotfix on master
|/
* 367372f add feature
* 9a3c794 first commit
```

**Cấu trúc `.git/HEAD`** — xác nhận HEAD là gì:

```
$ cat .git/HEAD
ref: refs/heads/master

$ cat .git/refs/heads/master
cdf66585c62e19c162d25a0bdc9f37dc65c4926f
```

HEAD trỏ vào tên branch, branch trỏ vào commit SHA. Khi bạn `git checkout <sha>`, `.git/HEAD`
chứa thẳng SHA đó thay vì `ref: refs/heads/...` — đó là detached HEAD.

## 4. Thực hành

**Khởi tạo repo và commit đầu tiên**:

```bash
mkdir my-project && cd my-project
git init
git config user.name "Your Name"
git config user.email "you@example.com"

echo "# My Project" > README.md
git add README.md
git commit -m "initial commit: add README"
```

**Kiểm tra staging area trước khi commit**:

```bash
git diff            # thay đổi chưa staged (working dir vs index)
git diff --staged   # thay đổi đã staged (index vs last commit)
git status          # tổng quan cả hai
```

**Tạo và merge branch**:

```bash
git checkout -b feature/search     # tạo + chuyển sang branch mới
# ... code, add, commit ...
git checkout main                  # quay về branch chính
git merge feature/search           # merge (fast-forward nếu main không có commit mới)
git branch -d feature/search       # dọn branch đã merge
```

**`.gitignore`** — loại trừ file không cần track:

```
node_modules/
*.log
.env
dist/
```

Sau khi tạo `.gitignore`: `git add .gitignore && git commit -m "add gitignore"`. File đã được
track trước đó phải dùng `git rm --cached <file>` để bỏ theo dõi (gitignore không hồi tố).

## 5. Lỗi thường gặp và cách chẩn đoán

**`git add .` bỏ sót file** — thường do `.gitignore` quá rộng hoặc file đã có trong cache.
Kiểm tra: `git status --ignored` để thấy file nào đang bị ignore.

**Merge conflict** — xảy ra khi cùng dòng bị sửa ở cả hai nhánh. Git đánh dấu trong file:

```
<<<<<<< HEAD
version on current branch
=======
version on feature branch
>>>>>>> feature/login
```

Sửa file thủ công (xóa markers, giữ lại nội dung đúng), rồi `git add <file>` và `git commit`.

**"detached HEAD state"** sau `git checkout <tag/sha>` — commit mới sẽ mất khi checkout branch
khác. Nếu cần lưu: `git checkout -b my-temp-branch` ngay trước khi checkout đi.

**Commit sai message, chưa push** — có thể sửa: `git commit --amend`. Đã push: tránh amend vì
sẽ gây conflict cho người khác đã pull commit đó.

## 6. Tình huống thực tế

**Tình huống**: bạn đang làm `feature/payment` thì có bug critical trên `main`. Cần fix ngay
mà không mất code đang làm dở.

```bash
# Lưu code dở vào stash (chi tiết ở bài workflows)
git stash push -m "WIP: payment form validation"

# Tạo branch hotfix từ main
git checkout main
git checkout -b hotfix/cart-null-pointer

# Fix bug, commit, merge về main
echo "fix" >> cart.js && git add . && git commit -m "fix: null pointer in cart"
git checkout main && git merge hotfix/cart-null-pointer
git branch -d hotfix/cart-null-pointer

# Quay lại feature, lấy lại code dở
git checkout feature/payment
git stash pop
```

`git stash` lưu working directory + staging area vào stack tạm, trả lại working directory sạch.
`git stash pop` khôi phục lại (chi tiết ở bài `devops.git.workflows`).

## 7. Tự kiểm tra

**Câu 1**: Bạn sửa 3 file A, B, C. Chạy `git add A B` rồi `git commit`. File C sẽ ở trạng thái
nào?

a) Tự động được commit theo  
b) Bị xóa khỏi working directory  
c) Vẫn là untracked/modified trong working directory, không vào commit  
d) Được thêm vào commit tiếp theo tự động

**Đáp án: c** — `git add` chỉ đưa file A, B vào staging area. Commit chỉ đóng gói những gì ở
staging area. C vẫn ở working directory, không thay đổi, không bị xóa.

---

**Câu 2**: Branch trong Git về bản chất là gì?

a) Bản sao đầy đủ của toàn bộ repository  
b) Một tập hợp các diff giữa các commit  
c) Một file text chứa SHA của commit đầu nhánh  
d) Một thư mục riêng trong `.git/`

**Đáp án: c** — branch chỉ là 1 file trong `.git/refs/heads/<tên-branch>` chứa hash 40 ký tự.
Tạo mới hay xóa branch không đụng đến commit nào, không sao chép file nào.

---

**Câu 3**: Khi nào Git thực hiện fast-forward merge (không tạo merge commit)?

a) Khi merge dùng flag `--ff`  
b) Khi nhánh đích không có commit mới nào sau khi nhánh nguồn rẽ ra  
c) Khi cả hai nhánh thay đổi file khác nhau hoàn toàn  
d) Khi dùng `git merge --squash`

**Đáp án: b** — fast-forward xảy ra khi lịch sử là thẳng: branch đích (e.g. `main`) chưa tiến
thêm bước nào kể từ điểm rẽ nhánh, nên Git chỉ cần dịch con trỏ về phía trước. `--ff` là flag
mặc định, không phải điều kiện; `--squash` không liên quan đến fast-forward.

---

**Câu 4**: `.git/HEAD` chứa `ref: refs/heads/main`. Điều này có nghĩa là?

a) HEAD đang ở trạng thái detached  
b) HEAD trỏ vào branch `main`, đang ở trạng thái bình thường  
c) Branch `main` bị hỏng  
d) Repository chưa có commit nào

**Đáp án: b** — `ref: refs/heads/main` là trạng thái bình thường khi bạn đang ở branch `main`.
Detached HEAD là khi `.git/HEAD` chứa thẳng SHA-1 hash (40 ký tự hex), không phải `ref: ...`.

---

**Câu 5**: Lệnh nào kiểm tra sự khác biệt giữa những gì đã staged (sẽ vào commit) với commit
trước?

a) `git diff`  
b) `git diff HEAD`  
c) `git diff --staged`  
d) `git status`

**Đáp án: c** — `git diff` (không tham số) so sánh working directory vs staging area. `git diff
--staged` (hoặc `--cached`) so sánh staging area vs last commit — đây là thứ sẽ vào commit tiếp.
`git diff HEAD` so sánh cả working directory lẫn staged vs last commit (tổng hợp cả hai).

## 8. Bài liên quan và nguồn tham khảo

**Bài tiếp theo trong module:**
- `devops.git.workflows` — rebase, xử lý conflict chi tiết, branching strategy

**Bài liên quan ngoài module (xem thêm):**
- `devops.cicd.concepts` — CI/CD pipeline bắt đầu từ git push
- `linux.shell-scripting.bash-basics` — scripting dùng trong git hooks

**Nguồn tham khảo:**
- [Pro Git — Recording Changes](https://git-scm.com/book/en/v2/Git-Basics-Recording-Changes-to-the-Repository)
- [Pro Git — Branches in a Nutshell](https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell)
