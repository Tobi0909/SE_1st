import type { Role } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
  }
}

/** OWNER là cấp cao hơn ADMIN (vẫn đi qua mọi gate dành cho ADMIN). */
export function isAdminRole(role: Role): boolean {
  return role === "ADMIN" || role === "OWNER";
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdminRole(user.role)) throw new ForbiddenError();
  return user;
}

export async function requireOwner() {
  const user = await requireUser();
  if (user.role !== "OWNER") throw new ForbiddenError();
  return user;
}
