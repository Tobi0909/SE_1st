import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/rbac";

export default async function AdminPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Câu hỏi bị báo sai</CardTitle>
          <CardDescription>Xem và xử lý các câu bị member báo sai khi làm quiz.</CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <Button asChild variant="outline">
            <Link href="/admin/flagged">Xem danh sách</Link>
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Quản lý user, chủ đề, thống kê gọi LLM</CardTitle>
          <CardDescription>Sẽ có ở GĐ5.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
