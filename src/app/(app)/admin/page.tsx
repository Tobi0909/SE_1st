import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/rbac";

const SECTIONS = [
  {
    title: "User",
    description: "Tạo user mới, đổi role, xoá user.",
    href: "/admin/users",
  },
  {
    title: "Chủ đề",
    description: "Thêm chủ đề, sửa tên/mô tả/thứ tự hiển thị.",
    href: "/admin/topics",
  },
  {
    title: "Câu hỏi bị báo sai",
    description: "Xem và xử lý các câu bị member báo sai khi làm quiz.",
    href: "/admin/flagged",
  },
  {
    title: "Thống kê gọi LLM",
    description: "Số lượt gọi, tỉ lệ thành công, token usage theo từng tính năng.",
    href: "/admin/usage",
  },
];

export default async function AdminPage() {
  await requireAdmin();

  return (
    <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
      {SECTIONS.map((s) => (
        <Card key={s.href}>
          <CardHeader>
            <CardTitle className="text-base">{s.title}</CardTitle>
            <CardDescription>{s.description}</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <Button asChild variant="outline">
              <Link href={s.href}>Mở</Link>
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
