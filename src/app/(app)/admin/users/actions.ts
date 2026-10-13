"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { requireAdmin } from "@/lib/rbac";

const ResetPasswordSchema = z.object({
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
});

const CreateUserSchema = z.object({
  email: z.email("Email không hợp lệ"),
  name: z.string().min(1, "Tên không được để trống"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export async function createUserAction(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  await requireAdmin();

  const parsed = CreateUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ";

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return "Email đã tồn tại";

  const passwordHash = await hashPassword(parsed.data.password);
  await db.user.create({
    data: {
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      role: parsed.data.role,
    },
  });

  revalidatePath("/admin/users");
  return undefined;
}

export async function toggleRoleAction(userId: string): Promise<void> {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("Không thể tự đổi role của chính mình");

  const target = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role === "OWNER") throw new Error("Không thể đổi role của chủ sở hữu");
  // Hạ quyền 1 admin (ADMIN -> MEMBER) chỉ dành cho OWNER, tránh 1 admin bất kỳ tự do hạ
  // quyền admin khác. Thăng quyền (MEMBER -> ADMIN) thì admin thường vẫn làm được.
  if (target.role === "ADMIN" && admin.role !== "OWNER") {
    throw new Error("Chỉ chủ sở hữu mới được hạ quyền admin");
  }

  await db.user.update({
    where: { id: userId },
    data: { role: target.role === "ADMIN" ? "MEMBER" : "ADMIN" },
  });

  revalidatePath("/admin/users");
}

export async function deleteUserAction(userId: string): Promise<void> {
  const admin = await requireAdmin();
  if (userId === admin.id) throw new Error("Không thể tự xoá chính mình");

  const target = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role === "OWNER") throw new Error("Không thể xoá chủ sở hữu");
  if (target.role === "ADMIN" && admin.role !== "OWNER") {
    throw new Error("Chỉ chủ sở hữu mới được xoá admin");
  }

  await db.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
}

export async function resetPasswordAction(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const admin = await requireAdmin();

  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId) return "Thiếu user";
  if (userId === admin.id) return "Dùng trang Cài đặt tài khoản để đổi mật khẩu của chính mình";

  const parsed = ResetPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ";

  const target = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (target.role === "OWNER") return "Không thể đổi mật khẩu chủ sở hữu";
  if (target.role === "ADMIN" && admin.role !== "OWNER") {
    return "Chỉ chủ sở hữu mới được đổi mật khẩu admin khác";
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.user.update({ where: { id: userId }, data: { passwordHash } });

  revalidatePath("/admin/users");
  return "success";
}
