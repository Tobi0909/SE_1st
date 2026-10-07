import { db } from "@/lib/db";
import { ArticleLevel, ArticleStatus } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";

export type ArticleListItem = {
  id: string;
  knowledgeId: string;
  title: string;
  domain: string;
  module: string;
  level: ArticleLevel;
  status: ArticleStatus;
  todoVerifyCount: number;
  lastVerified: Date | null;
};

export type ArticleDetail = ArticleListItem & {
  content: string;
  prerequisites: string[];
  appliesTo: string[];
  sources: string[];
  sourcePath: string;
  embeddingModel: string | null;
  skillNodeLinks: { skillNodeId: string; skillNode: { title: string; topicId: string } }[];
};

const LIST_SELECT = {
  id: true,
  knowledgeId: true,
  title: true,
  domain: true,
  module: true,
  level: true,
  status: true,
  todoVerifyCount: true,
  lastVerified: true,
} satisfies Prisma.ArticleSelect;

export type GetArticlesOptions = {
  domain?: string;
  module?: string;
  level?: ArticleLevel;
  isAdmin?: boolean;
  page?: number;
  pageSize?: number;
  orderBy?: "title" | "lastVerified" | "level";
};

export async function getArticles(opts: GetArticlesOptions = {}): Promise<{
  items: ArticleListItem[];
  total: number;
}> {
  const { domain, module, level, isAdmin = false, page = 1, pageSize = 20, orderBy = "level" } = opts;

  const where: Prisma.ArticleWhereInput = {
    ...(domain ? { domain } : {}),
    ...(module ? { module } : {}),
    ...(level ? { level } : {}),
    ...(!isAdmin ? { status: ArticleStatus.VERIFIED } : {}),
  };

  const levelOrder: Record<ArticleLevel, number> = {
    FOUNDATION: 0,
    OPERATION:  1,
    EXPERT:     2,
  };

  const orderByClause: Prisma.ArticleOrderByWithRelationInput =
    orderBy === "lastVerified" ? { lastVerified: "desc" } :
    orderBy === "title"        ? { title: "asc" } :
    { level: "asc" };

  const [items, total] = await Promise.all([
    db.article.findMany({
      where,
      select: LIST_SELECT,
      orderBy: orderByClause,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.article.count({ where }),
  ]);

  // Sort FOUNDATION→OPERATION→EXPERT when orderBy=level (Prisma sorts enums alphabetically)
  if (orderBy === "level") {
    items.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
  }

  return { items, total };
}

export async function getArticle(
  knowledgeId: string,
  isAdmin = false,
): Promise<ArticleDetail | null> {
  const article = await db.article.findUnique({
    where: { knowledgeId },
    include: {
      skillNodeLinks: {
        include: { skillNode: { select: { title: true, topicId: true } } },
      },
    },
  });

  if (!article) return null;
  if (!isAdmin && article.status === ArticleStatus.DRAFT) return null;

  return article as ArticleDetail;
}

/** Full-text search using tsvector. Returns list items ranked by relevance. */
export async function searchArticles(
  query: string,
  isAdmin = false,
): Promise<ArticleListItem[]> {
  if (!query.trim()) return [];

  // Remove chars that break tsquery; keep letters (incl. diacritics) + digits + spaces
  const sanitized = query.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  if (!sanitized) return [];

  if (isAdmin) {
    return db.$queryRaw<ArticleListItem[]>`
      SELECT id, "knowledgeId", title, domain, module, level, status,
             "todoVerifyCount", "lastVerified"
      FROM articles,
           websearch_to_tsquery('simple', unaccent(${sanitized})) query
      WHERE search_vector @@ query
      ORDER BY ts_rank(search_vector, query) DESC
      LIMIT 40
    `;
  }

  return db.$queryRaw<ArticleListItem[]>`
    SELECT id, "knowledgeId", title, domain, module, level, status,
           "todoVerifyCount", "lastVerified"
    FROM articles,
         websearch_to_tsquery('simple', unaccent(${sanitized})) query
    WHERE search_vector @@ query
      AND status = 'VERIFIED'
    ORDER BY ts_rank(search_vector, query) DESC
    LIMIT 40
  `;
}

/** Runtime filter: articles in same domain+level — for quiz/lab "đọc thêm" links. */
export async function getRelatedArticles(
  domain: string,
  level: ArticleLevel,
  limit = 3,
): Promise<ArticleListItem[]> {
  return db.article.findMany({
    where: { domain, level, status: ArticleStatus.VERIFIED },
    select: LIST_SELECT,
    take: limit,
    orderBy: { title: "asc" },
  });
}

// Maps topic slugs (from Topic.slug) to knowledge domain values
const TOPIC_SLUG_TO_DOMAIN: Record<string, string> = {
  linux:                "linux",
  networking:           "networking",
  virtualization:       "virt-storage",
  container:            "container-k8s",
  "monitoring-logging": "monitoring",
  "cicd-iac":           "devops",
  "security-hardening": "security",
  sre:                  "sre",
  data:                 "data",
};

const DIFFICULTY_TO_LEVEL: Record<string, ArticleLevel> = {
  EASY:   ArticleLevel.FOUNDATION,
  MEDIUM: ArticleLevel.OPERATION,
  HARD:   ArticleLevel.EXPERT,
};

/** Fetch articles matching a topic slug + difficulty — for quiz/lab "Đọc thêm" links. */
export async function getArticlesForTopic(
  topicSlug: string,
  difficulty: string,
  limit = 3,
): Promise<ArticleListItem[]> {
  const domain = TOPIC_SLUG_TO_DOMAIN[topicSlug];
  const level  = DIFFICULTY_TO_LEVEL[difficulty];
  if (!domain || !level) return [];
  return getRelatedArticles(domain, level, limit);
}

/** Distinct domain values for filter sidebar. */
export async function getArticleDomains(isAdmin = false): Promise<string[]> {
  const rows = await db.article.findMany({
    where: isAdmin ? {} : { status: ArticleStatus.VERIFIED },
    select: { domain: true },
    distinct: ["domain"],
    orderBy: { domain: "asc" },
  });
  return rows.map(r => r.domain);
}
