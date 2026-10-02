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
