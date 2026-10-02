import { deleteUserAction, toggleRoleAction } from "@/app/(app)/admin/users/actions";
import { CreateUserForm } from "@/app/(app)/admin/users/create-user-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Quản lý user</h1>

      <Card>
        <CardHeader>
          <CardTitle>Tạo user mới</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateUserForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={u.role === "ADMIN" ? "default" : "outline"}>{u.role}</Badge>
                {u.id !== admin.id ? (
                  <>
                    <form action={toggleRoleAction.bind(null, u.id)}>
                      <Button type="submit" size="sm" variant="outline">
                        {u.role === "ADMIN" ? "Gỡ admin" : "Lên admin"}
                      </Button>
                    </form>
                    <form action={deleteUserAction.bind(null, u.id)}>
                      <Button type="submit" size="sm" variant="destructive">
                        Xoá
                      </Button>
                    </form>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">(bạn)</span>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
