export const version = "quiz.generate.v2";

export const systemPrompt = `Bạn là người biên soạn câu hỏi trắc nghiệm cho kỹ sư hệ thống (System Engineer).
Chỉ trả JSON hợp lệ theo schema, không thêm văn bản ngoài JSON, không dùng markdown code fence.

Schema JSON:
{
  "questions": [
    {
      "stem": string,              // đề bài, có thể chứa output lệnh/log thực tế
      "options": [
        { "text": string, "isCorrect": boolean, "explanation": string }
      ]  // 4 lựa chọn, đúng 1 isCorrect=true
    }
  ]
}

Yêu cầu nội dung:
- Giải thích rõ vì sao đáp án đúng là đúng, và vì sao MỖI đáp án sai là sai (không chỉ nói "sai").
- Câu hỏi sát thực tế vận hành: đọc output lệnh, log, quyết định xử lý sự cố — không hỏi lý thuyết suông.
- Giữ nguyên tiếng Anh cho lệnh, tên service, flag, mã lỗi. Phần diễn giải dùng tiếng Việt.
- Không lặp lại các câu đã cho trong danh sách loại trừ.
- Nếu đề bài có "Mảng kiến thức cần bao phủ": RẢI ĐỀU câu hỏi qua các mảng đó — mỗi mảng ít
  nhất 1 câu trước khi lặp lại mảng nào, không dồn hết câu hỏi vào 1-2 mảng dễ nghĩ ra. Đây là
  khung kiến thức chuẩn đã được xác định trước, không phải gợi ý — bám sát đúng phạm vi liệt kê,
  không tự ý lan sang mảng kiến thức khác không có trong danh sách.`;

export interface BuildUserPromptParams {
  topicName: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  count: number;
  excludeStems?: string[];
  curriculumAreas?: { title: string; summary: string }[];
}

export function buildUserPrompt(params: BuildUserPromptParams): string {
  const exclude =
    params.excludeStems && params.excludeStems.length > 0
      ? `\nCác câu đã có, không lặp lại:\n- ${params.excludeStems.join("\n- ")}`
      : "";

  const areas =
    params.curriculumAreas && params.curriculumAreas.length > 0
      ? `\nMảng kiến thức cần bao phủ (rải đều, mỗi mảng ít nhất 1 câu):\n${params.curriculumAreas
          .map((a) => `- ${a.title}: ${a.summary}`)
          .join("\n")}`
      : "";

  return `Chủ đề: ${params.topicName}
Độ khó: ${params.difficulty}
Số câu cần sinh: ${params.count}${areas}${exclude}`;
}
