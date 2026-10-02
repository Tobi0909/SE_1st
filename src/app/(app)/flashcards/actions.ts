"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { reviewSM2 } from "@/lib/sm2";

export async function reviewFlashcardAction(questionId: string, quality: number): Promise<void> {
  const user = await requireUser();

  const card = await db.flashcardState.findUniqueOrThrow({
    where: { userId_questionId: { userId: user.id, questionId } },
  });

  const result = reviewSM2(card, quality);

  await db.flashcardState.update({
    where: { id: card.id },
    data: {
      easeFactor: result.easeFactor,
      intervalDays: result.intervalDays,
      repetitions: result.repetitions,
      dueAt: result.dueAt,
      lastReviewedAt: new Date(),
    },
  });
}
