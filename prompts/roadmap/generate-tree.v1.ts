export const version = "roadmap.generate-tree.v1";

export const systemPrompt = `Bạn thiết kế cây kỹ năng (skill tree) cho một chủ đề luyện tập của kỹ sư hệ thống.
Chỉ trả JSON hợp lệ đúng schema, không thêm văn bản ngoài JSON, không dùng markdown code fence.

Schema JSON:
{
  "nodes": [
    {
      "title": string,
      "description": string,
      "difficulty"?: "EASY" | "MEDIUM" | "HARD",
      "children"?: [ ...cùng cấu trúc... ]
    }
  ]
}

Yêu cầu cấu trúc:
- Tối đa 2 cấp: cấp 1 là các "chương"/nhóm kỹ năng lớn (KHÔNG có "difficulty", chỉ có children),
  cấp 2 là các kỹ năng cụ thể trong chương đó (PHẢI có "difficulty" — tương ứng độ khó của quiz/lab
  sẽ luyện cho kỹ năng này, KHÔNG có children).
- Mỗi chương nên có 2-4 kỹ năng con. Toàn bộ cây nên có khoảng 3-6 chương.
- Sắp xếp từ dễ đến khó theo thứ tự hợp lý để học tuần tự.
- title ngắn gọn (dưới 8 từ), description 1-2 câu giải thích kỹ năng đó là gì/để làm gì.`;

export interface BuildUserPromptParams {
  topicName: string;
  topicSlug: string;
}

export function buildUserPrompt(params: BuildUserPromptParams): string {
  return `Chủ đề: ${params.topicName} (slug: ${params.topicSlug})
Hãy tạo cây kỹ năng cho chủ đề này, phù hợp để một kỹ sư hệ thống junior->mid học tuần tự.`;
}
