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

## Design system

Đang làm lại giao diện (xem lịch sử commit `redesign:`) theo tinh thần "công cụ vận hành
chuyên nghiệp" — gọn, đậm đặc thông tin, tĩnh, chính xác (tham chiếu Linear/Vercel
dashboard/Grafana bản mới). Áp dụng từng màn hình, mỗi màn hình 1 commit; phần này cập nhật
dần theo tiến độ, không phải làm 1 lần xong.

- **Token màu**: định nghĩa ở `src/app/globals.css`, KHÔNG dùng preset `radix-nova` gốc của
  shadcn nữa (giữ lại import `shadcn/tailwind.css` vì nó cấp các `@custom-variant data-open`
  v.v. mà `dropdown-menu.tsx`/`command.tsx` cần — xoá sẽ hỏng animation mở/đóng). **Dark là
  mặc định** (`:root` giữ giá trị dark, `.light` override — không phải `.dark` override như
  mặc định của shadcn), `ThemeProvider` có `defaultTheme="dark"`.
  - Nền dark: `#0B0E14` → panel `#10141C` → popover/elevated `#161B25`, border `#232A38`.
  - Accent xanh terminal: dark `#3DDC97` (chữ tối `#0B0E14` trên nền accent), light `#178254`
    (đậm hơn bản dark để đạt AA — `#3DDC97` trực tiếp trên nền trắng chỉ ~1.8:1, KHÔNG dùng
    làm màu chữ/nút ở light mode). Đã tính contrast bằng WCAG formula (xem lịch sử trước khi
    đổi màu — mọi cặp text/bg phải ≥ 4.5:1, xem thủ tục tính ở dưới nếu cần đổi).
  - Semantic riêng: `--destructive` (sai/lỗi), `--success`, `--warning`, `--info` — định nghĩa
    riêng ở cả 2 mode, không tái dùng `--primary` cho error/warning.
  - Border cố ý rất mảnh/subtle (~1.3:1 so với nền) theo đúng yêu cầu "border mảnh, hạn chế
    shadow" — không đạt WCAG 1.4.11 (3:1) cho non-text boundary, chấp nhận được vì không phải
    kênh truyền đạt thông tin duy nhất (surface level + spacing đã phân tách bố cục).
- **Thang chữ**: override thẳng token `--text-xs/sm/base/lg/xl/2xl` của Tailwind trong
  `@theme inline` thành 12/13/14/16/20/28px (`base` = mặc định 14px) — nghĩa là MỌI chỗ dùng
  `text-sm`/`text-base`... trong codebase tự động theo thang mới, không cần sửa từng file.
  Heading (`h1-h4`) weight 600 qua `@layer base`.
- **Font**: `Be Vietnam Pro` (UI, subsets latin+vietnamese, weight 400/500/600) + `JetBrains
  Mono` (code/số liệu, variable) qua `next/font/google` trong `src/app/layout.tsx`, biến CSS
  đặt tên khớp với theme (`--font-sans`, `--font-mono`) — trước đó dự án dùng Geist nhưng biến
  CSS bị lệch tên với theme (`--font-geist-sans` vs theme đọc `--font-sans`) nên Geist chưa
  từng thực sự được áp dụng, chỉ fallback hệ thống; đã fix luôn khi đổi font.
  `next/font` tự tải về lúc build và tự host, không gọi Google Fonts CDN lúc chạy — đúng yêu
  cầu app chạy on-prem.
- **Số liệu**: dùng class `.tabular` (hoặc trực tiếp `font-mono tabular-nums`) để không nhảy
  số khi cập nhật — quyết định của chủ dự án, khác khuyến nghị chung của skill `dataviz`
  (vốn khuyên số lớn đứng một mình dùng proportional figures); đây là lựa chọn thẩm mỹ riêng
  cho app này (cảm giác "terminal"), áp dụng nhất quán cho mọi con số trong UI.
  Radius chuẩn `--radius: 6px` (`--radius-sm/md/lg/xl` suy ra từ đó).
