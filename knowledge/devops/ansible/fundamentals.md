---
id: devops.ansible.fundamentals
title: "Ansible: inventory, playbook, module cơ bản"
domain: devops
module: devops.ansible
level: "vận hành"
prerequisites: ["linux.shell-scripting.bash-basics"]
applies_to:
  - "Ansible 2.12+ (ansible-core) — cú pháp minh hoạ; không có Ansible cài trên máy demo,
    output lấy theo tài liệu chính thức docs.ansible.com"
status: draft
sources:
  - "https://docs.ansible.com/ansible/latest/getting_started/get_started_inventory.html"
  - "https://docs.ansible.com/ansible/latest/getting_started/get_started_playbook.html"
last_verified: "2026-10-07"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Cấu hình 1 server tay thì làm được. Cấu hình 50 server giống nhau thì không còn là option.
Ansible giải quyết bằng cách mô tả trạng thái mong muốn (declarative) và tự thực hiện qua
SSH — không cần cài agent trên managed node, không cần học ngôn ngữ mới (YAML + Jinja2). Điểm
mạnh: idempotent — chạy lại nhiều lần vẫn cho kết quả như lần đầu, không gây side effect thêm.
Bài này xây dựng mental model: inventory là "ai", playbook là "làm gì", module là "cách làm".

## 2. Khái niệm cốt lõi

> Tất cả lệnh và output trong bài này là **minh hoạ** — không có Ansible cài trên máy demo.

**Kiến trúc Ansible (agentless)**:

```
Control node (máy bạn)          Managed nodes (server đích)
┌────────────────────┐           ┌─────────────────┐
│  ansible-playbook  │  SSH/WinRM│  web1 (Ubuntu)  │
│  ansible           │ ─────────>│  web2 (Ubuntu)  │
│  inventory         │           │  db1  (CentOS)  │
└────────────────────┘           └─────────────────┘
```

- **Control node**: máy cài Ansible, không cần quyền đặc biệt trên managed node ban đầu.
- **Managed node**: server đích, chỉ cần SSH + Python 3 (hoặc Python 2.7 cũ).
- **Agentless**: không cài daemon/agent trên managed node — SSH là đủ.

**Inventory**: danh sách managed nodes, nhóm theo chức năng.

**Playbook**: file YAML mô tả "muốn managed nodes ở trạng thái nào".

**Module**: đơn vị thực thi — `apt`, `copy`, `service`, `template`... Ansible có ~3000 module
built-in, mỗi module là idempotent (tự kiểm tra trạng thái hiện tại, chỉ thay đổi khi cần).

**Task**: gọi 1 module với tham số cụ thể. Playbook = danh sách task theo thứ tự.

**become**: leo thang quyền (`sudo`) để chạy task với quyền root.

## 3. Cách nó hoạt động

**Inventory** — khai báo managed nodes:

```ini
# inventory.ini (định dạng INI)
[webservers]
web1 ansible_host=192.168.1.10
web2 ansible_host=192.168.1.11

[databases]
db1 ansible_host=192.168.1.20

[production:children]   # group gồm nhiều group con
webservers
databases
```

Hoặc định dạng YAML (`inventory.yml`):

```yaml
all:
  children:
    webservers:
      hosts:
        web1:
          ansible_host: 192.168.1.10
        web2:
          ansible_host: 192.168.1.11
    databases:
      hosts:
        db1:
          ansible_host: 192.168.1.20
```

Biến kết nối hay đặt trong inventory hoặc `group_vars/`:
- `ansible_user`: user SSH (mặc định: user hiện tại)
- `ansible_ssh_private_key_file`: đường dẫn private key
- `ansible_become_password`: sudo password (tốt hơn: dùng `--ask-become-pass`)

**Ad-hoc command** — chạy 1 module ngay, không cần playbook:

```bash
# Kiểm tra kết nối tới tất cả host
ansible all -i inventory.ini -m ping

# Output minh hoạ:
web1 | SUCCESS => {
    "changed": false,
    "ping": "pong"
}
web2 | SUCCESS => {
    "changed": false,
    "ping": "pong"
}

# Chạy lệnh shell trên group webservers
ansible webservers -i inventory.ini -m shell -a "df -h /"
```

**Cấu trúc playbook**:

```yaml
# deploy-nginx.yml
---
- name: Cài đặt và cấu hình Nginx         # tên "play"
  hosts: webservers                         # chạy trên group nào
  become: yes                               # dùng sudo cho toàn play

  vars:
    nginx_port: 80
    app_dir: /var/www/html

  tasks:
    - name: Cài Nginx
      apt:                                  # module apt (Ubuntu/Debian)
        name: nginx
        state: present
        update_cache: yes

    - name: Sao chép file cấu hình
      template:                             # module template (Jinja2)
        src: nginx.conf.j2
        dest: /etc/nginx/nginx.conf
        mode: '0644'
      notify: Reload Nginx                  # trigger handler khi file thay đổi

    - name: Đảm bảo Nginx đang chạy
      service:
        name: nginx
        state: started
        enabled: yes

  handlers:
    - name: Reload Nginx                    # chỉ chạy khi được notify
      service:
        name: nginx
        state: reloaded
```

