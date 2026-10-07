---
id: devops.cicd.tools
title: "Công cụ CI/CD phổ biến: Jenkins/GitLab CI/GitHub Actions cơ bản"
domain: devops
module: devops.cicd
level: "vận hành"
prerequisites: ["devops.cicd.concepts"]
applies_to:
  - "GitHub Actions (runner ubuntu-latest), GitLab CI 16+, Jenkins 2.x (Declarative Pipeline) —
    cú pháp minh hoạ theo tài liệu chính thức; không có instance chạy thật trong sandbox"
status: draft
sources:
  - "https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions"
  - "https://docs.gitlab.com/ee/ci/yaml/"
  - "https://www.jenkins.io/doc/book/pipeline/syntax/"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Ba tool CI/CD phổ biến nhất đều giải quyết cùng bài toán nhưng với triết lý khác nhau:
GitHub Actions tích hợp chặt với GitHub, GitLab CI là built-in của GitLab, Jenkins là
open-source tự host với plugin ecosystem phong phú. Biết cú pháp cơ bản của cả ba giúp đọc
và sửa pipeline ở môi trường bất kỳ, không bị bỡ ngỡ khi chuyển công ty hay dự án.

## 2. Khái niệm cốt lõi

> Toàn bộ YAML và Groovy trong bài này là **minh hoạ** — không có GitHub Actions, GitLab CI,
> hay Jenkins chạy thật trong sandbox. Cú pháp lấy theo tài liệu chính thức ghi trong `sources`.

**So sánh nhanh**:

| | GitHub Actions | GitLab CI | Jenkins |
|--|---------------|-----------|---------|
| **Config file** | `.github/workflows/*.yml` | `.gitlab-ci.yml` (root) | `Jenkinsfile` (root) |
| **Trigger** | `on:` | `rules:` / `only:` | `triggers` / webhook |
| **Runner** | Managed hoặc self-hosted | Shared / self-hosted Runner | Agent (node) |
| **Parallelism** | Jobs trong cùng stage | Jobs song song (no stage) | Parallel steps trong stage |
| **Secret** | `secrets.NAME` | `$VARIABLE` (masked) | `credentials('id')` |
| **Khi dùng** | Repo trên GitHub | Repo trên GitLab | On-prem, kiểm soát hoàn toàn |

## 3. Cách nó hoạt động

### GitHub Actions

Cấu trúc file `.github/workflows/ci.yml`:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

  build:
    needs: test           # chỉ chạy khi job 'test' pass
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t myapp:${{ github.sha }} .

      - name: Push to registry
        run: |
          echo "${{ secrets.DOCKER_PASSWORD }}" | \
            docker login -u "${{ secrets.DOCKER_USERNAME }}" --password-stdin
          docker push myapp:${{ github.sha }}

  deploy-prod:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'   # chỉ chạy trên branch main
    environment: production               # require approval nếu environment có protection rules
    steps:
      - name: Deploy
        run: |
          kubectl set image deployment/myapp \
            myapp=myapp:${{ github.sha }}
```

**Điểm quan trọng GitHub Actions**:
- `uses: actions/checkout@v4` — clone repo vào runner (cần ở bước đầu tiên của hầu hết job)
- `cache: 'npm'` trong `setup-node` — tự cache `node_modules` theo `package-lock.json`
- `${{ github.sha }}` — SHA commit hiện tại; `${{ secrets.NAME }}` — secret đã cấu hình
- `needs: test` — job dependency: `build` chỉ chạy khi `test` pass
- `environment: production` — nếu environment có "Required reviewers" trên GitHub, pipeline
  dừng chờ người approve trước khi chạy job này

### GitLab CI

File `.gitlab-ci.yml`:

```yaml
stages:
  - test
  - build
  - deploy

variables:
  IMAGE_TAG: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

test:
  stage: test
  image: node:20-alpine
  cache:
    key: $CI_COMMIT_REF_SLUG
    paths:
      - node_modules/
  script:
    - npm ci
    - npm test
  coverage: '/Lines\s*:\s*(\d+\.?\d*)%/'   # extract coverage từ output

build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $IMAGE_TAG .
    - docker push $IMAGE_TAG
  rules:
    - if: $CI_COMMIT_BRANCH == "main"

deploy-production:
  stage: deploy
  script:
    - kubectl set image deployment/myapp myapp=$IMAGE_TAG
  environment:
    name: production
    url: https://myapp.example.com
  when: manual          # manual gate — phải bấm nút trong GitLab UI
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

