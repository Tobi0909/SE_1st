---
id: devops.git.workflows
title: "Git workflow: rebase, xử lý conflict, branching strategy"
domain: devops
module: devops.git
level: "vận hành"
prerequisites: ["devops.git.fundamentals"]
applies_to:
  - "Git 2.x — chuẩn chung; ví dụ chạy thật trên Git 2.34.1 (Ubuntu 22.04)"
status: draft
sources:
  - "https://git-scm.com/book/en/v2/Git-Branching-Rebasing"
  - "https://git-scm.com/book/en/v2/Git-Tools-Stashing-and-Cleaning"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

`git merge` và `git rebase` đều tích hợp thay đổi từ một branch vào branch khác — nhưng
tạo ra lịch sử commit rất khác nhau. Dùng sai làm lịch sử khó đọc, khó bisect, và có thể
gây chaos trong team khi rebase commit đã publish. Bài này giải thích khi nào dùng cái nào,
cách xử lý conflict đúng bài bản, và tại sao GitHub Flow phổ biến hơn GitFlow trong team
nhỏ/CI-CD-heavy.

## 2. Khái niệm cốt lõi

**Rebase = "dời gốc" branch**: thay vì tạo merge commit, rebase lấy từng commit trên feature
branch và "replay" lại trên đầu target branch. Kết quả: lịch sử thẳng, không có merge commit.

**Merge = lưu lại lịch sử thật**: tạo merge commit ghi lại đúng thực tế "hai nhánh đã hội tụ
tại đây". Lịch sử trung thực nhưng có thể nhiều merge commit lồng nhau.

**Quy tắc vàng của rebase**: **không rebase commit đã push lên shared branch**. Rebase tạo
commit MỚI với SHA khác — người khác đã pull commit cũ sẽ bị diverged history, phải force merge
rất phức tạp. Rebase an toàn khi: branch là của riêng bạn và chưa push, hoặc cả team đã đồng ý.

**git stash**: lưu tạm working directory + staging area khi cần chuyển branch giữa chừng mà
không muốn commit code chưa xong.

## 3. Cách nó hoạt động

**Rebase thay đổi base của branch**:

```
# Trước rebase
* a6c2195 auth: add logout     ← feature/auth HEAD
* 05839e1 auth: add login
| * c55ebba main: update docs  ← master HEAD
|/
* 15e669d initial

$ git checkout feature/auth
$ git rebase master

# Sau rebase — commit được replay với SHA mới
* 9dc1f40 auth: add logout     ← feature/auth HEAD (SHA khác!)
* 4b8a1f1 auth: add login      (SHA khác!)
* c55ebba main: update docs    ← master HEAD
* 15e669d initial
```

Sau rebase, `git merge feature/auth` vào master sẽ là fast-forward (lịch sử thẳng, không merge
commit). Đây là pattern phổ biến: rebase trước → merge/squash vào main.

**Interactive rebase — dọn dẹp lịch sử trước khi merge**:

```bash
# Squash 3 commit cuối thành 1 trước khi merge
git rebase -i HEAD~3
```

Editor mở ra, mỗi dòng là 1 commit:

```
pick 4b8a1f1 auth: add login
pick 9dc1f40 auth: add logout
pick ff12a3b auth: fix typo in logout message
```

Đổi `pick` → `squash` (hoặc `s`) cho commit cần gộp vào commit trên:

```
pick 4b8a1f1 auth: add login
squash 9dc1f40 auth: add logout
squash ff12a3b auth: fix typo in logout message
```

Lưu → editor mới cho phép sửa message của commit gộp.

**Xử lý merge conflict**:

```bash
$ git merge feature/refactor
Auto-merging app.py
CONFLICT (content): Merge conflict in app.py
Automatic merge failed; fix conflicts and then commit the result.

$ cat app.py
line1
<<<<<<< HEAD
optimized_code
=======
refactored_code
>>>>>>> feature/refactor
```

Markers:
- `<<<<<<< HEAD` → `=======`: phiên bản của branch hiện tại (HEAD)
- `=======` → `>>>>>>>`: phiên bản của branch đang merge vào

Giải quyết: sửa file thủ công (xóa cả 3 dòng marker, giữ nội dung muốn), rồi:

```bash
git add app.py
git commit   # Git tự điền message "Merge branch ..."
```

