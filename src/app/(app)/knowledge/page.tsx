import { Suspense } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { requireUser } from "@/lib/rbac";
import {
  getArticles,
  getArticleDomains,
  searchArticles,
} from "@/lib/knowledge/queries";
import { ArticleLevel } from "@/generated/prisma/client";
import { ArticleCard } from "@/components/knowledge/article-card";
import { KnowledgeFilters } from "@/components/knowledge/knowledge-filters";

const PAGE_SIZE = 20;

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;

  const query   = sp.q?.trim() ?? "";
  const domain  = sp.domain ?? "";
  const level   = (sp.level as ArticleLevel | undefined) ?? undefined;
  const page    = Math.max(1, Number(sp.page) || 1);

  const [domains, result] = await Promise.all([
    getArticleDomains(isAdmin),
    query
      ? searchArticles(query, isAdmin).then(items => ({ items, total: items.length }))
      : getArticles({ domain: domain || undefined, level, isAdmin, page, pageSize: PAGE_SIZE }),
  ]);

  const totalPages = Math.ceil(result.total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Kho tri thức</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} bài · tài liệu tham chiếu SE / DevOps / Security
          </p>
        </div>
        <Link
          href="/knowledge/new"
          className="shrink-0 rounded-md border border-border bg-muted/20 px-3 py-1.5 text-sm hover:border-primary/40 hover:text-foreground"
        >
          + Nộp tài liệu
        </Link>
      </div>

      <div className="flex gap-6">
        {/* Filter sidebar */}
        <aside className="w-52 shrink-0">
          <Suspense>
            <KnowledgeFilters domains={domains} isAdmin={isAdmin} />
          </Suspense>
        </aside>

        {/* Article list */}
        <div className="min-w-0 flex-1">
          {result.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {query ? `Không tìm thấy bài nào cho "${query}".` : "Chưa có bài viết."}
            </p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {result.items.map(article => (
                  <ArticleCard key={article.id} article={article} isAdmin={isAdmin} />
                ))}
              </div>

              {/* Pagination — only when not searching */}
              {!query && totalPages > 1 && (
                <div className="mt-4 flex items-center gap-2 text-sm">
                  {page > 1 && (
                    <Link
                      href={buildPageUrl(sp, page - 1)}
                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <ChevronLeft className="size-3.5" /> Trước
                    </Link>
                  )}
                  <span className="text-muted-foreground">
                    {page} / {totalPages}
                  </span>
                  {page < totalPages && (
                    <Link
                      href={buildPageUrl(sp, page + 1)}
                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      Sau <ChevronRight className="size-3.5" />
                    </Link>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function buildPageUrl(sp: Record<string, string>, page: number) {
  const params = new URLSearchParams(sp);
  params.set("page", String(page));
  return `/knowledge?${params.toString()}`;
}
