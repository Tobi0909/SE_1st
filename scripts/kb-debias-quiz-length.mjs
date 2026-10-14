#!/usr/bin/env node
/**
 * Giảm length bias trong mục "## N. Tự kiểm tra" của knowledge/**.md: khi đáp án đúng dài
 * hơn đáp án sai dài nhất quá 30%, cắt bớt phần giải thích/lý do phụ ở cuối đáp án đúng (câu
 * cốt lõi vẫn đúng 100%, không thêm/bớt sự thật) để độ dài tương đương các lựa chọn sai —
 * tránh lộ đáp án qua độ dài câu chữ. Chỉ sửa option a)-d) trong danh sách lựa chọn, KHÔNG sửa
 * đoạn "**Đáp án: X** — ..." (giải thích đầy đủ vẫn hiển thị sau khi trả lời).
 *
 * Rule-based, không gọi LLM. Những câu không tìm được điểm cắt an toàn (ratio vẫn cao sau khi
 * thử mọi delimiter) được GIỮ NGUYÊN và liệt vào "cần soát tay" trong báo cáo cuối — không cắt
 * liều vì có thể làm sai ngữ nghĩa.
 *
 * Chạy: node scripts/kb-debias-quiz-length.mjs --dry-run   (chỉ in báo cáo, không ghi file)
 *       node scripts/kb-debias-quiz-length.mjs             (ghi file thật)
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "knowledge";
const DRY = process.argv.includes("--dry-run");
const FLAG_RATIO = 1.3; // correct.length / maxOtherLen vượt ngưỡng này mới coi là "lộ đáp án"
const TARGET_RATIO = 1.3;

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}

function findSelfCheckRange(lines) {
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
  return start === -1 ? null : [start, end];
}

function splitBlocks(lines, start, end) {
  const blocks = [];
  let blockStart = start;
  for (let i = start; i < end; i++) {
    if (/^-{3,}$/.test(lines[i].trim())) {
      blocks.push([blockStart, i]);
      blockStart = i + 1;
    }
  }
  blocks.push([blockStart, end]);
  return blocks;
}

function parseBlockOptions(lines, blockStart, blockEnd) {
  const options = [];
  let answerLetter = null;
  let i = blockStart;
  while (i < blockEnd) {
    const line = lines[i];
    const m = /^([a-dA-D])\)\s*(.+)$/.exec(line);
    if (m) {
      let text = m[2].trim();
      let j = i + 1;
      while (
        j < blockEnd &&
        lines[j].trim() !== "" &&
        !/^[a-dA-D]\)/.test(lines[j]) &&
        !/^\*\*Đáp án/.test(lines[j])
      ) {
        text += ` ${lines[j].trim()}`;
        j++;
      }
      options.push({ letter: m[1].toLowerCase(), startIdx: i, endIdx: j, text });
      i = j;
      continue;
    }
    const am = /^\*\*Đáp án\s*[:：]?\s*([a-dA-D])\*\*/.exec(line);
    if (am) {
      answerLetter = am[1].toLowerCase();
      break;
    }
    i++;
  }
  return { options, answerLetter };
}

