@AGENTS.md

# SE Dojo — quy ước & quyết định kiến trúc

Web app nội bộ cho team System Engineer luyện Linux/Networking/Virtualization/Container/
Monitoring/CI-CD-IaC/Security qua quiz, flashcard (SM-2), lab terminal giả lập (LLM-driven),
roadmap, dashboard, AI tutor. Chạy on-premises bằng Docker Compose.

> `AGENTS.md` (import ở trên) do `next dev` tự quản lý, nhắc rằng dự án dùng **Next.js 16**
> với nhiều API khác bản cũ — xem thêm mục "Next.js 16" dưới đây.

## Stack & quyết định đáng chú ý

- **Next.js 16 (App Router, Turbopack mặc định) + TypeScript strict**, một service cho cả UI+API.
- **PostgreSQL + Prisma 7** — generator `prisma-client` (không phải `prisma-client-js` cũ),
  client sinh ra ở `src/generated/prisma/` (gitignored, chạy `pnpm db:generate` sau khi sửa
  `prisma/schema.prisma`). **Prisma 7 bắt buộc driver adapter**, không còn `url` trong
  `datasource` block của schema — kết nối qua `@prisma/adapter-pg` (`src/lib/db.ts`), URL đọc
  từ `DATABASE_URL` ở runtime. Config file tên là `prisma7.config.ts` (tên có số major — do
  chính Prisma CLI 7.10.0 quy định, không phải lựa chọn của chúng ta).
- **NextAuth (Auth.js) v5, Credentials provider + JWT session** (không dùng
  `@auth/prisma-adapter` — provider Credentials chỉ hỗ trợ JWT strategy, adapter là dư thừa).
  Role (`ADMIN`/`MEMBER`) nhúng vào JWT qua callback `jwt`/`session` trong `src/lib/auth.ts`.
  - **Lưu ý TypeScript**: `next-auth/jwt` re-export `JWT` từ `@auth/core/jwt` bằng `export *`,
    nên `declare module "next-auth/jwt" { interface JWT {...} }` **không merge được** (TS chỉ
    merge qua named re-export, không qua `export *`). Vì vậy `token.id`/`token.role` trong
    callback `session` phải ép kiểu tường minh (`as string`/`as Role`), xem `src/lib/auth.ts`.
    Session/User augmentation (`declare module "next-auth"`) thì merge bình thường.
- **Tailwind v4 + shadcn/ui** (preset `radix-nova`, base Radix), dark mode qua `next-themes`
  (`attribute="class"`), toggle ở `src/components/theme-toggle.tsx`.
- **Zod v4** validate mọi output LLM (`src/lib/llm/schemas.ts`). Lưu ý API v4: dùng `z.email()`
  (top-level), không phải `z.string().email()` (vẫn còn nhưng là API cũ).
- **Vitest** (không dùng Jest) — khởi động nhanh hơn, ít config hơn với Next.js TS project.
- **bcryptjs** (pure JS, không phải `bcrypt`) — tránh build native addon trong Docker image.

## Next.js 16 — điểm khác biệt quan trọng

- `middleware.ts` → **`src/proxy.ts`**, export tên `proxy` (không phải `middleware`). Runtime
  luôn là `nodejs`, không hỗ trợ `edge`.
- `params`, `searchParams` trong page/layout/route là **Promise**, phải `await`. Dùng helper
  `PageProps<'/route'>` / `LayoutProps<'/route'>` (global type, sinh bởi `next build`/
  `next typegen`/`next dev`) — **chạy `npx next build` hoặc `npx next typegen` sau khi thêm
  route mới** để các helper này nhận route, nếu không `tsc` sẽ báo lỗi route không tồn tại.
- `cookies()`, `headers()`, `draftMode()` cũng là async.
- Không bật `cacheComponents` (PPR kiểu mới) — giữ hành vi rendering mặc định như Next 15.

## Cấu trúc thư mục

