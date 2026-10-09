---
id: devops.cicd.concepts
title: "CI/CD: khái niệm pipeline, stage, artifact"
domain: devops
module: devops.cicd
level: "nền tảng"
prerequisites: ["devops.git.fundamentals"]
applies_to:
  - "Platform-agnostic — nguyên lý áp dụng cho GitHub Actions, GitLab CI, Jenkins, và mọi
    CI/CD system; ví dụ minh hoạ không phụ thuộc tool cụ thể"
status: verified
sources:
  - "https://docs.gitlab.com/ee/ci/introduction/"
  - "https://docs.github.com/en/actions/learn-github-actions/understanding-github-actions"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Trước CI/CD, mỗi lần deploy là một buổi ngồi rủi — build tay, test tay, upload tay, rồi cầu nguyện.
Một thay đổi nhỏ bị bỏ sót test, không ai biết cho đến khi production báo lỗi lúc nửa đêm. CI/CD
là câu trả lời: mỗi lần push code → pipeline tự động chạy, phát hiện lỗi sớm nhất có thể, và
deploy theo quy trình nhất quán — không phụ thuộc vào ai đang trực. Bài này xây dựng mental model
về CI, CD, pipeline anatomy, và artifact trước khi học tool cụ thể.

## 2. Khái niệm cốt lõi

**CI (Continuous Integration)**: tích hợp code liên tục — mỗi commit/PR trigger tự động
build và test. Mục tiêu: phát hiện lỗi tích hợp sớm (trong phút, không phải ngày).

**CD có 2 nghĩa khác nhau**:

- **Continuous Delivery**: pipeline tự động đến bước "sẵn sàng deploy production", nhưng
  bước deploy cuối cùng cần con người bấm nút xác nhận. Thích hợp khi cần kiểm soát thời
  điểm release (compliance, business window).
- **Continuous Deployment**: pipeline deploy thẳng lên production tự động, không cần người
  bấm nút — mỗi commit qua đủ test là lên prod. Yêu cầu test coverage cao và giám sát tốt.

**Pipeline**: chuỗi stage tự động chạy theo thứ tự (hoặc song song). Stage sau chỉ chạy khi
stage trước thành công — fail một stage thì pipeline dừng và thông báo ngay.

**Stage**: nhóm các job có cùng mục đích (ví dụ: `test`, `build`, `deploy`). Các job trong
cùng stage có thể chạy song song; các stage thì tuần tự.

**Job**: đơn vị thực thi nhỏ nhất trong pipeline — một tập lệnh shell chạy trên 1 runner.

**Runner / Agent**: máy (vật lý, VM, hoặc container) thực thi các job. Có thể là runner
dùng chung (managed bởi platform) hoặc self-hosted (cài trên máy của bạn).

**Artifact**: output được lưu lại từ 1 job để stage sau dùng hoặc để archive.
- Ví dụ: file `.jar`, Docker image, file binary đã compile, coverage report HTML.
- Artifact có phiên bản (thường dùng git commit SHA hoặc build number) — đảm bảo đúng
  build đang chạy ở production, tránh nhầm lẫn.

**Environment**: môi trường triển khai — `dev`, `staging`, `production`. Pipeline thường
deploy qua nhiều environment theo thứ tự để kiểm tra trước khi lên prod.

## 3. Cách nó hoạt động

**Luồng điển hình (GitHub Flow + CI/CD)**:

```
Developer push → Git remote
                    ↓
             [Trigger: push to branch]
                    ↓
         ┌──── Stage: test ────┐
         │  job: lint          │  (song song)
         │  job: unit-test     │
         └────────────────────┘
                    ↓ (nếu pass)
         ┌──── Stage: build ───┐
         │  job: docker-build  │  → artifact: Docker image :sha
         └────────────────────┘
                    ↓
         ┌─── Stage: deploy ───┐
         │  job: deploy-dev    │  → deploy to dev env
         └────────────────────┘
                    ↓ (manual gate nếu CD Delivery)
         ┌─── Stage: release ──┐
         │  job: deploy-prod   │  → deploy to production
         └────────────────────┘
```

**Fail fast**: stage `test` chạy trước `build` và `deploy` — nếu unit test fail, pipeline
dừng ngay, không tốn thời gian build/deploy code broken.

**Artifact immutability**: Docker image hoặc binary build ra từ 1 commit SHA cụ thể không
được rebuild — cùng artifact đó chạy qua dev → staging → prod. Nếu mỗi environment rebuild
từ source, có thể test artifact khác artifact deploy.

