import { db } from "@/lib/db";
import { toDateKey } from "@/lib/dashboard/streak";

export interface ActivityDay {
  date: string;
  count: number;
}

/** Số hoạt động theo từng ngày trong `days` ngày gần nhất (dùng cho heatmap kiểu GitHub).
 * Cùng nguồn dữ liệu với `getStreak` (QuizAttempt, LabCommandLog, FlashcardState) nhưng đếm
 * số lượng thay vì chỉ "có/không". */
export async function getActivityHeatmap(userId: string, days = 126): Promise<ActivityDay[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);

  const [quizAttempts, labCommandLogs, flashcardReviews] = await Promise.all([
    db.quizAttempt.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    db.labCommandLog.findMany({
      where: { session: { userId }, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    db.flashcardState.findMany({
      where: { userId, lastReviewedAt: { gte: since } },
      select: { lastReviewedAt: true },
    }),
  ]);

  const counts = new Map<string, number>();
  const bump = (date: Date) => {
    const key = toDateKey(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const a of quizAttempts) bump(a.createdAt);
  for (const l of labCommandLogs) bump(l.createdAt);
  for (const f of flashcardReviews) {
    if (f.lastReviewedAt) bump(f.lastReviewedAt);
  }

  const result: ActivityDay[] = [];
  const cursor = new Date(since);
  for (let i = 0; i < days; i++) {
    const key = toDateKey(cursor);
    result.push({ date: key, count: counts.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}
