"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { INITIAL_SM2_STATE } from "@/lib/sm2";
import { requireUser } from "@/lib/rbac";

export interface AnswerFeedback {
  correct: boolean;
  options: { id: string; isCorrect: boolean; explanation: string }[];
}

export async function recordAnswerAction(
  questionId: string,
  selectedOptionId: string,
): Promise<AnswerFeedback> {
  const user = await requireUser();

  const question = await db.question.findUniqueOrThrow({
    where: { id: questionId },
    include: { options: true },
  });
  const selected = question.options.find((o) => o.id === selectedOptionId);
  if (!selected) throw new Error("selectedOptionId không thuộc câu hỏi này");

  await db.quizAttempt.create({
    data: { userId: user.id, questionId, selectedOptionId, correct: selected.isCorrect },
  });

  await db.flashcardState.upsert({
    where: { userId_questionId: { userId: user.id, questionId } },
    update: {},
    create: { userId: user.id, questionId, ...INITIAL_SM2_STATE, dueAt: new Date() },
  });

  return {
    correct: selected.isCorrect,
    options: question.options.map((o) => ({
      id: o.id,
      isCorrect: o.isCorrect,
      explanation: o.explanation,
    })),
  };
}

export async function flagQuestionAction(questionId: string, reason: string): Promise<void> {
  const user = await requireUser();

  await db.questionFlag.create({
    data: { questionId, userId: user.id, reason: reason || null },
  });
  await db.question.update({ where: { id: questionId }, data: { status: "FLAGGED" } });
  revalidatePath("/admin/flagged");
}
