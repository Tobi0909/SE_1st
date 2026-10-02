import Link from "next/link";

import { TutorChat } from "@/components/tutor/tutor-chat";
import type { ChatContextType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { buildTutorContext } from "@/lib/tutor/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const VALID_CONTEXT_TYPES: ChatContextType[] = ["NODE", "QUESTION", "LAB"];

export default async function TutorPage({ searchParams }: PageProps<"/tutor">) {
  const user = await requireUser();
  const params = await searchParams;
  const contextTypeRaw = typeof params.contextType === "string" ? params.contextType : undefined;
  const contextId = typeof params.contextId === "string" ? params.contextId : undefined;

  if (!contextTypeRaw || !contextId || !VALID_CONTEXT_TYPES.includes(contextTypeRaw as ChatContextType)) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Mở AI tutor từ một ngữ cảnh cụ thể</CardTitle>
          <CardDescription>
            Hãy mở tutor từ 1 câu hỏi quiz, 1 bài lab, hoặc 1 kỹ năng trong roadmap để tutor hỗ
            trợ đúng trọng tâm.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/quiz">Quiz</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/lab">Lab</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/roadmap">Roadmap</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const contextType = contextTypeRaw as ChatContextType;

  const existingSession = await db.chatSession.findFirst({
    where: { userId: user.id, contextType, contextId },
    orderBy: { createdAt: "desc" },
  });
  const chatSession =
    existingSession ??
    (await db.chatSession.create({ data: { userId: user.id, contextType, contextId } }));

  const [messages, context] = await Promise.all([
    db.chatMessage.findMany({ where: { chatSessionId: chatSession.id }, orderBy: { createdAt: "asc" } }),
    buildTutorContext(contextType, contextId),
  ]);

  return (
    <div className="max-w-2xl">
      <TutorChat
        chatSessionId={chatSession.id}
        contextLabel={context.label}
        contextType={contextType}
        contextId={contextId}
        initialMessages={messages.map((m) => ({ role: m.role, content: m.content }))}
      />
    </div>
  );
}
