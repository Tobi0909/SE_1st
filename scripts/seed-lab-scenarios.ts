/**
 * Nạp 81 lab mẫu viết tay (prisma/data/labScenarios/) vào bảng lab_scenarios, status ACTIVE.
 * Chạy: pnpm lab:seed-scenarios          (ghi DB)
 *        pnpm lab:seed-scenarios:dry     (dry-run: validate + báo cáo, không write DB)
 *
 * Mục đích: mỗi tổ hợp (topic, difficulty) có sẵn 3 lab mẫu để đạt MIN_SCENARIOS_PER_POOL
 * (xem src/lib/lab/scenarioPool.ts) — khi đó ensureLabScenario() không bao giờ cần gọi LLM
 * live để tạo lab mới nữa, tránh phụ thuộc vào độ ổn định/tốc độ của LLM gateway khi người
 * dùng bấm "Bắt đầu lab" (xem CLAUDE.md, mục điều tra lab lỗi tùm lum ngoài Linux/Easy).
 *
 * Idempotent: định danh 1 lab mẫu bằng (topicId, difficulty, title). Lab mẫu đã tồn tại thì
 * UPDATE lại cột `data` theo đúng nội dung mới nhất trong file (nếu có thay đổi) thay vì bỏ
 * qua — cho phép sửa nội dung lab mẫu đã seed rồi deploy lại mà không cần xoá DB. Các
 * LabSession đã tạo trước đó không bị ảnh hưởng (state của session là bản snapshot riêng,
 * không tham chiếu ngược lại `data` của scenario).
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { ALL_STATIC_LAB_SCENARIOS } from "../prisma/data/labScenarios";
import { LabScenarioSchema } from "../src/lib/llm/schemas";

const DRY_RUN = process.argv.includes("--dry-run");
const PROMPT_VERSION = "static.v1";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  let validated = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let nodesLinked = 0;
  const errors: string[] = [];

  for (const raw of ALL_STATIC_LAB_SCENARIOS) {
    const parsed = LabScenarioSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`[${raw.topicSlug}/${raw.difficulty}] "${raw.title}": ${parsed.error.message}`);
      continue;
    }
    validated++;
    const scenario = parsed.data;

    const topic = await db.topic.findUnique({ where: { slug: scenario.topicSlug } });
    if (!topic) {
      errors.push(`[${scenario.topicSlug}/${scenario.difficulty}] "${scenario.title}": topic slug không tồn tại trong DB — chạy pnpm db:seed trước.`);
      continue;
    }

    const normalizedData = JSON.parse(JSON.stringify(scenario));

    const existing = await db.labScenario.findFirst({
      where: { topicId: topic.id, difficulty: scenario.difficulty, title: scenario.title },
      select: { id: true, data: true },
    });

    if (existing) {
      // jsonb của Postgres KHÔNG giữ nguyên thứ tự key như lúc insert (khác với kiểu `json`),
      // nên so sánh JSON.stringify thô sẽ luôn lệch dù nội dung thực chất giống hệt — phải so
      // sánh qua dạng canonical (key đã sắp xếp đệ quy).
      const changed = canonicalJson(existing.data) !== canonicalJson(normalizedData);
      if (!changed) {
        unchanged++;
        continue;
      }
      if (DRY_RUN) {
        updated++;
        continue;
      }
      await db.labScenario.update({
        where: { id: existing.id },
        data: { data: normalizedData, promptVersion: PROMPT_VERSION },
      });
      updated++;
      continue;
    }

    if (DRY_RUN) {
      created++;
      continue;
    }

    const row = await db.labScenario.create({
      data: {
        topicId: topic.id,
        difficulty: scenario.difficulty,
        title: scenario.title,
        promptVersion: PROMPT_VERSION,
        data: normalizedData,
        status: "ACTIVE",
      },
    });
    created++;

    // Gắn vào skill node cùng topic/difficulty đã tồn tại, giống ensureLabScenario
    // (src/lib/lab/scenarioPool.ts) để lab mẫu cũng xuất hiện được trong roadmap.
    const matchingNodes = await db.skillNode.findMany({
      where: { topicId: topic.id, difficulty: scenario.difficulty },
      select: { id: true },
    });
    if (matchingNodes.length > 0) {
      const res = await db.labScenarioNode.createMany({
        data: matchingNodes.map((n) => ({ nodeId: n.id, scenarioId: row.id })),
        skipDuplicates: true,
      });
      nodesLinked += res.count;
    }
  }

  console.log(`${DRY_RUN ? "[dry-run] " : ""}Validate: ${validated}/${ALL_STATIC_LAB_SCENARIOS.length} hợp lệ theo LabScenarioSchema`);
  console.log(`${DRY_RUN ? "Sẽ tạo" : "Đã tạo"}: ${created}`);
  console.log(`${DRY_RUN ? "Sẽ cập nhật" : "Đã cập nhật"}: ${updated}`);
  console.log(`Giữ nguyên (không đổi): ${unchanged}`);
  if (!DRY_RUN) console.log(`Đã gắn vào skill node: ${nodesLinked}`);
  if (errors.length > 0) {
    console.log(`\nLỗi (${errors.length}):`);
    for (const e of errors) console.log(`  - ${e}`);
  }
}

/** Stringify ổn định với key object được sắp xếp đệ quy — dùng để so sánh nội dung JSON, không
 *  phải để lưu (thứ tự key gốc trong file data/*.ts vẫn là nguồn chân lý khi ghi). */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortKeysDeep(v)]));
  }
  return value;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
