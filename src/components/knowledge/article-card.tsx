import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ArticleListItem } from "@/lib/knowledge/queries";

const LEVEL_LABEL: Record<string, string> = {
  FOUNDATION: "Nền tảng",
  OPERATION:  "Vận hành",
  EXPERT:     "Chuyên sâu",
};

const LEVEL_STYLE: Record<string, string> = {
  FOUNDATION: "bg-info/10 text-info border-info/20",
  OPERATION:  "bg-warning/10 text-warning border-warning/20",
  EXPERT:     "bg-destructive/10 text-destructive border-destructive/20",
};

const DOMAIN_LABEL: Record<string, string> = {
  "linux":            "Linux",
  "networking":       "Networking",
  "container-k8s":    "Container / K8s",
  "devops":           "DevOps",
  "monitoring":       "Monitoring",
  "security":         "Security",
  "sre":              "SRE",
  "virt-storage":     "Virt / Storage",
  "data":             "Data",
};

interface ArticleCardProps {
  article: ArticleListItem;
  isAdmin?: boolean;
}

export function ArticleCard({ article, isAdmin = false }: ArticleCardProps) {
  // knowledgeId contains dots; encode for URL
  const href = `/knowledge/${encodeURIComponent(article.knowledgeId)}`;

  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-card/80"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary">
          {article.title}
        </p>
        {isAdmin && article.status === "DRAFT" && (
          <span className="shrink-0 rounded border border-warning/30 bg-warning/10 px-1.5 py-0.5 font-mono text-xs text-warning">
            DRAFT
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground">
          {DOMAIN_LABEL[article.domain] ?? article.domain}
        </span>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-xs",
            LEVEL_STYLE[article.level] ?? "bg-muted/40 text-muted-foreground border-border",
          )}
        >
          {LEVEL_LABEL[article.level] ?? article.level}
        </span>
        {isAdmin && article.todoVerifyCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-warning">
            <AlertTriangle className="size-3" />
            {article.todoVerifyCount} TODO
          </span>
        )}
      </div>
    </Link>
  );
}
