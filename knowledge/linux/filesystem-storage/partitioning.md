---
id: linux.filesystem-storage.partitioning
title: "Phân vùng đĩa: fdisk/parted, GPT vs MBR"
domain: linux
module: linux.filesystem-storage
level: "vận hành"
prerequisites: ["linux.filesystem-storage.fhs-permissions"]
applies_to:
  - "util-linux fdisk (đi kèm hầu hết distro), GNU parted"
status: draft
sources:
  - "https://man7.org/linux/man-pages/man8/fdisk.8.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** thao tác phân vùng đĩa là HÀNH ĐỘNG PHÁ HUỶ DỮ LIỆU nếu chạy
> nhầm đĩa — không có môi trường test an toàn trong lúc viết bài này để chạy thật trên một đĩa
> thật (chủ dự án đã quyết định: không cài thêm công cụ/dùng sudo trên máy thật cho module
> này). Toàn bộ lệnh và output dưới đây lấy cú pháp đúng từ tài liệu chính thức
> (`fdisk(8)` trên man7.org), đánh dấu **output minh hoạ** — PHẢI tự kiểm chứng trên một máy
> test/VM trước khi áp dụng, không chạy theo bài này trên server production mà chưa hiểu rõ
> từng bước.

## 1. Vì sao cần biết

Thêm một đĩa mới vào server, mở rộng dung lượng, hay chuẩn bị đĩa cho LVM/RAID — mọi việc đều
bắt đầu từ việc tạo PHÂN VÙNG (partition) đúng cách. Một lựa chọn sai ở bước này (chọn nhầm GPT/
MBR, tính sai dung lượng, ghi `w` nhầm đĩa) có thể xoá sạch dữ liệu đang có trên đĩa — đây là
một trong số ít thao tác Linux hằng ngày có thể gây hậu quả không thể phục hồi ngay lập tức,
nên hiểu đúng TRƯỚC khi gõ lệnh quan trọng hơn hầu hết chủ đề khác trong module này.

## 2. Khái niệm cốt lõi

Hai công cụ phổ biến nhất, hai cách tiếp cận khác nhau:

| Công cụ | Kiểu dùng | Hỗ trợ |
|---|---|---|
| `fdisk` | Dialog tương tác (gõ lệnh 1 ký tự: `n`, `p`, `d`, `w`...) | GPT, MBR, Sun, SGI, BSD |
| `parted` | Cả tương tác và non-interactive (dùng trong script) | GPT, MBR |

Hai kiểu bảng phân vùng:

- **MBR (Master Boot Record)**: kiểu cũ, 512 byte đầu đĩa, tối đa 4 partition chính (hoặc 3
  chính + 1 extended chứa nhiều partition logic bên trong), giới hạn dung lượng đĩa 2TiB.
- **GPT (GUID Partition Table)**: kiểu mới, hỗ trợ đĩa > 2TiB, tối đa 128 partition (không cần
  "extended partition" như MBR), mỗi partition có GUID riêng. Theo đúng tài liệu `fdisk(8)`:
  "GPT is always a better choice than MBR, especially on modern hardware with a UEFI boot
  loader" — chỉ nên chọn MBR khi cần tương thích với hệ thống/bootloader cũ không hỗ trợ GPT.

## 3. Cách nó hoạt động

**Tạo partition trong `fdisk` CHƯA ghi gì xuống đĩa cho tới khi gõ `w`**: toàn bộ thao tác
trong session `fdisk` (thêm, xoá, đổi type partition) chỉ sửa một bản "dự thảo" trong bộ nhớ.
Gõ `q` (quit) bất kỳ lúc nào trước `w` sẽ HUỶ TOÀN BỘ thay đổi, đĩa giữ nguyên như trước khi mở
`fdisk` — đây là lưới an toàn quan trọng nhất: nếu không chắc, luôn `q` thay vì `w`.

