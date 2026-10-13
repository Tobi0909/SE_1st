import { deleteUserAction, toggleRoleAction } from "@/app/(app)/admin/users/actions";
import { CreateUserForm } from "@/app/(app)/admin/users/create-user-form";
import { ResetPasswordForm } from "@/app/(app)/admin/users/reset-password-form";
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
          {users.map((u) => {
            const isSelf = u.id === admin.id;
            const isOwner = u.role === "OWNER";
            // Hạ quyền/xoá/đổi mật khẩu 1 admin khác chỉ dành cho OWNER.
            const canManage = !isSelf && !isOwner && (u.role !== "ADMIN" || admin.role === "OWNER");

            return (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-2 last:border-0">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={u.role === "OWNER" ? "default" : u.role === "ADMIN" ? "secondary" : "outline"}>
                    {u.role}
                  </Badge>
                  {isSelf ? (
                    <span className="text-xs text-muted-foreground">(bạn)</span>
                  ) : isOwner ? (
                    <span className="text-xs text-muted-foreground">(chủ sở hữu)</span>
                  ) : canManage ? (
                    <>
                      <form action={toggleRoleAction.bind(null, u.id)}>
                        <Button type="submit" size="sm" variant="outline">
                          {u.role === "ADMIN" ? "Gỡ admin" : "Lên admin"}
                        </Button>
                      </form>
                      <ResetPasswordForm userId={u.id} />
                      <form action={deleteUserAction.bind(null, u.id)}>
                        <Button type="submit" size="sm" variant="destructive">
                          Xoá
                        </Button>
                      </form>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">(chỉ chủ sở hữu mới quản lý được)</span>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