- **App shell** (`src/components/shell/`): `app-shell.tsx` (client, giữ state collapsed +
  search-open), `sidebar.tsx` (collapsible, lưu trạng thái vào `localStorage` qua **lazy
  `useState` initializer**, KHÔNG dùng `useEffect` + `setState` để hydrate từ localStorage —
  bị `react-hooks/set-state-in-effect` chặn ở lint vì gây render kép; đọc thẳng trong
  initializer + `suppressHydrationWarning` ở `<aside>` để chấp nhận lệch class 1 lần giữa SSR
  (luôn "mở rộng" vì không có `window`) và client đã hydrate theo preference lưu sẵn — lệch
  này chỉ là preference UI thuần client, không ảnh hưởng nội dung), `topbar.tsx` (breadcrumb
  tự suy ra từ pathname + `NAV_ITEMS`, nút search, theme toggle, user menu), `command-
  palette.tsx` (Ctrl+K / Cmd+K), `nav-items.ts` (danh sách điều hướng dùng chung cho sidebar
  + command palette, lọc theo `adminOnly`).
  - **Lưu ý `shadcn/command.tsx`**: `CommandDialog` ở phiên bản registry hiện tại (cmdk 1.1.1)
    **KHÔNG tự bọc `<Command>`** quanh `children` như các phiên bản shadcn cũ — phải tự bọc
    `<Command>...</Command>` bên trong `<CommandDialog>`, nếu không `CommandInput` crash
    `Cannot read properties of undefined (reading 'subscribe')` vì `CommandPrimitive.Input`
    cần context từ `<Command>` (gốc `cmdk`) mà không có. Đã sửa ở
    `src/components/shell/command-palette.tsx` — nếu `pnpm dlx shadcn add command` ghi đè lại
    file này sau này, nhớ bọc lại.
- **Heatmap hoạt động** (`src/components/dashboard/activity-heatmap.tsx`): sequential ramp 1
  hue (accent xanh) 5 bậc theo opacity (`bg-primary/25` → `bg-primary`), KHÔNG chạy qua
  `validate_palette.js` của skill `dataviz` vì đó là validator cho palette **categorical** —
  chạy trên sequential ramp sẽ FAIL theo thiết kế (các bậc nằm sát nhau có chủ đích), không
  phải lỗi thật. Dữ liệu từ `src/lib/dashboard/activity.ts` (`getActivityHeatmap`, cùng nguồn
  bảng với `getStreak` nhưng đếm theo ngày thay vì chỉ có/không).
- **Để tự kiểm tra UI có DB thật** mà không cần Docker: xem mục "Test end-to-end không cần
  Docker (PGlite)" bên dưới — kỹ thuật này dùng được cho mọi lần đổi UI sau này, không chỉ
  lần test ban đầu.

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

## AI tutor

- Tutor chỉ mở được KÈM ngữ cảnh (`/tutor?contextType=NODE|QUESTION|LAB&contextId=...`) —
  không có chat chung chung không ngữ cảnh, để tránh phải thêm giá trị enum
  `ChatContextType` mới (migration) cho trường hợp "không có ngữ cảnh". Link "Hỏi AI tutor"
  gắn sẵn ở quiz session, lab workspace, và từng node trong roadmap.
- Streaming dùng **plain text stream** qua `Response` với `ReadableStream`
  (`src/app/api/tutor/chat/route.ts`), KHÔNG dùng SSE format (`data: ...\n\n`) — chỉ có 1
  luồng nội dung liên tục, không cần nhiều event-type nên stream thô đơn giản hơn mà vẫn
  progressive-render được ở client (đọc qua `response.body.getReader()`).
- Ngữ cảnh build lại từ DB mỗi lần gửi tin nhắn (`src/lib/tutor/context.ts`, theo
  `chatSession.contextType`/`contextId`, không lưu snapshot) — với `LAB`, CHỈ đưa
  briefing/symptoms, KHÔNG đưa `rootCause` vào context của tutor; prompt
  (`prompts/tutor/chat.v1.ts`) còn dặn thêm: dù hỏi thẳng cũng không được tiết lộ đáp án lab.
- "Chấm câu trả lời tự luận" (`gradeMyAnswerAction`,
  `src/app/(app)/tutor/actions.ts`) chỉ áp dụng khi `contextType === QUESTION`: rubric lấy từ
  `explanation` của đáp án đúng, kết quả được lưu làm 2 `ChatMessage` (USER + ASSISTANT) nối
  vào cùng thread chat, không phải một luồng riêng.

## Trang admin

- `/admin/users`: tạo user (hash password qua `src/lib/password.ts`), đổi role, xoá — admin
  không tự đổi role/xoá chính mình (chặn ở action, không chỉ ẩn UI).
- `/admin/topics`: tạo chủ đề mới + sửa tên/mô tả/thứ tự. **Cố ý không cho xoá chủ đề** — cascade
  sẽ xoá toàn bộ câu hỏi/lab/roadmap của chủ đề đó, rủi ro quá cao cho 1 nút bấm trong UI nội
  bộ nhỏ (xem thêm `IDEAS.md`).
- `/admin/usage`: thống kê `LlmUsageLog` group theo `feature` (số lần gọi, tỉ lệ thành công,
  latency trung bình, tổng token) + danh sách 20 lượt gọi gần nhất.
- `/admin/flagged`: đã có từ GĐ2 (câu hỏi bị báo sai).

## Docker

