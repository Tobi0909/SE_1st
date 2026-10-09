---
id: linux.filesystem-storage.lvm-advanced
title: "LVM nâng cao: resize, snapshot, thin provisioning"
domain: linux
module: linux.filesystem-storage
level: "chuyên sâu"
prerequisites: ["linux.filesystem-storage.lvm-basics"]
applies_to:
  - "LVM2 — snapshot/thin provisioning là tính năng chuẩn của lvm2, không cần cài thêm gói"
status: verified
sources:
  - "https://man7.org/linux/man-pages/man8/lvextend.8.html"
  - "https://man7.org/linux/man-pages/man8/lvcreate.8.html"
last_verified: "2026-10-05"
author: "Claude Sonnet 5 (draft, chờ người duyệt)"
---

> **Lưu ý về cách viết bài này:** cùng lý do với hai bài trước trong module — không có môi
> trường an toàn để tự chạy LVM thật trên máy viết bài. Cú pháp/ví dụ dưới đây trích TRỰC TIẾP
> từ man page chính thức (`lvextend(8)`, `lvcreate(8)`), đánh dấu **output minh hoạ**.

## 1. Vì sao cần biết

Bài `lvm-basics` đã giới thiệu mở rộng LV cơ bản. Ba kỹ thuật nâng cao ở bài này giải quyết các
nhu cầu vận hành thường gặp hơn: **shrink** (thu nhỏ, rủi ro cao hơn mở rộng rất nhiều),
**snapshot** (chụp nhanh trạng thái để backup/rollback mà không cần dừng dịch vụ), và **thin
provisioning** (cấp phát "ảo" nhiều hơn dung lượng vật lý thật có — tiết kiệm nhưng cần giám
sát chặt để tránh hết dung lượng thật một cách bất ngờ).

## 2. Khái niệm cốt lõi

| Kỹ thuật | Lệnh chính | Rủi ro |
|---|---|---|
| Resize (mở rộng) | `lvextend -L +<size> -r` | Thấp — hầu hết filesystem hỗ trợ online |
| Resize (thu nhỏ) | `lvreduce`/`lvresize -L -<size> -r` | CAO — phải shrink filesystem TRƯỚC khi shrink LV, sai thứ tự mất dữ liệu |
| Snapshot | `lvcreate -s -L <size> -n <tên-snap> <LV-gốc>` | Trung bình — snapshot đầy (hết không gian COW) sẽ tự invalidate |
| Thin provisioning | `lvcreate -T -V <size-ảo> <thinpool>` | Cao nếu không giám sát — cấp phát vượt dung lượng thật (overcommit) |

## 3. Cách nó hoạt động

**Shrink NGƯỢC THỨ TỰ với extend — đây là lỗi gây mất dữ liệu phổ biến nhất liên quan LVM**:
khi MỞ RỘNG, thứ tự đúng là mở rộng LV trước, resize filesystem sau (filesystem "phát hiện" có
thêm không gian). Khi THU NHỎ, thứ tự PHẢI NGƯỢC LẠI: resize (shrink) filesystem TRƯỚC để nó tự
dồn dữ liệu vào phần sẽ được giữ lại, RỒI MỚI thu nhỏ LV. Nếu thu nhỏ LV trước khi filesystem
kịp co lại, phần dữ liệu nằm ở cuối LV (giờ đã bị cắt bỏ) sẽ mất ngay lập tức, không thể phục
hồi dễ dàng. Vì rủi ro này, nhiều tài liệu khuyến nghị: nếu không chắc chắn, backup đầy đủ
trước khi shrink, và cân nhắc dùng `-r` cẩn thận (một số công cụ quản lý cả hai bước đúng thứ
tự tự động, nhưng không phải lúc nào cũng an toàn tuyệt đối với mọi loại filesystem — XFS, ví
dụ, hoàn toàn KHÔNG hỗ trợ shrink, chỉ hỗ trợ extend).

