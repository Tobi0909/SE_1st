import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, CheckCircle, Clock, ExternalLink } from "lucide-react";

import { verifyArticleAction } from "@/app/(app)/knowledge/actions";
import { requireUser } from "@/lib/rbac";
import { getArticle } from "@/lib/knowledge/queries";
import { ArticleBody } from "@/components/knowledge/article-body";
import { Button } from "@/components/ui/button";

const LEVEL_LABEL: Record<string, string> = {
  FOUNDATION: "Nền tảng",
  OPERATION:  "Vận hành",
  EXPERT:     "Chuyên sâu",
};

const LEVEL_STYLE: Record<string, string> = {
  FOUNDATION: "bg-info/10 text-info border-info/20",
  OPERATION:  "bg-warning/10 text-warning border-warning/20",
  EXPERT:     "bg-destructive/10 text-destructive border-destructive/20",
};

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ knowledgeId: string }>;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const { knowledgeId: encoded } = await params;
  const knowledgeId = decodeURIComponent(encoded);

  const article = await getArticle(knowledgeId, isAdmin, user.id);
  if (!article) notFound();

  // Breadcrumb: domain.module.lesson → ["domain", "module", "lesson"]
  const parts = knowledgeId.split(".");
  const [domainPart, modulePart] = parts;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {/* Back link */}
      <Link
        href="/knowledge"
        className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Kho tri thức
      </Link>

      <div className="flex gap-6">
        {/* Main content */}
        <article className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-6 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{domainPart}</span>
              <span>›</span>
              <span>{modulePart}</span>
            </div>

            <h1 className="text-xl font-semibold leading-snug text-foreground">
              {article.title}
            </h1>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded border px-2 py-0.5 text-xs ${LEVEL_STYLE[article.level] ?? "border-border bg-muted/30 text-muted-foreground"}`}
              >
                {LEVEL_LABEL[article.level] ?? article.level}
              </span>

              {article.status === "DRAFT" && (isAdmin || article.submittedBy === user.id) && (
                <span className="rounded border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs text-warning">
                  DRAFT{article.submittedBy && article.submittedBy !== user.id ? " · chờ duyệt" : ""}
                </span>
              )}

              {article.status === "DRAFT" && isAdmin && (
                <form action={verifyArticleAction.bind(null, article.id)}>
                  <Button type="submit" size="sm" variant="outline">
                    Duyệt bài
                  </Button>
                </form>
              )}

              {article.status === "VERIFIED" && (
                <span className="flex items-center gap-1 text-xs text-success">
                  <CheckCircle className="size-3" /> Verified
                </span>
              )}

              {article.lastVerified && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  {article.lastVerified.toLocaleDateString("vi-VN")}
                </span>
              )}

              {isAdmin && article.todoVerifyCount > 0 && (
                <span className="rounded bg-warning/10 px-2 py-0.5 text-xs text-warning">
                  {article.todoVerifyCount} TODO-VERIFY
                </span>
              )}
            </div>
          </div>

          {/* Markdown body */}
          <ArticleBody content={article.content} />

          {/* Sources */}
          {article.sources.length > 0 && (
            <div className="mt-8 border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Nguồn tham khảo</p>
              <ul className="flex flex-col gap-1">
                {article.sources.map(src => (
                  <li key={src}>
                    <a
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="size-3 shrink-0" />
                      {src}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>

        {/* Sidebar */}
        <aside className="hidden w-52 shrink-0 xl:flex xl:flex-col xl:gap-5">
          {/* Prerequisites */}
          {article.prerequisites.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Cần đọc trước</p>
              <ul className="flex flex-col gap-1">
                {article.prerequisites.map(prereq => (
                  <li key={prereq}>
                    <Link
                      href={`/knowledge/${encodeURIComponent(prereq)}`}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <BookOpen className="size-3 shrink-0" />
                      <span className="truncate">{prereq.split(".").pop()?.replace(/-/g, " ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Linked skill nodes */}
          {article.skillNodeLinks.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Roadmap liên quan</p>
              <ul className="flex flex-col gap-1">
                {article.skillNodeLinks.map(({ skillNodeId, skillNode }) => (
                  <li key={skillNodeId}>
                    <Link
                      href={`/roadmap`}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <span className="truncate">{skillNode.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Source path — admin only */}
          {isAdmin && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">File nguồn</p>
              <p className="font-mono text-xs text-muted-foreground break-all">
                {article.sourcePath}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
