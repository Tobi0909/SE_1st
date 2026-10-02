import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { ContinueItem } from "@/lib/dashboard/stats";

export function ContinueLearning({ item }: { item: ContinueItem | null }) {
  if (!item) return null;

  return (
    <Link
      href={item.href}
      className="group flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50"
    >
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{item.meta}</p>
        <p className="truncate text-sm font-medium">{item.label}</p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}
