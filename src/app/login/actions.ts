"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/lib/auth";

export async function loginAction(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: (formData.get("callbackUrl") as string) || "/dashboard",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return "Email hoặc mật khẩu không đúng.";
    }
    throw err;
  }
}
