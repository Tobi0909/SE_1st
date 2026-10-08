-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ArticleLevel" AS ENUM ('FOUNDATION', 'OPERATION', 'EXPERT');

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "knowledgeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "level" "ArticleLevel" NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "sourcePath" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "prerequisites" TEXT[],
    "appliesTo" TEXT[],
    "sources" TEXT[],
    "lastVerified" TIMESTAMP(3),
    "todoVerifyCount" INTEGER NOT NULL DEFAULT 0,
    "embeddingModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_skill_nodes" (
    "articleId" TEXT NOT NULL,
    "skillNodeId" TEXT NOT NULL,

    CONSTRAINT "article_skill_nodes_pkey" PRIMARY KEY ("articleId","skillNodeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "articles_knowledgeId_key" ON "articles"("knowledgeId");

-- CreateIndex
CREATE INDEX "articles_domain_module_idx" ON "articles"("domain", "module");

-- CreateIndex
CREATE INDEX "articles_status_level_idx" ON "articles"("status", "level");

-- AddForeignKey
ALTER TABLE "article_skill_nodes" ADD CONSTRAINT "article_skill_nodes_articleId_fkey"
    FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_skill_nodes" ADD CONSTRAINT "article_skill_nodes_skillNodeId_fkey"
    FOREIGN KEY ("skillNodeId") REFERENCES "skill_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Full-text search: unaccent extension + generated tsvector column + GIN index
-- config 'simple': no stemming — preserves technical terms and Vietnamese text
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() is only STABLE (phụ thuộc dictionary), Postgres không cho dùng trực
-- tiếp trong cột GENERATED STORED (yêu cầu IMMUTABLE). Bọc qua 1 hàm SQL tự khai
-- IMMUTABLE — an toàn vì dictionary 'unaccent' không đổi lúc runtime.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
    RETURNS text AS $$
        SELECT unaccent('unaccent', $1)
    $$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

ALTER TABLE "articles"
    ADD COLUMN "search_vector" tsvector
        GENERATED ALWAYS AS (
            to_tsvector('simple',
                immutable_unaccent(coalesce("title", ''))
                || ' ' || immutable_unaccent(coalesce("content", ''))
            )
        ) STORED;

CREATE INDEX "articles_search_vector_gin" ON "articles" USING GIN("search_vector");
