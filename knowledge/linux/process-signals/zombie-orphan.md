---
id: linux.process-signals.zombie-orphan
title: "Chẩn đoán zombie/orphan process và process leak"
domain: linux
module: linux.process-signals
level: "chuyên sâu"
prerequisites: ["linux.process-signals.signals", "linux.process-signals.monitoring"]
applies_to:
  - "Ubuntu 22.04 LTS (kernel 6.8) — hành vi subreaper/zombie là chuẩn kernel Linux, áp dụng chung mọi distro"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man2/wait.2.html"
  - "https://man7.org/linux/man-pages/man1/ps.1.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

## 1. Vì sao cần biết

Hai bài trước trong module (`lifecycle`, `monitoring`) đã giới thiệu khái niệm zombie và
orphan. Bài này đi sâu vào tình huống THỰC TẾ hay gặp nhất liên quan tới chúng: zombie TÍCH TỤ
dần qua thời gian trên một server production cho tới khi làm nghẽn cả hệ thống — và cách truy
ngược từ "có bao nhiêu zombie" tới "process nào đang viết code sai", vì bản thân zombie không
bao giờ là nguyên nhân gốc, nó luôn là HẬU QUẢ của một process cha không gọi `wait()` đúng
cách.

## 2. Khái niệm cốt lõi

Nhắc lại và làm rõ ba trạng thái dễ nhầm:

| Trạng thái | Process còn sống? | Nguyên nhân | Ai xử lý được |
|---|---|---|---|
| Zombie (`Z`) | KHÔNG (đã `exit()`) | Cha chưa gọi `wait()`/`waitpid()` | Phải sửa/khởi động lại process CHA, không phải zombie |
| Orphan (process mồ côi) | CÓ | Cha đã thoát trước khi con `exit()` | Tự động được subreaper/`init` nhận nuôi, thường không cần can thiệp |
| Process leak (rò rỉ tích lũy) | Hỗn hợp | Cha liên tục tạo con, liên tục không `wait()` | Sửa code process cha — đây là "zombie" lặp lại nhiều lần, tích tụ |

Điểm mấu chốt: **orphan tự nó không phải vấn đề** (kernel có cơ chế subreaper xử lý tốt, xem
bài `lifecycle`) — vấn đề thật luôn là ZOMBIE TÍCH TỤ, vì đây là dấu hiệu một process cha có
bug (không gọi `wait()`), và nếu process cha đó vẫn tiếp tục sống và tiếp tục tạo con mới, số
zombie sẽ tăng dần KHÔNG GIỚI HẠN cho tới khi đầy bảng process của kernel.

## 3. Cách nó hoạt động

**Zombie không chiếm CPU/RAM đáng kể — vấn đề là SỐ LƯỢNG, không phải TẢI**: một zombie chỉ
còn lại một bản ghi tối thiểu trong bảng process của kernel (PID, exit code, một số thống kê
resource usage) — không chạy code, không dùng CPU, RAM thực tế gần như bằng 0. Nguy hiểm thật
sự là mỗi entry trong bảng process là MỘT SLOT có giới hạn tổng số (`kernel.pid_max`, thường
mặc định khá lớn nhưng không vô hạn) — zombie tích tụ đủ nhiều VẪN chiếm slot, tới khi hệ
thống không còn slot trống cho `fork()` mới, bất kể CPU/RAM còn dư bao nhiêu (đã minh hoạ ở
tình huống thực tế của bài `lifecycle`).

**Truy ngược từ zombie về "ai gây ra" luôn đi qua cột `PPID`**: vì zombie chỉ còn tồn tại vì
process CHA chưa `wait()`, cột `PPID` của mọi zombie chính là "nghi phạm" — không cần đoán, chỉ
cần gom nhóm zombie theo PPID (xem mục 4) để biết chính xác process nào đang có bug.

**Phân biệt "process cha chết" khỏi "process cha còn sống nhưng lười gọi wait()"**: nếu process
CHA của một zombie đã thoát, zombie đó sẽ được re-parent và reap TỰ ĐỘNG bởi subreaper gần nhất
(đã học ở bài `lifecycle`) — zombie chỉ "sống dai" khi CHÍNH process cha gốc vẫn đang chạy,
nhưng code của nó có vấn đề (ví dụ dùng `subprocess.Popen` không gọi `.wait()`, hoặc tự viết
`fork()` tay mà quên `waitpid()`, hoặc trong một số trường hợp cũ hơn: cố ý đặt
`signal(SIGCHLD, SIG_IGN)` nhưng lại dùng sai trên hệ thống không hỗ trợ auto-reap theo cách đó
— mỗi ngôn ngữ/framework có API `wait` riêng, nhưng nguyên lý kernel luôn giống nhau).

