"use client";

import { useEffect, useState, type ReactNode } from "react";

import { CommandPalette } from "@/components/shell/command-palette";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { TooltipProvider } from "@/components/ui/tooltip";

const COLLAPSE_STORAGE_KEY = "se-dojo-sidebar-collapsed";

interface AppShellProps {
  name: string;
  email: string;
  isAdmin: boolean;
  children: ReactNode;
}

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppShell({ name, email, isAdmin, children }: AppShellProps) {
  // Lazy initializer: đọc localStorage ngay lần render đầu trên client để tránh phải
  // setState trong effect (gây render kép, bị react-hooks/set-state-in-effect chặn ở lint).
  // Server luôn render "mở rộng" (window undefined); nếu client có lưu "thu gọn", className
  // của <aside> sẽ khác bản SSR ở đúng 1 lần hydrate — chấp nhận được cho 1 preference UI
  // thuần client, không ảnh hưởng nội dung/SEO (suppressHydrationWarning ở Sidebar).
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // bỏ qua nếu không lưu được
      }
      return next;
    });
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar isAdmin={isAdmin} collapsed={collapsed} onToggle={toggleCollapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar name={name} email={email} isAdmin={isAdmin} onOpenSearch={() => setSearchOpen(true)} />
          <main className="flex-1 overflow-y-auto">
            <div className="w-full max-w-6xl p-6">{children}</div>
          </main>
        </div>
      </div>
      <CommandPalette isAdmin={isAdmin} open={searchOpen} onOpenChange={setSearchOpen} />
    </TooltipProvider>
  );
}