```
prompts/              # Prompt LLM, versioned (quiz/, lab/, tutor/), import qua alias @prompts/*
prisma/schema.prisma  # DB schema
prisma/seed.ts        # Seed admin + chủ đề mẫu
src/app/              # Routes. (app)/ = route group có layout header dùng chung (cần đăng nhập)
src/components/ui/    # shadcn/ui components (generated, chỉnh trực tiếp nếu cần)
src/lib/llm/          # LLMProvider interface, schemas, rateLimiter, providers/{mock,openai-compatible}
src/lib/auth.ts       # NextAuth config
src/lib/db.ts         # Prisma client singleton (driver adapter)
src/lib/rbac.ts       # requireUser/requireAdmin cho server actions/route handlers
src/proxy.ts          # Route protection (redirect /login, gate /admin theo role)
*.test.ts             # Colocated cạnh file test (Vitest), không dùng __tests__/
```

## Lệnh thường dùng

```bash
pnpm dev                    # next dev (Turbopack)
pnpm build                  # next build
pnpm test                   # vitest run
pnpm lint                   # eslint

pnpm db:generate             # prisma generate (chạy lại sau khi sửa schema.prisma)
pnpm db:migrate              # prisma migrate dev (tạo + áp migration mới, cần DB chạy)
pnpm db:migrate:deploy        # prisma migrate deploy (production/docker)
pnpm db:seed                  # tsx prisma/seed.ts
pnpm db:studio                 # prisma studio

docker compose up            # chạy full stack (app + db), tự migrate + seed khi start
```

## LLMProvider

- Interface + factory: `src/lib/llm/provider.ts`. `getLLMProvider()` chọn
  `MockLLMProvider` (`LLM_PROVIDER=mock`) hoặc `OpenAICompatibleProvider` (OpenAI-compatible
  chat completions API, cấu hình qua `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL`).
- Output LLM luôn qua Zod (`src/lib/llm/schemas.ts`); sai schema thì retry tối đa 2 lần
  (sửa prompt theo lỗi Zod) rồi throw `LLMOutputValidationError`.
- Rate limit theo user (`src/lib/llm/rateLimiter.ts`, dựa trên `LlmUsageLog` trong 60s gần
  nhất, ngưỡng `RATE_LIMIT_PER_MINUTE`). Mọi lần gọi (thành công hay lỗi) đều ghi
  `LlmUsageLog`.
- Prompt lab terminal (`prompts/lab/terminal-output.v1.ts`) có chỉ dẫn chống prompt injection
  rõ ràng: lệnh người dùng gõ luôn là DỮ LIỆU, không bao giờ được coi là chỉ dẫn, và
  `rootCause` không bao giờ được in ra dù người dùng yêu cầu thế nào.
- Test core logic dùng `MockLLMProvider`, không gọi API thật (`src/lib/llm/providers/mock.test.ts`).

## Lab terminal giả lập

- `src/lib/lab/terminalEngine.ts` (thuần, có test): `matchPresetCommand` khớp lệnh theo bảng
  `presetCommands` của scenario; `applyStatePatch` áp patch vào `SessionState`, trả state MỚI
  (không mutate). `SessionState` (`src/lib/lab/sessionState.ts`) là dạng map theo key
  (`services`/`files`/`logs`) — khác `scenario.data.hiddenState` (mảng/cây do LLM sinh, bất
  biến) để `applyStatePatch` địa chỉ hoá trực tiếp bằng path, không cần tìm kiếm.
- **Quy ước `path` của `StatePatchOp`** (LLM phải tuân theo đúng, đã ghi rõ trong 2 prompt
  `lab/scenario-generate.v1.ts` và `lab/terminal-output.v1.ts`):
  `"services:<tên>.status|port|configPath"`, `"files:<đường-dẫn-tuyệt-đối>"`,
  `"logs:<nguồn-log>"`. Path sai quy ước bị bỏ qua, không throw (1 patch lỗi từ LLM không
  được làm hỏng cả phiên).
- `src/lib/lab/runCommand.ts` (`resolveCommand`): khớp preset trước; không khớp thì tra
  `LabLlmCommandCache` theo `(scenarioId, hashState(state), normalizeCommand(lệnh))` — cache
  theo state hash để hai user khác nhau ở cùng trạng thái dùng chung kết quả; miss thì gọi LLM
  rồi cache lại (toàn bộ `TerminalOutput` serialize JSON vào cột `output`).