**Chạy playbook**:

```bash
# Kiểm tra (dry-run) không thay đổi thật
ansible-playbook deploy-nginx.yml -i inventory.ini --check

# Chạy thật
ansible-playbook deploy-nginx.yml -i inventory.ini

# Output minh hoạ:
PLAY [Cài đặt và cấu hình Nginx] ***

TASK [Gathering Facts] ***
ok: [web1]
ok: [web2]

TASK [Cài Nginx] ***
changed: [web1]
changed: [web2]

TASK [Sao chép file cấu hình] ***
changed: [web1]
changed: [web2]

RUNNING HANDLERS [Reload Nginx] ***
changed: [web1]
changed: [web2]

PLAY RECAP ***
web1  : ok=4  changed=3  unreachable=0  failed=0
web2  : ok=4  changed=3  unreachable=0  failed=0
```

**Trạng thái task**:
- `ok`: task chạy, không cần thay đổi (idempotent — đã ở đúng trạng thái)
- `changed`: task thay đổi gì đó trên host
- `failed`: task lỗi — playbook dừng ở host đó (các host khác vẫn tiếp tục theo mặc định)
- `unreachable`: không SSH được tới host

## 4. Thực hành

**Module thường dùng**:

```yaml
# Quản lý package
- apt:                          # Ubuntu/Debian
    name: [nginx, curl, git]    # cài nhiều package cùng lúc
    state: present              # present | absent | latest
    update_cache: yes

- yum:                          # RHEL/CentOS
    name: httpd
    state: latest

# Quản lý file/thư mục
- file:
    path: /var/app/logs
    state: directory            # directory | file | absent | link
    owner: www-data
    group: www-data
    mode: '0755'

# Copy file từ control node
- copy:
    src: files/app.conf
    dest: /etc/app/app.conf
    backup: yes                 # giữ file cũ thành .bak

# Template Jinja2
- template:
    src: templates/config.j2    # file .j2 trên control node
    dest: /etc/app/config.conf

# Chạy lệnh (dùng khi không có module phù hợp)
- shell: "echo {{ app_version }} > /var/app/version.txt"
  # shell qua /bin/sh, hỗ trợ pipe/redirect; command thì không
```

**Variables và Jinja2**:

```yaml
vars:
  db_host: db1.internal
  db_port: 5432

tasks:
  - name: Tạo config file
    template:
      src: app.conf.j2
      dest: /etc/app/config.conf

# app.conf.j2:
# database_host = {{ db_host }}
# database_port = {{ db_port }}
# hostname = {{ ansible_facts['hostname'] }}   # fact thu thập từ host
```

**Điều kiện và vòng lặp**:

```yaml
- name: Cài package chỉ trên Ubuntu
  apt:
    name: curl
    state: present
  when: ansible_facts['distribution'] == 'Ubuntu'

- name: Tạo nhiều user
  user:
    name: "{{ item }}"
    state: present
  loop:
    - alice
    - bob
    - charlie
```

## 5. Lỗi thường gặp và cách chẩn đoán

**`unreachable: [host]`** — không SSH được. Kiểm tra: `ssh -i key user@host` thủ công, xem có
cần thêm host vào `known_hosts` không, đúng port chưa (`ansible_port: 2222` nếu không dùng 22).

**`MODULE FAILURE` với `"module_stdout": ""`** — managed node thiếu Python. Ansible cần Python 3
trên managed node. Fix: cài Python trước bằng raw module: `ansible host -m raw -a "apt install -y python3"`.

**Task luôn `changed` dù đã đúng trạng thái** — dùng `shell:` thay vì module idempotent phù hợp.
`shell: systemctl restart nginx` luôn `changed`; thay bằng `service: name=nginx state=restarted`.

**`sudo: no tty present`** — cần `ansible_become_password` hoặc cấu hình `/etc/sudoers` không
cần password (`NOPASSWD`) cho user Ansible. Tốt nhất: dùng SSH key + sudo NOPASSWD trong sudoers.

## 6. Tình huống thực tế

**Tình huống**: cần deploy cùng 1 ứng dụng lên 3 môi trường (dev/staging/prod) với cấu hình
khác nhau (DB host, log level, số worker).

**Giải pháp**: dùng `group_vars/` — mỗi group inventory có file vars riêng:

```
inventory/
  production
  staging
  development
group_vars/
  production.yml    # db_host: prod-db.internal, log_level: error
  staging.yml       # db_host: staging-db.internal, log_level: warn
  development.yml   # db_host: localhost, log_level: debug
```

Playbook giữ nguyên, chỉ đổi inventory khi chạy:

```bash
ansible-playbook deploy.yml -i inventory/production
ansible-playbook deploy.yml -i inventory/staging
```

Template `app.conf.j2` dùng cùng biến `{{ db_host }}` và `{{ log_level }}` — giá trị tự động
theo môi trường. Đây là cách tách config khỏi logic, không hardcode trong playbook.

