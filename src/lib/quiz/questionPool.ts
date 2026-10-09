import type { Difficulty } from "@/generated/prisma/client";
import { pickCurriculumAreas } from "@/lib/curriculum/pick";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/provider";

const EXCLUDE_STEMS_LIMIT = 200;
const RECENT_ATTEMPT_DAYS = 14;

function shuffled<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

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
  userId: string,
) {
  const since = new Date(Date.now() - RECENT_ATTEMPT_DAYS * 24 * 60 * 60 * 1000);
  const [candidates, recentAttempts] = await Promise.all([
    db.question.findMany({
      where: { topicId, difficulty, status: "ACTIVE" },
      select: { id: true, source: true },
    }),
    db.quizAttempt.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { questionId: true },
    }),
  ]);
  const recentIds = new Set(recentAttempts.map((a) => a.questionId));

  // Ưu tiên theo thứ tự: ADMIN+chưa làm gần đây > LLM+chưa làm gần đây > ADMIN+đã làm gần
  // đây > LLM+đã làm gần đây — chỉ lùi về nhóm "đã làm gần đây" khi nhóm ưu tiên cao hơn
  // không đủ count (pool nhỏ, user đã làm gần hết thì vẫn cho lặp lại thay vì chặn).
  const buckets = [
    candidates.filter((c) => c.source === "ADMIN" && !recentIds.has(c.id)),
    candidates.filter((c) => c.source === "LLM" && !recentIds.has(c.id)),
    candidates.filter((c) => c.source === "ADMIN" && recentIds.has(c.id)),
    candidates.filter((c) => c.source === "LLM" && recentIds.has(c.id)),
  ];

  const chosenIds = buckets
    .flatMap(shuffled)
    .slice(0, count)
    .map((c) => c.id);

  const questions = await db.question.findMany({
    where: { id: { in: chosenIds } },
    include: { options: true },
  });

  const byId = new Map(questions.map((q) => [q.id, q]));
  return chosenIds.map((id) => byId.get(id)).filter((q) => q !== undefined);
}
