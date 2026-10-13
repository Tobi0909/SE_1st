import { describe, expect, it } from "vitest";

import { LabScenarioSchema, QuizBatchSchema } from "@/lib/llm/schemas";

const validQuestion = {
  stem: "Lệnh nào xem trạng thái service trên systemd?",
  options: [
    { text: "systemctl status <name>", isCorrect: true, explanation: "Đúng vì đây là lệnh chuẩn của systemd." },
    { text: "service <name> info", isCorrect: false, explanation: "Sai vì cú pháp này không tồn tại." },
    { text: "ps aux", isCorrect: false, explanation: "Sai vì chỉ liệt kê process, không cho biết trạng thái systemd unit." },
    { text: "top", isCorrect: false, explanation: "Sai vì top theo dõi tài nguyên, không phải trạng thái service." },
  ],
};

describe("QuizBatchSchema", () => {
  it("chấp nhận câu hỏi hợp lệ với đúng 1 đáp án đúng", () => {
    const result = QuizBatchSchema.safeParse({ questions: [validQuestion] });
    expect(result.success).toBe(true);
  });

  it("từ chối khi không có đáp án đúng nào", () => {
    const noCorrect = {
      ...validQuestion,
      options: validQuestion.options.map((o) => ({ ...o, isCorrect: false })),
    };
    const result = QuizBatchSchema.safeParse({ questions: [noCorrect] });
    expect(result.success).toBe(false);
  });

  it("từ chối khi có hơn 1 đáp án đúng", () => {
    const twoCorrect = {
      ...validQuestion,
      options: validQuestion.options.map((o, i) => ({ ...o, isCorrect: i < 2 })),
    };
    const result = QuizBatchSchema.safeParse({ questions: [twoCorrect] });
    expect(result.success).toBe(false);
  });

  it("từ chối khi thiếu explanation", () => {
    const missingExplanation = {
      stem: validQuestion.stem,
      options: validQuestion.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    };
    const result = QuizBatchSchema.safeParse({ questions: [missingExplanation] });
    expect(result.success).toBe(false);
  });
});

describe("LabScenarioSchema", () => {
  const validScenario = {
    version: 1,
    title: "Nginx không khởi động được",
    topicSlug: "linux",
    difficulty: "MEDIUM",
    briefing: {
      context: "Dịch vụ web nội bộ không truy cập được.",
      symptoms: ["curl trả về connection refused"],
    },
    hiddenState: {
      filesystem: [{ name: "/etc/nginx/nginx.conf", type: "file", content: "..." }],
      services: [{ name: "nginx", status: "stopped", port: 80 }],
      logs: { "journalctl -u nginx": ["Failed with result 'exit-code'"] },
    },
    rootCause: {
      summary: "Lỗi cú pháp cấu hình nginx.",
      explanation: "Thiếu dấu ; trong block server.",
    },
    completionCriteria: {
      requiredFindings: ["nginx đang stopped"],
      rubric: [{ criterion: "Xác định đúng service lỗi", weight: 50 }],
    },
    presetCommands: [
      {
        match: { type: "exact", pattern: "systemctl status nginx" },
        output: "Active: failed",
      },
    ],
    hints: ["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"],
  };

  it("chấp nhận scenario hợp lệ", () => {
    const result = LabScenarioSchema.safeParse(validScenario);
    expect(result.success).toBe(true);
  });

  it("từ chối khi thiếu hints thứ 3", () => {
    const result = LabScenarioSchema.safeParse({
      ...validScenario,
      hints: ["Gợi ý 1", "Gợi ý 2"],
    });
    expect(result.success).toBe(false);
  });

  it("từ chối khi version khác 1", () => {
    const result = LabScenarioSchema.safeParse({ ...validScenario, version: 2 });
    expect(result.success).toBe(false);
  });
});
