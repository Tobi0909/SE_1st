import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "default" | "accent";
}

export function StatTile({ label, value, icon: Icon, tone = "default" }: StatTileProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          tone === "accent" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}
