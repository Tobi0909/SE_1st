import { db } from "@/lib/db";

export class RateLimitExceededError extends Error {
  constructor() {
    super("Đã vượt giới hạn gọi LLM trong 1 phút, vui lòng thử lại sau.");
  }
}

const WINDOW_MS = 60_000;

export async function assertWithinRateLimit(userId: string | null): Promise<void> {
  if (!userId) return;

  const limit = Number(process.env.RATE_LIMIT_PER_MINUTE ?? "20");
  const since = new Date(Date.now() - WINDOW_MS);

  const count = await db.llmUsageLog.count({
    where: { userId, createdAt: { gte: since } },
  });

  if (count >= limit) throw new RateLimitExceededError();
}
