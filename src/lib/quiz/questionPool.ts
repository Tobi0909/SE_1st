import type { Difficulty } from "@/generated/prisma/client";
import { pickCurriculumAreas } from "@/lib/curriculum/pick";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/provider";

const EXCLUDE_STEMS_LIMIT = 200;

export async function ensureQuestionPool(
  topicId: string,
  difficulty: Difficulty,
  minCount: number,
  userId: string | null,
): Promise<void> {
  const activeCount = await db.question.count({
    where: { topicId, difficulty, status: "ACTIVE" },
  });
  if (activeCount >= minCount) return;

  const needed = minCount - activeCount;
  const topic = await db.topic.findUniqueOrThrow({ where: { id: topicId } });
  const existing = await db.question.findMany({
    where: { topicId, difficulty },
    select: { stem: true },
    take: EXCLUDE_STEMS_LIMIT,
  });

  // Giao đúng mảng kiến thức cần bao phủ (curriculum chuẩn, xem ADR-005) thay vì để LLM sinh
  // tự do — chủ đề admin tự tạo không có curriculum thì trả mảng rỗng, prompt tự fallback.
  const curriculumAreas = pickCurriculumAreas(topic.slug, difficulty, needed);

  const provider = await getLLMProvider();
  const batch = await provider.generateQuizBatch({
    userId,
    topicName: topic.name,
    topicSlug: topic.slug,
    difficulty,
    count: needed,
    excludeStems: existing.map((q) => q.stem),
    curriculumAreas,
  });

  for (const q of batch.questions) {
    await db.question.create({
      data: {
        topicId,
        difficulty,
        stem: q.stem,
        source: "LLM",
        options: {
          create: q.options.map((o) => ({
            text: o.text,
            isCorrect: o.isCorrect,
            explanation: o.explanation,
          })),
        },
      },
    });
  }
}

export async function pickRandomQuestions(
  topicId: string,
  difficulty: Difficulty,
  count: number,
) {
  const candidates = await db.question.findMany({
    where: { topicId, difficulty, status: "ACTIVE" },
    select: { id: true },
  });

  const chosenIds = [...candidates]
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map((c) => c.id);

  const questions = await db.question.findMany({
    where: { id: { in: chosenIds } },
    include: { options: true },
  });

  const byId = new Map(questions.map((q) => [q.id, q]));
  return chosenIds.map((id) => byId.get(id)).filter((q) => q !== undefined);
}
