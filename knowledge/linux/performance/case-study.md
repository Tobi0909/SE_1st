---
id: linux.performance.case-study
title: "Case study troubleshooting hiệu năng tổng hợp: strace, lsof"
domain: linux
module: linux.performance
level: "chuyên sâu"
prerequisites: ["linux.performance.io"]
applies_to:
  - "Ubuntu 22.04 LTS (kernel 6.8) — strace/lsof, Yama LSM (ptrace_scope)"
status: verified
sources:
  - "https://www.kernel.org/doc/html/latest/admin-guide/LSM/Yama.html"
  - "https://man7.org/linux/man-pages/man1/strace.1.html"
last_verified: "2026-10-06"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Ba bài trước tách riêng CPU/RAM/I/O ở mức CHỈ SỐ TỔNG QUÁT (`vmstat`, `free`, `iostat`). Khi
CHỈ SỐ đã xác nhận "có vấn đề" nhưng chưa rõ CHÍNH XÁC process đang làm gì (gọi syscall nào,
mở file nào), `strace` và `lsof` là bước ĐI SÂU TIẾP THEO — "nhìn vào bên trong" một process
cụ thể. Đây là kỹ năng tổng hợp, kết hợp mọi công cụ đã học trong module thành MỘT quy trình
chẩn đoán hoàn chỉnh từ "hệ thống chậm" tới "chính xác dòng code/syscall nào gây ra".

## 2. Khái niệm cốt lõi

| Công cụ | Cho biết gì | Chi phí |
|---|---|---|
| `strace -c <cmd>` | TỔNG HỢP số lần gọi mỗi syscall, thời gian tiêu tốn — cho process MỚI khởi động | Thấp, dùng được production |
| `strace -p <pid>` | THEO DÕI TRỰC TIẾP syscall của process ĐANG CHẠY | Chặn process khi đang trace, cần quyền ptrace |
| `lsof -p <pid>` | TOÀN BỘ file/socket/thiết bị process đang MỞ | Thấp, an toàn production |

**Yama LSM / `ptrace_scope`**: cơ chế bảo mật kernel GIỚI HẠN việc một process "theo dõi"
(ptrace) process khác, có 4 mức:

| Giá trị | Tên | Ý nghĩa |
|---|---|---|
| `0` | Classic | Không giới hạn — ptrace bất kỳ process CÙNG UID (nếu "dumpable") |
| `1` | Restricted (mặc định phổ biến) | Chỉ ptrace được DESCENDANT của chính mình (con/cháu/chắt mọi cấp), trừ khi process đích tự cho phép qua `prctl(PR_SET_PTRACER,...)` |
| `2` | Admin-only | Chỉ process có `CAP_SYS_PTRACE` (thường là root) mới ptrace được |
| `3` | No attach | Không ai `PTRACE_ATTACH` được, kể cả root — chỉ đổi lại được sau khi reboot |

Mức mặc định phổ biến trên nhiều distro hiện đại (bao gồm Ubuntu) là `1` — CHO PHÉP ptrace đối
với TOÀN BỘ DESCENDANT (con, cháu, chắt... ở MỌI cấp, không chỉ con TRỰC TIẾP) của chính
process gọi ptrace, nhưng
KHÔNG cho phép ptrace một process BẤT KỲ không nằm trong nhánh descendant đó (dù cùng user).

## 3. Cách nó hoạt động

**`strace -c` (summary mode) phù hợp để TÌM NHANH syscall nào "ngốn" thời gian nhất, không
cần đọc từng dòng log chi tiết**: chạy LẠI process từ đầu với `strace -c`, kernel tự TỔNG HỢP
số lần gọi + thời gian cho MỖI loại syscall, in ra bảng xếp hạng — hữu ích khi nghi ngờ một
chương trình "chậm" nhưng chưa biết CHƯA RÕ do đọc file quá nhiều, hay gọi mạng quá nhiều, hay
thứ gì khác hoàn toàn.

