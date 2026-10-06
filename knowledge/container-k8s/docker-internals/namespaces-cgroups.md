---
id: container-k8s.docker-internals.namespaces-cgroups
title: "Cơ chế cách ly: Linux namespace và cgroup (nền tảng container)"
domain: container-k8s
module: container-k8s.docker-internals
level: "nền tảng"
prerequisites: ["linux.process-signals.lifecycle"]
applies_to:
  - "Ubuntu 22.04 LTS — kernel 6.8.0-138-generic; cgroup v2 unified hierarchy (đây là default từ Ubuntu 22.04, khác cgroup v1 legacy có trên distro cũ); các khái niệm namespace là chuẩn chung mọi Linux kernel hiện đại"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man7/namespaces.7.html"
  - "https://man7.org/linux/man-pages/man7/cgroups.7.html"
  - "https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 4.6 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Docker (và mọi container runtime — containerd, podman...) KHÔNG phải "máy ảo trong máy ảo" và
KHÔNG phải một giải pháp riêng của Docker Inc. Nó sử dụng HAI tính năng kernel Linux có sẵn từ lâu:
**namespace** (cách ly — mỗi container thấy hệ thống khác nhau) và **cgroup** (giới hạn — mỗi
container dùng tài nguyên không vượt mức được phép). Hiểu hai cơ chế này giải thích được: tại sao
"container gần như không có overhead so với process native", tại sao container KHÔNG bảo vệ kernel
(kernel vẫn dùng chung), và tại sao một số thao tác "thoát khỏi container" vẫn có thể nếu namespace
chưa đủ chặt.

## 2. Khái niệm cốt lõi

**Linux namespace**: cơ chế PHÂN VÙNG CÁI NHÌN — mỗi process được gắn vào một tập namespace, và
chỉ thấy tài nguyên hệ thống trong phạm vi namespace đó. 8 loại namespace hiện có:

| Namespace | Symbol | Cách ly cái gì |
|---|---|---|
| `pid` | `CLONE_NEWPID` | PID space — container thấy PID 1, host thấy PID thật |
| `net` | `CLONE_NEWNET` | Network interface, route, iptables riêng |
| `mnt` | `CLONE_NEWNS` | Mount point — container có cây filesystem riêng |
| `uts` | `CLONE_NEWUTS` | Hostname và NIS domain name riêng |
| `ipc` | `CLONE_NEWIPC` | IPC (shared memory, semaphore) riêng |
| `user` | `CLONE_NEWUSER` | UID/GID mapping — root trong container ≠ root trên host |
| `cgroup` | `CLONE_NEWCGROUP` | Cây cgroup riêng (cách ly metadata cgroup) |
| `time` | `CLONE_NEWTIME` | CLOCK_MONOTONIC/CLOCK_BOOTTIME riêng (kernel 5.6+) |

**cgroup (control group)**: cơ chế GIỚI HẠN VÀ THEO DÕI tài nguyên — CPU, RAM, I/O, network cho
một nhóm process. Không phải cách ly (process bên trong vẫn thấy tài nguyên host nếu chỉ đọc),
mà là ĐẶT TRẦN — kernel từ chối cho phép vượt quá giới hạn đã khai báo. Trên Ubuntu 22.04 dùng
**cgroup v2** (unified hierarchy, một cây duy nhất, tất cả controller trong cùng một cây) khác với
cgroup v1 (mỗi controller có cây riêng).

**Namespace + cgroup cộng lại = container**: namespace làm cho process TƯỞNG nó đang chạy một mình
trong hệ thống riêng; cgroup làm cho nó THỰC SỰ không thể lấy thêm tài nguyên dù muốn. Hai cơ chế
này độc lập nhau và có thể dùng riêng — container runtime chỉ tự động gọi cả hai khi tạo container.

## 3. Cách nó hoạt động

**Mỗi process được gắn với ĐÚNG MỘT namespace của mỗi loại** — có thể xem qua `/proc/<pid>/ns/`,
là tập symlink chỉ tới inode đại diện namespace. Hai process có cùng symlink target → dùng chung
namespace. Khi process mới được tạo (`fork`/`clone`), nó thừa kế namespace của parent TRỪ KHI
`CLONE_NEW*` flag được chỉ định. `unshare()` syscall cho phép process tự tách ra namespace mới mà
không cần fork.

**Container "thoát" namespace (namespace escape) là một class lỗ hổng bảo mật thật** — thông thường
gặp nhất với `user` namespace (mapping root-in-container → unprivileged-on-host là chính sách của
Docker) và `mnt` namespace (mount `/` của host vào container nếu volume sai cách). Hiểu namespace là
điều kiện cần để đánh giá rủi ro bảo mật của từng cấu hình container.