Nếu muốn hủy merge đang dở: `git merge --abort`.

**git stash — lưu tạm code chưa xong**:

```bash
# Lưu vào stash (bao gồm cả untracked files với -u)
git stash push -u -m "WIP: experiment"

# Xem danh sách stash
git stash list
# stash@{0}: On feature/auth: WIP: experiment

# Khôi phục và xóa stash đầu tiên
git stash pop

# Khôi phục mà không xóa (để dùng ở branch khác)
git stash apply stash@{0}
```

## 4. Thực hành

**Workflow điển hình với rebase**:

```bash
# 1. Tạo feature branch từ main
git checkout main && git pull
git checkout -b feature/payment

# 2. Code và commit (nhiều commit nhỏ ổn)
git add . && git commit -m "WIP: payment form"
git add . && git commit -m "WIP: stripe integration"
git add . && git commit -m "fix: handle card decline"

# 3. Main có thêm commit mới → đồng bộ trước khi tạo PR
git fetch origin
git rebase origin/main    # replay feature commits lên đầu main mới nhất

# 4. Dọn lịch sử (squash 3 commit WIP thành 1 commit rõ ràng)
git rebase -i origin/main

# 5. Push (force với --force-with-lease vì đã rebase — an toàn hơn --force)
git push --force-with-lease origin feature/payment

# 6. Tạo Pull Request → merge (squash hoặc merge commit tuỳ team)
```

`--force-with-lease` an toàn hơn `--force`: từ chối nếu remote có commit mà bạn chưa pull
(tránh vô tình ghi đè commit của người khác trên cùng branch).

**git cherry-pick — lấy 1 commit cụ thể từ branch khác**:

```bash
# Lấy commit SHA abc1234 từ branch khác mà không merge toàn bộ branch
git cherry-pick abc1234
```

Dùng khi: hotfix đã merge vào release branch cần backport lên main, hoặc lấy 1 commit thử
nghiệm từ feature branch chưa sẵn sàng.

## 5. Lỗi thường gặp và cách chẩn đoán

**Rebase conflict nhiều lần** — xảy ra khi 1 dòng bị sửa ở nhiều commit trong chuỗi rebase.
Mỗi commit replay có thể gây conflict riêng. Giải pháp: `git add <file>` sau khi sửa conflict,
rồi `git rebase --continue` (không `git commit`). Để hủy toàn bộ rebase: `git rebase --abort`.

**Push bị rejected sau rebase** — vì SHA đã thay đổi so với remote. Nếu branch là của riêng
bạn: `git push --force-with-lease`. Nếu branch được share: không rebase, dùng merge.

**`git stash pop` có conflict** — stash không thể apply sạch lên working directory hiện tại.
Giải quyết conflict như merge conflict bình thường, rồi `git stash drop` để xóa stash đã áp.

**Mất commit sau `git rebase -i`** — do xóa nhầm dòng trong editor (bỏ `pick` = bỏ commit).
Khôi phục: `git reflog` tìm SHA cũ → `git checkout -b recovery <sha>`.

## 6. Tình huống thực tế

**GitFlow vs GitHub Flow vs Trunk-Based**:

| | GitFlow | GitHub Flow | Trunk-Based |
|--|---------|-------------|-------------|
| **Nhánh chính** | `main` + `develop` | `main` | `main` |
| **Feature** | Từ `develop`, merge về `develop` | Từ `main`, merge về `main` | Commit thẳng hoặc short-lived branch (< 1 ngày) |
| **Release** | Branch `release/x.y` | Tag trên `main` | Tag trên `main` |
| **Hotfix** | Branch `hotfix/` từ `main` | Branch từ `main` | Patch trực tiếp |
| **Phù hợp** | Versioned software, release schedule cứng | Web service, deploy thường xuyên | CI/CD mạnh, team cao cấp |

**Lựa chọn thực tế**: với team dùng Docker + CI/CD deploy nhiều lần/ngày, **GitHub Flow** là
đủ — `main` luôn deployable, feature branch ngắn (1-3 ngày), PR là cơ chế review. GitFlow
có giá trị khi cần maintain song song nhiều version (v1.x và v2.x cùng lúc).

**Ví dụ GitHub Flow hoàn chỉnh**:

