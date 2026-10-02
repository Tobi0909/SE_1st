"use client";

import { useRef, useState, useTransition } from "react";

import { gradeMyAnswerAction } from "@/app/(app)/tutor/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChatContextType } from "@/generated/prisma/client";

interface ChatMessageView {
  role: "USER" | "ASSISTANT";
  content: string;
}

interface TutorChatProps {
  chatSessionId: string;
  contextLabel: string;
  contextType: ChatContextType;
  contextId: string;
  initialMessages: ChatMessageView[];
}

export function TutorChat({
  chatSessionId,
  contextLabel,
  contextType,
  contextId,
  initialMessages,
}: TutorChatProps) {
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showEssayForm, setShowEssayForm] = useState(false);
  const [essayText, setEssayText] = useState("");
  const [isGrading, startGrading] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || isStreaming) return;

    setMessages((m) => [...m, { role: "USER", content: text }, { role: "ASSISTANT", content: "" }]);
    setInput("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatSessionId, message: text }),
      });
      if (!res.body) throw new Error("Không nhận được phản hồi stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "ASSISTANT", content: acc };
          return copy;
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "ASSISTANT", content: `[Lỗi: ${errMsg}]` };
        return copy;
      });
    } finally {
      setIsStreaming(false);
    }
  }

  function submitEssay() {
    const text = essayText.trim();
    if (!text || isGrading) return;
    startGrading(async () => {
      const result = await gradeMyAnswerAction(chatSessionId, contextId, text);
      setMessages((m) => [
        ...m,
        { role: "USER", content: result.userContent },
        { role: "ASSISTANT", content: result.assistantContent },
      ]);
      setEssayText("");
      setShowEssayForm(false);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Tutor</CardTitle>
        <CardDescription>{contextLabel}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div ref={listRef} className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Hỏi tutor bất cứ điều gì về ngữ cảnh này.</p>
          ) : null}
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "USER"
                  ? "ml-8 rounded-md bg-primary/10 p-2 text-sm whitespace-pre-wrap"
                  : "mr-8 rounded-md border p-2 text-sm whitespace-pre-wrap"
              }
            >
              {m.content || (isStreaming && i === messages.length - 1 ? "…" : "")}
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            disabled={isStreaming}
            rows={2}
            placeholder="Nhập câu hỏi..."
            className="flex-1 rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button onClick={() => void send()} disabled={isStreaming || !input.trim()}>
            Gửi
          </Button>
        </div>

        {contextType === "QUESTION" ? (
          <div className="flex flex-col gap-2 border-t pt-3">
            {showEssayForm ? (
              <>
                <textarea
                  value={essayText}
                  onChange={(e) => setEssayText(e.target.value)}
                  rows={3}
                  placeholder="Viết lý giải của bạn cho câu hỏi này để tutor chấm..."
                  className="rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex gap-2">
                  <Button size="sm" disabled={isGrading || !essayText.trim()} onClick={submitEssay}>
                    Nộp để chấm
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowEssayForm(false)}>
                    Huỷ
                  </Button>
                </div>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setShowEssayForm(true)}>
                Nộp câu trả lời tự luận để chấm
              </Button>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
