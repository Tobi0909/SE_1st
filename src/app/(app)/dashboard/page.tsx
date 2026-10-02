import Link from "next/link";
import { Flame, Layers, Target } from "lucide-react";

import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";
import { ContinueLearning } from "@/components/dashboard/continue-learning";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getActivityHeatmap } from "@/lib/dashboard/activity";
import { getContinueLearning, getDueFlashcardsCount, getStreak, getWeakAreas } from "@/lib/dashboard/stats";
import { requireUser } from "@/lib/rbac";
import { getAllTopicsProgress } from "@/lib/roadmap/progress";

const DIFFICULTY_LABEL: Record<string, string> = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [topicsProgress, weakAreas, streak, dueFlashcards, continueItem, activity] = await Promise.all([
    getAllTopicsProgress(user.id),
    getWeakAreas(user.id),
    getStreak(user.id),
    getDueFlashcardsCount(user.id),
    getContinueLearning(user.id),
    getActivityHeatmap(user.id),
  ]);

  const overallTotal = topicsProgress.reduce((sum, t) => sum + t.total, 0);
  const overallMastered = topicsProgress.reduce((sum, t) => sum + t.mastered, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Chào, {user.name}</h1>
        <p className="text-sm text-muted-foreground">Tổng quan tiến độ luyện tập của bạn.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Streak" value={`${streak} ngày`} icon={Flame} tone="accent" />
        <StatTile label="Thẻ cần ôn" value={dueFlashcards} icon={Layers} />
        <StatTile
          label="Tiến độ tổng"
          value={overallTotal > 0 ? `${overallMastered}/${overallTotal}` : "—"}
          icon={Target}
        />
      </div>

      {continueItem ? (
        <div>
          <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Tiếp tục học
          </h2>
          <ContinueLearning item={continueItem} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <section className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium">Hoạt động 18 tuần qua</h2>
            <ActivityHeatmap data={activity} />
          </section>

          <section className="rounded-md border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-medium">Tiến độ theo chủ đề</h2>
            <div className="flex flex-col gap-3">
              {topicsProgress.map(({ topic, total, mastered, generated }) => (
                <Link key={topic.id} href={`/roadmap/${topic.slug}`} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span>{topic.name}</span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {generated ? `${mastered}/${total}` : "Chưa có roadmap"}
                    </span>
                  </div>
                  <Progress value={generated && total > 0 ? (mastered / total) * 100 : 0} className="h-1.5" />
                </Link>
              ))}
            </div>
          </section>
        </div>

        <section className="h-fit rounded-md border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium">Điểm yếu cần ôn</h2>
          <div className="flex flex-col gap-2">
            {weakAreas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa đủ dữ liệu — làm vài bài quiz để thấy điểm yếu nhé.
              </p>
            ) : (
              weakAreas.map((area) => (
                <Link
                  key={`${area.topicId}:${area.difficulty}`}
                  href={`/quiz/session?topicSlug=${area.topicSlug}&difficulty=${area.difficulty}&count=10`}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  <span className="flex items-center gap-2">
                    {area.topicName}
                    <Badge variant="outline">{DIFFICULTY_LABEL[area.difficulty]}</Badge>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {Math.round(area.accuracy * 100)}%
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
