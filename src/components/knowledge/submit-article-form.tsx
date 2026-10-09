"use client";

import { useActionState } from "react";

import { submitArticleAction } from "@/app/(app)/knowledge/actions";
import { DOMAIN_LABEL, LEVEL_OPTIONS } from "@/components/knowledge/knowledge-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SubmitArticleForm() {
  const [error, formAction, isPending] = useActionState(submitArticleAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Tiêu đề</Label>
        <Input id="title" name="title" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="domain">Lĩnh vực</Label>
          <select
            id="domain"
            name="domain"
            required
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {Object.entries(DOMAIN_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="level">Cấp độ</Label>
          <select
            id="level"
            name="level"
            required
            className="h-9 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {LEVEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="module">Module</Label>
        <Input id="module" name="module" placeholder="vd: linux.users-permissions" required />
        <p className="text-xs text-muted-foreground">
          Theo quy ước dotted của kho tri thức (domain.module) nếu biết, không bắt buộc khớp
          taxonomy sẵn có — admin có thể chỉnh lại khi duyệt.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="content">Nội dung (Markdown)</Label>
        <textarea
          id="content"
          name="content"
          rows={16}
          required
          className="rounded-md border border-input bg-background p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sources">Nguồn tham khảo (mỗi dòng 1 link, không bắt buộc)</Label>
        <textarea
          id="sources"
          name="sources"
          rows={3}
          className="rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Đang nộp..." : "Nộp bài (chờ admin duyệt)"}
      </Button>
    </form>
  );
}
