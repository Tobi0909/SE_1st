import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/provider";
import { requireUser } from "@/lib/rbac";
import { buildTutorContext } from "@/lib/tutor/context";

const RequestSchema = z.object({
  chatSessionId: z.string().min(1),
  message: z.string().min(1).max(4000),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();

  const parsed = RequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { chatSessionId, message } = parsed.data;

  const chatSession = await db.chatSession.findUnique({ where: { id: chatSessionId } });
  if (!chatSession || chatSession.userId !== user.id) {
    return NextResponse.json({ error: "Không tìm thấy phiên chat" }, { status: 404 });
  }

  const history = await db.chatMessage.findMany({
    where: { chatSessionId },
    orderBy: { createdAt: "asc" },
  });
  const context = await buildTutorContext(chatSession.contextType, chatSession.contextId);

  await db.chatMessage.create({ data: { chatSessionId, role: "USER", content: message } });

  const provider = await getLLMProvider();
  const tokenStream = provider.chatStream({
    userId: user.id,
    systemContext: context.description,
    history: history.map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
    message,
  });

  const encoder = new TextEncoder();
  let full = "";

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of tokenStream) {
          full += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        full += `\n\n[Lỗi: ${message}]`;
        controller.enqueue(encoder.encode(`\n\n[Lỗi: ${message}]`));
      } finally {
        if (full.trim()) {
          await db.chatMessage.create({ data: { chatSessionId, role: "ASSISTANT", content: full } });
        }
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
