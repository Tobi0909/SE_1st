# Tiến độ kho tri thức SE Dojo

> Đọc file này đầu mỗi phiên làm việc để biết tiếp tục đúng chỗ. Cập nhật mỗi khi hoàn thành
> một module (xem quy trình ở CLAUDE.md task spec "Xây dựng kho tri thức cho SE Dojo").

## Trạng thái tổng quan

- Giai đoạn 0 (taxonomy): **xong, đã được chủ dự án duyệt** — `knowledge/_taxonomy.yaml`
  (9 domain, 56 module, 146 bài).
- Tổng số bài đã viết: **10 / 146** (`draft`, chưa `verified`).
- Tổng số `TODO-VERIFY` còn tồn đọng trong toàn kho: **0** (kiểm tra bằng `pnpm kb:lint`).
- `pnpm kb:lint`: **pass**, không lỗi.
- Chủ dự án đã duyệt văn phong/độ sâu của module đầu tiên ("cứ tiếp tục xây dựng tiếp đi") —
  từ nay tự làm tiếp từng module theo đúng khuôn mẫu, chỉ dừng khi gặp vấn đề cần quyết định.

## Module đã hoàn thành (viết + tự review bằng subagent + lint pass)

### 1. `linux.boot-systemd` — Boot và systemd (5/5 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `linux.boot-systemd.boot-process` | `knowledge/linux/boot-systemd/boot-process.md` | draft |
| `linux.boot-systemd.units` | `knowledge/linux/boot-systemd/units.md` | draft |
| `linux.boot-systemd.service-mgmt` | `knowledge/linux/boot-systemd/service-mgmt.md` | draft |
| `linux.boot-systemd.timers` | `knowledge/linux/boot-systemd/timers.md` | draft |
| `linux.boot-systemd.advanced` | `knowledge/linux/boot-systemd/advanced.md` | draft |

### 2. `linux.process-signals` — Process và tín hiệu (5/5 bài)

| Lesson id | File | Trạng thái |
|---|---|---|
| `linux.process-signals.lifecycle` | `knowledge/linux/process-signals/lifecycle.md` | draft |
| `linux.process-signals.signals` | `knowledge/linux/process-signals/signals.md` | draft |
| `linux.process-signals.job-control` | `knowledge/linux/process-signals/job-control.md` | draft |
| `linux.process-signals.monitoring` | `knowledge/linux/process-signals/monitoring.md` | draft |
| `linux.process-signals.zombie-orphan` | `knowledge/linux/process-signals/zombie-orphan.md` | draft |

**Phát hiện đáng chú ý khi review module này (ghi lại để tránh lặp lại ở module sau):**
- Reviewer phát hiện 1 lỗi kỹ thuật thật ở tình huống thực tế của `zombie-orphan.md`: ví dụ
  gốc dùng Node.js `child_process.spawn()` không lắng nghe event `'exit'` để giải thích zombie
  tích tụ — SAI, vì Node.js (qua libuv) tự `waitpid()` mọi child bất kể JS có listener hay
  không. Đã sửa sang ví dụ Python `subprocess.Popen()` không gọi `.wait()`/`.poll()`/
  `.communicate()` — đã tự verify bằng thực nghiệm thật (tạo 5 child, thấy 5 zombie xuất hiện,
  gọi `.wait()` thì về 0) trước khi đưa vào bài. **Bài học: hành vi tự-reap-child khác nhau
  giữa runtime/ngôn ngữ, không suy diễn từ ngôn ngữ này sang ngôn ngữ khác — luôn verify bằng
  thực nghiệm hoặc tài liệu chính thức của ĐÚNG runtime được nhắc tới trong bài, không dùng
  kiến thức chung chung.**
- Reviewer phát hiện 1 mâu thuẫn nội tại ở `job-control.md`: giải thích sai cơ chế SIGHUP khi
  đóng terminal (ban đầu viết "kernel gửi SIGHUP tới mọi process gắn với terminal", đúng ra là
  kernel chỉ gửi tới session leader/shell, rồi CHÍNH SHELL tự forward lại cho các job nó quản
  lý trước khi thoát — theo Bash Reference Manual). Đã sửa thống nhất trong toàn bài + thêm
  nguồn `gnu.org/software/bash/manual`.