## 7. Tự kiểm tra

**Câu 1**: Ansible là "agentless" có nghĩa là?

a) Ansible không cần cài trên control node, chỉ cần Python  
b) Managed node không cần cài Ansible agent/daemon — kết nối qua SSH là đủ  
c) Ansible không dùng SSH, kết nối qua REST API  
d) Managed node không cần chạy bất kỳ phần mềm nào, kể cả Python

**Đáp án: b** — "agentless" nghĩa là không cài persistent agent trên managed node. Ansible kết
nối qua SSH (hoặc WinRM cho Windows), đẩy module Python tạm thời sang, chạy xong rồi dọn sạch.
Managed node vẫn cần Python 3 (không cần Ansible). Control node mới cần cài Ansible.

---

**Câu 2**: Task với `state: present` trong module `apt` có gì khác so với `state: latest`?

a) `present` cài package, `latest` chỉ kiểm tra phiên bản  
b) `present` chỉ cài nếu chưa có (giữ phiên bản cũ nếu đã cài); `latest` cài hoặc upgrade lên mới nhất  
c) `present` và `latest` hoàn toàn giống nhau  
d) `latest` chỉ hoạt động với `yum`, không hoạt động với `apt`

**Đáp án: b** — `state: present` là idempotent theo nghĩa "package phải có mặt" — nếu đã cài
bất kỳ version nào thì task `ok`, không upgrade. `state: latest` kiểm tra và upgrade nếu có
version mới hơn trong repo — có thể gây `changed` mỗi lần chạy nếu repo có update mới.

---

**Câu 3**: Handler trong Ansible có đặc điểm gì so với task thông thường?

a) Handler chạy trước tất cả task trong play  
b) Handler chỉ chạy một lần cuối play, dù được notify nhiều lần  
c) Handler chạy song song với task, không theo thứ tự  
d) Handler không thể dùng module `service`

**Đáp án: b** — handler chỉ chạy khi được `notify`, và chỉ chạy **một lần** ở cuối play dù
nhiều task cùng notify cùng handler đó. Ví dụ: 3 task cùng `notify: Reload Nginx` → Nginx chỉ
reload 1 lần ở cuối, không reload 3 lần liên tiếp. Handler không chạy nếu không có task nào
thay đổi (`changed`) trong play.

---

**Câu 4**: Lệnh `ansible-playbook deploy.yml --check` làm gì?

a) Chỉ kiểm tra cú pháp YAML, không kết nối tới host  
b) Chạy playbook thật nhưng ghi log vào file thay vì stdout  
c) Kết nối tới host, kiểm tra trạng thái, báo cáo gì sẽ thay đổi — nhưng KHÔNG thực sự thay đổi  
d) Chạy playbook và tự động rollback nếu có lỗi

**Đáp án: c** — `--check` (dry-run mode): Ansible thực sự kết nối SSH, thu thập facts, kiểm tra
trạng thái hiện tại của từng task — rồi báo `changed` hoặc `ok` mà không thực sự thay đổi gì.
Hữu ích để xem "nếu chạy thật thì sẽ thay đổi những gì". Lưu ý: một số module không hỗ trợ
đầy đủ check mode (đặc biệt `shell:` / `command:`).

---

**Câu 5**: Tại sao nên dùng `loop:` thay vì nhiều task riêng biệt khi cần cài nhiều user?

a) `loop:` nhanh hơn vì chạy song song  
b) `loop:` giảm số dòng YAML và tập trung logic vào 1 task; module được gọi 1 lần/item nhưng cùng cấu hình  
c) `loop:` là cách duy nhất module `user` chấp nhận nhiều tên cùng lúc  
d) `loop:` tự retry nếu 1 item thất bại

**Đáp án: b** — `loop:` giúp DRY (Don't Repeat Yourself): thay vì viết N task giống nhau chỉ
khác tên, viết 1 task + 1 list. Mỗi item trong list là 1 lần gọi module. Module `user` không
nhận list trong field `name:` — phải dùng loop. Loop KHÔNG chạy song song (tuần tự theo thứ
tự list) và không có auto-retry.

## 8. Bài liên quan và nguồn tham khảo

**Bài tiếp theo trong module:**
- `devops.ansible.roles` — tổ chức playbook phức tạp bằng role

**Bài liên quan ngoài module (xem thêm):**
- `linux.shell-scripting.bash-basics` — Jinja2 trong template tương tự shell variable
- `devops.cicd.tools` — Ansible thường là deploy step trong Jenkins/GitLab CI pipeline
- `linux.users-permissions.sudo-pam` — cấu hình sudo NOPASSWD cho Ansible user

**Nguồn tham khảo:**
- [Ansible Docs — Getting Started: Inventory](https://docs.ansible.com/ansible/latest/getting_started/get_started_inventory.html)
- [Ansible Docs — Getting Started: Playbook](https://docs.ansible.com/ansible/latest/getting_started/get_started_playbook.html)