**Xoá một partition khác với xoá DỮ LIỆU trong đó**: `fdisk`/`parted` chỉ sửa BẢNG PHÂN VÙNG
(thông tin "partition này bắt đầu ở sector nào, kết thúc ở sector nào") — dữ liệu thật trong
vùng đó vẫn còn trên đĩa cho tới khi bị GHI ĐÈ bởi dữ liệu mới. Đây là lý do công cụ phục hồi
dữ liệu đôi khi cứu được dữ liệu sau khi xoá nhầm partition (miễn chưa ghi gì mới lên vùng đó)
— nhưng KHÔNG nên trông chờ vào điều này, luôn backup trước khi thao tác phân vùng thật.

**Kernel cần được báo "bảng phân vùng vừa đổi" trước khi dùng được partition mới**: sau khi
`w` trong `fdisk`, nếu đĩa đang BẬN (có partition khác trên cùng đĩa đang mount), kernel có thể
chưa tự nhận ra bảng phân vùng mới ngay — cần `partprobe` (từ gói `parted`) hoặc đôi khi phải
reboot để kernel đọc lại bảng phân vùng, tuỳ việc đĩa đó có đang được dùng hay không.

## 4. Thực hành (output minh hoạ theo tài liệu chính thức, CHƯA tự chạy thật trên máy)

Liệt kê bảng phân vùng hiện có (lệnh này AN TOÀN, chỉ đọc, không đổi gì — khác các lệnh sau):

```bash
$ fdisk -l /dev/sdb
Disk /dev/sdb: 20 GiB, 21474836480 bytes, 41943040 sectors
Disklabel type: gpt
```

Vào chế độ tương tác để tạo một partition mới (ví dụ trên đĩa trống `/dev/sdb`) — **output
minh hoạ**, trình tự lệnh đúng theo tài liệu `fdisk(8)`:

```
$ fdisk /dev/sdb

Command (m for help): n          # tạo partition mới
Partition number (1-128, default 1): 1
First sector: [Enter để lấy mặc định]
Last sector, +/-sectors or +/-size{K,M,G,T,P}: +10G

Created a new partition 1 of type 'Linux filesystem' and of size 10 GiB.

Command (m for help): p          # xem lại bảng phân vùng TRƯỚC khi ghi
Command (m for help): w          # GHI THẬT xuống đĩa — không thể hoàn tác dễ dàng sau bước này
```

Lưu ý quan trọng (không phải một phần output, mà là điểm người viết bài nhấn mạnh): giữa `n`
và `w` LUÔN dùng `p` để xem lại toàn bộ bảng phân vùng một lần nữa — đây là cơ hội cuối để phát
hiện nhầm đĩa/nhầm kích thước trước khi hành động không thể hoàn tác dễ dàng.

Sau khi tạo partition, báo cho kernel biết (nếu cần) và tạo filesystem trên đó (hai bước riêng
— `fdisk` không tự tạo filesystem):

```bash
$ partprobe /dev/sdb
$ mkfs.ext4 /dev/sdb1
```

## 5. Lỗi thường gặp và cách chẩn đoán

**Chạy `fdisk /dev/sdX` nhầm đĩa đang chứa dữ liệu quan trọng, phát hiện SAU khi đã `w`**
- Nguyên nhân: không kiểm tra kỹ `fdisk -l` (hoặc `lsblk`) để xác nhận ĐÚNG tên thiết bị trước
  khi vào chế độ sửa — đặc biệt nguy hiểm trên server nhiều đĩa, tên `/dev/sdX` có thể đổi thứ
  tự giữa các lần boot.
- Cách xác nhận hậu quả: nếu đã `w`, bảng phân vùng cũ đã mất — cách duy nhất là phục hồi từ
  backup, hoặc thử công cụ phục hồi phân vùng (ví dụ `testdisk`) với hy vọng dữ liệu chưa bị
  ghi đè.