**Pipeline-as-code**: config pipeline lưu trong repo cùng source code (`.github/workflows/`,
`.gitlab-ci.yml`, `Jenkinsfile`). Lợi ích: version-controlled, review được qua PR, branch
khác nhau có thể có pipeline khác nhau.

**Trigger types**:
- **Push trigger**: mỗi commit push lên branch nào đó
- **PR/MR trigger**: mỗi lần tạo hoặc update Pull Request — thường chạy test+lint, chưa deploy
- **Schedule**: cron job (nightly build, weekly security scan)
- **Manual trigger**: người bấm nút từ UI — dùng cho deploy production

## 4. Thực hành

> CI/CD systems không cài trên máy demo — toàn bộ ví dụ dưới đây là **minh hoạ** theo tài liệu
> chính thức. Cú pháp chi tiết có ở bài `devops.cicd.tools`.

**Checklist thiết kế pipeline mới**:

```
□ CI (chạy với mọi push/PR):
  □ Linting / static analysis
  □ Unit tests (nhanh, < 5 phút)
  □ Build artifact (Docker image / binary)
  □ Lưu artifact với version = commit SHA

□ CD - deploy to dev/staging (chạy khi merge vào main):
  □ Pull artifact vừa build (không build lại)
  □ Deploy (kubectl set image, helm upgrade, ansible...)
  □ Smoke test / health check sau deploy
  □ Thông báo kết quả (Slack/email)

□ CD - deploy to production:
  □ Manual gate (approval) hoặc auto nếu team đồng ý
  □ Rollback plan (giữ 2-3 version image cũ)
  □ Monitor sau deploy (alert nếu error rate tăng)
```

**Nguyên tắc tối ưu pipeline**:

- **Fail fast**: test nhanh chạy trước, test chậm chạy sau. Lint chạy trước unit test.
- **Parallel jobs**: unit test + integration test chạy song song thay vì tuần tự.
- **Cache dependencies**: `node_modules/`, `.gradle/`, pip cache — build lần 2 nhanh gấp 5-10×.
- **Không hardcode secret**: dùng secret store của platform (GitHub Secrets, GitLab Variables,
  Jenkins Credentials) — không commit password/key vào repo.

## 5. Lỗi thường gặp và cách chẩn đoán

**"Works on my machine"**: code pass local nhưng fail CI — thường do khác version dependency,
khác OS, hoặc test dựa vào state cục bộ (file, DB seeded). Fix: dùng Docker image chuẩn trong
CI, không dùng runner hệ thống với dependency tự cài.

**Pipeline quá chậm** (> 15 phút): người dùng bỏ qua kết quả. Kiểm tra: bước nào chiếm
nhiều thời gian nhất (thường là build Docker image). Fix: cache layer Docker, split test thành
parallel jobs, dùng incremental build.

**Secret bị lộ trong log**: `echo $SECRET` in thẳng ra log. Dùng `--password-stdin` thay vì
truyền password qua arg; dùng masked secret của platform (tự replace `***` trong log).

**Flaky test**: test đôi pass đôi fail không lý do rõ ràng — CI pipeline không đáng tin. Phải
fix flaky test trước khi CI có ý nghĩa; tạm thời có thể retry test job (1-2 lần) nhưng không
phải giải pháp dài hạn.

## 6. Tình huống thực tế

**Tình huống**: team bạn deploy thủ công, mỗi tuần 1 lần, hay có bug regression sau deploy.
Muốn chuyển sang CI/CD nhưng codebase chưa có test.

Cách tiếp cận thực tế (không phải lý tưởng):

1. **Bắt đầu chỉ với CI, không CD**: tạo pipeline chỉ gồm lint + build, không deploy. Ít
   rủi ro, tạo thói quen pipeline pass trước khi merge.
2. **Thêm test dần**: viết test cho code MỚI và code vừa fix bug — không cần test toàn bộ
   codebase ngay. Dần dần coverage tăng.
3. **CD to dev/staging trước**: auto deploy lên môi trường không ảnh hưởng production khi
   pipeline pass. Team thấy giá trị trước khi áp dụng cho production.
4. **Manual gate cho production**: dùng Continuous Delivery (không Deployment) cho production
   — người phải bấm nút xác nhận. An toàn hơn trong giai đoạn đầu.

Đây là con đường thực tế hơn "rewrite mọi thứ có test đầy đủ rồi mới bắt đầu CI/CD".

## 7. Tự kiểm tra

