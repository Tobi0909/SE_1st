"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { NAV_ITEMS } from "@/components/shell/nav-items";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SidebarProps {
  isAdmin: boolean;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ isAdmin, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside
      suppressHydrationWarning
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-150",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div
        className={cn(
          "flex h-12 shrink-0 items-center border-b border-sidebar-border px-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {!collapsed ? (
          <Link href="/dashboard" className="text-sm font-semibold text-sidebar-foreground">
            SE Dojo
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const link = (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon
                className={cn(
                  "size-4 shrink-0",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-accent-foreground",
                )}
              />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );

          if (!collapsed) return link;

          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </aside>
  );
}
