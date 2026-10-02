import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function QuizPage() {
  const topics = await db.topic.findMany({ orderBy: { order: "asc" } });

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Luyện quiz</CardTitle>
      </CardHeader>
      <CardContent>
        {topics.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có chủ đề nào. Hãy chạy seed script (`pnpm db:seed`) trước.
          </p>
        ) : (
          <form action="/quiz/session" className="flex flex-col gap-4">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="count">Số câu</Label>
              <select id="count" name="count" required defaultValue="10" className={SELECT_CLASS}>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="15">15</option>
                <option value="20">20</option>
              </select>
            </div>
            <Button type="submit">Bắt đầu</Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
