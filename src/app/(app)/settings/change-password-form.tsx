"use client";

import { useActionState, useRef } from "react";

import { changePasswordAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [result, formAction, isPending] = useActionState(
    async (prevState: string | undefined, formData: FormData) => {
      const res = await changePasswordAction(prevState, formData);
      if (res === "success") formRef.current?.reset();
      return res;
    },
    undefined,
  );

  const isSuccess = result === "success";

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="newPassword">Mật khẩu mới</Label>
        <Input id="newPassword" name="newPassword" type="password" minLength={8} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" minLength={8} required />
      </div>
      {result && !isSuccess ? <p className="text-sm text-destructive">{result}</p> : null}
      {isSuccess ? <p className="text-sm text-success">Đã đổi mật khẩu thành công</p> : null}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Đang lưu..." : "Đổi mật khẩu"}
      </Button>
    </form>
  );
}
