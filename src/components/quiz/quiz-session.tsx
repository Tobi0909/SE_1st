"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { flagQuestionAction, recordAnswerAction, type AnswerFeedback } from "@/app/(app)/quiz/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface QuizOption {
  id: string;
  text: string;
}

interface QuizQuestion {
  id: string;
  stem: string;
  options: QuizOption[];
}

export function QuizSession({
  topicName,
  difficulty,
  questions,
}: {
  topicName: string;
  difficulty: string;
  questions: QuizQuestion[];
}) {
  const [index, setIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [score, setScore] = useState(0);
  const [flagged, setFlagged] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (index >= questions.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hoàn thành!</CardTitle>
        </CardHeader>
        <CardContent>
          Điểm: {score}/{questions.length}
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/quiz">Luyện lại</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const question = questions[index];
  const isLast = index === questions.length - 1;

  function submitAnswer(optionId: string) {
    if (feedback || isPending) return;
    setSelectedId(optionId);
    startTransition(async () => {
      const result = await recordAnswerAction(question.id, optionId);
      setFeedback(result);
      if (result.correct) setScore((s) => s + 1);
    });
  }

  function next() {
    setIndex((i) => i + 1);
    setSelectedId(null);
    setFeedback(null);
    setFlagged(false);
  }

  function report() {
    setFlagged(true);
    startTransition(() => flagQuestionAction(question.id, ""));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {topicName} · {difficulty} · Câu {index + 1}/{questions.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="whitespace-pre-wrap">{question.stem}</p>
        <div className="flex flex-col gap-2">
          {question.options.map((o) => {
            const optFeedback = feedback?.options.find((f) => f.id === o.id);
            return (
              <button
                key={o.id}
                type="button"
                disabled={!!feedback || isPending}
                onClick={() => submitAnswer(o.id)}
                className={cn(
                  "rounded-md border p-3 text-left text-sm transition-colors",
                  !feedback && "hover:bg-accent",
                  feedback && optFeedback?.isCorrect && "border-green-600 bg-green-600/10",
                  feedback &&
                    !optFeedback?.isCorrect &&
                    o.id === selectedId &&
                    "border-destructive bg-destructive/10",
                )}
              >
                <div>{o.text}</div>
                {optFeedback ? (
                  <div className="mt-1 text-xs text-muted-foreground">{optFeedback.explanation}</div>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          {!flagged ? (
            <button
              type="button"
              onClick={report}
              className="text-xs text-muted-foreground underline"
            >
              Báo câu sai
            </button>
          ) : (
            <p className="text-xs text-muted-foreground">Đã báo, cảm ơn bạn.</p>
          )}
          <Link
            href={`/tutor?contextType=QUESTION&contextId=${question.id}`}
            target="_blank"
            className="text-xs text-muted-foreground underline"
          >
            Hỏi AI tutor
          </Link>
        </div>
      </CardContent>
      {feedback ? (
        <CardFooter>
          <Button onClick={next}>{isLast ? "Xem kết quả" : "Câu tiếp theo"}</Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
