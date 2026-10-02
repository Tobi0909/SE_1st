# SE Dojo

Web app nội bộ để team System Engineer luyện Linux, Networking, Virtualization, Container,
Monitoring/Logging, CI/CD & IaC, Security hardening — qua quiz/flashcard, lab troubleshooting
với terminal giả lập (không thực thi lệnh thật), roadmap tiến độ, và AI tutor.

## Tính năng

- **Quiz & flashcard**: chọn chủ đề/độ khó, LLM sinh câu hỏi (tái sử dụng kho có sẵn trước khi
  sinh thêm), giải thích đúng/sai từng đáp án, ôn tập theo spaced repetition (SM-2).
- **Lab troubleshooting**: terminal giả lập (không thực thi lệnh thật), gợi ý 3 cấp, nộp bài
  được LLM chấm theo rubric.
- **Roadmap & dashboard**: cây kỹ năng theo chủ đề, trạng thái tính từ kết quả thực tế, dashboard
  cá nhân (tiến độ, điểm yếu, streak) và trang team.
- **AI tutor**: chat streaming theo ngữ cảnh (câu hỏi/lab/kỹ năng đang mở), chấm câu trả lời tự
  luận và chỉ ra chỗ thiếu.
- **Admin**: quản lý user (tạo/đổi role/xoá), chủ đề, nội dung bị báo sai, thống kê gọi LLM.

## Yêu cầu

- Docker + Docker Compose (chạy production/local như sẽ chạy thật)
- Hoặc, để phát triển không qua Docker: Node.js 22+, pnpm, PostgreSQL 16+

## Chạy bằng Docker Compose (khuyến nghị)

```bash
cp .env.example .env
# Điền AUTH_SECRET (openssl rand -base64 32), LLM_BASE_URL/LLM_API_KEY/LLM_MODEL,
# SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD. Có thể đặt LLM_PROVIDER=mock để chạy thử
# không cần API key LLM thật.

docker compose up
```

Lần đầu chạy, container `app` sẽ tự áp migration và seed admin + chủ đề mẫu trước khi start —
không cần bước thủ công nào khác. Mở http://localhost:3000, đăng nhập bằng
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` đã điền trong `.env`. Tạo thêm user cho team ở
trang `/admin/users` sau khi đăng nhập.

## Phát triển không qua Docker

```bash
cp .env.example .env   # sửa DATABASE_URL trỏ vào Postgres local của bạn
pnpm install
pnpm db:migrate         # tạo schema
pnpm db:seed            # admin + chủ đề mẫu
pnpm dev
```

## Test

```bash
pnpm test        # vitest run — test logic lõi: SM-2, terminal engine (khớp lệnh + cập nhật
                  # trạng thái), validate output LLM (schema + mock provider), trạng thái
                  # roadmap, streak, điểm yếu. Không gọi API LLM thật.
pnpm lint
pnpm build        # cũng chạy typecheck (tsc) như một phần của next build
```

## Backup / restore database

Database chạy trong volume Docker `pgdata`. Backup/restore bằng `pg_dump`/`pg_restore` qua
container `db`:

```bash
# Backup
docker compose exec db pg_dump -U se_dojo -d se_dojo -F c -f /tmp/backup.dump
docker compose cp db:/tmp/backup.dump ./backup.dump

# Restore (vào database rỗng)
docker compose cp ./backup.dump db:/tmp/backup.dump
docker compose exec db pg_restore -U se_dojo -d se_dojo --clean --if-exists /tmp/backup.dump
```

(Thay `se_dojo`/`se_dojo` bằng `POSTGRES_USER`/`POSTGRES_DB` thật nếu bạn đã đổi trong `.env`.)

## Cấu trúc & quyết định kiến trúc

Xem [`CLAUDE.md`](./CLAUDE.md).
