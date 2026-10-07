# ADR-006: Kho tri thức tĩnh import vào DB, full-text search bằng tsvector

- **Trạng thái**: Đã áp dụng (2026-10-07)
- **Tác giả**: Tobi0909

---

## Bối cảnh

SE Dojo có 146 bài `.md` trong `knowledge/` được viết và quản lý bằng tay, mỗi bài có
frontmatter chuẩn (id, title, domain, module, level, status, prerequisites, applies_to,
sources, last_verified) và body 8 section (Tổng quan, Tại sao, Cơ chế, Cấu hình, Vận hành,
Lỗi thường gặp, Bảo mật, Tham khảo).

Cần:
1. Đưa nội dung vào app để người học có thể browse, search, lọc theo domain/level/status.
2. Link từ quiz session, lab workspace, roadmap node sang tài liệu tham khảo phù hợp.
3. Full-text search hoạt động được với tiếng Việt có dấu + thuật ngữ kỹ thuật tiếng Anh.

---

## Các lựa chọn đã cân nhắc

### A. Đọc file trực tiếp từ filesystem lúc runtime

Ưu: đơn giản, không cần bước import, luôn phản ánh file mới nhất.  
Nhược: không có full-text search, phải mở filesystem access trong Next.js Route Handler
(không phù hợp với container), hiệu năng kém khi list/filter 146 file.

### B. Import vào DB (PostgreSQL) — **đã chọn**

Ưu: full-text search bằng tsvector+GIN index, query nhanh, không cần fs access runtime,
hash-based idempotency cho phép chạy import nhiều lần an toàn.  
Nhược: thêm bước import, filesystem là nguồn biên tập nhưng DB là runtime source (phải nhớ
sync).

### C. pgvector semantic search (embedding)

Ưu: tìm được "cgroups" khi search "container isolation", semantic matching vượt trội so với
keyword.  
Nhược: cần embedding API (LLM call + token cost mỗi lần import/update), pgvector extension
(~30MB), re-embed khi nội dung đổi, latency higher. Không phù hợp với môi trường on-prem hạn
chế dependency ngoài.

---

## Quyết định

**Chọn phương án B** (import vào DB) với các chi tiết sau:

### Schema

Bảng `articles` với cột `contentHash` (SHA-256) cho idempotent import, `status` enum
(DRAFT/VERIFIED), `level` enum (FOUNDATION/OPERATION/EXPERT). Cột `search_vector tsvector
GENERATED ALWAYS AS ... STORED` thêm qua raw SQL trong migration (Prisma không natively
support tsvector type).

Bảng `article_skill_nodes` (n:m) cho link thủ công giữa Article và SkillNode trong roadmap.

### Full-text search

Config `'simple'` + extension `unaccent` — không stem, giữ nguyên thuật ngữ kỹ thuật
(`nginx`, `cgroups`, `iptables`) và từ tiếng Việt có dấu được normalize. Config `'english'`
không phù hợp vì stem làm mất tên lệnh/flag, và không xử lý tiếng Việt.

Query dùng `websearch_to_tsquery('simple', unaccent(...))` để hỗ trợ phrase search và boolean
tự nhiên từ user input.

### Import script

`scripts/kb-import.ts`: đọc tất cả `.md` trong `knowledge/`, parse frontmatter, tính
SHA-256(file content), upsert vào DB (create nếu mới, update nếu hash đổi, skip nếu không
đổi). Hỗ trợ `--dry-run` (validate only, không write DB). Chạy tự động trong
`docker-entrypoint.sh` sau `prisma migrate deploy`.

### Visibility

- MEMBER: chỉ thấy bài có `status = VERIFIED`
- ADMIN: thấy cả DRAFT + VERIFIED

### Link quiz/lab → articles

Dùng runtime filter theo domain+level (không stored join table). Mapping `topicSlug →
domain` và `difficulty → level` trong `src/lib/knowledge/queries.ts`.

### Chừa chỗ cho pgvector

Cột `embeddingModel String?` nullable trong schema — không ảnh hưởng tính năng hiện tại,
dễ thêm `embeddingVector vector(1536)` sau bằng migration riêng khi cần semantic search.

---

## Hệ quả

- Filesystem `knowledge/` là nguồn biên tập; DB là runtime source. Admin phải chạy
  `pnpm kb:import` (hoặc để Docker tự chạy) sau mỗi lần cập nhật bài.
- Link Article ↔ SkillNode là thủ công qua bảng `article_skill_nodes`.
- Migration SQL viết tay (Prisma 7 `migrate diff` yêu cầu shadow DB để auto-generate; thêm
  phần tsvector không thể auto-generate qua Prisma schema bình thường).
- `react-markdown` + `@tailwindcss/typography` thêm vào dependency cho render Markdown ở
  trang chi tiết bài.
