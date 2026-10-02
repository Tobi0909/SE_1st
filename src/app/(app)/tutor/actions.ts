"use server";

import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/provider";
import { ForbiddenError, requireUser } from "@/lib/rbac";

export interface EssayGradeMessages {
  userContent: string;
  assistantContent: string;
}

export async function gradeMyAnswerAction(
  chatSessionId: string,
  questionId: string,
  answerText: string,
): Promise<EssayGradeMessages> {
  const user = await requireUser();

  const chatSession = await db.chatSession.findUniqueOrThrow({ where: { id: chatSessionId } });
  if (chatSession.userId !== user.id) throw new ForbiddenError();
  if (chatSession.contextType !== "QUESTION" || chatSession.contextId !== questionId) {
    throw new Error("Chỉ chấm được câu trả lời tự luận trong ngữ cảnh câu hỏi tương ứng");
  }

  const question = await db.question.findUniqueOrThrow({
    where: { id: questionId },
    include: { options: true },
  });
  const correct = question.options.find((o) => o.isCorrect);
  const rubric = correct
    ? `Đáp án đúng: "${correct.text}". Giải thích: ${correct.explanation}`
    : "Không có đáp án tham chiếu.";

  const provider = await getLLMProvider();
  const grade = await provider.gradeEssay({
    userId: user.id,
    question: question.stem,
    rubric,
    answer: answerText,
  });

  const userContent = `[Nộp câu trả lời tự luận để chấm]\n${answerText}`;
  const assistantContent = [
    `Điểm: ${grade.score}/100`,
    grade.missingPoints.length > 0 ? `Còn thiếu:\n- ${grade.missingPoints.join("\n- ")}` : "",
    grade.feedback,
  ]
    .filter(Boolean)
    .join("\n\n");

  await db.chatMessage.createMany({
    data: [
      { chatSessionId, role: "USER", content: userContent },
      { chatSessionId, role: "ASSISTANT", content: assistantContent },
    ],
  });

  return { userContent, assistantContent };
}