const CUT_PATTERNS = [
  /:\s*\(1\)/,
  /\s—\s/,
  /;\s/,
  /\.\s+(?=[A-ZĐÀ-ỸА-Я])/u,
  /,?\s+vì\b/,
  /\s\(/,
];

// Từ nối cần có phần sau (mệnh đề phụ thuộc) — cắt ngay trước/ngay sau các từ này để lại câu
// cụt, không dùng được làm điểm cắt dù độ dài hợp lệ.
const DANGLING_WORDS = new Set([
  "là", "vì", "do", "khi", "nếu", "mà", "để", "nên", "và", "hoặc", "miễn", "trừ",
  "bởi", "theo", "của", "với", "từ", "tại", "như", "so", "hơn", "chỉ", "chưa",
  "đã", "sẽ", "đang", "không", "cũng", "còn", "này", "đó", "các", "những", "một",
  "có", "ở", "lên", "xuống", "qua", "sau", "trước", "giữa", "bằng", "dù", "tuy",
]);

function endsWithDanglingWord(text) {
  const m = /([a-zA-ZÀ-ỹ]+)\s*$/u.exec(text);
  if (!m) return false;
  return DANGLING_WORDS.has(m[1].toLowerCase());
}

function cleanTrim(text) {
  let trimmed = text.replace(/[\s,;:\-–—]+$/u, "");
  trimmed = trimmed.replace(/\([^)]*$/u, "").trim();
  return trimmed;
}

function tryTrim(text, maxOtherLen) {
  const floor = Math.max(20, Math.floor(maxOtherLen * 0.5));
  const target = Math.ceil(maxOtherLen * TARGET_RATIO);
  const candidates = [];
  for (const pattern of CUT_PATTERNS) {
    const re = new RegExp(pattern, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    let match;
    while ((match = re.exec(text)) !== null) {
      candidates.push(match.index);
      if (match.index === re.lastIndex) re.lastIndex++;
    }
  }
  const valid = candidates.filter((len) => len >= floor && len < text.length);
  if (valid.length === 0) return null;
  valid.sort((a, b) => {
    const da = a <= target ? target - a : (a - target) * 10; // ưu tiên mạnh cho <= target
    const db = b <= target ? target - b : (b - target) * 10;
    return da - db;
  });
  for (const cut of valid) {
    const trimmed = cleanTrim(text.slice(0, cut));
    if (trimmed.length < floor) continue;
    if (endsWithDanglingWord(trimmed)) continue;
    return trimmed;
  }
  return null;
}

const files = walk(ROOT).sort();
const report = {
  filesScanned: 0,
  filesChanged: 0,
  totalQuestions: 0,
  flagged: 0,
  fixed: [],
  skippedUnsafe: [],
};

for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  const hasTrailingNewline = original.endsWith("\n");
  const lines = original.split("\n");
  const range = findSelfCheckRange(lines);
  if (!range) continue;
  const [start, end] = range;
  const sectionHasMcq = lines.slice(start, end).some((l) => /^\*\*Câu\s*\d+\*\*/.test(l));
  if (!sectionHasMcq) continue;

  report.filesScanned++;
  const blocks = splitBlocks(lines, start, end);
  let fileChanged = false;

  for (let bi = blocks.length - 1; bi >= 0; bi--) {
    const [bStart, bEnd] = blocks[bi];
    const { options, answerLetter } = parseBlockOptions(lines, bStart, bEnd);
    if (options.length < 2 || !answerLetter) continue;
    const correct = options.find((o) => o.letter === answerLetter);
    const others = options.filter((o) => o.letter !== answerLetter);
    if (!correct || others.length === 0) continue;

    const maxOtherLen = Math.max(...others.map((o) => o.text.length));
    report.totalQuestions++;
    if (correct.text.length <= maxOtherLen * FLAG_RATIO) continue;

    report.flagged++;
    const trimmed = tryTrim(correct.text, maxOtherLen);
    if (!trimmed) {
      report.skippedUnsafe.push({
        file,
        before: correct.text,
        maxOtherLen,
        ratio: +(correct.text.length / maxOtherLen).toFixed(2),
      });
      continue;
    }

    report.fixed.push({
      file,
      before: correct.text,
      after: trimmed,
      ratioBefore: +(correct.text.length / maxOtherLen).toFixed(2),
      ratioAfter: +(trimmed.length / maxOtherLen).toFixed(2),
    });

    const newLine = `${correct.letter}) ${trimmed}`;
    lines.splice(correct.startIdx, correct.endIdx - correct.startIdx, newLine);
    fileChanged = true;
  }

  if (fileChanged) {
    report.filesChanged++;
    if (!DRY) {
      const newContent = lines.join("\n") + (hasTrailingNewline ? "" : "");
      fs.writeFileSync(file, hasTrailingNewline ? `${newContent}\n`.replace(/\n+$/, "\n") : newContent);
    }
  }
}

console.log(`\nkb-debias-quiz-length${DRY ? " (DRY RUN)" : ""}`);
console.log(`  Files scanned (có mục Tự kiểm tra dạng MCQ): ${report.filesScanned}`);
console.log(`  Files thay đổi: ${report.filesChanged}`);
console.log(`  Tổng câu hỏi: ${report.totalQuestions}`);
console.log(`  Câu bị lộ đáp án qua độ dài (ratio > ${FLAG_RATIO}): ${report.flagged}`);
console.log(`  → Tự sửa được (cắt an toàn): ${report.fixed.length}`);
console.log(`  → Cần soát tay (không tìm được điểm cắt an toàn): ${report.skippedUnsafe.length}`);

if (report.skippedUnsafe.length > 0) {
  console.log("\n--- Danh sách cần soát tay ---");
  for (const s of report.skippedUnsafe) {
    console.log(`\n[${s.file}] ratio=${s.ratio}`);
    console.log(`  ĐÚNG (${s.before.length} ký tự): ${s.before}`);
  }
}

fs.writeFileSync(
  "/tmp/claude-1000/-home-tuantm5-Coder-trien-chi-u-project-1st/577e2430-b7c6-4a92-863e-0cd410fff072/scratchpad/kb-debias-report.json",
  JSON.stringify(report, null, 2),
);
