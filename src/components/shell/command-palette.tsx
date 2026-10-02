"use client";

import { useRouter } from "next/navigation";

import { NAV_ITEMS } from "@/components/shell/nav-items";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

interface CommandPaletteProps {
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ isAdmin, open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Điều hướng"
      description="Chuyển trang nhanh"
    >
      <Command>
        <CommandInput placeholder="Tìm trang..." />
        <CommandList>
          <CommandEmpty>Không tìm thấy.</CommandEmpty>
          <CommandGroup heading="Điều hướng">
            {items.map((item) => (
              <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                <item.icon className="size-4" />
                {item.label}
                {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
