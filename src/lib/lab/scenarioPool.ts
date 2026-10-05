import type { Difficulty } from "@/generated/prisma/client";
import { pickCurriculumAreas } from "@/lib/curriculum/pick";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/provider";

const MIN_SCENARIOS_PER_POOL = 3;
const SCENARIO_PROMPT_VERSION = "lab.scenario-generate.v2";

export async function ensureLabScenario(
  topicId: string,
  difficulty: Difficulty,
  userId: string | null,
): Promise<void> {
  const count = await db.labScenario.count({ where: { topicId, difficulty, status: "ACTIVE" } });
  if (count >= MIN_SCENARIOS_PER_POOL) return;

  const topic = await db.topic.findUniqueOrThrow({ where: { id: topicId } });
  // Mỗi scenario xoay quanh 1 mảng kiến thức cụ thể (curriculum chuẩn, xem ADR-005) — chủ đề
  // admin tự tạo không có curriculum thì pickCurriculumAreas trả rỗng, prompt tự sinh tự do.
  const [curriculumArea] = pickCurriculumAreas(topic.slug, difficulty, 1);

  const provider = await getLLMProvider();
  const generated = await provider.generateScenario({
    userId,
    topicName: topic.name,
    topicSlug: topic.slug,
    difficulty,
    curriculumArea,
  });

  const scenario = await db.labScenario.create({
    data: {
      topicId,
      difficulty,
      title: generated.title,
      promptVersion: SCENARIO_PROMPT_VERSION,
      data: JSON.parse(JSON.stringify(generated)),
      status: "ACTIVE",
    },
  });

  // Gắn scenario mới vào các skill node cùng topic/difficulty đã tồn tại (nếu roadmap được
  // sinh trước lab). Chiều ngược lại — node mới gắn vào scenario có sẵn — xử lý trong
  // src/lib/roadmap/progress.ts khi tạo node.
  const matchingNodes = await db.skillNode.findMany({ where: { topicId, difficulty }, select: { id: true } });
  if (matchingNodes.length > 0) {
    await db.labScenarioNode.createMany({
      data: matchingNodes.map((n) => ({ nodeId: n.id, scenarioId: scenario.id })),
      skipDuplicates: true,
    });
  }
}

export async function pickRandomLabScenario(topicId: string, difficulty: Difficulty) {
  const candidates = await db.labScenario.findMany({
    where: { topicId, difficulty, status: "ACTIVE" },
    select: { id: true },
  });
  if (candidates.length === 0) return null;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return db.labScenario.findUnique({ where: { id: chosen.id } });
}
