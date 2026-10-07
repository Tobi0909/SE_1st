---
id: devops.ansible.roles
title: "Ansible role và best practice tổ chức playbook"
domain: devops
module: devops.ansible
level: "chuyên sâu"
prerequisites: ["devops.ansible.fundamentals"]
applies_to:
  - "Ansible 2.12+ (ansible-core) — cú pháp minh hoạ; không có Ansible cài trên máy demo"
status: draft
sources:
  - "https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_reuse_roles.html"
  - "https://docs.ansible.com/ansible/latest/galaxy/user_guide.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Playbook đơn file hoạt động tốt khi chỉ cần 20-30 task. Khi dự án lớn hơn — cấu hình Nginx,
MySQL, app deploy, monitoring — một file duy nhất trở nên không thể maintain. Ansible **role**
là cơ chế đóng gói: tách playbook thành đơn vị tái sử dụng độc lập, dùng được trong nhiều
playbook, chia sẻ qua Ansible Galaxy. Bài này giải thích cấu trúc role, handler, sự khác biệt
`defaults` vs `vars`, và các best practice để playbook không trở thành "spaghetti YAML".

## 2. Khái niệm cốt lõi

> Tất cả ví dụ trong bài này là **minh hoạ** — Ansible không cài trên máy demo.

**Role = thư mục có cấu trúc chuẩn** chứa tasks, handlers, variables, templates, files liên
quan đến một chức năng cụ thể (cài Nginx, cấu hình PostgreSQL, deploy app...).

**Handlers**: task đặc biệt chỉ chạy khi được `notify` từ task khác, và chạy 1 lần cuối
play dù được notify nhiều lần. Dùng để restart/reload service sau khi config thay đổi.

**defaults vs vars**: hai nơi lưu variable trong role, với **độ ưu tiên khác nhau**:
- `defaults/main.yml`: giá trị mặc định, ưu tiên thấp — người dùng role dễ dàng override.
- `vars/main.yml`: biến cứng của role, ưu tiên cao — khó override hơn, dùng cho giá trị không
  nên thay đổi từ ngoài.