**`ptrace_scope=1` chặn `strace -p` khi process đích KHÔNG CÒN nằm trong nhánh descendant
của tiến trình gọi strace** — đây KHÔNG phải lỗi quyền thông thường (không phải "thiếu sudo"
theo nghĩa file permission) mà là CHÍNH SÁCH BẢO MẬT CHỦ Ý của Yama LSM: ngăn một process (dù
chạy dưới CHÍNH user đó) tự do "nhìn vào" bộ nhớ/syscall của một process KHÁC NHÁNH — giảm
nguy cơ một process bị compromise đọc được dữ liệu nhạy cảm (ví dụ session key) của process
khác. Một process nền được tạo ra rồi bị RE-PARENT (ví dụ cha cũ đã thoát, nó được nhận nuôi
bởi subreaper — đã học ở bài `linux.process-signals.lifecycle`) không còn là descendant của
shell/tiến trình gọi `strace` NỮA, dù vẫn cùng user — đây chính là tình huống xảy ra ở ví dụ
mục 4 dưới đây. Muốn `strace -p` một process NGOÀI nhánh descendant, cần CHẠY VỚI ROOT (vượt
qua giới hạn này), hoặc chính process đó phải TỰ gọi `prctl(PR_SET_PTRACER, ...)` cho phép
TRƯỚC.

**`lsof` không bị giới hạn ptrace_scope — vì nó chỉ ĐỌC METADATA (danh sách file đang mở),
không "nhìn vào" bộ nhớ/syscall như `strace`**: đây là lý do `lsof -p <pid>` LUÔN chạy được
(không cần quyền đặc biệt ngoài quyền đọc thông tin process cơ bản), trong khi `strace -p`
cùng PID có thể bị chặn bởi Yama — hai công cụ có MỨC ĐỘ "nhìn sâu" khác nhau, dẫn tới yêu cầu
quyền khác nhau.

## 4. Thực hành

`strace -c` THẬT trên một lệnh đơn giản, xem bảng tổng hợp syscall (chạy thật):

```bash
$ strace -c -o /tmp/strace_demo.log ls /tmp > /dev/null
$ cat /tmp/strace_demo.log
% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
 30.53    0.000250          13        18           mmap
 18.68    0.000153          76         2           getdents64
 15.14    0.000124          17         7           mprotect
  5.74    0.000047           6         7           openat
```

Đọc: `getdents64` (đọc danh sách file trong thư mục — ĐÚNG việc `ls` cần làm) chỉ chiếm
`18.68%` thời gian, trong khi `mmap` (cấp phát bộ nhớ, phần lớn do LOADER nạp thư viện động)
chiếm NHIỀU HƠN (`30.53%`) — với một lệnh ĐƠN GIẢN như `ls`, phần lớn thời gian là OVERHEAD
khởi động process, không phải công việc THẬT — bình thường cho lệnh ngắn, nhưng nếu thấy tỷ lệ
TƯƠNG TỰ ở một ỨNG DỤNG LỚN chạy liên tục, đó là dấu hiệu đáng ngờ (ứng dụng "chạy" nhưng phần
lớn thời gian không làm việc thật).

Thử `strace -p` một process ĐANG CHẠY (tạo ở một lượt lệnh RIÊNG, mỗi lượt lệnh ở đây chạy
trong một shell con khác nhau — xem mục giải thích bên dưới) — xem LỖI THẬT do Yama chặn:

```bash
$ tail -f /dev/null & BGPID=$!
$ strace -p $BGPID
strace: Could not attach to process. If your uid matches the uid of the target process,
check the setting of /proc/sys/kernel/yama/ptrace_scope, or try again as the root user.
strace: attach: ptrace(PTRACE_SEIZE, 11916): Operation not permitted
$ cat /proc/sys/kernel/yama/ptrace_scope
1
```

`ptrace_scope=1` xác nhận ĐÚNG nguyên nhân (mục 3) — process nền này không còn nằm trong
nhánh DESCENDANT của tiến trình gọi `strace` ở lượt lệnh sau (mỗi lượt lệnh ở đây là một shell
riêng; process nền đã được RE-PARENT sang subreaper ngay khi shell tạo ra nó kết thúc — đúng
cơ chế "mồ côi" đã học ở bài `linux.process-signals.lifecycle`), nên bị Yama chặn, dù CÙNG
user (`tuantm5`) và dù không dùng `sudo`. Nếu `strace -p` được gọi TRONG CÙNG MỘT shell vừa
tạo process đó (còn là con trực tiếp, chưa bị re-parent), lệnh sẽ THÀNH CÔNG — minh hoạ đúng
nguyên lý "theo nhánh descendant", không phải một lệnh cấm tuyệt đối.

`lsof -p` CÙNG process đó — chạy THÀNH CÔNG dù `strace -p` vừa bị chặn, xác nhận đúng khác
biệt ở mục 3:

```bash
$ lsof -p $BGPID
COMMAND   PID    USER   FD   TYPE DEVICE SIZE/OFF     NODE NAME
tail    11916 tuantm5  cwd    DIR  259,2     4096 31067832 /home/.../project 1st
tail    11916 tuantm5  txt    REG  259,2    68112 18488900 /usr/bin/tail
tail    11916 tuantm5    0r   CHR    1,3      0t0        5 /dev/null
```

