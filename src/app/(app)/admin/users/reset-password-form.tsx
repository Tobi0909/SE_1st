"use client";

import { useActionState, useRef, useState } from "react";

import { resetPasswordAction } from "@/app/(app)/admin/users/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [result, formAction, isPending] = useActionState(
    async (prevState: string | undefined, formData: FormData) => {
      const res = await resetPasswordAction(prevState, formData);
      if (res === "success") {
        formRef.current?.reset();
        setOpen(false);
      }
      return res;
    },
    undefined,
  );

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Đặt lại mật khẩu
      </Button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <Input
        name="password"
        type="password"
        minLength={8}
        required
        placeholder="Mật khẩu mới"
        className="h-8 w-40"
      />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "..." : "Lưu"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Hủy
      </Button>
      {result && result !== "success" ? <p className="text-xs text-destructive">{result}</p> : null}
    </form>
  );
}