**Ansible Galaxy**: kho role cộng đồng tại [galaxy.ansible.com](https://galaxy.ansible.com) —
cài role có sẵn bằng `ansible-galaxy install <namespace.role>`.

## 3. Cách nó hoạt động

**Cấu trúc thư mục role**:

```
roles/
└── nginx/
    ├── tasks/
    │   └── main.yml        # danh sách task (bắt buộc)
    ├── handlers/
    │   └── main.yml        # handlers được notify từ tasks
    ├── defaults/
    │   └── main.yml        # biến mặc định (override được từ ngoài)
    ├── vars/
    │   └── main.yml        # biến nội bộ role (ít override hơn)
    ├── templates/
    │   └── nginx.conf.j2   # Jinja2 template
    ├── files/
    │   └── index.html      # file tĩnh để copy
    ├── meta/
    │   └── main.yml        # phụ thuộc role khác (dependencies)
    └── README.md
```

Chỉ thư mục `tasks/` là bắt buộc. Các thư mục khác bỏ qua được nếu không dùng.

**roles/nginx/tasks/main.yml**:

```yaml
---
- name: Cài Nginx
  apt:
    name: nginx
    state: present
    update_cache: yes

- name: Deploy cấu hình
  template:
    src: nginx.conf.j2          # relative to templates/ — không cần đường dẫn đầy đủ
    dest: /etc/nginx/nginx.conf
    mode: '0644'
  notify: Restart Nginx         # trigger handler

- name: Đảm bảo Nginx chạy và enabled
  service:
    name: nginx
    state: started
    enabled: yes
```

**roles/nginx/handlers/main.yml**:

```yaml
---
- name: Restart Nginx
  service:
    name: nginx
    state: restarted

- name: Reload Nginx
  service:
    name: nginx
    state: reloaded
```

**roles/nginx/defaults/main.yml** (giá trị override được từ inventory/playbook):

```yaml
---
nginx_port: 80
nginx_worker_processes: auto
nginx_worker_connections: 1024
```

**roles/nginx/templates/nginx.conf.j2**:

```nginx
worker_processes {{ nginx_worker_processes }};

events {
    worker_connections {{ nginx_worker_connections }};
}

server {
    listen {{ nginx_port }};
    root /var/www/html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

**Dùng role trong playbook**:

```yaml
# site.yml
---
- name: Cấu hình web servers
  hosts: webservers
  become: yes
  roles:
    - nginx                     # role ở roles/nginx/ (đường dẫn tương đối)
    - role: nginx               # cú pháp dài hơn, cho phép truyền thêm vars
      vars:
        nginx_port: 8080        # override default của role
```

**Tham chiếu role từ Ansible Galaxy**:

```bash
# Cài role từ Galaxy
ansible-galaxy install geerlingguy.nginx

# Hoặc khai báo trong requirements.yml rồi cài một lần
# requirements.yml:
# - src: geerlingguy.nginx
#   version: 3.2.0

ansible-galaxy install -r requirements.yml
```

## 4. Thực hành

**Cấu trúc project thực tế**:

```
project/
├── site.yml                   # playbook chính ("orchestration" layer)
├── webservers.yml             # playbook cho webservers
├── databases.yml              # playbook cho databases
├── inventory/
│   ├── production
│   └── staging
├── group_vars/
│   ├── all.yml                # vars cho mọi group
│   ├── webservers.yml
│   └── databases.yml
├── host_vars/
│   └── web1.yml               # vars cho host cụ thể
└── roles/
    ├── common/                 # role setup chung (user, timezone, ntp...)
    ├── nginx/
    └── app-deploy/
```

`site.yml` nhập các playbook con:

```yaml
# site.yml
---
- import_playbook: webservers.yml
- import_playbook: databases.yml
```

**meta/main.yml — khai báo dependency**:

```yaml
# roles/app-deploy/meta/main.yml
---
dependencies:
  - role: nginx                  # app-deploy phụ thuộc nginx — Ansible tự install nginx trước
    vars:
      nginx_port: 8080
  - role: common
```

**Tags — chạy một phần playbook**:

```yaml
- name: Cài Nginx
  apt:
    name: nginx
    state: present
  tags:
    - nginx
    - packages

- name: Deploy app
  copy:
    src: app.tar.gz
    dest: /opt/app/
  tags:
    - app
    - deploy
```

```bash
# Chỉ chạy task có tag 'deploy'
ansible-playbook site.yml -i inventory/production --tags deploy

# Bỏ qua task có tag 'packages'
ansible-playbook site.yml -i inventory/production --skip-tags packages
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Role không tìm thấy** (`ERROR! the role 'nginx' was not found`): Ansible tìm role theo thứ tự:
`roles/` trong project directory, rồi path trong `DEFAULT_ROLES_PATH` (`~/.ansible/roles`,
`/etc/ansible/roles`). Fix: đảm bảo thư mục `roles/nginx/` tồn tại, hoặc cài từ Galaxy.

**Handler không chạy dù task `changed`**: kiểm tra tên handler trong `notify:` phải khớp CHÍNH
XÁC với `name:` trong handlers (case-sensitive, kể cả khoảng trắng). Cũng kiểm tra play không
dùng `--check` (dry-run) — handler không chạy trong check mode.

**Biến `defaults` không override được** — người dùng đặt variable trong `vars/main.yml` thay
vì `defaults/main.yml`. `vars/main.yml` có ưu tiên cao hơn inventory/playbook vars, rất khó
override từ ngoài. Quy tắc: giá trị muốn người dùng override → `defaults/`; giá trị nội bộ
cứng của role → `vars/`.

**Template lỗi `Jinja2 template error`**: variable chưa được định nghĩa. Dùng filter mặc định:
`{{ nginx_port | default(80) }}` — nếu variable chưa set thì dùng `80`. Hoặc luôn khai báo
trong `defaults/main.yml` để tránh undefined error.

## 6. Tình huống thực tế

**Tình huống**: playbook ban đầu cài Nginx + deploy app trong 1 file 200 task. Team mới join
không biết sửa phần nào. Cần refactor.

**Chiến lược tách role**:

1. **Nhóm task theo chức năng**: tasks liên quan đến Nginx (cài, cấu hình, reload) → role
   `nginx`; tasks liên quan đến app (checkout code, build, restart) → role `app-deploy`.

2. **Xác định biến nào thay đổi theo môi trường**: `nginx_port`, `app_version`, `db_host` →
   đưa vào `defaults/` của role tương ứng + `group_vars/` cho từng môi trường.

3. **Dùng `import_tasks` để chia nhỏ tasks/main.yml** nếu vẫn còn dài:

```yaml
# roles/nginx/tasks/main.yml
---
- import_tasks: install.yml
- import_tasks: configure.yml
- import_tasks: ssl.yml         # chỉ import nếu cần HTTPS
  when: nginx_enable_ssl | default(false)
```

Kết quả: mỗi role là unit độc lập, test được riêng, tái dùng được ở playbook khác.

## 7. Tự kiểm tra

**Câu 1**: Sự khác biệt chính giữa `defaults/main.yml` và `vars/main.yml` trong một role là?

a) `defaults` dành cho production, `vars` cho development  
b) `defaults` có độ ưu tiên thấp hơn — dễ override từ inventory/playbook; `vars` có độ ưu tiên cao hơn, khó override  
c) `vars` chạy trước `defaults` trong thứ tự task  
d) `defaults` chỉ dùng được với loop, `vars` dùng cho task thường