**cgroup v2 hierarchy**: tất cả controller (cpu, memory, io, pids...) nằm trong MỘT cây thư mục tại
`/sys/fs/cgroup/`. Mỗi thư mục con là một cgroup, có thể có cgroup con. Kernel gán mỗi process vào
đúng một cgroup (path lưu trong `/proc/<pid>/cgroup`). File trong mỗi cgroup (`cpu.max`,
`memory.max`...) là interface để đọc/đặt giới hạn. Container runtime tạo một thư mục con dưới
`/sys/fs/cgroup/` cho mỗi container và ghi giới hạn vào đó.

## 4. Thực hành

Xem namespace của shell hiện tại — mỗi dòng là symlink trỏ tới inode của namespace:

```bash
$ readlink /proc/self/ns/*
cgroup:[4026531835]
ipc:[4026531839]
mnt:[4026531841]
net:[4026531840]
pid:[4026531836]
pid:[4026531836]
time:[4026531834]
time:[4026531834]
user:[4026531837]
uts:[4026531838]
```

Hai số `pid:[4026531836]` xuất hiện hai lần — tương ứng `pid` và `pid_for_children` (namespace áp
dụng cho chính process vs namespace của child process). Số `4026531836` là inode ID, duy nhất cho
mỗi namespace instance — hai process có cùng số này đang CÙng namespace; container sẽ có số KHÁC
với host.

Xem cgroup của process hiện tại — cho biết process đang thuộc cgroup nào trong hierarchy:

```bash
$ cat /proc/self/cgroup
0::/user.slice/user-1000.slice/user@1000.service/app.slice/app-com.anthropic.Claude-6533.scope
```

Đọc: định dạng `<hierarchy-id>::<cgroup-path>` — `0::` nghĩa là cgroup v2 (hierarchy 0 = unified),
path phân cấp: `user.slice` → `user-1000.slice` → session service → app scope. Một container
Docker sẽ nằm trong cây khác, ví dụ:
`/system.slice/docker.service/docker-<id>.scope`.

Xem toàn bộ controller có sẵn trong cgroup v2:

```bash
$ cat /sys/fs/cgroup/cgroup.controllers
cpuset cpu io memory hugetlb pids rdma misc
```

Các controller này (cpu, memory, io, pids...) là những tài nguyên có thể đặt giới hạn qua cgroup.
Container runtime ghi giới hạn bằng cách tạo thư mục cgroup con và ghi vào file `<controller>.max`.

Xem cấu trúc cgroup v2 (thư mục con = cgroup con):

```bash
$ ls /sys/fs/cgroup/
dev-hugepages.mount/  sys-fs-fuse-connections.mount/  cgroup.controllers  memory.stat
dev-mqueue.mount/     sys-kernel-config.mount/         cgroup.procs        ...
init.scope/           system.slice/                    cpu.stat
proc-sys-fs-binfmt_misc.mount/ user.slice/             io.stat
```

`system.slice/` chứa cgroup của các service systemd; `user.slice/` chứa cgroup của user sessions
(bao gồm shell hiện tại). Khi Docker chạy, sẽ thấy thêm `docker/` hoặc `system.slice/docker.service/`
trong cây này.

> Phần dưới là **output minh hoạ** — Docker không cài trên máy demo; các lệnh `docker inspect` và
> cấu trúc cgroup container lấy theo tài liệu Docker Engine chính thức.

Khi Docker tạo container, nó tạo namespace mới và đặt cgroup riêng. Xem namespace của container
(minh hoạ — chạy với `docker inspect` + đọc `/proc/<container-pid>/ns/`):

```
$ docker inspect --format='{{.State.Pid}}' my-container
12345

$ readlink /proc/12345/ns/net /proc/12345/ns/pid /proc/12345/ns/mnt
net:[4026532001]    ← KHÁC với host net:[4026531840]
pid:[4026532002]    ← KHÁC với host pid:[4026531836]
mnt:[4026532003]    ← KHÁC với host mnt:[4026531841]
```

Số inode khác = namespace riêng, xác nhận container được cách ly.

## 5. Lỗi thường gặp và cách chẩn đoán

**Container "thấy" hostname của host thay vì hostname được đặt trong `docker run --hostname`**
- Nguyên nhân: container không được tạo với UTS namespace riêng (cấu hình `--network=host` kéo
  theo dùng chung namespace của host), hoặc `--hostname` không được set.
- Cách xác nhận: trong container, so sánh `hostname` với `cat /proc/self/ns/uts` — nếu inode
  giống inode UTS của host process, container đang dùng chung UTS namespace.
- Cách xử lý: luôn dùng `docker run --hostname <tên>` khi cần tên riêng; tránh `--network=host`
  khi không thực sự cần share toàn bộ network stack với host.

**Container vượt giới hạn RAM gây OOM kill không như mong đợi**
- Nguyên nhân: cgroup giới hạn RAM nhưng OOM killer quyết định kill process NÀO trong cgroup khi
  vượt ngưỡng — không nhất thiết là process "tham nhất", mà theo điểm `oom_score` (xem thêm: `linux.performance.memory-swap`). Một số container runtime cho phép cấu hình `--oom-score-adj`
  để ảnh hưởng hành vi này.
