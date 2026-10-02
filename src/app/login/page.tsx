import { LoginForm } from "@/app/login/login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/dashboard";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <LoginForm callbackUrl={callbackUrl} />
    </div>
  );
}