## 5. Lỗi thường gặp và cách chẩn đoán

**`strace -p` báo "Operation not permitted", nghĩ ngay là thiếu `sudo`**
- Nguyên nhân: như vừa minh hoạ — có thể là Yama `ptrace_scope` chặn, KHÔNG PHẢI thiếu
  quyền file/sudo thông thường (dù `sudo strace -p` CÓ thể giải quyết được, nhưng không phải
  vì "thiếu sudo" theo nghĩa thông thường).
- Cách xác nhận: đọc message lỗi ĐẦY ĐỦ (tự gợi ý kiểm tra `ptrace_scope`) và
  `cat /proc/sys/kernel/yama/ptrace_scope` — giá trị `1`/`2`/`3` xác nhận đúng nguyên nhân.
- Cách xử lý: dùng `sudo` (vượt qua giới hạn, cần quyền root) — hoặc nếu process đó là CON
  TRỰC TIẾP của chính session, strace sẽ hoạt động không cần sudo.

**Dùng `strace -p` production trên một process CỰC KỲ nhạy về độ trễ (ví dụ trading, real-
time), gây gián đoạn ngắn nhưng NGHIÊM TRỌNG**
- Nguyên nhân: `strace -p` làm CHẬM process đang trace đáng kể (mỗi syscall phải dừng lại để
  kernel thông báo cho tracer) — chi phí này có thể KHÔNG chấp nhận được với hệ thống cực kỳ
  nhạy thời gian.
- Cách xác nhận: đo độ trễ/latency ứng dụng NGAY TRƯỚC và TRONG lúc strace — thấy tăng đột
  biến xác nhận tác động.
- Cách xử lý: với hệ thống nhạy cảm, ưu tiên `strace -c` trên một BẢN SAO/test tương tự trước
  (không trace trực tiếp production), hoặc dùng công cụ ít tác động hơn (eBPF-based tracing
  như `bpftrace` nếu cần production-safe).

**Dùng `lsof` để tìm "ai đang giữ file này" nhưng không lọc đúng, output quá nhiều không đọc
được**
- Nguyên nhân: `lsof` không có argument lọc theo file cụ thể sẽ in TOÀN BỘ file đang mở của
  TOÀN hệ thống — quá nhiều để đọc hữu ích.
- Cách xác nhận: output dài tràn màn hình, khó tìm đúng thông tin cần.
- Cách xử lý: luôn lọc theo đúng mục tiêu: `lsof <đường-dẫn-file>` (ai đang mở file này) hoặc
  `lsof -p <pid>` (file nào process này đang mở) — không chạy `lsof` trần không tham số cho
  mục đích điều tra cụ thể.

## 6. Tình huống thực tế

Tổng hợp quy trình đầy đủ: một API service báo latency tăng cao bất thường, team cần xác định
nguyên nhân từ ĐẦU tới CUỐI bằng các công cụ đã học trong cả module.

1. `vmstat 1 5` (bài `cpu-load`) — `wa` bình thường, `r`/`cs` không bất thường — loại trừ CPU
   và I/O tổng quát.
2. `free -h` (bài `memory-swap`) — `available` vẫn dư nhiều, swap không hoạt động — loại trừ
   RAM/swap.
3. Đã loại trừ CPU/RAM/I/O tổng quát — nghi ngờ vấn đề nằm ở TẦNG ỨNG DỤNG (logic code, không
   phải hạ tầng) — chuyển sang công cụ của bài này.
4. `strace -c -p <pid-service>` (với quyền phù hợp, hoặc chạy `strace -c` khi RESTART service
   trong môi trường test tương tự) — phát hiện syscall `connect`/`read` tới một IP CỤ THỂ
   (service phụ thuộc bên ngoài) chiếm PHẦN LỚN thời gian, với SỐ LẦN GỌI cao bất thường.
5. `lsof -p <pid-service>` — xác nhận service đang giữ RẤT NHIỀU kết nối TCP tới CÙNG một
   service phụ thuộc đó — gợi ý service phụ thuộc đang PHẢN HỒI CHẬM, khiến service chính phải
   chờ (và có thể đang retry liên tục, tạo thêm connection mới).
6. Điều tra service phụ thuộc đó riêng (có thể chính service phụ thuộc đang gặp vấn đề CPU/
   RAM/I/O của NÓ) — xác định đúng vấn đề gốc nằm ở ĐÓ, không phải ở service ban đầu bị báo
   cáo chậm.
