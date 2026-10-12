/**
 * Sinh Question (quiz) tĩnh từ mục "## N. Tự kiểm tra" của Article đã import (kb:import).
 * Chạy: pnpm kb:build-quiz          (ghi DB)
 *        pnpm kb:build-quiz:dry     (dry-run: parse + báo cáo, không write DB)
 *
 * PHẠM VI PILOT (xem CLAUDE.md task "chuyển quiz/flashcard/lab sang nội dung tĩnh"): mục
 * "Tự kiểm tra" trong 146 bài hiện có 3 định dạng khác nhau, chỉ 1 trong đó ("**Câu N**:" +
 * 4 lựa chọn a)-d) + "**Đáp án: X**") là multiple-choice sẵn, khớp đúng schema Question/
 * QuestionOption (bắt buộc nhiều option, 1 đúng). 2 định dạng còn lại là hỏi-đáp tự luận
 * (numbered + <details>, hoặc **N.** + đoạn văn) — KHÔNG parse ở đây, để lại cho bản sau
 * (cần sinh thêm đáp án nhiễu, không tự động hoá bằng regex được). Bài không khớp định dạng
 * MCQ bị liệt vào "skipped (không phải định dạng MCQ)" trong báo cáo cuối, không phải lỗi.
 *
 * Idempotent: mỗi câu được định danh bằng (sourceArticleId, questionIndex). Nếu
 * Article.contentHash đổi mà câu ở index đó đã tồn tại với articleVersion cũ khác hash mới,
 * câu CŨ bị đánh dấu STALE (giữ lại — có thể đã có QuizAttempt/FlashcardState tham chiếu),
 * câu MỚI được tạo mới với articleVersion = hash hiện tại.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { DOMAIN_TO_TOPIC_SLUG } from "../src/lib/knowledge/domainTopicMap";
import {
  ArticleLevel,
  Difficulty,
  PrismaClient,
  QuestionStatus,
} from "../src/generated/prisma/client";

const DRY_RUN = process.argv.includes("--dry-run");

const LEVEL_TO_DIFFICULTY: Record<ArticleLevel, Difficulty> = {
  FOUNDATION: "EASY",
  OPERATION: "MEDIUM",
  EXPERT: "HARD",
};

const NEW_TOPICS = [
  { slug: "data", name: "Data", description: "MySQL/PostgreSQL, Redis, message queue" },
  {
    slug: "sre",
    name: "SRE",
    description: "Incident response, postmortem, change management, capacity planning",
  },
];

interface ParsedOption {
  letter: string;
  text: string;
}

interface ParsedQuestion {
  index: number;
  stem: string;
  options: ParsedOption[];
  correctLetter: string;
  explanation: string;
}

/** Tìm thân mục "## N. Tự kiểm tra" (số thứ tự mục thay đổi giữa các bài, không cố định). */
function extractSelfCheckSection(body: string): string | null {
  const lines = body.split("\n");
  let start = -1;
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (start === -1) {
      if (/^## .*Tự kiểm tra/.test(lines[i])) start = i + 1;
    } else if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (start === -1) return null;
  return lines.slice(start, end).join("\n").trim();
}

function isMcqFormat(section: string): boolean {
  return /^\*\*Câu\s*\d+\*\*/m.test(section);
}

/** Parse 1 block "**Câu N**: ... / a) .. b).. / **Đáp án: X** — giải thích". Trả null nếu lệch khuôn mẫu. */
function parseBlock(block: string, index: number): ParsedQuestion | null {
  const paragraphs = block
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length < 3) return null;

  const stemMatch = /^\*\*Câu\s*\d+\*\*\s*[:：]?\s*([\s\S]*)$/.exec(paragraphs[0]);
  if (!stemMatch) return null;
  const stem = stemMatch[1].replace(/\s*\n\s*/g, " ").trim();

  // Option có thể wrap xuống nhiều dòng (dòng tiếp theo không có tiền tố "a)"-"d)" được nối
  // vào option đang mở, cách nhau 1 khoảng trắng) — không chỉ 1 dòng/option.
  const options: ParsedOption[] = [];
  for (const rawLine of paragraphs[1].split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = /^([a-dA-D])\)\s*(.+)$/.exec(line);
    if (m) {
      options.push({ letter: m[1].toLowerCase(), text: m[2].trim() });
    } else if (options.length > 0) {
      options[options.length - 1].text += ` ${line}`;
    }
  }
  if (options.length < 2) return null;

  const answerParagraph = paragraphs.slice(2).join("\n\n");
  const answerMatch = /^\*\*Đáp án\s*[:：]?\s*([a-dA-D])\*\*\s*[—–\-]?\s*([\s\S]*)$/.exec(
    answerParagraph.trim(),
  );
  if (!answerMatch) return null;
  const correctLetter = answerMatch[1].toLowerCase();
  const explanation = answerMatch[2].replace(/\s*\n\s*/g, " ").trim();
  if (!options.some((o) => o.letter === correctLetter)) return null;
  if (!explanation) return null;

  return { index, stem, options, correctLetter, explanation };
}

