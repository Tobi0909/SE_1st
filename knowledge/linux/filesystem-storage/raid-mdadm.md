---
id: linux.filesystem-storage.raid-mdadm
title: "RAID phần mềm với mdadm: các mức RAID phổ biến, tạo và theo dõi"
domain: linux
module: linux.filesystem-storage
level: "chuyên sâu"
prerequisites: ["linux.filesystem-storage.partitioning"]
applies_to:
  - "mdadm (Linux software RAID) — chuẩn trên hầu hết distro"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man8/mdadm.8.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** tạo/thao tác RAID là hành động trên nhiều đĩa cùng lúc, rủi
> ro mất dữ liệu cao nếu nhầm thiết bị — máy viết bài này không cài `mdadm` (quyết định của
> chủ dự án: không cài thêm gói/dùng sudo cho module này). Cú pháp/output dưới đây trích trực
> tiếp từ man page chính thức (`mdadm(8)`), đánh dấu **output minh hoạ**.

## 1. Vì sao cần biết

RAID phần cứng (hardware RAID qua card điều khiển riêng) không phải lúc nào cũng có sẵn, đặc
biệt trên server giá rẻ hoặc máy ảo. `mdadm` cho phép làm RAID hoàn toàn bằng phần mềm ở tầng
kernel, không cần phần cứng đặc biệt — đánh đổi là CPU phải tự tính toán (đặc biệt RAID 5/6 cần
tính parity), nhưng với CPU hiện đại, chi phí này thường không đáng kể. Hiểu đúng các mức RAID
và cách theo dõi trạng thái là kỹ năng bắt buộc để đảm bảo RAID thực sự bảo vệ dữ liệu như kỳ
vọng — một RAID bị degraded (một đĩa hỏng) mà không ai phát hiện kịp thời thì KHÔNG còn khả
năng chịu lỗi nào nữa nếu đĩa thứ hai cũng hỏng.

## 2. Khái niệm cốt lõi

| Mức RAID | Số đĩa tối thiểu | Chịu lỗi | Dung lượng khả dụng | Đặc điểm |
|---|---|---|---|---|
| RAID 0 | 2 | KHÔNG (0 đĩa) | 100% (toàn bộ) | Chỉ tăng hiệu năng/dung lượng, KHÔNG phải RAID an toàn |
| RAID 1 | 2 | 1 đĩa | 50% (nhân đôi dữ liệu) | Mirror — đơn giản, phục hồi nhanh |
| RAID 5 | 3 | 1 đĩa | (N-1)/N | Dùng parity phân tán, cân bằng dung lượng/an toàn |
| RAID 6 | 4 | 2 đĩa | (N-2)/N | Như RAID 5 nhưng chịu được 2 đĩa hỏng cùng lúc |
| RAID 10 | 4 (xem ghi chú) | tuỳ cấu hình | 50% | Kết hợp mirror (RAID 1) + striping (RAID 0) |

> **Ghi chú về RAID 10 trong `mdadm`:** `4` đĩa là cấu hình RAID 10 cổ điển (nested, phổ biến
> nhất) và dễ hình dung nhất khi mới học. `mdadm --level=10` thực chất linh hoạt hơn RAID 10
> phần cứng truyền thống — hỗ trợ layout riêng (`near`/`far`/`offset`) cho phép tạo mảng với
> tối thiểu **2 đĩa**. Bài này trình bày theo mô hình 4 đĩa cổ điển vì đây là cách phổ biến
> nhất trong thực tế vận hành; nếu cần cấu hình khác, đọc kỹ phần `--layout=` trong `mdadm(8)`.

Lệnh cốt lõi:

```
mdadm --create <md-device> --level=<mức> --raid-devices=<số đĩa> <danh sách đĩa/partition>
```

## 3. Cách nó hoạt động

**RAID 0 THỰC RA KHÔNG PHẢI "RAID an toàn" dù tên gọi dễ gây hiểu lầm**: RAID 0 (striping,
không có dự phòng) chỉ tăng HIỆU NĂNG và GỘP DUNG LƯỢNG — mất BẤT KỲ đĩa nào trong mảng đều mất
TOÀN BỘ dữ liệu (dữ liệu bị "xé" rải đều qua tất cả đĩa, không có bản sao). Nhầm RAID 0 là một
hình thức bảo vệ dữ liệu là một trong những hiểu lầm nguy hiểm nhất với người mới — nó hoàn
toàn ngược lại, XÁC SUẤT MẤT DỮ LIỆU còn CAO HƠN một đĩa đơn lẻ (càng nhiều đĩa trong mảng,
càng nhiều điểm có thể hỏng để kéo sập toàn bộ).