**Không có cách "xoá" một zombie bằng tín hiệu** — điều NÊN làm, không phải điều KHÔNG THỂ
làm: về mặt kernel, cách DUY NHẤT loại bỏ một zombie là để process cha của nó gọi `wait()` —
hoặc gián tiếp bằng cách làm process cha đó KẾT THÚC (lúc đó toàn bộ zombie con của nó được
re-parent và tự động được subreaper reap ngay). Restart process cha (nếu đó là một service có
thể restart an toàn) thường là cách xử lý TẠM THỜI nhanh nhất trong lúc chờ sửa code gốc.

## 4. Thực hành

Kiểm tra số lượng zombie toàn hệ thống — thao tác đầu tiên khi nghi ngờ process leak (chạy
trên máy Ubuntu 22.04.5 LTS, không có zombie tồn đọng tại thời điểm viết bài — xác nhận hệ
thống đang sạch):

```bash
$ ps -eo stat | grep -c '^Z'
0
```

Khi SỐ NÀY KHÁC 0 và có xu hướng tăng dần qua thời gian, bước tiếp theo là gom nhóm theo
`PPID` để tìm "nghi phạm" (cú pháp mẫu, chạy được trên bất kỳ máy Linux nào, không phụ thuộc
có zombie thật hay không tại thời điểm chạy):

```bash
$ ps -eo stat,ppid,comm | awk '$1 ~ /Z/ {print $2}' | sort | uniq -c | sort -rn
```

Lệnh này in ra PPID nào đang "giữ" nhiều zombie nhất — PPID xuất hiện nhiều lần chính là
process cha có bug, cần `ps -p <PPID> -o pid,comm,args` để biết đó là tiến trình nào trước khi
quyết định restart hay sửa code.

Minh hoạ lại việc tạo và reap một zombie thật (lặp lại từ bài `lifecycle`, lần này nhấn mạnh
GÓC NHÌN CHẨN ĐOÁN — xem zombie "xuất hiện" trong `ps -eo stat | grep -c '^Z'` đúng lúc nó tồn
tại):

```bash
$ python3 -c "
import os, time
pid = os.fork()
if pid == 0:
    os._exit(0)
else:
    time.sleep(2)
    os.system(\"ps -eo stat | grep -c '^Z'\")  # đếm ngay TRONG lúc zombie còn tồn tại
    os.waitpid(pid, 0)
"
1
```

Số `1` xác nhận đúng một zombie tồn tại trong khoảng 2 giây process cha (script Python) chưa
gọi `waitpid()` — ngay sau khi `waitpid()` chạy, số này sẽ về lại 0 nếu kiểm tra lại.

Xem orphan THẬT được subreaper nhận nuôi (không phải zombie — process vẫn sống, chỉ đổi PPID,
nhắc lại từ bài `lifecycle` vì đây là bước cần làm TRƯỚC khi vội kết luận một process "mồ côi"
là có vấn đề):

```bash
$ bash -c 'tail -f /dev/null & echo "child PID: $!"'
child PID: 30370
$ ps -p 30370 -o pid,ppid,comm
    PID    PPID COMMAND
  30370    3466 tail
```

`PPID=3466` (không phải `1`) xác nhận: trên desktop Linux hiện đại dùng systemd user session,
orphan được nhận nuôi bởi `systemd --user` của session đó, không nhất thiết luôn là PID 1 —
quan trọng khi viết script dò orphan bằng điều kiện `PPID == 1`, điều kiện đó có thể BỎ LỌT
trường hợp này trên một số hệ thống.

## 5. Lỗi thường gặp và cách chẩn đoán

**Script dò zombie chỉ đếm process có `PPID == 1`, bỏ sót nhiều trường hợp thật**
- Nguyên nhân: nhầm "orphan luôn có PPID=1" — trên hệ thống dùng subreaper (systemd user
  session, container runtime có init riêng), orphan có thể có PPID khác 1 (mục 4).