**Snapshot là Copy-On-Write (COW), không phải bản sao đầy đủ ngay lập tức**: khi tạo snapshot,
LVM không copy toàn bộ dữ liệu — nó chỉ cấp một vùng không gian trống (`--size` chỉ định) để
LƯU CÁC BLOCK GỐC trước khi chúng bị GHI ĐÈ trên LV gốc sau thời điểm tạo snapshot. Nếu LV gốc
thay đổi NHIỀU sau khi snapshot được tạo (nhiều block gốc cần lưu lại), vùng COW có thể bị ĐẦY
trước khi admin xoá snapshot — khi đó snapshot tự động "invalidate" (mất tác dụng, không dùng
được để rollback nữa), nhưng LV GỐC vẫn hoạt động bình thường không bị ảnh hưởng. Theo đúng
`lvcreate(8)`, `-l 20%ORIGIN` là một cách tính kích thước snapshot phổ biến — dành 20% kích
thước LV gốc cho vùng COW, tuỳ mức độ thay đổi dữ liệu dự kiến trong thời gian snapshot tồn
tại.

**Thin provisioning tách biệt "dung lượng ảo được CẤP" khỏi "dung lượng thật ĐƯỢC DÙNG"**:
một thin pool có dung lượng VẬT LÝ thật cố định, nhưng các thin LV tạo từ nó có thể khai báo
kích thước ẢO lớn hơn NHIỀU so với tổng dung lượng vật lý của pool (ví dụ tạo 5 thin LV, mỗi
cái "ảo" 1TB, trên một pool chỉ có 2TB thật) — đây gọi là OVERCOMMIT, hoạt động dựa trên giả
định không phải mọi LV đều dùng hết dung lượng ảo được cấp cùng lúc. Lợi ích: linh hoạt cấp
phát mà không cần biết trước chính xác nhu cầu từng LV. Rủi ro: nếu TỔNG dữ liệu THẬT trên tất
cả thin LV vượt quá dung lượng vật lý của pool, pool hết dung lượng dù từng LV riêng lẻ "còn
chỗ" theo kích thước ảo — bắt buộc phải giám sát % dùng thật của pool (`lvs` hiện cột
`Data%`), không chỉ nhìn kích thước ảo từng LV.

## 4. Thực hành (output minh hoạ theo tài liệu chính thức, CHƯA tự chạy thật trên máy)

Mở rộng LV và resize filesystem trong MỘT lệnh (đúng thứ tự an toàn — mở rộng):

```bash
$ lvextend -l +100%FREE -r vg01/lvol01
  Size of logical volume vg01/lvol01 changed from 500.00 GiB to 1.00 TiB.
  Filesystem ext4 ... resized to 1.00 TiB.
```

Tạo snapshot của một LV đang hoạt động (không cần unmount, dùng để backup nhất quán tại một
thời điểm, hoặc làm điểm rollback trước khi thử một thay đổi rủi ro):

```bash
$ lvcreate --snapshot --size 100m --name mysnap vg00/mylv
  Logical volume "mysnap" created.
```

Theo dõi mức sử dụng vùng COW của snapshot (quan trọng — snapshot đầy sẽ tự invalidate như
giải thích ở mục 3):

```bash
$ lvs vg00/mysnap
  LV      VG    Attr       LSize   Pool Origin Data%
  mysnap  vg00  swi-a-s--- 100.00m      mylv   63.50
```

`Data%` = `63.50` nghĩa là vùng COW đã dùng hết 63.5% — cần theo dõi, xoá snapshot kịp thời
(sau khi backup xong, hoặc sau khi xác nhận không cần rollback nữa) trước khi đầy.

Tạo thin pool và thin LV (output minh hoạ theo đúng ví dụ trong `lvcreate(8)`):

```bash
$ lvcreate -T -L 2T -n tpool0 vg00          # tạo thin pool 2TB dung lượng THẬT
  Thin pool volume "vg00/tpool0" created.
$ lvcreate -T vg00/tpool0 -V 1T -n mythin   # tạo thin LV TỪ pool đã có, -V là kích thước ẢO
  Logical volume "mythin" created.
```

LV `mythin` "ảo" `1T` nhưng pool `tpool0` chỉ có `2T` thật — có thể tạo thêm nhiều thin LV
khác tương tự miễn TỔNG DỮ LIỆU THẬT ghi vào chúng không vượt quá `2T` của pool.

## 5. Lỗi thường gặp và cách chẩn đoán

**Shrink LV trước khi shrink filesystem, mất dữ liệu ở phần cuối LV**
- Nguyên nhân: làm ngược thứ tự bắt buộc đã nêu ở mục 3 — filesystem chưa kịp dồn dữ liệu vào
  phần sẽ được giữ lại thì LV (và không gian đĩa thật đằng sau nó) đã bị cắt bớt.
