import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getTeamStreaks } from "@/lib/dashboard/stats";
import { requireUser } from "@/lib/rbac";
import { getTeamProgress } from "@/lib/roadmap/progress";

export default async function TeamPage() {
  await requireUser();

  const [progress, streaks] = await Promise.all([getTeamProgress(), getTeamStreaks()]);
  const rows = progress
    .map((p) => ({ ...p, streak: streaks.get(p.user.id) ?? 0 }))
    .sort((a, b) => ratio(b) - ratio(a));

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Tổng quan team</h1>
      <Card>
        <CardHeader>
          <CardTitle>Tiến độ tổng (tất cả chủ đề)</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {rows.map(({ user, total, mastered, streak }) => (
            <div key={user.id} className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
              <div className="min-w-0">
                <p className="truncate font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <div className="flex items-center gap-4 text-sm whitespace-nowrap">
                <span className="text-muted-foreground">{streak} ngày streak</span>
                <span className="w-24">
                  <Progress value={total > 0 ? (mastered / total) * 100 : 0} />
                </span>
                <span className="w-12 text-right text-muted-foreground">
                  {mastered}/{total}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ratio(row: { total: number; mastered: number }): number {
  return row.total > 0 ? row.mastered / row.total : 0;
}
