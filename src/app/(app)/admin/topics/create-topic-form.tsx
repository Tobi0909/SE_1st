"use client";

import { useActionState } from "react";

import { createTopicAction } from "@/app/(app)/admin/topics/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateTopicForm() {
  const [error, formAction, isPending] = useActionState(createTopicAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="slug">Slug</Label>
          <Input id="slug" name="slug" placeholder="vd: kubernetes" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Tên</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="description">Mô tả</Label>
          <Input id="description" name="description" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="order">Thứ tự hiển thị</Label>
          <Input id="order" name="order" type="number" defaultValue={0} />
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Đang tạo..." : "Tạo chủ đề"}
      </Button>
    </form>
  );
}
