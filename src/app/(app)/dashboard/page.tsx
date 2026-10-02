import Link from "next/link";
import { Flame } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getStreak, getWeakAreas } from "@/lib/dashboard/stats";
import { requireUser } from "@/lib/rbac";
import { getAllTopicsProgress } from "@/lib/roadmap/progress";

const DIFFICULTY_LABEL: Record<string, string> = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [topicsProgress, weakAreas, streak] = await Promise.all([
    getAllTopicsProgress(user.id),
    getWeakAreas(user.id),
    getStreak(user.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Chào {user.name} 👋</h1>
        <div className="flex items-center gap-1 text-sm font-medium text-orange-600">
          <Flame className="size-4" />
          {streak} ngày streak
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Tiến độ theo chủ đề</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {topicsProgress.map(({ topic, total, mastered, generated }) => (
              <Link key={topic.id} href={`/roadmap/${topic.slug}`} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{topic.name}</span>
                  <span className="text-muted-foreground">
                    {generated ? `${mastered}/${total}` : "Chưa có roadmap"}
                  </span>
                </div>
                <Progress value={generated && total > 0 ? (mastered / total) * 100 : 0} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Điểm yếu cần ôn</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {weakAreas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa đủ dữ liệu — làm vài bài quiz để thấy điểm yếu nhé.
              </p>
            ) : (
              weakAreas.map((area) => (
                <Link
                  key={`${area.topicId}:${area.difficulty}`}
                  href={`/quiz/session?topicSlug=${area.topicSlug}&difficulty=${area.difficulty}&count=10`}
                  className="flex items-center justify-between rounded-md border p-2 text-sm hover:bg-accent"
                >
                  <span>
                    {area.topicName} <Badge variant="outline">{DIFFICULTY_LABEL[area.difficulty]}</Badge>
                  </span>
                  <span className="text-muted-foreground">{Math.round(area.accuracy * 100)}%</span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
