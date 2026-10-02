import { updateTopicAction } from "@/app/(app)/admin/topics/actions";
import { CreateTopicForm } from "@/app/(app)/admin/topics/create-topic-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export default async function AdminTopicsPage() {
  await requireAdmin();
  const topics = await db.topic.findMany({ orderBy: { order: "asc" } });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Quản lý chủ đề</h1>

      <Card>
        <CardHeader>
          <CardTitle>Thêm chủ đề mới</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateTopicForm />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {topics.map((topic) => (
          <Card key={topic.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {topic.name} <span className="font-normal text-muted-foreground">({topic.slug})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={updateTopicAction} className="flex flex-col gap-3">
                <input type="hidden" name="id" value={topic.id} />
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem]">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`name-${topic.id}`}>Tên</Label>
                    <Input id={`name-${topic.id}`} name="name" defaultValue={topic.name} required />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`description-${topic.id}`}>Mô tả</Label>
                    <Input
                      id={`description-${topic.id}`}
                      name="description"
                      defaultValue={topic.description ?? ""}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`order-${topic.id}`}>Thứ tự</Label>
                    <Input id={`order-${topic.id}`} name="order" type="number" defaultValue={topic.order} />
                  </div>
                </div>
                <Button type="submit" size="sm" variant="outline" className="self-start">
                  Lưu
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
