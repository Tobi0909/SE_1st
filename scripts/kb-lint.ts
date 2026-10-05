/**
 * Lint kho tri thức (knowledge/): kiểm tra frontmatter hợp lệ, id trùng, bài tiên
 * quyết tồn tại, link nội bộ hỏng, đủ các mục bắt buộc. Chạy: pnpm kb:lint
 */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { dirname, join, relative, resolve } from "path";
import yaml from "js-yaml";

const ROOT = resolve(__dirname, "..");
const KNOWLEDGE_DIR = join(ROOT, "knowledge");
const TAXONOMY_PATH = join(KNOWLEDGE_DIR, "_taxonomy.yaml");

const REQUIRED_FRONTMATTER_FIELDS = [
  "id",
  "title",
  "domain",
  "module",
  "level",
  "prerequisites",
  "applies_to",
  "status",
  "sources",
  "last_verified",
  "author",
] as const;

const VALID_STATUS = new Set(["draft", "verified"]);
const VALID_LEVEL = new Set(["nền tảng", "vận hành", "chuyên sâu"]);

// Tiêu đề mục bắt buộc theo đúng mẫu bài trong CLAUDE.md task spec. Khớp theo
// số thứ tự đầu dòng ("## 1.", "## 2."...) để không phụ thuộc cách diễn đạt chữ.
const REQUIRED_SECTION_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];

interface TaxonomyLesson {
  id: string;
  title: string;
  level: string;
  prerequisites: string[];
  priority: string;
}

interface TaxonomyModule {
  id: string;
  title: string;
  lessons: TaxonomyLesson[];
}

interface TaxonomyDomain {
  id: string;
  title: string;
  modules: TaxonomyModule[];
}

interface Taxonomy {
  domains: TaxonomyDomain[];
}

interface Issue {
  file: string;
  message: string;
}

const errors: Issue[] = [];
const warnings: Issue[] = [];

function loadTaxonomy(): Taxonomy {
  const raw = readFileSync(TAXONOMY_PATH, "utf8");
  return yaml.load(raw) as Taxonomy;
}

function walkMarkdownFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith("_")) continue; // _taxonomy.yaml, _progress.md
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
    } else if (entry.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseFrontmatter(content: string, file: string): Record<string, unknown> | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
  if (!match) {
    errors.push({ file, message: "Thiếu frontmatter YAML (phải bắt đầu bằng --- ... ---)." });
    return null;
  }
  try {
    const data = yaml.load(match[1]) as Record<string, unknown>;
    return data;
  } catch (err) {
    errors.push({ file, message: `Frontmatter không parse được: ${(err as Error).message}` });
    return null;
  }
}

function getBody(content: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/.exec(content);
  return match ? match[1] : content;
}

function checkRequiredSections(body: string, file: string): void {
  const foundNumbers = new Set<number>();
  const headingRegex = /^##\s+(\d+)\./gm;
  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(body)) !== null) {
    foundNumbers.add(Number(m[1]));
  }
  for (const n of REQUIRED_SECTION_NUMBERS) {
    if (!foundNumbers.has(n)) {
      errors.push({ file, message: `Thiếu mục bắt buộc số ${n} (heading "## ${n}. ...").` });
    }
  }
}

function checkInternalLinks(body: string, file: string): void {
  const linkRegex = /\]\((?!https?:\/\/)([^)#]+)(?:#[^)]*)?\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(body)) !== null) {
    const target = m[1].trim();
    if (!target || target.startsWith("mailto:")) continue;
    const resolved = resolve(dirname(file), target);
    if (!existsSync(resolved)) {
      errors.push({ file, message: `Link nội bộ hỏng: "${target}" không tồn tại.` });
    }
  }
}

