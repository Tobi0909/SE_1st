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

  await db.labScenario.create({
    data: {
      topicId,
      difficulty,
      title: generated.title,
      promptVersion: "lab.scenario-generate.v1",
      data: JSON.parse(JSON.stringify(generated)),
      status: "ACTIVE",
    },
  });
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