**RAID 5/6 dùng PARITY (thông tin kiểm tra) thay vì nhân bản toàn bộ dữ liệu**: thay vì lưu 2
bản giống hệt (như RAID 1), RAID 5 tính một giá trị "parity" (thường qua phép XOR) từ dữ liệu
trên các đĩa còn lại, lưu rải đều (không dồn vào 1 đĩa cố định) qua tất cả đĩa trong mảng — khi
MỘT đĩa hỏng, dữ liệu trên đĩa đó được TÍNH LẠI từ dữ liệu + parity trên các đĩa còn sống. Đây
là lý do RAID 5/6 tiết kiệm dung lượng hơn RAID 1 (không cần nhân đôi toàn bộ) nhưng cần tính
toán (CPU) khi ghi dữ liệu mới (phải tính lại parity mỗi lần ghi) và khi rebuild sau khi thay
đĩa hỏng.

**Trạng thái "degraded" nghĩa là RAID đang chạy nhưng KHÔNG CÒN dự phòng**: khi một đĩa trong
RAID 1/5/6 hỏng, mảng KHÔNG dừng hoạt động ngay (đây chính là điểm mạnh của RAID) — nó chuyển
sang trạng thái "degraded", vẫn đọc/ghi được bình thường bằng cách tính toán từ các đĩa còn
lại. NHƯNG ở trạng thái này, mảng KHÔNG CÒN khả năng chịu thêm lỗi nào nữa (RAID 1 degraded =
đĩa cuối cùng, hỏng tiếp là mất hết; RAID 5 degraded = như RAID 0 về mặt an toàn cho tới khi
rebuild xong). Đây là lý do giám sát trạng thái RAID (không chỉ tạo xong rồi quên) là bắt buộc
— một RAID degraded không ai biết có thể tồn tại hàng tháng cho tới khi đĩa thứ hai hỏng và mất
sạch dữ liệu.

## 4. Thực hành (output minh hoạ theo tài liệu chính thức, CHƯA tự chạy thật trên máy)

Tạo RAID 1 (mirror) từ 2 partition:

```bash
$ mdadm --create /dev/md0 --level=1 --raid-devices=2 /dev/sda1 /dev/sdb1
mdadm: Note: this array has metadata at the start and
    may not be suitable as a boot device.
mdadm: array /dev/md0 started.
```

Xem trạng thái tổng quan từ kernel (cách nhanh nhất kiểm tra sức khoẻ mọi RAID trên máy):

```bash
$ cat /proc/mdstat
Personalities : [raid1]
md0 : active raid1 sdb1[1] sda1[0]
      10476544 blocks super 1.2 [2/2] [UU]
```

Đọc `[2/2] [UU]`: `2/2` nghĩa là 2 trên tổng 2 đĩa đang hoạt động bình thường, `UU` (mỗi `U` là
một đĩa "Up") xác nhận cả hai đĩa đều khoẻ — nếu một đĩa hỏng, sẽ thấy `[2/1]` hoặc `[1/2]` và
`U_`/`_U` (dấu gạch dưới thay cho đĩa bị down).

Xem chi tiết đầy đủ hơn qua `mdadm --detail`:

```bash
$ mdadm --detail /dev/md0
/dev/md0:
    Version : 1.2
  Raid Level : raid1
  Array Size : 10476544 (9.99 GiB 10.73 GB)
 Raid Devices : 2
Total Devices : 2
       State : clean
Active Devices : 2
Failed Devices : 0
```

Xử lý khi một đĩa hỏng — quy trình 3 bước (minh hoạ, giả sử `/dev/sda1` vừa báo lỗi phần
cứng):

