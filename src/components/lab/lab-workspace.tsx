"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useState, useTransition } from "react";

import {
  flagLabScenarioAction,
  getHintAction,
  runCommandAction,
  submitLabAction,
} from "@/app/(app)/lab/[sessionId]/actions";
import { LabTerminal } from "@/components/lab/lab-terminal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { SubmissionGrade } from "@/lib/llm/schemas";

const HINT_LEVELS = [1, 2, 3] as const;

interface RelatedArticle {
  knowledgeId: string;
  title: string;
}

interface LabWorkspaceProps {
  sessionId: string;
  title: string;
  briefing: { context: string; symptoms: string[] };
  commandHistory: { command: string; output: string }[];
  usedHintLevels: number[];
  isCompleted: boolean;
  grade: SubmissionGrade | null;
  relatedArticles?: RelatedArticle[];
}

export function LabWorkspace({
  sessionId,
  title,
  briefing,
  commandHistory,
  usedHintLevels,
  isCompleted,
  grade: initialGrade,
  relatedArticles = [],
}: LabWorkspaceProps) {
  const [hints, setHints] = useState<Record<number, string>>({});
  const [isPending, startTransition] = useTransition();
  const [rootCauseText, setRootCauseText] = useState("");
  const [fixText, setFixText] = useState("");
  const [grade, setGrade] = useState<SubmissionGrade | null>(initialGrade);
  const [completed, setCompleted] = useState(isCompleted);
  const [flagged, setFlagged] = useState(false);

  function reportScenario() {
    setFlagged(true);
    startTransition(() => flagLabScenarioAction(sessionId, ""));
  }

  const initialLines = commandHistory.flatMap((h) => [`$ ${h.command}`, h.output].filter(Boolean));

  function revealHint(level: number) {
    startTransition(async () => {
      const text = await getHintAction(sessionId, level);
      setHints((prev) => ({ ...prev, [level]: text }));
    });
  }

  function handleSubmit() {
    if (!rootCauseText.trim() || !fixText.trim() || isPending) return;
    startTransition(async () => {
      const result = await submitLabAction(sessionId, rootCauseText, fixText);
      setGrade(result);
      setCompleted(true);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{briefing.context}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {briefing.symptoms.map((symptom) => (
                <li key={symptom}>{symptom}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <LabTerminal
          initialLines={initialLines}
          disabled={completed}
          onCommand={(command) => runCommandAction(sessionId, command)}
        />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/tutor?contextType=LAB&contextId=${sessionId}`} target="_blank">
              Hỏi AI tutor
            </Link>
          </Button>
          {!flagged ? (
            <button
              type="button"
              onClick={reportScenario}
              className="text-xs text-muted-foreground underline"
            >
              Báo lab sai
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">Đã báo, cảm ơn bạn.</p>
          )}
        </div>
        {relatedArticles.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <BookOpen className="size-3" /> Tài liệu liên quan
            </p>
            {relatedArticles.map((a) => (
              <Link
                key={a.knowledgeId}
                href={`/knowledge/${encodeURIComponent(a.knowledgeId)}`}
                className="text-xs text-primary hover:underline"
              >
                {a.title}
              </Link>
            ))}
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Gợi ý</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {HINT_LEVELS.map((level) => (
              <div key={level} className="flex flex-col gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => revealHint(level)}
                >
                  Gợi ý {level}
                </Button>
                {hints[level] ? (
                  <p className="text-xs text-muted-foreground">{hints[level]}</p>
                ) : usedHintLevels.includes(level) ? (
                  <p className="text-xs text-muted-foreground italic">Đã xem trước đó, bấm để xem lại</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nộp bài</CardTitle>
            <CardDescription>Nêu nguyên nhân gốc và cách xử lý bạn phát hiện được.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {grade ? (
              <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
                <p className="font-medium">Điểm: {grade.total}/100</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{grade.feedback}</p>
                {grade.byRubricItem.length > 0 ? (
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {grade.byRubricItem.map((item) => (
                      <li key={item.criterion}>
                        {item.met ? "✓" : "✗"} {item.criterion}: {item.feedback}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="rootCause">Nguyên nhân gốc</Label>
                  <textarea
                    id="rootCause"
                    rows={4}
                    value={rootCauseText}
                    onChange={(e) => setRootCauseText(e.target.value)}
                    className="rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fix">Cách xử lý</Label>
                  <textarea
                    id="fix"
                    rows={4}
                    value={fixText}
                    onChange={(e) => setFixText(e.target.value)}
                    className="rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <Button
                  disabled={isPending || !rootCauseText.trim() || !fixText.trim()}
                  onClick={handleSubmit}
                >
                  Nộp bài
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