function main(): void {
  if (!existsSync(KNOWLEDGE_DIR)) {
    console.error("Không tìm thấy thư mục knowledge/.");
    process.exit(1);
  }

  const taxonomy = loadTaxonomy();
  const taxonomyLessonIds = new Set<string>();
  const taxonomyLessonById = new Map<string, { domain: string; module: string; lesson: TaxonomyLesson }>();
  for (const domain of taxonomy.domains) {
    for (const mod of domain.modules) {
      for (const lesson of mod.lessons) {
        taxonomyLessonIds.add(lesson.id);
        taxonomyLessonById.set(lesson.id, { domain: domain.id, module: mod.id, lesson });
      }
    }
  }

  const files = walkMarkdownFiles(KNOWLEDGE_DIR);
  const seenIds = new Map<string, string>(); // id -> file đầu tiên gặp
  let totalTodoVerify = 0;

  for (const file of files) {
    const relFile = relative(ROOT, file);
    const content = readFileSync(file, "utf8");
    const frontmatter = parseFrontmatter(content, relFile);
    if (!frontmatter) continue;

    for (const field of REQUIRED_FRONTMATTER_FIELDS) {
      if (!(field in frontmatter) || frontmatter[field] === null || frontmatter[field] === undefined) {
        errors.push({ file: relFile, message: `Thiếu field frontmatter bắt buộc: "${field}".` });
      }
    }

    const id = frontmatter.id as string | undefined;
    if (id) {
      if (seenIds.has(id)) {
        errors.push({ file: relFile, message: `Id trùng với ${seenIds.get(id)}: "${id}".` });
      } else {
        seenIds.set(id, relFile);
      }

      const taxonomyEntry = taxonomyLessonById.get(id);
      if (!taxonomyEntry) {
        errors.push({ file: relFile, message: `Id "${id}" không có trong _taxonomy.yaml.` });
      } else {
        if (frontmatter.domain !== taxonomyEntry.domain) {
          errors.push({
            file: relFile,
            message: `domain "${frontmatter.domain}" không khớp taxonomy ("${taxonomyEntry.domain}").`,
          });
        }
        if (frontmatter.module !== taxonomyEntry.module) {
          errors.push({
            file: relFile,
            message: `module "${frontmatter.module}" không khớp taxonomy ("${taxonomyEntry.module}").`,
          });
        }
        if (frontmatter.level !== taxonomyEntry.lesson.level) {
          warnings.push({
            file: relFile,
            message: `level "${frontmatter.level}" không khớp taxonomy ("${taxonomyEntry.lesson.level}").`,
          });
        }
      }
    }

    const status = frontmatter.status as string | undefined;
    if (status && !VALID_STATUS.has(status)) {
      errors.push({ file: relFile, message: `status "${status}" không hợp lệ (chỉ draft|verified).` });
    }

    const level = frontmatter.level as string | undefined;
    if (level && !VALID_LEVEL.has(level)) {
      errors.push({ file: relFile, message: `level "${level}" không hợp lệ.` });
    }

    const prerequisites = (frontmatter.prerequisites as string[] | undefined) ?? [];
    for (const prereq of prerequisites) {
      if (!taxonomyLessonIds.has(prereq)) {
        errors.push({ file: relFile, message: `Bài tiên quyết "${prereq}" không tồn tại trong taxonomy.` });
      }
    }

    const body = getBody(content);
    checkRequiredSections(body, relFile);
    checkInternalLinks(body, relFile);

    const todoMatches = body.match(/TODO-VERIFY/g);
    if (todoMatches) totalTodoVerify += todoMatches.length;
  }

  console.log(`Đã kiểm tra ${files.length} bài trong knowledge/.`);
  console.log(`Tổng số TODO-VERIFY còn lại: ${totalTodoVerify}`);

  if (warnings.length > 0) {
    console.log(`\n⚠ ${warnings.length} cảnh báo:`);
    for (const w of warnings) console.log(`  ${w.file}: ${w.message}`);
  }

  if (errors.length > 0) {
    console.log(`\n✗ ${errors.length} lỗi:`);
    for (const e of errors) console.log(`  ${e.file}: ${e.message}`);
    process.exit(1);
  }

  console.log("\n✓ kb-lint pass, không có lỗi.");
}

main();
