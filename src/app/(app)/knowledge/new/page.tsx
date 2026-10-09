import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireUser } from "@/lib/rbac";
import { SubmitArticleForm } from "@/components/knowledge/submit-article-form";

export default async function NewArticlePage() {
  await requireUser();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link
        href="/knowledge"
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Kho tri thức
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Nộp bài viết mới</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bài nộp ở trạng thái DRAFT cho tới khi admin duyệt — chỉ bạn và admin xem được trong
          lúc chờ duyệt.
        </p>
      </div>

      <SubmitArticleForm />
    </div>
  );
}