- `Dockerfile`: multi-stage, **không dùng `output: "standalone"`** — `getLLMProvider()` dùng
  dynamic `import()` để chọn provider theo env, Next's file-tracing cho standalone có thể bỏ
  sót 1 trong 2 provider file. Image copy full `node_modules` — chấp nhận được với quy mô nội
  bộ 4-10 người, ưu tiên đúng/đơn giản hơn tối ưu kích thước image.
- `docker-entrypoint.sh`: chạy `prisma migrate deploy` → seed → `next start`, mỗi lần container
  khởi động (idempotent nhờ seed dùng `upsert`).
- Chưa test được `docker compose up` thật trong sandbox phát triển (không có Docker) — đã xác
  minh logic qua `prisma migrate diff --from-empty` (không cần DB) và build/test chạy trên máy
  host. Đã test end-to-end thật (không qua Docker, xem mục dưới) — **vẫn cần người dùng tự
  chạy `docker compose up` trên máy có Docker ít nhất 1 lần để xác nhận chính container/compose
  chạy đúng**, vì sandbox phát triển không có Docker.

## Test end-to-end không cần Docker (PGlite)

Sandbox phát triển không có Docker/Postgres/sudo. Để test thật (không phải chỉ đọc code),
dùng `@electric-sql/pglite` + `@electric-sql/pglite-socket` (cài TẠM trong thư mục scratch,
KHÔNG phải dependency của project) để dựng một server nói đúng wire protocol Postgres thật
(`pg`/`@prisma/adapter-pg` kết nối transparent, không cần đổi code app):

```bash
npm install @electric-sql/pglite @electric-sql/pglite-socket   # trong 1 thư mục scratch riêng
npx pglite-server --db=./data/sedojo --port=5433 --host=127.0.0.1 --max-connections=10
# rồi trỏ DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres?schema=public"
# và chạy prisma migrate deploy + db:seed + pnpm dev như bình thường
```

Nhờ vậy đã chạy thật được: đăng nhập → quiz (sinh câu qua mock LLM, trả lời, giải thích) →
flashcard (SM-2 cập nhật) → lab (preset command khớp, LLM fallback + cache, hint, chấm nộp
bài) → roadmap (sinh skill tree, trạng thái node phản ánh đúng kết quả quiz+lab thật) →
dashboard/team → AI tutor (chat streaming + chấm tự luận) → admin (user/topic/usage/flagged
CRUD) → dark mode → đăng xuất. Qua đó phát hiện và sửa 2 bug thật:

1. **`/team` crash "Connection terminated unexpectedly"** khi có nhiều user: `getTeamProgress`
   cũ gọi lại `getAllTopicsProgress` cho TỪNG user (N user × M topic query lồng nhau qua
   `Promise.all` — hàng trăm query đồng thời cho 1 lần tải trang). Đã refactor
   `src/lib/roadmap/progress.ts`: tách `buildRoadmapTree` thành hàm THUẦN nhận dữ liệu đã
   fetch sẵn, rồi `getAllTopicsProgress`/`getTeamProgress`/`getTeamStreaks`
   (`src/lib/dashboard/stats.ts`) mỗi hàm chỉ fetch gộp vài query hằng số (không nhân theo số
   user/topic) rồi tính hết trong JS. Giữ nguyên `computeTopicRoadmap` (1 user/1 topic) vì quy
   mô nhỏ, không cần tối ưu.
2. **`LLM_PROVIDER=mock` không ghi `LlmUsageLog` và bỏ qua rate limit hoàn toàn** — logic đó
   trước chỉ nằm trong `OpenAICompatibleProvider`, không áp dụng chung. Thêm
   `src/lib/llm/providers/tracked.ts` (`withTracking`) bọc quanh `MockLLMProvider` trong
   `getLLMProvider()` để áp rate limit + ghi log (promptTokens/completionTokens=0 vì mock
   không có usage thật) nhất quán bất kể provider nào — tránh phải nhớ lặp lại logic này nếu
   sau này thêm provider khác. `OpenAICompatibleProvider` KHÔNG bị bọc thêm (đã tự ghi log chi
   tiết hơn với token thật, bọc chồng sẽ ghi trùng).

Một lần duy nhất gặp "báo sai câu A nhưng DB lại ghi flag vào câu B" ngay sau khi vừa sửa
code xong (dev server có thể đang compile lại) — thử lại 2 lần liền sau đó khớp đúng 100%,
kết luận là artefact của thời điểm hot-reload, không phải bug code.

## Trạng thái

Cả 5 giai đoạn (khung dự án, quiz/flashcard, lab terminal, roadmap/dashboard, AI tutor +
admin) đã hoàn thành và đã được test end-to-end thật (xem mục trên) qua PGlite, ngoại trừ
chính `docker compose up`/container thật. Ý tưởng ngoài phạm vi ghi vào `IDEAS.md`, không tự
thêm vào code khi chưa được duyệt.
