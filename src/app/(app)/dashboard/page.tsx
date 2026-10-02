import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/rbac";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Chào {user.name} 👋</h1>
      <Card>
        <CardHeader>
          <CardTitle>Dashboard đang được xây dựng</CardTitle>
          <CardDescription>
            Tiến độ theo chủ đề, điểm yếu, streak sẽ có ở giai đoạn Roadmap &amp; Dashboard (GĐ4).
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
