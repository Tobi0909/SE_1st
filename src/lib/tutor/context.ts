import type { ChatContextType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { LabScenarioSchema } from "@/lib/llm/schemas";

export interface TutorContext {
  label: string;
  description: string;
}

const FALLBACK: TutorContext = {
  label: "Chung",
  description: "Không có ngữ cảnh cụ thể, trả lời như một trợ lý SE chung.",
};

export async function buildTutorContext(
  contextType: ChatContextType,
  contextId: string | null,
): Promise<TutorContext> {
  if (!contextId) return FALLBACK;

  if (contextType === "QUESTION") {
    const question = await db.question.findUnique({
      where: { id: contextId },
      include: { topic: true, options: true },
    });
    if (!question) return FALLBACK;
    const correct = question.options.find((o) => o.isCorrect);
    return {
      label: `Câu hỏi: ${question.stem.slice(0, 60)}${question.stem.length > 60 ? "…" : ""}`,
      description: `Câu hỏi quiz chủ đề "${question.topic.name}" (độ khó ${question.difficulty}):
"${question.stem}"
Đáp án đúng: "${correct?.text ?? "(không rõ)"}"`,
    };
  }

  if (contextType === "LAB") {
    const session = await db.labSession.findUnique({
      where: { id: contextId },
      include: { scenario: true },
    });
    if (!session) return FALLBACK;
    const scenario = LabScenarioSchema.parse(session.scenario.data);
    return {
      label: `Lab: ${scenario.title}`,
      // KHÔNG đưa rootCause vào đây — tutor không được tiết lộ đáp án của bài lab.
      description: `Học viên đang làm lab troubleshooting "${scenario.title}".
Bối cảnh: ${scenario.briefing.context}
Triệu chứng: ${scenario.briefing.symptoms.join(", ")}`,
    };
  }

  if (contextType === "NODE") {
    const node = await db.skillNode.findUnique({ where: { id: contextId } });
    if (!node) return FALLBACK;
    return {
      label: `Kỹ năng: ${node.title}`,
      description: `Học viên đang xem kỹ năng "${node.title}" trong roadmap. ${node.description ?? ""}`,
    };
  }

  return FALLBACK;
}