**Đáp án: b** — Ansible có 22 mức độ ưu tiên variable. `defaults/main.yml` nằm gần đáy (thấp
nhất trong role) — bất kỳ variable nào khai báo ở inventory, group_vars, playbook vars đều
override được. `vars/main.yml` nằm cao hơn nhiều — inventory vars không override được. Quy tắc:
biến muốn người dùng role điều chỉnh → `defaults`, biến cứng nội bộ → `vars`.

---

**Câu 2**: Handler `Restart Nginx` chỉ được notify bởi 1 task, nhưng task đó chạy trên 3 host
cùng lúc và cả 3 đều `changed`. Handler sẽ chạy bao nhiêu lần?

a) 3 lần (1 lần/host)  
b) 1 lần duy nhất  
c) 0 lần — handler chỉ chạy khi được notify 2 lần trở lên  
d) 3 lần, tất cả song song

**Đáp án: a** — handler chạy 1 lần TRÊN MỖI HOST đã notify nó. "Chỉ chạy 1 lần" nghĩa là: dù
task A và task B cùng notify handler trên cùng 1 host, handler đó chỉ chạy 1 lần trên host đó
(không 2 lần). Ở đây chỉ có 1 task notify, nhưng chạy trên 3 host → handler chạy 1 lần/host = 3 lần tổng.

---

**Câu 3**: `ansible-galaxy install geerlingguy.nginx` cài role vào đâu theo mặc định?

a) `roles/` trong thư mục hiện tại  
b) `~/.ansible/roles/`  
c) `/usr/share/ansible/roles/`  
d) Cùng thư mục với file `requirements.yml`

**Đáp án: b** — mặc định, `ansible-galaxy install` cài vào `~/.ansible/roles/` (hoặc path
đầu tiên trong `DEFAULT_ROLES_PATH`). Để cài vào thư mục project: `ansible-galaxy install
geerlingguy.nginx -p roles/`. Hoặc đặt `roles_path = roles` trong `ansible.cfg` của project.

---

**Câu 4**: `import_tasks` và `include_tasks` trong Ansible khác nhau như thế nào?

a) `import_tasks` tĩnh (parse lúc load playbook), `include_tasks` động (load lúc runtime, hỗ trợ điều kiện)  
b) `import_tasks` chỉ dùng được trong role, `include_tasks` dùng ở playbook cấp cao  
c) `include_tasks` nhanh hơn vì không kiểm tra syntax  
d) Hai lệnh hoàn toàn giống nhau, chỉ khác tên alias

**Đáp án: a** — `import_tasks` là static include: Ansible xử lý lúc parse playbook, tags áp
dụng được cho sub-tasks, nhưng `when` condition của `import_tasks` không động theo runtime
variable. `include_tasks` là dynamic: load file lúc task chạy, hỗ trợ variable động trong
tên file (`include_tasks: "{{ env }}.yml"`), nhưng tags không tự truyền xuống sub-tasks.

---

**Câu 5**: Best practice nào giúp playbook Ansible "idempotent" thực sự?

a) Dùng `shell:` thay vì module vì shell linh hoạt hơn  
b) Dùng module chuyên biệt (`apt`, `service`, `file`) thay vì `shell:`/`command:` khi có thể  
c) Luôn thêm `ignore_errors: yes` để playbook không dừng  
d) Chạy `--check` trước mỗi lần chạy thật

**Đáp án: b** — module Ansible được thiết kế idempotent: kiểm tra trạng thái hiện tại trước
khi thay đổi, chỉ `changed` khi cần thiết. `shell: service nginx restart` luôn `changed` và
luôn restart dù service đã đúng trạng thái. `service: name=nginx state=started` kiểm tra
trước, chỉ start nếu service đang dừng. `ignore_errors` che giấu lỗi thay vì fix; `--check`
là verification tool, không làm playbook idempotent.

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan ngoài module (xem thêm):**
- `devops.cicd.tools` — role Ansible thường là 1 step trong Jenkins/GitLab CI deploy stage
- `devops.terraform.fundamentals` — Terraform provision infra, Ansible configure (bổ sung nhau)
- `linux.shell-scripting.best-practices` — nguyên lý idempotent áp dụng cho cả shell script và Ansible

**Nguồn tham khảo:**
- [Ansible Docs — Roles](https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_reuse_roles.html)
- [Ansible Galaxy User Guide](https://docs.ansible.com/ansible/latest/galaxy/user_guide.html)