function parseMcqSection(section: string): ParsedQuestion[] | null {
  const blocks = section
    .split(/\n-{3,}\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const questions: ParsedQuestion[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const parsed = parseBlock(blocks[i], i + 1);
    if (!parsed) return null;
    questions.push(parsed);
  }
  return questions.length > 0 ? questions : null;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter });

  let createdCount = 0;
  let staleCount = 0;
  let unchangedCount = 0;
  let skippedNoTopic = 0;
  let skippedNotMcq = 0;
  let skippedParseError = 0;
  const notMcqArticles: string[] = [];
  const noTopicDomains = new Set<string>();

  try {
    if (!DRY_RUN) {
      for (const t of NEW_TOPICS) {
        await db.topic.upsert({
          where: { slug: t.slug },
          update: {},
          create: { slug: t.slug, name: t.name, description: t.description, order: 99 },
        });
      }
    }

    const topics = DRY_RUN ? [] : await db.topic.findMany({ select: { id: true, slug: true } });
    const topicIdBySlug = new Map(topics.map((t) => [t.slug, t.id]));

    const articles = await db.article.findMany({
      select: {
        id: true,
        knowledgeId: true,
        domain: true,
        level: true,
        content: true,
        contentHash: true,
      },
    });

    for (const article of articles) {
      const topicSlug = DOMAIN_TO_TOPIC_SLUG[article.domain];
      if (!topicSlug) {
        skippedNoTopic++;
        noTopicDomains.add(article.domain);
        continue;
      }

      const section = extractSelfCheckSection(article.content);
      if (!section || !isMcqFormat(section)) {
        skippedNotMcq++;
        notMcqArticles.push(article.knowledgeId);
        continue;
      }

      const parsed = parseMcqSection(section);
      if (!parsed) {
        skippedParseError++;
        console.warn(`  ✗ ${article.knowledgeId}: định dạng MCQ nhưng parse lỗi (kiểm tra tay)`);
        continue;
      }

      if (DRY_RUN) {
        createdCount += parsed.length;
        continue;
      }

      const topicId = topicIdBySlug.get(topicSlug);
      if (!topicId) {
        skippedNoTopic++;
        noTopicDomains.add(article.domain);
        continue;
      }
      const difficulty = LEVEL_TO_DIFFICULTY[article.level];

      for (const q of parsed) {
        const existing = await db.question.findFirst({
          where: { sourceArticleId: article.id, questionIndex: q.index },
          orderBy: { createdAt: "desc" },
        });

        if (existing && existing.articleVersion === article.contentHash) {
          unchangedCount++;
          continue;
        }

        if (existing && existing.status !== "STALE") {
          await db.question.update({
            where: { id: existing.id },
            data: { status: QuestionStatus.STALE },
          });
          staleCount++;
        }

        await db.question.create({
          data: {
            topicId,
            difficulty,
            stem: q.stem,
            source: "ADMIN",
            status: "ACTIVE",
            sourceArticleId: article.id,
            questionIndex: q.index,
            articleVersion: article.contentHash,
            options: {
              create: q.options.map((o) => ({
                text: o.text,
                isCorrect: o.letter === q.correctLetter,
                explanation:
                  o.letter === q.correctLetter ? q.explanation : `Không đúng. ${q.explanation}`,
              })),
            },
          },
        });
        createdCount++;
      }
    }

    console.log(`\nkb-build-quiz${DRY_RUN ? " (DRY RUN)" : ""}: ${articles.length} bài xét`);
    console.log(`  ✓ ${createdCount} câu tạo mới`);
    if (!DRY_RUN) {
      console.log(`  ─ ${unchangedCount} câu không đổi (đã có, cùng articleVersion)`);
      console.log(`  ⚠ ${staleCount} câu cũ đánh dấu STALE (bài gốc đã đổi nội dung)`);
    }
    console.log(`  ⏭ ${skippedNotMcq} bài bỏ qua (chưa phải định dạng MCQ — để bản sau)`);
    console.log(`  ⏭ ${skippedNoTopic} bài bỏ qua (domain chưa map Topic: ${[...noTopicDomains].join(", ") || "-"})`);
    if (skippedParseError > 0) console.log(`  ✗ ${skippedParseError} bài định dạng MCQ nhưng parse lỗi`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