7. Ghi vào runbook: quy trình chẩn đoán latency PHẢI đi THEO THỨ TỰ từ TỔNG QUÁT (CPU/RAM/I/O
   của chính service) tới CHI TIẾT (syscall/file/connection cụ thể) — nhảy thẳng vào
   `strace`/`lsof` mà chưa loại trừ CPU/RAM/I/O trước dễ bỏ sót nguyên nhân đơn giản hơn; nhưng
   khi ĐÃ loại trừ xong, `strace`/`lsof` là bước BẮT BUỘC để đi tới nguyên nhân thật (thường
   nằm ở một DEPENDENCY bên ngoài, không phải chính service).

## 7. Tự kiểm tra

1. Vì sao `strace -c` phù hợp hơn đọc từng dòng `strace` thông thường khi chỉ cần biết "syscall
   nào chiếm nhiều thời gian nhất"?
   <details><summary>Đáp án</summary><code>-c</code> (summary/count mode) tự TỔNG HỢP số lần
   gọi và thời gian cho MỖI loại syscall thành một bảng xếp hạng, không cần tự đọc và tính
   từng dòng log chi tiết — nhanh hơn nhiều cho mục đích "tìm syscall nào ngốn thời gian
   nhất".</details>

2. `strace -p <pid>` báo lỗi "Operation not permitted" dù chạy đúng user sở hữu process đó,
   không dùng sudo. Đây có chắc là lỗi quyền file thông thường không?
   <details><summary>Đáp án</summary>Không chắc — rất có thể là Yama LSM
   (<code>ptrace_scope</code>) chặn, một chính sách bảo mật RIÊNG của kernel về việc ptrace
   process khác, KHÁC với permission file thông thường. Cần kiểm tra
   <code>/proc/sys/kernel/yama/ptrace_scope</code> để xác nhận.</details>

3. Vì sao `lsof -p <pid>` thường chạy được dù `strace -p` CÙNG pid đó bị chặn bởi
   `ptrace_scope`?
   <details><summary>Đáp án</summary><code>lsof</code> chỉ đọc METADATA (danh sách file/
   socket đang mở) của process, không "nhìn vào" bộ nhớ hay can thiệp syscall như
   <code>strace</code> (dùng ptrace) — mức độ "nhìn sâu" khác nhau dẫn tới yêu cầu quyền khác
   nhau, Yama chỉ giới hạn ptrace, không giới hạn đọc metadata thông thường.</details>

4. Vì sao KHÔNG nên `strace -p` trực tiếp một process production cực kỳ nhạy về độ trễ mà
   không cân nhắc?
   <details><summary>Đáp án</summary><code>strace -p</code> làm CHẬM đáng kể process đang
   trace (mỗi syscall phải dừng để kernel thông báo cho tracer) — với hệ thống nhạy thời gian,
   chi phí này có thể gây ảnh hưởng nghiêm trọng hơn chính vấn đề đang điều tra. Nên ưu tiên
   test trên bản sao, hoặc dùng công cụ ít tác động hơn.</details>

5. Trong tình huống thực tế mục 6, vì sao team KIỂM TRA CPU/RAM/I/O TRƯỚC khi dùng
   `strace`/`lsof`, thay vì dùng `strace`/`lsof` ngay từ đầu?
   <details><summary>Đáp án</summary>Để LOẠI TRỪ các nguyên nhân hạ tầng ĐƠN GIẢN HƠN (CPU/
   RAM/I/O) trước khi đi vào chẩn đoán CHI TIẾT HƠN (syscall/connection cụ thể) — tránh bỏ sót
   nguyên nhân dễ phát hiện bằng công cụ tổng quát, và tránh lãng phí thời gian phân tích chi
   tiết khi vấn đề thực ra nằm ở tầng hạ tầng cơ bản.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.performance.cpu-load`, `linux.performance.memory-swap`, `linux.performance.io` —
  ba bước chẩn đoán TỔNG QUÁT trước khi cần tới `strace`/`lsof` ở bài này.

**Bài liên quan ngoài module:**
- `linux.users-permissions.selinux-apparmor` — một dạng MAC khác (không phải Yama) cũng có
  thể chặn hành vi process theo cách tương tự, cần phân biệt khi debug lỗi "permission".

**Nguồn tham khảo:**
- [Yama LSM — kernel.org](https://www.kernel.org/doc/html/latest/admin-guide/LSM/Yama.html)
  — đặc tả chính thức các mức `ptrace_scope` (0-3).
- [strace(1) — man7.org](https://man7.org/linux/man-pages/man1/strace.1.html) — cú pháp
  `-c` (summary) và `-p` (attach).
