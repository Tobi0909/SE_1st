import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { auth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const user = session?.user;

  if (!user) return children;

  return (
    <AppShell name={user.name ?? "User"} email={user.email ?? ""} isAdmin={user.role === "ADMIN"}>
      {children}
    </AppShell>
  );
}