**Câu 1**: Điểm khác biệt chính giữa Continuous Delivery và Continuous Deployment là?

a) Continuous Delivery dùng Jenkins, Continuous Deployment dùng GitHub Actions  
b) Continuous Delivery deploy tự động mọi môi trường; Deployment chỉ deploy đến staging  
c) Continuous Delivery cần người xác nhận bước deploy production; Deployment deploy tự động không cần người  
d) Continuous Deployment chỉ áp dụng cho microservices, Delivery cho monolith

**Đáp án: c** — Continuous Delivery: pipeline tự động đến trạng thái "sẵn sàng", deploy
production cần manual approval. Continuous Deployment: commit qua đủ test là tự động lên
production. Cả hai không phụ thuộc tool hay kiến trúc.

---

**Câu 2**: Tại sao artifact từ CI không nên build lại ở mỗi môi trường (dev/staging/prod)?

a) Vì build lại tốn thêm thời gian  
b) Vì build lại có thể tạo ra artifact khác (khác dependency version, khác git state) dù từ cùng source  
c) Vì Docker image không thể build 2 lần  
d) Vì pipeline không có quyền truy cập source code ở bước deploy

**Đáp án: b** — "immutable artifact" đảm bảo đúng thứ đã test đang được deploy. Nếu rebuild,
dependency có thể đã update (floating tag `latest`, npm patch update), compiler output khác nhau
theo môi trường, hoặc git state có commit mới — test staging ≠ artifact đang chạy ở production.

---

**Câu 3**: Stage `lint` và `unit-test` nên chạy như thế nào trong cùng 1 pipeline?

a) Tuần tự: `lint` xong rồi `unit-test`  
b) Song song trong cùng stage để giảm thời gian tổng  
c) `unit-test` trước vì quan trọng hơn  
d) Chỉ chạy `lint` trên main branch, `unit-test` trên mọi branch

**Đáp án: b** — lint và unit-test không phụ thuộc nhau, chạy song song giảm thời gian tổng.
Cả hai thuộc nhóm "kiểm tra code quality", đặt trong cùng stage để stage `build` chỉ chạy khi
cả hai pass. Thứ tự lint/unit-test không quan trọng về logic.

---

**Câu 4**: "Pipeline-as-code" có lợi ích gì so với config pipeline qua UI?

a) Pipeline chạy nhanh hơn vì không cần parse YAML  
b) Config được version-controlled, review qua PR, và có thể khác nhau theo branch  
c) UI không hỗ trợ điều kiện phức tạp như `when: manual`  
d) Pipeline-as-code không cần runner riêng

**Đáp án: b** — lưu pipeline config trong repo: (1) mọi thay đổi pipeline đều có git history,
(2) review pipeline change như review code, (3) branch `feature/x` có thể test với pipeline
khác branch `main` mà không ảnh hưởng nhau. UI config không có các đặc tính này.

---

**Câu 5**: Team thấy pipeline CI mất 30 phút, developer không chờ kết quả. Cách cải thiện hiệu
quả nhất trước tiên là?

a) Mua runner mạnh hơn  
b) Profiling: xác định bước nào mất nhiều thời gian nhất, tập trung optimize bước đó  
c) Giảm số lượng test  
d) Chạy CI chỉ 1 lần/ngày thay vì mỗi push

**Đáp án: b** — trước khi tốn tiền hay hi sinh quality, profile trước. Thường 1-2 bước chiếm
80% thời gian (thường là Docker build hoặc integration test). Cache dependencies, parallel jobs,
hoặc layer cache Docker image có thể giảm 50-80% thời gian mà không cần hardware mới hay bỏ test.

## 8. Bài liên quan và nguồn tham khảo

**Bài tiếp theo trong module:**
- `devops.cicd.tools` — GitHub Actions, GitLab CI, Jenkins cú pháp thực tế

**Bài liên quan ngoài module (xem thêm):**
- `devops.git.workflows` — branching strategy ảnh hưởng đến pipeline trigger
- `devops.gitops.principles` — GitOps là extension của CD, dùng Git làm source of truth
- `container-k8s.docker-internals.images` — Docker image là artifact phổ biến nhất
- `monitoring.alerting-design.principles` — monitor sau deploy là phần của CD loop

**Nguồn tham khảo:**
- [GitLab — CI/CD Introduction](https://docs.gitlab.com/ee/ci/introduction/)
- [GitHub Actions — Understanding GitHub Actions](https://docs.github.com/en/actions/learn-github-actions/understanding-github-actions)