- Cách phòng tránh: LUÔN chạy `lsblk -f` hoặc `fdisk -l` trước, đối chiếu kích thước/UUID/
  filesystem label đã biết để xác nhận ĐÚNG đĩa, trước khi gõ bất kỳ lệnh sửa nào.

**Tạo partition mới xong, `mkfs`/`mount` báo không tìm thấy `/dev/sdb1`**
- Nguyên nhân: kernel chưa đọc lại bảng phân vùng mới (thường do đĩa đang bận ở partition
  khác) — thiếu bước `partprobe`.
- Cách xác nhận: `lsblk /dev/sdb` không thấy partition con mới dù `fdisk -l` đã hiện đúng.
- Cách xử lý: chạy `partprobe /dev/sdb` (hoặc `partx -a /dev/sdb`); nếu vẫn không được, cần
  reboot để kernel chắc chắn đọc lại.

**Chọn MBR cho một đĩa lớn hơn 2TiB, sau đó không tạo được phân vùng dùng hết dung lượng**
- Nguyên nhân: MBR có giới hạn cứng 2TiB cho mỗi partition (và cho tổng dung lượng đĩa dùng
  được theo kiểu địa chỉ 32-bit sector truyền thống) — phần vượt quá không thể dùng được với
  bảng MBR.
- Cách xác nhận: `fdisk -l` cho thấy dung lượng đĩa thật lớn hơn nhiều so với tổng các partition
  có thể tạo.
- Cách xử lý: chuyển sang GPT (`fdisk` hỗ trợ chuyển đổi, hoặc tạo lại bảng phân vùng mới hoàn
  toàn bằng GPT) — cần backup trước vì đổi kiểu bảng phân vùng thường yêu cầu xoá bảng cũ.

## 6. Tình huống thực tế

Một SE cần thêm dung lượng cho server đang chạy nhiều VM, vừa gắn thêm một đĩa NVMe 4TB mới.
Server đã có sẵn 2 đĩa khác (`/dev/sda` chứa OS, `/dev/sdb` chứa data cũ).

1. Trước khi làm bất cứ điều gì: `lsblk -f` để xem toàn cảnh — xác nhận đĩa mới xuất hiện với
   tên `/dev/sdc` (hoặc tên NVMe dạng `/dev/nvme1n1` tuỳ loại thiết bị), kích thước đúng 4TB,
   KHÔNG có filesystem nào (cột FSTYPE trống) — xác nhận đây đúng là đĩa mới, trống, chưa từng
   dùng.
2. Vì đĩa 4TB vượt xa giới hạn 2TiB của MBR, quyết định dùng GPT ngay từ đầu — tránh phải làm
   lại sau này.
3. `fdisk /dev/sdc` (hoặc dùng `parted` nếu quen làm non-interactive trong script để dễ lặp lại
   cho nhiều server tương tự) — tạo một partition chiếm toàn bộ đĩa, dùng loại "Linux
   filesystem".
4. Trước khi `w`, dùng lệnh `p` xem lại — đối chiếu kích thước hiển thị (~4TB) đúng với kích
   thước đĩa mới đã xác nhận ở bước 1, KHÔNG phải kích thước của `/dev/sda`/`/dev/sdb` đã có
   dữ liệu.
5. `w` để ghi, `partprobe /dev/sdc`, rồi `mkfs.ext4 /dev/sdc1` (hoặc chọn filesystem khác tuỳ
   nhu cầu — ví dụ XFS nếu cần hiệu năng tốt hơn cho file lớn).
6. Thêm dòng mount vào `/etc/fstab` theo UUID (không theo `/dev/sdc1` — tên thiết bị có thể đổi
   giữa các lần boot), test `mount -a` trước khi reboot để chắc chắn không có lỗi cấu hình.
7. Ghi vào runbook: với MỌI thao tác phân vùng trên server có nhiều đĩa, bước đầu tiên BẮT
   BUỘC là `lsblk -f` đối chiếu kích thước/FSTYPE để xác nhận đúng đĩa — không bao giờ tin vào
   trí nhớ "chắc là `/dev/sdX` này".