- Cách xác nhận: sau khi shrink sai thứ tự, `fsck` trên filesystem đó báo lỗi nghiêm trọng
  (corrupt), hoặc mount báo lỗi không đọc được.
- Cách xử lý: khôi phục từ backup — đây là lỗi KHÓ cứu được sau khi đã xảy ra, phòng tránh quan
  trọng hơn xử lý hậu quả: luôn `resize2fs <size-nhỏ-hơn>` TRƯỚC, xác nhận thành công, rồi mới
  `lvreduce`.

**Snapshot "biến mất" (invalidate) giữa chừng khi đang cần rollback**
- Nguyên nhân: vùng COW đã đầy (LV gốc thay đổi nhiều hơn dự tính so với `--size` đã cấp cho
  snapshot) — đúng hành vi thiết kế, không phải bug, nhưng snapshot không còn dùng để rollback
  được nữa.
- Cách xác nhận: `lvs` cho LV snapshot đó hiện `Attr` có cờ cảnh báo invalid, hoặc lệnh không
  còn liệt kê được snapshot đó bình thường.
- Cách xử lý: tạo lại snapshot với `--size` lớn hơn (ước lượng dựa trên tốc độ thay đổi dữ liệu
  thực tế của LV gốc trong khoảng thời gian cần giữ snapshot), hoặc rút ngắn thời gian giữ
  snapshot nếu không thể cấp thêm không gian.

**Thin pool hết dung lượng THẬT dù từng thin LV "còn chỗ" theo kích thước ảo**
- Nguyên nhân: tổng dữ liệu thật ghi vào tất cả thin LV trong pool đã vượt dung lượng vật lý —
  hệ quả trực tiếp của overcommit nếu không giám sát `Data%` của pool.
- Cách xác nhận: `lvs` trên chính thin POOL (không phải từng thin LV) cho thấy `Data%` gần
  100%.
- Cách xử lý khẩn cấp: mở rộng pool (`lvextend` trên pool nếu VG còn dư địa vật lý) hoặc xoá
  bớt dữ liệu trên các thin LV; lâu dài: thiết lập cảnh báo giám sát riêng cho `Data%` của thin
  pool (khác với giám sát dung lượng từng LV/filesystem thông thường), vì đây là điểm nghẽn
  thật sự dễ bị bỏ sót.

## 6. Tình huống thực tế

Trước khi chạy một migration schema lớn và rủi ro trên database production, team quyết định
tạo snapshot LVM của LV chứa data directory để có thể rollback nhanh nếu migration thất bại
giữa chừng (nhanh hơn restore từ backup thông thường).

1. Ước lượng kích thước snapshot: migration dự kiến ghi/sửa khoảng 15% dữ liệu trong quá trình
   chạy — chọn `--size 25%ORIGIN` của LV gốc để có biên an toàn, tránh snapshot đầy giữa chừng
   migration.
2. Dừng ghi tạm thời vào database (hoặc dùng cơ chế quiesce phù hợp với DB engine) trong
   khoảng thời gian ngắn để đảm bảo snapshot ở trạng thái NHẤT QUÁN (consistent), rồi
   `lvcreate --snapshot --size 25%ORIGIN --name pre_migration_snap vg_db/lv_pgdata`.
3. Tiếp tục database bình thường, chạy migration.
4. Theo dõi `lvs vg_db/pre_migration_snap` định kỳ trong lúc migration chạy — `Data%` tăng dần
   theo đúng dự đoán, không vượt ngưỡng nguy hiểm.
5. Migration thất bại giữa chừng (giả định) — quyết định rollback: dừng database, dùng
   `lvconvert --merge vg_db/pre_migration_snap` để gộp ngược snapshot vào LV gốc (khôi phục
   đúng trạng thái tại thời điểm chụp), khởi động lại database.
6. Nếu migration THÀNH CÔNG thay vào đó: xoá snapshot ngay (`lvremove vg_db/pre_migration_snap`)
   để giải phóng không gian COW, không để tồn đọng không cần thiết — snapshot không phải backup
   dài hạn, chỉ nên tồn tại trong thời gian ngắn cần thiết cho mục đích rollback tức thời.
7. Ghi vào runbook: snapshot LVM trước migration rủi ro là kỹ thuật tốt cho rollback NHANH
   (giây/phút), nhưng KHÔNG thay thế backup thật (nếu toàn bộ VG/đĩa vật lý gặp sự cố, snapshot
   cùng nằm trên đó cũng mất theo) — vẫn cần backup off-host định kỳ song song.