- Cách xác nhận: đối chiếu PPID thật bằng `ps -p <PPID> -o comm,args` — nếu là `systemd --user`
  hoặc init/subreaper khác, đây vẫn là orphan được xử lý đúng, không phải lỗi.
- Cách xử lý: khi cần dò ZOMBIE (vấn đề thật), lọc theo `STAT ~ Z`, KHÔNG lọc theo `PPID == 1`
  — PPID của zombie là process cha CÒN SỐNG đang có bug, không liên quan subreaper.

**Restart process cha để dọn zombie, nhưng zombie quay lại sau một thời gian ngắn**
- Nguyên nhân: restart chỉ dọn zombie HIỆN CÓ, không sửa nguyên nhân gốc — code cha vẫn tiếp
  tục không gọi `wait()` cho con mới, zombie tích tụ lại.
- Cách xác nhận: theo dõi `ps -eo stat | grep -c '^Z'` theo thời gian — số tăng dần đều sau
  mỗi lần restart xác nhận lỗi code lặp lại, không phải sự cố một lần.
- Cách xử lý: bắt buộc sửa code gốc (gọi đúng hàm wait/poll/communicate của ngôn ngữ đang
  dùng) — restart chỉ là biện pháp tạm.

**Nhầm process ở trạng thái `D` kéo dài với zombie khi viết script cảnh báo**
- Nguyên nhân: cả hai "trông" giống nhau với cách lọc cẩu thả (chỉ kiểm tra "không phản hồi"),
  nhưng bản chất khác hoàn toàn (bảng ở mục 2).
- Cách xác nhận: lọc CHÍNH XÁC theo `STAT`/`S` — chỉ `Z` là zombie, `D` là vấn đề khác hẳn
  (I/O treo, xem `linux.process-signals.monitoring`).
- Cách xử lý: script giám sát nên có HAI cảnh báo riêng cho `Z` và `D`, vì hướng xử lý khác
  nhau.

## 6. Tình huống thực tế

Một API gateway tự viết (Python, dùng `subprocess.Popen()`) gọi một binary xử lý ảnh cho mỗi
request upload, giữ lại object `Popen` trong một danh sách để tra cứu sau nhưng không bao giờ
gọi `.wait()`/`.poll()`/`.communicate()` trên nó. Sau một tuần chạy production với lưu lượng
cao, server bắt đầu trả lỗi `BlockingIOError: [Errno 11] Resource temporarily unavailable` khi
gateway cố xử lý request mới (`fork()` thất bại).

1. `ps -eo stat | grep -c '^Z'` — trả về một số rất lớn (hàng chục nghìn), xác nhận process
   leak qua zombie.
2. `ps -eo stat,ppid,comm | awk '$1 ~ /Z/ {print $2}' | sort | uniq -c | sort -rn | head -3` —
   toàn bộ zombie cùng một PPID: PID của chính process Python gateway.
3. Đọc lại code: mỗi request gọi `subprocess.Popen([...])`, lưu object vào list để "tra cứu
   sau" nhưng không có `.wait()`/`.poll()`/`.communicate()` nào từng được gọi. Khác với một số
   runtime tự reap child ở tầng nền (ví dụ Node.js qua libuv), `subprocess.Popen` của Python
   KHÔNG tự `waitpid()` ngầm — reap chỉ xảy ra khi code gọi rõ một trong ba hàm trên. Mỗi
   request tạo một zombie mới, chưa bao giờ được dọn trong khi gateway (cha) vẫn chạy.
4. Xác nhận bằng thực nghiệm độc lập: tạo 5 process con qua `subprocess.Popen(["true"])`, giữ
   reference, không gọi `wait()` — `ps -eo stat | grep -c '^Z'` tăng từ `0` lên `5` ngay; gọi
   `.wait()` cho từng object thì về lại `0`.
5. Xử lý tạm thời: restart process gateway — toàn bộ zombie con được re-parent và reap ngay.
6. Xử lý gốc: gọi `.wait()`/`.communicate()` trên mỗi `Popen` ngay khi không còn cần theo dõi,
   hoặc `.poll()` định kỳ trong job dọn dẹp nếu cần giữ tham chiếu lâu hơn.
