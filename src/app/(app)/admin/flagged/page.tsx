import { hideQuestionAction, resolveFlagAction } from "@/app/(app)/admin/flagged/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export default async function FlaggedQuestionsPage() {
  await requireAdmin();

  const flaggedQuestions = await db.question.findMany({
    where: { status: "FLAGGED" },
    include: {
      options: true,
      topic: true,
      flags: { where: { resolved: false }, include: { user: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Câu hỏi bị báo sai ({flaggedQuestions.length})</h1>
      {flaggedQuestions.length === 0 ? (
        <p className="text-muted-foreground">Không có câu nào đang bị báo.</p>
      ) : null}
      {flaggedQuestions.map((q) => (
        <Card key={q.id}>
          <CardHeader>
            <CardTitle className="text-base">
              {q.topic.name} · {q.difficulty}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p>{q.stem}</p>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {q.flags.map((f) => (
                <li key={f.id}>
                  Báo bởi {f.user.name}
                  {f.reason ? `: ${f.reason}` : ""}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <form action={resolveFlagAction.bind(null, q.id)}>
                <Button type="submit" variant="outline">
                  Khôi phục (không lỗi)
                </Button>
              </form>
              <form action={hideQuestionAction.bind(null, q.id)}>
                <Button type="submit" variant="destructive">
                  Ẩn vĩnh viễn
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