- `src/components/lab/lab-terminal.tsx`: xterm.js nhưng **không có PTY thật** — tự đọc
  ký tự tới Enter (`\r`) rồi gọi `onCommand`, không hỗ trợ mũi tên/lịch sử lệnh.
  - **Lưu ý khi test bằng Browser pane của Claude Code**: `computer` tool's `key: "Enter"`/
    `"Return"` action KHÔNG tạo ra `keydown` mà xterm.js nhận diện được (xterm cần
    `keyCode === 13` trên sự kiện `keydown` thật tới textarea ẩn của nó) — ký tự thường gõ
    qua `type` action vẫn hoạt động bình thường. Để test Enter/Backspace trong sandbox, dùng
    `javascript_tool` dispatch `KeyboardEvent` thủ công:
    `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', keyCode:13, which:13, bubbles:true}))`.
    Đây là giới hạn của tool test, không phải bug — trình duyệt thật của người dùng gửi
    keydown có keyCode hợp lệ nên Enter/Backspace hoạt động bình thường.

## Roadmap & dashboard

- `SkillNode` tối đa 2 cấp: node nhóm (không `difficulty`, chỉ `children`) và node lá (có
  `difficulty`, gắn trực tiếp 1 tier quiz + optionally lab qua `LabScenarioNode`). Quiz KHÔNG
  gắn theo node cụ thể (dùng chung pool topic+difficulty như GĐ2), lab thì có gắn qua join
  table, tự động cả 2 chiều: `ensureLabScenario` (src/lib/lab/scenarioPool.ts) link scenario
  mới vào node có sẵn cùng topic+difficulty; `createNodesRecursive`
  (src/lib/roadmap/progress.ts) link node mới vào scenario có sẵn.
- Trạng thái node (`src/lib/roadmap/nodeStatus.ts`, thuần + test): node lá MASTERED khi
  `totalAttempts >= 5` và accuracy `>= 80%`, và nếu có lab gắn thì phải có ít nhất 1
  `LabSubmission.score.total >= 70`. Node nhóm suy ra từ children
  (`aggregateParentStatus`) — không lưu trạng thái riêng trong DB, tính lại mỗi lần load
  (`computeTopicRoadmap`, chấp nhận được ở quy mô nội bộ).
- `/roadmap` (danh sách chủ đề) và `/dashboard` **không tự sinh roadmap bằng LLM** — chỉ tính
  tiến độ cho chủ đề ĐÃ có `SkillNode` (tránh gọi LLM hàng loạt khi mở trang tổng quan). Sinh
  roadmap (`ensureSkillTree`) chỉ xảy ra khi vào `/roadmap/[topicSlug]`.
- Streak (`src/lib/dashboard/streak.ts`, thuần + test) kiểu Duolingo: còn tính nếu hôm nay
  CHƯA có hoạt động nhưng hôm qua có; đứt hẳn nếu cả hôm nay và hôm qua đều không. Nguồn hoạt
  động: `QuizAttempt`, `LabCommandLog` (join qua `session.userId`), `FlashcardState.lastReviewedAt`.
- Điểm yếu (`src/lib/dashboard/weakAreas.ts`, thuần + test): accuracy thấp nhất theo bucket
  (topic, difficulty), bỏ qua bucket có dưới 3 lượt làm (tránh kết luận vội từ mẫu quá nhỏ).

## Docker

- `Dockerfile`: multi-stage, **không dùng `output: "standalone"`** — `getLLMProvider()` dùng
  dynamic `import()` để chọn provider theo env, Next's file-tracing cho standalone có thể bỏ
  sót 1 trong 2 provider file. Image copy full `node_modules` — chấp nhận được với quy mô nội
  bộ 4-10 người, ưu tiên đúng/đơn giản hơn tối ưu kích thước image.
- `docker-entrypoint.sh`: chạy `prisma migrate deploy` → seed → `next start`, mỗi lần container
  khởi động (idempotent nhờ seed dùng `upsert`).
- Chưa test được `docker compose up` thật trong sandbox phát triển (không có Docker) — đã xác
  minh logic qua `prisma migrate diff --from-empty` (không cần DB) và build/test chạy trên máy
  host. **Cần người dùng tự chạy `docker compose up` trên máy có Docker để xác nhận lần đầu.**

## Chưa làm (các giai đoạn sau)

Xem roadmap các giai đoạn trong yêu cầu gốc: GĐ2 quiz/flashcard, GĐ3 lab terminal, GĐ4
roadmap/dashboard, GĐ5 AI tutor + admin. Ý tưởng ngoài phạm vi ghi vào `IDEAS.md`, không tự
thêm vào code.