- Đã bổ sung nguồn còn thiếu theo góp ý reviewer: `fork(2)`, `execve(2)` cho `lifecycle.md`;
  `proc_loadavg(5)` cho `monitoring.md` (xác nhận load average tính cả trạng thái `D`).

**Ghi chú về cách viết (áp dụng cho các module sau, để nhất quán):**
- Lệnh thực hành chạy THẬT trên máy desktop Ubuntu 22.04.5 LTS của người dùng (không phải
  Docker — máy đã có systemd PID 1, phù hợp trực tiếp cho module này). KHÔNG chạy lệnh đổi
  trạng thái lên service hệ thống thật (không start/stop/enable bất kỳ service hệ thống nào
  đang phục vụ máy) — khi cần minh hoạ `start`/`stop`/`enable`/`disable`, tạo một unit DEMO ở
  scope `systemctl --user` (ví dụ `se-dojo-demo.service`), dùng xong `stop` + `disable` + xoá
  file + `daemon-reload` ngay, xác nhận đã dọn sạch bằng `systemctl --user list-units`.
- Nguồn kiểm chứng: man page thật qua `man7.org` (`bootup.7`, `systemd.service.5`,
  `systemd.timer.5`, `systemd.socket.5`, `journald.conf.5`) + `docs.rockylinux.org` cho phần
  firmware/GRUB2 — lấy qua `WebFetch`, không viết từ trí nhớ.
- Review: dùng subagent "Code Reviewer" đọc cả 5 bài + taxonomy, tự chạy lại các lệnh ĐỌC
  (read-only) trên máy để đối chiếu byte-for-byte, kiểm tra mâu thuẫn chéo giữa các bài. Kết
  quả: không có lỗi nghiêm trọng; 2 vấn đề "nên sửa" đã được fix (mô tả exit code
  `systemctl status` khi unit `failed` ở `service-mgmt.md`, và cắt `boot-process.md` từ ~2490
  xuống ~2050 từ cho gần khung 800-2000 từ).
- Độ dài 5 bài (ước lượng, không tính frontmatter/code block): boot-process ~2050,
  units ~1711, service-mgmt ~1750, timers ~1769, advanced ~1876 từ.

## Module tiếp theo (chưa bắt đầu)

Theo đúng thứ tự ưu tiên trong taxonomy (ưu tiên "cao" trước), tiếp theo là
`linux.filesystem-storage`, rồi `linux.users-permissions` (cùng domain `linux`, ưu tiên "cao").
Domain `networking` có `networking.tcpip` ưu tiên "cao" cũng nên làm sớm vì nhiều module khác
(bao gồm `linux.network-stack`) có prerequisite trỏ vào đó.

## Vấn đề cần người quyết định (hiện tại: không có)

Đang tự làm tiếp từng module theo đúng khuôn mẫu đã được duyệt, chỉ dừng khi gặp vấn đề cần
chủ dự án quyết định (theo đúng quy trình đã thống nhất).

## Công cụ đã có / chưa có

- `scripts/kb-lint.ts` (`pnpm kb:lint`): **đã có** — kiểm tra frontmatter hợp lệ, id trùng,
  bài tiên quyết tồn tại trong taxonomy, đủ 8 mục bắt buộc (heading `## 1.` tới `## 8.`), link
  nội bộ hỏng, đếm `TODO-VERIFY` còn lại.
- `scripts/kb-import`: **chưa làm** — cần schema DB mới (bảng lưu bài kho tri thức, embedding
  pgvector, full-text index) nên đợi có nhiều module hơn và được duyệt hướng tích hợp trước khi
  thiết kế, tránh phải đổi schema nhiều lần.
- Trang "Kho tri thức" trong app, cập nhật `docs/ARCHITECTURE.md`/ADR-003: **chưa làm** — cùng
  lý do, đợi sau khi có đủ nội dung + hướng tích hợp DB rõ ràng để viết ADR một lần, tránh phải
  sửa lại.