- Cách xác nhận: `docker stats <container>` xem memory usage realtime; kiểm tra
  `cat /sys/fs/cgroup/docker/<id>/memory.max` để xem giới hạn đang set; check kernel log
  (`journalctl -k | grep "oom"`) khi OOM event xảy ra.
- Cách xử lý: tăng giới hạn RAM (`docker run -m <size>`), hoặc tối ưu ứng dụng, hoặc cấu hình
  restart policy (`--restart=on-failure`) để service tự phục hồi sau OOM kill.

## 6. Tình huống thực tế

Một container được thiết kế chạy độc lập nhưng có thể ảnh hưởng tới host nếu cấu hình namespace
sai — dùng để giải thích tại sao "container an toàn nhưng không hoàn toàn cách ly":

1. Một developer mount `/etc/` của host vào container để test (`-v /etc:/etc`) — container giờ có
   thể ĐỌC và SỬA toàn bộ `/etc/` của host qua namespace `mnt`, dù PID/net namespace vẫn cách ly.
   Đây là lý do volume mount phải được review kỹ không kém gì quyền file thông thường.
2. Container chạy với `--privileged` — flag này VÔ HIỆU HOÁ hầu hết cách ly namespace (container
   có đầy đủ capability Linux, có thể mount, thay đổi kernel parameter...), thực chất là chạy một
   process với quyền root đầy đủ trên host mà không cần SSH. Chỉ dùng khi thực sự cần (ví dụ
   container cần load kernel module), không phải "để tránh lỗi permission".
3. Khi audit security của hệ thống container, câu hỏi đầu tiên không phải "image có lỗ hổng
   không" mà là "container đang chạy với namespace và cgroup được cấu hình đúng không" — vì một
   image sạch nhưng cấu hình sai namespace/volume vẫn có thể gây rủi ro toàn bộ host.

## 7. Tự kiểm tra

1. Hai process có cùng inode trong `/proc/<pid>/ns/net`. Điều này có nghĩa là gì?
   <details><summary>Đáp án</summary>Chúng đang dùng CHUNG network namespace — thấy cùng interface,
   route table, iptables rule. Nếu một là container và một là host, container đó đang dùng network
   của host (tương đương <code>--network=host</code> trong Docker), không được cách ly mạng.</details>

2. Vì sao container thường "nhẹ hơn" VM về overhead?
   <details><summary>Đáp án</summary>Container dùng namespace/cgroup để cách ly và giới hạn process
   trực tiếp trên kernel host — KHÔNG có hypervisor, KHÔNG có guest kernel riêng, KHÔNG có hardware
   emulation. Process trong container chạy với kernel của host, chỉ có cái nhìn về hệ thống là
   khác (do namespace). VM chạy thêm một kernel đầy đủ và hypervisor, nên overhead cao hơn
   nhiều.</details>

3. `--privileged` trong `docker run` vô hiệu hoá điều gì?
   <details><summary>Đáp án</summary>Hầu hết cách ly namespace và tất cả giới hạn capability — container
   nhận đầy đủ Linux capability (như root thật trên host), có thể mount filesystem, thay đổi kernel
   parameter qua sysctl, load module... Thực chất là process root với quyền đầy đủ trên host dù
   "nhìn từ ngoài" vẫn là container.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `container-k8s.docker-internals.images` — Docker image dùng `mnt` namespace kết hợp overlay
  filesystem để tạo layer cho mỗi container.
- `container-k8s.docker-internals.networking` — Docker network mode (bridge/host/none) tương ứng
  với cách tạo/không tạo `net` namespace mới.

**Bài liên quan ngoài module:**
- `linux.process-signals.lifecycle` — `fork()`/`clone()` là cách kernel tạo process, namespace
  được kế thừa hoặc tách ra đúng lúc `clone()` với flag `CLONE_NEW*`.
- `linux.performance.memory-swap` — `oom_score`/`oom_score_adj` ảnh hưởng hành vi OOM kill trong
  cgroup container.
- `linux.kernel-troubleshooting.sysctl` — một số sysctl (`net.ipv4.ip_forward`) cần bật trên host
  để Docker bridge network hoạt động.

**Nguồn tham khảo:**
- [namespaces(7) — man7.org](https://man7.org/linux/man-pages/man7/namespaces.7.html) — danh sách
  8 namespace type, API (`clone`, `unshare`, `setns`), `/proc/<pid>/ns/`.
- [cgroups(7) — man7.org](https://man7.org/linux/man-pages/man7/cgroups.7.html) — tổng quan cgroup
  v1 và v2, interface file, lifecycle.
- [Kernel cgroup v2 — kernel.org](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
  — tài liệu chính thức cgroup v2 unified hierarchy, interface file chi tiết từng controller.
