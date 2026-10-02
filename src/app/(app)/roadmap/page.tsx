import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireUser } from "@/lib/rbac";
import { getAllTopicsProgress } from "@/lib/roadmap/progress";

export default async function RoadmapPage() {
  const user = await requireUser();
  const items = await getAllTopicsProgress(user.id);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Roadmap</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(({ topic, total, mastered, generated }) => (
          <Link key={topic.id} href={`/roadmap/${topic.slug}`}>
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="text-base">{topic.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {generated ? (
                  <div className="flex flex-col gap-2">
                    <Progress value={total > 0 ? (mastered / total) * 100 : 0} />
                    <p className="text-xs text-muted-foreground">
                      {mastered}/{total} kỹ năng đã thành thạo
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Chưa có roadmap — bấm để tạo</p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
