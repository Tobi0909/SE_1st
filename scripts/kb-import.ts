/**
 * Import kho tri thức (knowledge/) vào DB — idempotent theo content hash.
 * Chạy: pnpm kb:import           (import thật)
 *        pnpm kb:import:dry       (dry-run: parse + validate, không write DB)
 *
 * Cần DATABASE_URL trong .env (dùng cùng PrismaPg adapter như seed.ts).
 */
import "dotenv/config";

import { createHash } from "crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { dirname, join, relative, resolve } from "path";

import { PrismaPg } from "@prisma/adapter-pg";
import yaml from "js-yaml";

import { ArticleLevel, ArticleStatus, PrismaClient } from "../src/generated/prisma/client";

const ROOT = resolve(__dirname, "..");
const KNOWLEDGE_DIR = join(ROOT, "knowledge");
const TAXONOMY_PATH = join(KNOWLEDGE_DIR, "_taxonomy.yaml");

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Reuse từ kb-lint.ts ─────────────────────────────────────────────────────

const REQUIRED_FRONTMATTER_FIELDS = [
  "id", "title", "domain", "module", "level",
  "prerequisites", "applies_to", "status", "sources", "last_verified", "author",
] as const;

const LEVEL_MAP: Record<string, ArticleLevel> = {
  "nền tảng": ArticleLevel.FOUNDATION,
  "vận hành":  ArticleLevel.OPERATION,
  "chuyên sâu": ArticleLevel.EXPERT,
};

const STATUS_MAP: Record<string, ArticleStatus> = {
  draft:    ArticleStatus.DRAFT,
  verified: ArticleStatus.VERIFIED,
};

function walkMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith("_")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkMarkdownFiles(full));
    } else if (entry.endsWith(".md")) {
      files.push(full);
    }
  }
  return files;
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content);
  if (!m) return null;
  try {
    return yaml.load(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getBody(content: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/.exec(content);
  return m ? m[1] : content;
}

// ─── Validation ──────────────────────────────────────────────────────────────

interface ParsedArticle {
  knowledgeId: string;
  title: string;
  domain: string;
  module: string;
  level: ArticleLevel;
  status: ArticleStatus;
  sourcePath: string;
  contentHash: string;
  content: string;
  prerequisites: string[];
  appliesTo: string[];
  sources: string[];
  lastVerified: Date | null;
  todoVerifyCount: number;
}

function validateAndParse(
  rawContent: string,
  relFile: string,
  allIds: Set<string>,
): ParsedArticle | { error: string } {
  const fm = parseFrontmatter(rawContent);
  if (!fm) return { error: "Thiếu hoặc không parse được frontmatter." };

  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    if (fm[field] == null) return { error: `Thiếu field: "${field}".` };
  }

  const id = String(fm.id);
  if (allIds.has(id)) return { error: `Id trùng: "${id}".` };
  allIds.add(id);

  const level = LEVEL_MAP[fm.level as string];
  if (!level) return { error: `level không hợp lệ: "${fm.level}".` };

  const status = STATUS_MAP[fm.status as string];
  if (!status) return { error: `status không hợp lệ: "${fm.status}".` };

  const body = getBody(rawContent);
  const todoVerifyCount = (body.match(/TODO-VERIFY/g) ?? []).length;

  const lastVerifiedRaw = fm.last_verified as string | null | undefined;
  const lastVerified = lastVerifiedRaw ? new Date(lastVerifiedRaw) : null;

  const prerequisites = (fm.prerequisites as string[] | undefined) ?? [];
  const appliesTo = Array.isArray(fm.applies_to)
    ? (fm.applies_to as string[])
    : fm.applies_to
    ? [String(fm.applies_to)]
    : [];
  const sources = (fm.sources as string[] | undefined) ?? [];

  return {
    knowledgeId: id,
    title: String(fm.title),
    domain: String(fm.domain),
    module: String(fm.module),
    level,
    status,
    sourcePath: relFile,
    contentHash: createHash("sha256").update(rawContent).digest("hex"),
    content: body,
    prerequisites,
    appliesTo,
    sources,
    lastVerified,
    todoVerifyCount,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(KNOWLEDGE_DIR)) {
    console.error("Không tìm thấy thư mục knowledge/.");
    process.exit(1);
  }

  const files = walkMarkdownFiles(KNOWLEDGE_DIR);

  let newCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let errorCount = 0;
  let totalTodoVerify = 0;
  const errors: string[] = [];
  const seenIds = new Set<string>();

  // Parse tất cả trước (không cần DB)
  const parsed: (ParsedArticle & { relFile: string })[] = [];
  for (const file of files) {
    const relFile = relative(ROOT, file);
    const rawContent = readFileSync(file, "utf8");
    const result = validateAndParse(rawContent, relFile, seenIds);
    if ("error" in result) {
      errorCount++;
      errors.push(`  ✗ ${relFile}: ${result.error}`);
    } else {
      parsed.push({ ...result, relFile });
      totalTodoVerify += result.todoVerifyCount;
    }
  }

  if (DRY_RUN) {
    console.log(`kb-import (DRY RUN): ${files.length} file xử lý`);
    console.log(`  ✓ ${parsed.length} bài hợp lệ`);
    console.log(`  ✗ ${errorCount} lỗi frontmatter`);
    console.log(`  TODO-VERIFY còn lại: ${totalTodoVerify}`);
    if (errors.length) { console.log("\nLỗi:"); errors.forEach(e => console.log(e)); }
    return;
  }

  // Kết nối DB
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter });

  try {
    // Lấy hash hiện có từ DB để so sánh (1 query thay vì N)
    const existing = await db.article.findMany({ select: { knowledgeId: true, contentHash: true } });
    const existingMap = new Map(existing.map(a => [a.knowledgeId, a.contentHash]));

    for (const article of parsed) {
      const { relFile, ...data } = article;
      const existingHash = existingMap.get(data.knowledgeId);

      if (existingHash === undefined) {
        // Bài mới
        await db.article.create({ data });
        newCount++;
      } else if (existingHash !== data.contentHash) {
        // Bài đã thay đổi
        await db.article.update({
          where: { knowledgeId: data.knowledgeId },
          data,
        });
        changedCount++;
      } else {
        unchangedCount++;
      }
    }

    // Báo cáo bài chưa có SkillNode link
    const unlinked = await db.article.findMany({
      where: { skillNodeLinks: { none: {} } },
      select: { knowledgeId: true },
    });

    console.log(`\nkb-import: ${files.length} file xử lý`);
    console.log(`  ✓ ${newCount} bài mới`);
    console.log(`  ✓ ${changedCount} bài đã cập nhật`);
    console.log(`  ─ ${unchangedCount} bài không đổi`);
    console.log(`  ✗ ${errorCount} lỗi frontmatter`);
    console.log(`  TODO-VERIFY còn lại: ${totalTodoVerify}`);
    console.log(`  ⚠ ${unlinked.length} bài chưa có SkillNode link`);

    if (errors.length) {
      console.log("\nLỗi frontmatter:");
      errors.forEach(e => console.log(e));
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
