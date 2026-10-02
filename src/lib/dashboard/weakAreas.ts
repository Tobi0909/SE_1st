import type { Difficulty } from "@/generated/prisma/client";

export interface AccuracyBucket {
  topicId: string;
  topicSlug: string;
  topicName: string;
  difficulty: Difficulty;
  total: number;
  correct: number;
}

export interface WeakArea extends AccuracyBucket {
  accuracy: number;
}

/** Chọn ra các bucket (chủ đề + độ khó) có accuracy thấp nhất, bỏ qua bucket chưa đủ dữ liệu. */
export function pickWeakAreas(
  buckets: AccuracyBucket[],
  opts: { minAttempts?: number; limit?: number } = {},
): WeakArea[] {
  const minAttempts = opts.minAttempts ?? 3;
  const limit = opts.limit ?? 3;

  return buckets
    .filter((b) => b.total >= minAttempts)
    .map((b) => ({ ...b, accuracy: b.correct / b.total }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}
