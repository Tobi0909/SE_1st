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
 * Idempotent: định danh 1 lab mẫu bằng (topicId, difficulty, title) — nếu đã tồn tại thì bỏ
 * qua, không tạo trùng. Chạy lại an toàn sau khi thêm/sửa lab mẫu trong file data.
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
  let skippedExisting = 0;
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

    const existing = await db.labScenario.findFirst({
      where: { topicId: topic.id, difficulty: scenario.difficulty, title: scenario.title },
      select: { id: true },
    });
    if (existing) {
      skippedExisting++;
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
        data: JSON.parse(JSON.stringify(scenario)),
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
  console.log(`Bỏ qua (đã tồn tại): ${skippedExisting}`);
  if (!DRY_RUN) console.log(`Đã gắn vào skill node: ${nodesLinked}`);
  if (errors.length > 0) {
    console.log(`\nLỗi (${errors.length}):`);
    for (const e of errors) console.log(`  - ${e}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