## 7. Tự kiểm tra

1. Bạn cần thu nhỏ một LV chứa filesystem ext4 từ 500GB xuống 300GB. Thứ tự lệnh ĐÚNG là gì?
   <details><summary>Đáp án</summary>Trước tiên <code>resize2fs</code> (hoặc
   <code>lvreduce -r</code> nếu công cụ hỗ trợ tự làm đúng thứ tự) để THU NHỎ FILESYSTEM xuống
   còn khoảng 300GB (hoặc nhỏ hơn một chút để an toàn) TRƯỚC, xác nhận thành công, SAU ĐÓ mới
   <code>lvreduce</code> để thu nhỏ LV. Làm ngược lại (thu nhỏ LV trước) sẽ cắt mất dữ liệu ở
   cuối LV trước khi filesystem kịp dồn dữ liệu.</details>

2. Một LV dùng filesystem XFS. Có thể shrink LV đó an toàn bằng cách `xfs_growfs` theo chiều
   ngược không?
   <details><summary>Đáp án</summary>Không. XFS không hỗ trợ shrink filesystem dưới bất kỳ hình
   thức nào (<code>xfs_growfs</code> chỉ mở rộng, không có thao tác ngược) — muốn "thu nhỏ" một
   LV chứa XFS, cách duy nhất an toàn là tạo LV mới nhỏ hơn, copy dữ liệu sang, rồi xoá LV
   cũ.</details>

3. Một snapshot được tạo với `--size 50m` nhưng LV gốc thay đổi rất nhiều trong thời gian giữ
   snapshot (vượt xa 50MB dữ liệu gốc bị ghi đè). Điều gì xảy ra với snapshot, và LV GỐC có bị
   ảnh hưởng không?
   <details><summary>Đáp án</summary>Snapshot tự "invalidate" khi vùng COW đầy — không còn dùng
   được để rollback. LV GỐC hoàn toàn không bị ảnh hưởng, vẫn hoạt động bình thường — chỉ chức
   năng rollback của snapshot bị mất.</details>

4. Một thin pool có dung lượng vật lý 2TB, đã tạo 5 thin LV mỗi cái khai báo kích thước ảo 1TB
   (tổng ảo 5TB). Điều này có hợp lệ không? Rủi ro chính cần giám sát là gì?
   <details><summary>Đáp án</summary>Hợp lệ — đây chính là overcommit, một tính năng thiết kế
   của thin provisioning, không phải lỗi. Rủi ro cần giám sát: TỔNG DỮ LIỆU THẬT ghi vào cả 5
   LV cộng lại không được vượt quá 2TB dung lượng vật lý của pool — phải theo dõi
   <code>Data%</code> của chính POOL (không phải từng LV riêng lẻ) để tránh hết dung lượng thật
   bất ngờ.</details>

5. Vì sao snapshot LVM trước một migration rủi ro KHÔNG thể thay thế hoàn toàn cho backup định
   kỳ off-host?
   <details><summary>Đáp án</summary>Snapshot nằm CÙNG VG/đĩa vật lý với LV gốc — nếu toàn bộ
   đĩa/VG gặp sự cố phần cứng (hỏng đĩa, mất server), cả LV gốc lẫn snapshot đều mất cùng lúc.
   Backup off-host (nằm trên hạ tầng/vị trí vật lý khác) mới bảo vệ được khỏi loại sự cố
   này.</details>

## 8. Bài liên quan và nguồn tham khảo

**Bài liên quan trong module này:**
- `linux.filesystem-storage.lvm-basics` — nền tảng PV/VG/LV mà bài này mở rộng.

**Bài liên quan ngoài module:**
- `virt-storage.backup-dr.strategies` — chiến lược backup tổng quát (domain Ảo hóa và lưu
  trữ), snapshot LVM là MỘT công cụ hỗ trợ, không thay thế chiến lược backup đầy đủ.

**Nguồn tham khảo:**
- [lvextend(8) — man7.org](https://man7.org/linux/man-pages/man8/lvextend.8.html) — cú pháp mở
  rộng LV, cờ `-r`/`--resizefs`.
- [lvcreate(8) — man7.org](https://man7.org/linux/man-pages/man8/lvcreate.8.html) — cú pháp
  snapshot (`-s`/`--snapshot`) và thin provisioning (`-T`/`--thin`).
