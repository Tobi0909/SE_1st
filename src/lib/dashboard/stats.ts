import { db } from "@/lib/db";
import { computeStreak, toDateKey } from "@/lib/dashboard/streak";
import { pickWeakAreas, type AccuracyBucket, type WeakArea } from "@/lib/dashboard/weakAreas";

export async function getWeakAreas(userId: string): Promise<WeakArea[]> {
  const attempts = await db.quizAttempt.findMany({
    where: { userId },
    select: {
      correct: true,
      question: {
        select: { difficulty: true, topicId: true, topic: { select: { name: true, slug: true } } },
      },
    },
  });

  const buckets = new Map<string, AccuracyBucket>();
  for (const a of attempts) {
    const key = `${a.question.topicId}:${a.question.difficulty}`;
    const bucket = buckets.get(key) ?? {
      topicId: a.question.topicId,
      topicSlug: a.question.topic.slug,
      topicName: a.question.topic.name,
      difficulty: a.question.difficulty,
      total: 0,
      correct: 0,
    };
    bucket.total += 1;
    if (a.correct) bucket.correct += 1;
    buckets.set(key, bucket);
  }

  return pickWeakAreas([...buckets.values()]);
}

export async function getStreak(userId: string): Promise<number> {
  const [quizAttempts, labCommandLogs, flashcardReviews] = await Promise.all([
    db.quizAttempt.findMany({ where: { userId }, select: { createdAt: true } }),
    db.labCommandLog.findMany({
      where: { session: { userId } },
      select: { createdAt: true },
    }),
    db.flashcardState.findMany({
      where: { userId, lastReviewedAt: { not: null } },
      select: { lastReviewedAt: true },
    }),
  ]);

  const dates = new Set<string>();
  for (const a of quizAttempts) dates.add(toDateKey(a.createdAt));
  for (const l of labCommandLogs) dates.add(toDateKey(l.createdAt));
  for (const f of flashcardReviews) {
    if (f.lastReviewedAt) dates.add(toDateKey(f.lastReviewedAt));
  }

  return computeStreak([...dates]);
}

export async function getDueFlashcardsCount(userId: string): Promise<number> {
  return db.flashcardState.count({ where: { userId, dueAt: { lte: new Date() } } });
}

export interface ContinueItem {
  href: string;
  label: string;
  meta: string;
}

/** Gợi ý "tiếp tục học": ưu tiên lab đang làm dở, sau đó thẻ cần ôn, cuối cùng đề xuất quiz. */
export async function getContinueLearning(userId: string): Promise<ContinueItem | null> {
  const inProgressLab = await db.labSession.findFirst({
    where: { userId, status: "IN_PROGRESS" },
    include: { scenario: true },
    orderBy: { startedAt: "desc" },
  });
  if (inProgressLab) {
    return {
      href: `/lab/${inProgressLab.id}`,
      label: inProgressLab.scenario.title,
      meta: "Lab đang làm dở",
    };
  }

  const dueCount = await getDueFlashcardsCount(userId);
  if (dueCount > 0) {
    return { href: "/flashcards", label: `${dueCount} thẻ cần ôn`, meta: "Flashcard" };
  }

  const topic = await db.topic.findFirst({ orderBy: { order: "asc" } });
  if (topic) {
    return {
      href: `/quiz/session?topicSlug=${topic.slug}&difficulty=EASY&count=10`,
      label: `Luyện quiz ${topic.name}`,
      meta: "Bắt đầu mới",
    };
  }

  return null;
}

/** Streak mọi user trong 3 query gộp (không N query theo số user) — dùng cho trang /team. */
export async function getTeamStreaks(): Promise<Map<string, number>> {
  const [quizAttempts, labCommandLogs, flashcardReviews] = await Promise.all([
    db.quizAttempt.findMany({ select: { userId: true, createdAt: true } }),
    db.labCommandLog.findMany({ select: { createdAt: true, session: { select: { userId: true } } } }),
    db.flashcardState.findMany({
      where: { lastReviewedAt: { not: null } },
      select: { userId: true, lastReviewedAt: true },
    }),
  ]);

  const datesByUser = new Map<string, Set<string>>();
  const addDate = (userId: string, date: Date) => {
    const set = datesByUser.get(userId) ?? new Set<string>();
    set.add(toDateKey(date));
    datesByUser.set(userId, set);
  };

  for (const a of quizAttempts) addDate(a.userId, a.createdAt);
  for (const l of labCommandLogs) addDate(l.session.userId, l.createdAt);
  for (const f of flashcardReviews) {
    if (f.lastReviewedAt) addDate(f.userId, f.lastReviewedAt);
  }

  const result = new Map<string, number>();
  for (const [userId, dates] of datesByUser) {
    result.set(userId, computeStreak([...dates]));
  }
  return result;
}
