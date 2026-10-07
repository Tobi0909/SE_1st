"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

const LEVEL_OPTIONS = [
  { value: "FOUNDATION", label: "Nền tảng" },
  { value: "OPERATION",  label: "Vận hành" },
  { value: "EXPERT",     label: "Chuyên sâu" },
];

const STATUS_OPTIONS = [
  { value: "VERIFIED", label: "Verified" },
  { value: "DRAFT",    label: "Draft" },
];

const DOMAIN_LABEL: Record<string, string> = {
  "linux":          "Linux",
  "networking":     "Networking",
  "container-k8s":  "Container / K8s",
  "devops":         "DevOps",
  "monitoring":     "Monitoring",
  "security":       "Security",
  "sre":            "SRE",
  "virt-storage":   "Virt / Storage",
  "data":           "Data",
};

interface KnowledgeFiltersProps {
  domains: string[];
  isAdmin?: boolean;
}

export function KnowledgeFilters({ domains, isAdmin = false }: KnowledgeFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const update = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page"); // reset pagination on filter change
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const current = {
    q:      searchParams.get("q") ?? "",
    domain: searchParams.get("domain") ?? "",
    level:  searchParams.get("level") ?? "",
    status: searchParams.get("status") ?? "",
  };

  function FilterChip({
    paramKey, value, label,
  }: { paramKey: string; value: string; label: string }) {
    const active = searchParams.get(paramKey) === value;
    return (
      <button
        onClick={() => update(paramKey, active ? null : value)}
        className={cn(
          "rounded border px-2 py-1 text-xs transition-colors",
          active
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground",
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search box */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Tìm kiếm bài viết..."
          defaultValue={current.q}
          onChange={e => {
            const val = e.target.value;
            clearTimeout((window as unknown as { _kbSearchTimer?: ReturnType<typeof setTimeout> })._kbSearchTimer);
            (window as unknown as { _kbSearchTimer?: ReturnType<typeof setTimeout> })._kbSearchTimer =
              setTimeout(() => update("q", val || null), 300);
          }}
          className="w-full rounded-md border border-border bg-muted/20 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
        />
        {current.q && (
          <button
            onClick={() => update("q", null)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Domain filter */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Lĩnh vực</p>
        <div className="flex flex-wrap gap-1.5">
          {domains.map(d => (
            <FilterChip key={d} paramKey="domain" value={d} label={DOMAIN_LABEL[d] ?? d} />
          ))}
        </div>
      </div>

      {/* Level filter */}
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Cấp độ</p>
        <div className="flex flex-wrap gap-1.5">
          {LEVEL_OPTIONS.map(opt => (
            <FilterChip key={opt.value} paramKey="level" value={opt.value} label={opt.label} />
          ))}
        </div>
      </div>

      {/* Status filter — admin only */}
      {isAdmin && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Trạng thái</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map(opt => (
              <FilterChip key={opt.value} paramKey="status" value={opt.value} label={opt.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