7. Ghi vào runbook: service gọi subprocess cho từng request PHẢI có test riêng kiểm tra process
   leak dưới tải. Hành vi tự reap khác nhau giữa runtime (Node.js qua libuv tự `waitpid()` bất
   kể có listener JS hay không) — không suy diễn hành vi của một ngôn ngữ từ ngôn ngữ khác.

## 7. Tự kiểm tra

1. Bạn thấy 500 process ở trạng thái `Z`, tất cả cùng `PPID = 4210`. Hành động ĐẦU TIÊN hợp lý
   nhất là gì?
   <details><summary>Đáp án</summary>Kiểm tra process 4210 là gì (<code>ps -p 4210 -o
   comm,args</code>) để xác định đúng service/code nào đang có bug không gọi
   <code>wait()</code>, TRƯỚC khi quyết định restart nó hay sửa code — không có hành động nào
   tác động trực tiếp lên 500 zombie đó được (không "kill" được zombie).</details>

2. Một script dò "orphan process nguy hiểm" chỉ coi process có `PPID == 1` là orphan cần cảnh
   báo. Script này có đáng tin cậy trên một hệ thống dùng systemd user session không? Vì sao?
   <details><summary>Đáp án</summary>Không đáng tin cậy hoàn toàn — như minh hoạ ở mục 4,
   orphan trên hệ thống như vậy thường được nhận nuôi bởi <code>systemd --user</code> (một
   PID khác, không phải 1), script sẽ bỏ lọt những trường hợp này.</details>

3. Sau khi restart process cha để dọn zombie, zombie lại xuất hiện đều đặn mỗi vài giờ. Đây là
   dấu hiệu gì, và restart có phải giải pháp đúng không?
   <details><summary>Đáp án</summary>Dấu hiệu lỗi code LẶP LẠI trong chính process cha (không
   gọi <code>wait()</code> cho con mới mỗi lần nó tạo ra) — không phải sự cố một lần. Restart
   chỉ xử lý TRIỆU CHỨNG (dọn zombie hiện có), không phải giải pháp đúng; phải sửa code gốc.
   </details>

4. Một zombie process có đang chiếm CPU không? Có đang chiếm RAM đáng kể không? Vậy tại sao nó
   vẫn là một vấn đề cần xử lý?
   <details><summary>Đáp án</summary>Không chiếm CPU (không chạy code gì), RAM chiếm gần như
   không đáng kể (chỉ một bản ghi tối thiểu trong kernel). Vấn đề là nó vẫn chiếm MỘT SLOT
   trong bảng process có giới hạn tổng số — tích tụ đủ nhiều sẽ làm hết slot, khiến
   <code>fork()</code> cho MỌI chương trình trên máy thất bại, bất kể CPU/RAM còn dư.</details>

5. Vì sao lọc zombie bằng điều kiện "process không phản hồi trong 5 phút" (cách làm của một số
   script giám sát cẩu thả) có thể gây báo động sai hoặc bỏ lọt thật?
   <details><summary>Đáp án</summary>"Không phản hồi" không phân biệt được <code>Z</code>
   (zombie — đã chết, luôn "không phản hồi" theo đúng nghĩa đó, nhưng vô hại về tải) với
   <code>D</code> (uninterruptible sleep — còn sống, có thể là vấn đề I/O nghiêm trọng cần xử
   lý khác hẳn). Cách lọc đúng phải dựa trực tiếp vào cột <code>STAT</code>, không đoán qua
   "có phản hồi hay không".</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.process-signals.lifecycle` — nền tảng fork/exec/wait, khái niệm zombie/orphan/
  subreaper mà bài này mở rộng sang góc nhìn chẩn đoán thực tế.
- `linux.process-signals.monitoring` — đọc cột `STAT` trong `ps`/`top` để phân biệt
  `Z`/`D`/`S`/`R`.
- `linux.process-signals.signals` — tín hiệu không có tác dụng với zombie (vì nó đã chết),
  khác với process còn sống cần tín hiệu để kết thúc.

**Nguồn tham khảo:**
- [wait(2) — man7.org](https://man7.org/linux/man-pages/man2/wait.2.html) — định nghĩa chính
  thức zombie, orphan, subreaper.
- [ps(1) — man7.org](https://man7.org/linux/man-pages/man1/ps.1.html) — cú pháp lọc theo
  `STAT`, các trường `ppid`/`stat`/`comm` dùng trong lệnh chẩn đoán ở mục 4.
