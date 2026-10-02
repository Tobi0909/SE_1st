import type { Difficulty } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/provider";

const MIN_SCENARIOS_PER_POOL = 3;

export async function ensureLabScenario(
  topicId: string,
  difficulty: Difficulty,
  userId: string | null,
): Promise<void> {
  const count = await db.labScenario.count({ where: { topicId, difficulty, status: "ACTIVE" } });
  if (count >= MIN_SCENARIOS_PER_POOL) return;

  const topic = await db.topic.findUniqueOrThrow({ where: { id: topicId } });
  const provider = await getLLMProvider();
  const generated = await provider.generateScenario({
    userId,
    topicName: topic.name,
    topicSlug: topic.slug,
    difficulty,
  });

  const scenario = await db.labScenario.create({
    data: {
      topicId,
      difficulty,
      title: generated.title,
      promptVersion: "lab.scenario-generate.v1",
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