```bash
$ mdadm --manage /dev/md0 --fail /dev/sda1      # đánh dấu hỏng (nếu kernel chưa tự phát hiện)
$ mdadm --manage /dev/md0 --remove /dev/sda1    # gỡ khỏi mảng
$ mdadm --manage /dev/md0 --add /dev/sdc1       # thêm đĩa thay thế, bắt đầu rebuild tự động
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Tạo RAID 0 cho dữ liệu quan trọng, nghĩ rằng "RAID = an toàn hơn 1 đĩa"**
- Nguyên nhân: hiểu sai bản chất RAID 0 (chỉ striping, không dự phòng) — xem giải thích ở
  mục 3.
- Cách xác nhận: `mdadm --detail` cho mảng đó hiện `Raid Level : raid0` — xác nhận đây là mảng
  không có khả năng chịu lỗi.
- Cách xử lý: với dữ liệu quan trọng, chuyển sang RAID 1/5/6/10 tuỳ số đĩa và yêu cầu hiệu
  năng/dung lượng; RAID 0 chỉ phù hợp cho dữ liệu có thể mất/tái tạo dễ dàng (ví dụ cache, dữ
  liệu tạm xử lý).

**RAID chạy degraded nhiều tuần mà không ai biết, cho tới khi đĩa thứ hai hỏng**
- Nguyên nhân: không có giám sát chủ động trạng thái RAID — chỉ phát hiện khi SỰ CỐ THỨ HAI
  xảy ra, lúc đó đã quá muộn.
- Cách xác nhận (sau sự cố): `mdadm --detail` hoặc log hệ thống cho thấy mảng đã ở trạng thái
  degraded từ lâu trước khi sự cố thứ hai xảy ra.
- Cách xử lý/phòng tránh: bắt buộc thiết lập giám sát chủ động — `mdadm` hỗ trợ chế độ
  `--monitor` tự gửi email/cảnh báo khi trạng thái mảng thay đổi; tối thiểu, thêm kiểm tra định
  kỳ `cat /proc/mdstat` vào hệ thống giám sát chung (Zabbix/Prometheus) thay vì chỉ "tạo xong
  rồi quên".

**Rebuild sau khi thay đĩa mất rất nhiều thời gian, hiệu năng hệ thống giảm rõ rệt trong lúc đó**
- Nguyên nhân: rebuild (tính lại toàn bộ dữ liệu/parity cho đĩa mới) là tác vụ I/O và CPU nặng,
  đặc biệt với RAID 5/6 trên đĩa dung lượng lớn — hành vi bình thường, không phải lỗi.
- Cách xác nhận: `cat /proc/mdstat` trong lúc rebuild hiện thêm dòng tiến độ (`recovery`,
  phần trăm hoàn thành, tốc độ ước tính).
- Cách xử lý: nếu cần giảm tác động tới hiệu năng production trong lúc rebuild, `mdadm` cho
  phép giới hạn tốc độ rebuild qua `/proc/sys/dev/raid/speed_limit_max`/`speed_limit_min` —
  đánh đổi rebuild chậm hơn để giảm tải I/O, cân nhắc tuỳ mức độ khẩn cấp (mảng đang degraded
  càng lâu càng rủi ro nếu có đĩa thứ hai hỏng, nên không phải lúc nào cũng nên giảm tốc độ).

## 6. Tình huống thực tế

Hệ thống giám sát (đã thiết lập theo đúng khuyến nghị ở mục 5) gửi cảnh báo "RAID array
degraded" cho server lưu trữ file chia sẻ nội bộ.

1. `cat /proc/mdstat` ngay lập tức — xác nhận `md0` đang ở `[2/1] [U_]`, một đĩa đã down.
2. `mdadm --detail /dev/md0` — xem chi tiết, xác định đúng `/dev/sdb1` là đĩa bị lỗi
   (`State : faulty`), kèm thời điểm lỗi được ghi nhận.
3. Kiểm tra log phần cứng (`dmesg`/`journalctl -k`) xem có lỗi I/O/SMART liên quan tới đĩa vật
   lý tương ứng không — xác nhận đây là lỗi phần cứng thật, không phải lỗi cấu hình tạm thời.
4. Vì RAID đang ở trạng thái degraded (không còn dự phòng), đây là ưu tiên XỬ LÝ NGAY, không
   chờ bảo trì định kỳ — mọi dữ liệu trên hệ thống này hiện chỉ còn 1 bản, một lỗi đĩa thứ hai
   sẽ mất dữ liệu hoàn toàn.
5. Thay đĩa vật lý (hoặc nếu đã có đĩa dự phòng hot-spare cấu hình sẵn, `mdadm` có thể đã tự
   động bắt đầu rebuild ngay khi phát hiện lỗi, không cần can thiệp tay bước `--add`).
6. Nếu thay tay: `mdadm --manage /dev/md0 --remove /dev/sdb1` rồi `--add /dev/sdc1` (đĩa mới),
   theo dõi tiến độ rebuild qua `/proc/mdstat` cho tới khi về lại `[2/2] [UU]`.
7. Ghi vào runbook: mọi RAID production PHẢI có giám sát chủ động trạng thái (không chỉ dựa vào
   việc ai đó tình cờ chạy `cat /proc/mdstat`), và quy trình thay đĩa hỏng phải được document
   sẵn (số lượng, vị trí vật lý đĩa dự phòng có sẵn tại datacenter) để không mất thời gian tìm
   hiểu giữa lúc đang degraded — thời gian càng kéo dài, rủi ro càng cao.

## 7. Tự kiểm tra

1. Một RAID 0 gồm 4 đĩa. Một đĩa trong số đó hỏng. Có thể khôi phục lại dữ liệu từ 3 đĩa còn
   lại không? Vì sao?
   <details><summary>Đáp án</summary>Không. RAID 0 không có dự phòng — dữ liệu bị "xé" (stripe)
   rải đều qua TẤT CẢ đĩa, mỗi đĩa chứa một phần không thể thiếu. Mất bất kỳ đĩa nào cũng mất
   toàn bộ dữ liệu của cả mảng, không chỉ phần trên đĩa đó.</details>

2. `/proc/mdstat` hiện `[4/3] [UUU_]` cho một mảng RAID 5. Mảng này có đang bảo vệ được dữ liệu
   khỏi MỘT lỗi đĩa tiếp theo không?
   <details><summary>Đáp án</summary>Không. Mảng đang ở trạng thái degraded (1 trên 4 đĩa đã
   down) — RAID 5 chỉ chịu được 1 đĩa hỏng, đã dùng hết "ngân sách" chịu lỗi đó. Thêm một đĩa
   hỏng nữa trong lúc này sẽ mất toàn bộ dữ liệu của mảng.</details>

3. Vì sao RAID 5/6 cần nhiều tính toán CPU hơn RAID 1 khi ghi dữ liệu mới?
   <details><summary>Đáp án</summary>RAID 1 chỉ cần ghi (copy) dữ liệu giống hệt sang đĩa thứ
   hai. RAID 5/6 phải TÍNH LẠI giá trị parity (thường qua XOR) dựa trên dữ liệu mới và dữ liệu
   hiện có trên các đĩa khác mỗi lần ghi — một bước tính toán bổ sung mà RAID 1 không cần.
   </details>

4. Một server có RAID đã chạy degraded 3 tuần mà không ai phát hiện. Nguyên nhân gốc (root
   cause) thật sự của rủi ro này là gì — bản thân việc đĩa hỏng, hay điều gì khác?
   <details><summary>Đáp án</summary>Nguyên nhân gốc là THIẾU GIÁM SÁT CHỦ ĐỘNG, không phải bản
   thân việc một đĩa hỏng (RAID được thiết kế để chịu được MỘT lỗi đĩa). Vấn đề thật là hệ
   thống không có cách nào tự động phát hiện và cảnh báo khi RAID chuyển sang degraded, khiến
   "cửa sổ rủi ro" (thời gian không còn dự phòng) kéo dài không cần thiết.</details>

5. Sau khi thay đĩa hỏng và `mdadm --add` đĩa mới, quá trình rebuild đang chạy. Trong lúc này,
   mảng có còn bảo vệ được khỏi một lỗi đĩa khác không?
   <details><summary>Đáp án</summary>Chưa — mảng vẫn ở trạng thái "recovering" (một dạng
   degraded), chỉ được coi là an toàn trở lại SAU KHI rebuild hoàn tất 100% và trạng thái về
   <code>clean</code>/<code>[U U]</code> đầy đủ. Một lỗi đĩa xảy ra TRONG lúc đang rebuild vẫn
   có thể gây mất dữ liệu tuỳ mức RAID.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.filesystem-storage.partitioning` — tạo partition dùng làm thành phần cho RAID.
- `linux.filesystem-storage.lvm-basics` — RAID và LVM thường kết hợp (LVM trên top của RAID,
  hoặc LVM RAID tích hợp sẵn — không phải trọng tâm bài này).

**Bài liên quan ngoài module:**
- `virt-storage.backup-dr.strategies` — RAID bảo vệ khỏi lỗi ĐĨA, KHÔNG thay thế backup (không
  bảo vệ khỏi lỗi người dùng, ransomware, hay mất cả server).

**Nguồn tham khảo:**
- [mdadm(8) — man7.org](https://man7.org/linux/man-pages/man8/mdadm.8.html) — cú pháp tạo, quản
  lý, và xử lý sự cố RAID phần mềm.
