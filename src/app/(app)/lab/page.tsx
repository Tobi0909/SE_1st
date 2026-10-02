import Link from "next/link";

import { startLabAction } from "@/app/(app)/lab/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function LabPage() {
  const user = await requireUser();
  const [topics, inProgress] = await Promise.all([
    db.topic.findMany({ orderBy: { order: "asc" } }),
    db.labSession.findMany({
      where: { userId: user.id, status: "IN_PROGRESS" },
      include: { scenario: true },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div className="flex max-w-md flex-col gap-6">
      {inProgress.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Lab đang làm dở</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {inProgress.map((s) => (
              <Button key={s.id} asChild variant="outline" className="justify-start">
                <Link href={`/lab/${s.id}`}>{s.scenario.title}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Lab troubleshooting mới</CardTitle>
        </CardHeader>
        <CardContent>
          {topics.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có chủ đề nào. Hãy chạy seed script (`pnpm db:seed`) trước.
            </p>
          ) : (
            <form action={startLabAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="topicSlug">Chủ đề</Label>
                <select id="topicSlug" name="topicSlug" required defaultValue={topics[0].slug} className={SELECT_CLASS}>
                  {topics.map((t) => (
                    <option key={t.id} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="difficulty">Độ khó</Label>
                <select id="difficulty" name="difficulty" required defaultValue="EASY" className={SELECT_CLASS}>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>
              <Button type="submit">Bắt đầu lab</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
