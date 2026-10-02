import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/rbac";

export default async function AdminPage() {
  await requireAdmin();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trang quản trị đang được xây dựng</CardTitle>
        <CardDescription>
          Quản lý user, chủ đề, nội dung bị báo sai, thống kê gọi LLM sẽ có ở GĐ5.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
