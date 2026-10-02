import type { Role } from "@/generated/prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: Role;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

// `next-auth/jwt` re-exports `JWT` từ `@auth/core/jwt` qua `export *`, nên module
// augmentation ở đây không merge được (chỉ named re-export mới merge). Vì vậy
// id/role trên JWT được đọc qua ép kiểu rõ ràng trong lib/auth.ts, không dựa vào
// augmentation này.
