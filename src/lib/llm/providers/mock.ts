import type {
  ChatParams,
  GenerateQuizParams,
  GenerateScenarioParams,
  GradeEssayParams,
  GradeSubmissionParams,
  LLMProvider,
  TerminalRespondParams,
} from "@/lib/llm/provider";
import type {
  EssayGrade,
  LabScenario,
  QuizBatch,
  SubmissionGrade,
  TerminalOutput,
} from "@/lib/llm/schemas";

/**
 * Provider giả lập, không gọi API thật — dùng cho test và phát triển local
 * (LLM_PROVIDER=mock). Trả dữ liệu hợp lệ theo schema, nội dung mang tính đại diện.
 */
export class MockLLMProvider implements LLMProvider {
  async generateQuizBatch(params: GenerateQuizParams): Promise<QuizBatch> {
    const questions = Array.from({ length: params.count }, (_, i) => ({
      stem: `[MOCK] Câu hỏi ${i + 1} về ${params.topicName} (độ khó ${params.difficulty})`,
      options: [
        { text: "Đáp án đúng", isCorrect: true, explanation: "Đây là đáp án đúng vì lý do mô phỏng." },
        { text: "Đáp án sai A", isCorrect: false, explanation: "Sai vì lý do mô phỏng A." },
        { text: "Đáp án sai B", isCorrect: false, explanation: "Sai vì lý do mô phỏng B." },
        { text: "Đáp án sai C", isCorrect: false, explanation: "Sai vì lý do mô phỏng C." },
      ],
    }));
    return { questions };
  }

  async generateScenario(params: GenerateScenarioParams): Promise<LabScenario> {
    return {
      version: 1,
      title: `[MOCK] Scenario ${params.topicName}`,
      topicSlug: params.topicSlug,
      difficulty: params.difficulty,
      briefing: {
        context: "Dịch vụ web nội bộ báo lỗi không truy cập được (mô phỏng).",
        symptoms: ["Người dùng không mở được trang nội bộ", "curl trả về connection refused"],
      },
      hiddenState: {
        filesystem: [
          { name: "/etc/nginx/nginx.conf", type: "file", content: "# mock config" },
        ],
        services: [{ name: "nginx", status: "stopped", port: 80 }],
        logs: { "journalctl -u nginx": ["nginx.service: Failed with result 'exit-code'"] },
      },
      rootCause: {
        summary: "Service nginx bị dừng do lỗi cấu hình (mô phỏng).",
        explanation: "Cấu hình có lỗi cú pháp khiến nginx không start được.",
      },
      completionCriteria: {
        requiredFindings: ["nginx đang stopped", "nguyên nhân do lỗi cấu hình"],
        rubric: [{ criterion: "Xác định đúng service bị lỗi", weight: 50 }],
      },
      presetCommands: [
        {
          match: { type: "exact", pattern: "systemctl status nginx" },
          output: "● nginx.service - A high performance web server\n   Active: failed (Result: exit-code)",
        },
      ],
      hints: [
        "Thử kiểm tra trạng thái các service đang chạy.",
        "Xem log của service nghi ngờ bằng journalctl.",
        "Kiểm tra cú pháp file cấu hình bằng lệnh test cấu hình của service đó.",
      ],
    };
  }

  async terminalRespond(params: TerminalRespondParams): Promise<TerminalOutput> {
    return { output: `bash: ${params.command}: command not found (mock)` };
  }

  async gradeSubmission(params: GradeSubmissionParams): Promise<SubmissionGrade> {
    return {
      total: 50,
      byRubricItem: params.scenario.completionCriteria.rubric.map((r) => ({
        criterion: r.criterion,
        weight: r.weight,
        met: false,
        feedback: "[MOCK] Chưa đủ cơ sở để xác nhận.",
      })),
      feedback: "[MOCK] Đây là phản hồi mô phỏng, không phải đánh giá thật.",
    };
  }

  async gradeEssay(params: GradeEssayParams): Promise<EssayGrade> {
    return {
      score: 50,
      missingPoints: ["[MOCK] Điểm còn thiếu mô phỏng"],
      feedback: `[MOCK] Phản hồi mô phỏng cho câu trả lời: ${params.answer.slice(0, 20)}...`,
    };
  }

  async *chatStream(params: ChatParams): AsyncIterable<string> {
    const text = `[MOCK] Phản hồi mô phỏng cho: ${params.message}`;
    for (const word of text.split(" ")) {
      yield `${word} `;
    }
  }
}