## 7. Tự kiểm tra

1. Trong một session `fdisk`, bạn đã gõ `n` để tạo partition mới nhưng CHƯA gõ `w`. Gõ `q` lúc
   này có ảnh hưởng gì tới đĩa thật không?
   <details><summary>Đáp án</summary>Không ảnh hưởng gì — mọi thay đổi trong session
   <code>fdisk</code> chỉ là "dự thảo" trong bộ nhớ cho tới khi gõ <code>w</code>.
   <code>q</code> huỷ toàn bộ dự thảo, đĩa giữ nguyên như trước khi mở <code>fdisk</code>.
   </details>

2. Một đĩa 6TB cần dùng hết dung lượng cho một partition duy nhất. Nên chọn MBR hay GPT? Vì
   sao?
   <details><summary>Đáp án</summary>GPT — MBR có giới hạn cứng 2TiB cho partition/dung lượng
   đĩa dùng được theo kiểu địa chỉ sector truyền thống, không thể dùng hết 6TB nếu chọn
   MBR.</details>

3. Sau khi tạo partition mới và `w` thành công, `lsblk` không thấy partition con mới xuất
   hiện. Lệnh nào nên thử trước khi nghĩ tới việc reboot?
   <details><summary>Đáp án</summary><code>partprobe &lt;tên đĩa&gt;</code> (hoặc
   <code>partx -a &lt;tên đĩa&gt;</code>) — báo cho kernel đọc lại bảng phân vùng, thường giải
   quyết được mà không cần reboot.</details>

4. Bạn vừa `w` xong và phát hiện mình vừa xoá nhầm partition chứa dữ liệu quan trọng trên
   `/dev/sdb` (nhầm với `/dev/sdc`, đĩa đáng lẽ cần xoá). Dữ liệu còn khả năng cứu được không?
   Dựa vào đâu?
   <details><summary>Đáp án</summary>Có khả năng (không chắc chắn) — xoá partition chỉ sửa
   BẢNG PHÂN VÙNG, không trực tiếp xoá dữ liệu thật trên đĩa. Nếu chưa có gì ghi đè lên vùng đó
   sau khi xoá, công cụ phục hồi (ví dụ <code>testdisk</code>) có thể tái tạo lại bảng phân
   vùng/dữ liệu. Không nên trông chờ vào điều này — luôn xác nhận đúng đĩa TRƯỚC khi thao
   tác.</details>

5. Vì sao nên dùng `lsblk -f` (xem FSTYPE, label) thay vì chỉ dựa vào tên `/dev/sdX` để xác
   nhận đúng đĩa cần thao tác trên server nhiều đĩa?
   <details><summary>Đáp án</summary>Tên <code>/dev/sdX</code> có thể đổi thứ tự giữa các lần
   boot (phụ thuộc thứ tự kernel phát hiện thiết bị, đặc biệt với đĩa gắn ngoài/hot-plug) —
   không đáng tin cậy để nhận diện đĩa một cách chắc chắn. FSTYPE/label/UUID gắn với chính
   dữ liệu trên đĩa, không đổi theo thứ tự phát hiện, nên đáng tin cậy hơn để xác nhận "đây
   đúng là đĩa tôi nghĩ".</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.filesystem-storage.lvm-basics` — bước tiếp theo sau khi có partition, dùng nó làm
  Physical Volume cho LVM.
- `linux.filesystem-storage.raid-mdadm` — dùng nhiều partition/đĩa để tạo RAID phần mềm.

**Nguồn tham khảo:**
- [fdisk(8) — man7.org](https://man7.org/linux/man-pages/man8/fdisk.8.html) — cú pháp lệnh
  tương tác, xác nhận GPT/MBR và khuyến nghị dùng GPT trên phần cứng hiện đại.
