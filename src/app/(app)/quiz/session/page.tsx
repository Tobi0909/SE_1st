import { notFound } from "next/navigation";

import { QuizSession } from "@/components/quiz/quiz-session";
import type { Difficulty } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ensureQuestionPool, pickRandomQuestions } from "@/lib/quiz/questionPool";
import { requireUser } from "@/lib/rbac";

const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];

export default async function QuizSessionPage({ searchParams }: PageProps<"/quiz/session">) {
  const user = await requireUser();
  const params = await searchParams;

  const topicSlug = typeof params.topicSlug === "string" ? params.topicSlug : undefined;
  const difficultyRaw = typeof params.difficulty === "string" ? params.difficulty : undefined;
  const count = Math.min(Math.max(Number(params.count) || 10, 1), 30);

  if (!topicSlug || !difficultyRaw || !DIFFICULTIES.includes(difficultyRaw as Difficulty)) {
    notFound();
  }
  const difficulty = difficultyRaw as Difficulty;

  const topic = await db.topic.findUnique({ where: { slug: topicSlug } });
  if (!topic) notFound();

  await ensureQuestionPool(topic.id, difficulty, count, user.id);
  const questions = await pickRandomQuestions(topic.id, difficulty, count);

  if (questions.length === 0) {
    return (
      <p className="text-muted-foreground">
        Chưa sinh được câu hỏi nào cho chủ đề/độ khó này. Vui lòng thử lại.
      </p>
    );
  }

  return (
    <div className="max-w-2xl">
      <QuizSession
        topicName={topic.name}
        difficulty={difficulty}
        questions={questions.map((q) => ({
          id: q.id,
          stem: q.stem,
          options: q.options.map((o) => ({ id: o.id, text: o.text })),
        }))}
      />
    </div>
  );
}