**Điểm quan trọng GitLab CI**:
- `stages:` định nghĩa thứ tự — jobs trong cùng stage chạy song song, stage khác nhau tuần tự
- `$CI_COMMIT_SHA`, `$CI_REGISTRY_IMAGE` — predefined variables của GitLab CI
- `services: - docker:24-dind` — Docker-in-Docker, cần để build Docker image trong GitLab runner
- `rules: - if:` — cách hiện đại thay cho `only:/except:` (deprecated)
- `when: manual` — job hiện trong UI nhưng không tự chạy, cần người click

### Jenkins Declarative Pipeline

File `Jenkinsfile`:

```groovy
pipeline {
    agent any

    environment {
        IMAGE_TAG = "myapp:${env.BUILD_NUMBER}"
    }

    stages {
        stage('Test') {
            steps {
                sh 'npm ci'
                sh 'npm test'
            }
            post {
                always {
                    junit 'test-results/*.xml'   // publish test report
                }
            }
        }

        stage('Build') {
            steps {
                script {
                    docker.build(env.IMAGE_TAG)
                }
            }
        }

        stage('Deploy') {
            when {
                branch 'main'
            }
            steps {
                withCredentials([string(credentialsId: 'kubeconfig', variable: 'KUBECONFIG')]) {
                    sh "kubectl set image deployment/myapp myapp=${env.IMAGE_TAG}"
                }
            }
        }
    }

    post {
        failure {
            mail to: 'team@example.com',
                 subject: "Build ${env.BUILD_NUMBER} failed",
                 body: "Check ${env.BUILD_URL}"
        }
    }
}
```

**Điểm quan trọng Jenkins**:
- `agent any` — Jenkins chọn bất kỳ agent nào rảnh; hoặc `agent { docker { image 'node:20' } }`
- `${env.BUILD_NUMBER}` — biến môi trường Jenkins; `${env.BUILD_URL}` — link đến build log
- `when { branch 'main' }` — điều kiện chạy stage, chỉ áp dụng trên branch `main`
- `withCredentials(...)` — lấy secret từ Jenkins Credentials store, không log ra ngoài
- `post { failure { ... } }` — action khi pipeline fail; `always` chạy bất kể kết quả

## 4. Thực hành

**Tạo GitHub Actions workflow đơn giản nhất** (Python project):

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install -r requirements.txt
      - run: pytest
```

**Thêm secret vào GitHub Actions**:
1. GitHub repo → Settings → Secrets and variables → Actions → New repository secret
2. Tên: `DOCKER_PASSWORD`, giá trị: token/password
3. Trong workflow: `${{ secrets.DOCKER_PASSWORD }}`

**Debug pipeline fail**: với GitHub Actions, click vào job fail trong tab Actions → xem từng step.
Thêm `- run: env` để in environment variables (không in secrets — bị mask tự động).

## 5. Lỗi thường gặp và cách chẩn đoán

**GitHub Actions: `actions/checkout@v4` không clone submodule** — cần thêm `with: submodules: true`.

**GitLab CI: Docker build fail "Cannot connect to the Docker daemon"** — cần cấu hình
`DOCKER_HOST: tcp://docker:2376` và service `docker:dind`, hoặc dùng Kaniko/Buildah thay DinD.

**Jenkins: `Permission denied` khi chạy Docker** — jenkins user không thuộc group `docker`.
Fix: `usermod -aG docker jenkins` rồi restart Jenkins.

**Pipeline dùng biến secret bị "masked" thành `***` trong log** — đây là hành vi đúng, không
phải lỗi. Nếu cần debug giá trị, kiểm tra trực tiếp trong Secrets UI, không print ra log.

**Cache không được dùng** (build vẫn chậm): kiểm tra cache key — nếu `package-lock.json` thay
đổi thì cache miss (đúng thiết kế). Với GitLab CI, cache theo `$CI_COMMIT_REF_SLUG` để mỗi
branch có cache riêng.

## 6. Tình huống thực tế

**Tình huống**: team có monorepo chứa 2 service (`api/` và `frontend/`). Muốn chỉ build và deploy
service nào thay đổi, không build cả 2 mỗi lần.

**GitHub Actions — path filter**:

```yaml
jobs:
  build-api:
    if: |
      contains(github.event.head_commit.message, '[api]') ||
      github.event_name == 'pull_request'
    # hoặc dùng paths filter:
  # on:
  #   push:
  #     paths: ['api/**']
```

Cách đơn giản hơn: dùng `on.push.paths` filter ở mức workflow:

```yaml
# .github/workflows/api.yml — chỉ trigger khi có file thay đổi trong api/
on:
  push:
    paths:
      - 'api/**'
      - '.github/workflows/api.yml'
```