```bash
git checkout main && git pull origin main
git checkout -b feature/user-avatar   # branch từ main

# Code, commit...
git push -u origin feature/user-avatar

# Tạo PR trên GitHub → code review → CI pass → squash merge
# Sau merge:
git checkout main && git pull
git branch -d feature/user-avatar
```

Squash merge trên GitHub (nút "Squash and merge") gộp tất cả commit của PR thành 1 commit trên
main — lịch sử main sạch, mỗi PR = 1 commit, dễ `git revert` nếu cần rollback.

## 7. Tự kiểm tra

**Câu 1**: Bạn đang trên `feature/search` và muốn đồng bộ các commit mới của `main` vào branch
của mình, giữ lịch sử thẳng. Lệnh nào phù hợp?

a) `git merge main`  
b) `git rebase main`  
c) `git pull origin main`  
d) `git cherry-pick main`

**Đáp án: b** — `git rebase main` replay commit của `feature/search` lên đầu `main`, giữ lịch
sử thẳng. `git merge main` cũng đồng bộ được nhưng tạo merge commit. `git pull origin main`
chỉ hoạt động nếu đang ở branch `main`, và sẽ merge không phải rebase theo mặc định.

---

**Câu 2**: Khi giải quyết merge conflict, sau khi sửa file và xóa conflict markers xong, bước
tiếp theo là?

a) `git merge --continue`  
b) `git commit` ngay  
c) `git add <file>` rồi `git commit`  
d) `git reset` rồi thử lại

**Đáp án: c** — phải `git add` file đã sửa để đánh dấu conflict đã giải quyết, sau đó `git
commit` hoàn tất merge. `git merge --continue` cũng hợp lệ (nó tự chạy `git commit`), nhưng
thiếu `git add` trước thì cả hai đều báo lỗi "you have unmerged paths".

---

**Câu 3**: `git stash push -u` khác `git stash push` ở điểm nào?

a) `-u` lưu cả untracked files (file chưa bao giờ `git add`)  
b) `-u` lưu kể cả file đã committed  
c) `-u` không tạo entry trong stash, chỉ lưu vào clipboard  
d) `-u` là viết tắt của `--update-index`

**Đáp án: a** — mặc định `git stash` chỉ lưu: (1) tracked files đã modified, (2) staged changes.
Untracked files (chưa từng `git add`) bị bỏ qua nếu không có `-u`/`--include-untracked`.

---

**Câu 4**: `git push --force-with-lease` an toàn hơn `git push --force` vì?

a) Nó tự động resolve conflict trước khi push  
b) Nó từ chối nếu remote có commit mà local chưa fetch  
c) Nó yêu cầu xác nhận thêm từ người dùng  
d) Nó chỉ force push được branch của mình, không được push lên `main`

**Đáp án: b** — `--force-with-lease` so sánh "lease" (remote tracking ref bạn đã biết) với
remote thật. Nếu ai đó push thêm commit lên remote branch sau lần fetch cuối của bạn, lệnh bị
từ chối thay vì ghi đè. `--force` không kiểm tra điều này.

---

**Câu 5**: Team bạn dùng GitHub Flow và muốn `main` luôn có lịch sử sạch, mỗi feature = 1 commit
rõ ràng. Nút merge nào trên GitHub phù hợp nhất?

a) "Create a merge commit"  
b) "Rebase and merge"  
c) "Squash and merge"  
d) "Fast-forward merge"

**Đáp án: c** — "Squash and merge" gộp tất cả commit của PR thành 1 commit duy nhất trên `main`,
commit message có thể chỉnh sửa rõ ràng. "Create a merge commit" giữ nguyên commit WIP nhỏ lẻ.
"Rebase and merge" replay từng commit riêng lẻ (không squash). GitHub không có nút "fast-forward
merge" riêng (fast-forward chỉ xảy ra tự động khi không có diverge).

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan ngoài module (xem thêm):**
- `devops.cicd.concepts` — pipeline trigger từ git event (push, PR)
- `devops.cicd.tools` — GitHub Actions, GitLab CI dùng git event

**Nguồn tham khảo:**
- [Pro Git — Rebasing](https://git-scm.com/book/en/v2/Git-Branching-Rebasing)
- [Pro Git — Stashing and Cleaning](https://git-scm.com/book/en/v2/Git-Tools-Stashing-and-Cleaning)
