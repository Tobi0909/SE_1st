import { FlashcardReview } from "@/components/flashcard/flashcard-review";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";

export default async function FlashcardsPage() {
  const user = await requireUser();

  const dueCards = await db.flashcardState.findMany({
    where: { userId: user.id, dueAt: { lte: new Date() } },
    include: { question: { include: { options: true, topic: true } } },
    orderBy: { dueAt: "asc" },
    take: 30,
  });

  const cards = dueCards
    .filter((c) => c.question.status === "ACTIVE")
    .map((c) => ({
      questionId: c.questionId,
      topicName: c.question.topic.name,
      stem: c.question.stem,
      options: c.question.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        explanation: o.explanation,
      })),
    }));

  return (
    <div className="max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold">Ôn hôm nay</h1>
      {cards.length === 0 ? (
        <p className="text-muted-foreground">
          Không có thẻ nào cần ôn hôm nay. Làm vài câu quiz để bắt đầu có thẻ ôn tập!
        </p>
      ) : (
        <FlashcardReview cards={cards} />
      )}
    </div>
  );
}
