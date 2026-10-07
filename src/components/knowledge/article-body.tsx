"use client";

import ReactMarkdown from "react-markdown";

interface ArticleBodyProps {
  content: string;
}

export function ArticleBody({ content }: ArticleBodyProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none
      prose-headings:font-semibold prose-headings:text-foreground
      prose-p:text-foreground/90 prose-p:leading-relaxed
      prose-a:text-primary prose-a:no-underline hover:prose-a:underline
      prose-code:rounded prose-code:bg-muted/60 prose-code:px-1 prose-code:py-0.5
      prose-code:font-mono prose-code:text-xs prose-code:text-foreground
      prose-pre:rounded-md prose-pre:border prose-pre:border-border prose-pre:bg-muted/30
      prose-blockquote:border-primary/40 prose-blockquote:text-muted-foreground
      prose-strong:text-foreground prose-strong:font-semibold
      prose-hr:border-border
      prose-li:text-foreground/90
      prose-table:text-sm
      prose-th:border prose-th:border-border prose-th:bg-muted/30 prose-th:px-3 prose-th:py-1.5
      prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-1.5">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
