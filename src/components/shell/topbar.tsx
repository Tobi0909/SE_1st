"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

import { NAV_ITEMS } from "@/components/shell/nav-items";
import { UserMenu } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";

function useBreadcrumb(pathname: string): string[] {
  const match = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  if (!match) return [];

  const rest = pathname.slice(match.href.length).split("/").filter(Boolean);
  return [match.label, ...rest.map(decodeURIComponent)];
}

interface TopbarProps {
  name: string;
  email: string;
  isAdmin: boolean;
  onOpenSearch: () => void;
}

export function Topbar({ name, email, isAdmin, onOpenSearch }: TopbarProps) {
  const pathname = usePathname();
  const crumbs = useBreadcrumb(pathname);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border px-4">
      <nav aria-label="Breadcrumb" className="min-w-0 text-sm text-muted-foreground">
        <ol className="flex items-center gap-1.5 truncate">
          {crumbs.length === 0 ? (
            <li className="text-foreground">SE Dojo</li>
          ) : (
            crumbs.map((crumb, i) => (
              <li key={i} className="flex items-center gap-1.5 truncate">
                {i > 0 ? <span className="text-border">/</span> : null}
                <span className={i === crumbs.length - 1 ? "truncate text-foreground" : "truncate"}>
                  {crumb}
                </span>
              </li>
            ))
          )}
        </ol>
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-7 items-center gap-2 rounded-md border border-input bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Search className="size-3.5" />
          <span className="hidden sm:inline">Tìm trang</span>
          <kbd className="ml-1 hidden rounded border border-border bg-muted px-1 font-mono text-[10px] sm:inline">
            {isMac ? "⌘K" : "Ctrl K"}
          </kbd>
        </button>
        <ThemeToggle />
        <UserMenu name={name} email={email} isAdmin={isAdmin} />
      </div>
    </header>
  );
}