**GitLab CI — rules với `changes`**:

```yaml
build-api:
  stage: build
  rules:
    - changes:
        - api/**/*
  script:
    - cd api && docker build .
```

`changes:` kiểm tra file nào thay đổi trong commit, chỉ trigger job khi có file khớp pattern.

## 7. Tự kiểm tra

**Câu 1**: Trong GitHub Actions, `needs: [test, lint]` ở một job có nghĩa là?

a) Job chạy song song với `test` và `lint`  
b) Job chỉ chạy khi CẢ HAI job `test` và `lint` đều thành công  
c) Job chạy ngay sau `test`, không cần `lint` pass  
d) Job chạy trước `test` và `lint`

**Đáp án: b** — `needs:` định nghĩa dependency: job chỉ bắt đầu khi tất cả jobs được liệt kê
trong `needs` đều complete và success. Nếu bất kỳ job nào fail, job có `needs` đó bị skip.

---

**Câu 2**: Trong GitLab CI, sự khác biệt giữa `when: manual` và `when: on_success` là?

a) `manual` chạy trên branch bất kỳ; `on_success` chỉ chạy trên `main`  
b) `manual` yêu cầu người bấm nút trong UI; `on_success` tự động chạy khi stage trước pass  
c) `manual` không ghi log; `on_success` ghi đầy đủ  
d) `manual` dùng Docker runner; `on_success` dùng shell runner

**Đáp án: b** — `when: on_success` (mặc định) tự chạy khi stage trước thành công. `when: manual`
hiển thị nút play trong GitLab pipeline UI, không tự chạy — dùng để làm manual gate cho deploy
production.

---

**Câu 3**: Jenkins `withCredentials([string(credentialsId: 'token', variable: 'MY_TOKEN')])` làm gì?

a) In giá trị của secret ra log để debug  
b) Tạo một secret mới trong Jenkins Credentials store  
c) Lấy secret từ Jenkins Credentials, gán vào biến `MY_TOKEN` trong scope của block, không log  
d) Mã hoá biến `MY_TOKEN` trước khi gửi lên server

**Đáp án: c** — `withCredentials` bind giá trị từ Jenkins Credentials store vào biến env cục bộ
trong scope của block đó. Jenkins tự động mask giá trị trong log (thay bằng `****`). Secret không
bao giờ được expose ra ngoài block.

---

**Câu 4**: File config của GitLab CI bắt buộc phải đặt ở đâu trong repository?

a) Bất kỳ thư mục nào, miễn tên file là `.gitlab-ci.yml`  
b) Thư mục `.gitlab/` ở root  
c) Root của repository, tên file `.gitlab-ci.yml`  
d) Thư mục `.ci/`, tên file tùy chọn (khai báo trong Settings)

**Đáp án: c** — mặc định GitLab CI tìm `.gitlab-ci.yml` ở root của repository. Có thể thay đổi
đường dẫn trong GitLab project Settings → CI/CD → General → Custom CI/CD configuration file (d
đúng một phần nhưng không phải hành vi mặc định — câu hỏi hỏi "bắt buộc" mặc định).

---

**Câu 5**: Tại sao `npm ci` được dùng trong CI thay vì `npm install`?

a) `npm ci` nhanh hơn vì không download package  
b) `npm ci` cài đúng version từ `package-lock.json`, fail nếu lock file lỗi thời; `npm install` có thể update lock file  
c) `npm install` không hoạt động trên Linux  
d) `npm ci` tự động chạy tests sau khi install

**Đáp án: b** — `npm ci` (clean install): xóa `node_modules` cũ, cài đúng version theo
`package-lock.json`, FAIL nếu `package.json` và `package-lock.json` không đồng bộ. Điều này
đảm bảo CI luôn dùng đúng version đã được test. `npm install` có thể update lock file và cài
phiên bản mới hơn, dẫn đến "works locally, fails in prod".

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan ngoài module (xem thêm):**
- `devops.git.workflows` — GitHub Flow, branching strategy ảnh hưởng pipeline design
- `container-k8s.docker-internals.images` — Docker image build trong CI
- `devops.gitops.tools` — ArgoCD/Flux nhận artifact từ CI để deploy
- `devops.ansible.fundamentals` — Ansible dùng trong deploy step của pipeline

**Nguồn tham khảo:**
- [GitHub Actions — Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [GitLab CI/CD YAML Reference](https://docs.gitlab.com/ee/ci/yaml/)
- [Jenkins Declarative Pipeline Syntax](https://www.jenkins.io/doc/book/pipeline/syntax/)
