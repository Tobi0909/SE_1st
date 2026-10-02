"use client";

import { useState, useTransition } from "react";

import { reviewFlashcardAction } from "@/app/(app)/flashcards/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

interface FlashcardOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
}

interface FlashcardData {
  questionId: string;
  topicName: string;
  stem: string;
  options: FlashcardOption[];
}

export function FlashcardReview({ cards }: { cards: FlashcardData[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (index >= cards.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Xong! Bạn đã ôn {cards.length} thẻ hôm nay.</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const card = cards[index];
  const correctOption = card.options.find((o) => o.isCorrect);

  function rate(quality: number) {
    if (isPending) return;
    startTransition(async () => {
      await reviewFlashcardAction(card.questionId, quality);
      setIndex((i) => i + 1);
      setRevealed(false);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {card.topicName} · Thẻ {index + 1}/{cards.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="whitespace-pre-wrap">{card.stem}</p>
        {revealed ? (
          <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
            <p className="font-medium text-green-700 dark:text-green-400">{correctOption?.text}</p>
            {card.options.map((o) => (
              <p key={o.id} className="text-xs text-muted-foreground">
                {o.isCorrect ? "✓" : "✗"} {o.text}: {o.explanation}
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="flex gap-2">
        {!revealed ? (
          <Button onClick={() => setRevealed(true)}>Lật thẻ</Button>
        ) : (
          <>
            <Button variant="outline" disabled={isPending} onClick={() => rate(2)}>
              Quên
            </Button>
            <Button variant="outline" disabled={isPending} onClick={() => rate(4)}>
              Nhớ
            </Button>
            <Button disabled={isPending} onClick={() => rate(5)}>
              Dễ
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
