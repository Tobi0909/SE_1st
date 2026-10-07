import {
  BookOpen,
  Bot,
  LayoutDashboard,
  Layers,
  ListChecks,
  Map,
  ShieldCheck,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  shortcut?: string;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Hôm nay", href: "/dashboard", icon: LayoutDashboard, shortcut: "G D" },
  { label: "Roadmap", href: "/roadmap", icon: Map, shortcut: "G R" },
  { label: "Quiz", href: "/quiz", icon: ListChecks, shortcut: "G Q" },
  { label: "Flashcard", href: "/flashcards", icon: Layers, shortcut: "G F" },
  { label: "Lab", href: "/lab", icon: Terminal, shortcut: "G L" },
  { label: "Tutor", href: "/tutor", icon: Bot, shortcut: "G T" },
  { label: "Tri thức", href: "/knowledge", icon: BookOpen, shortcut: "G K" },
  { label: "Team", href: "/team", icon: Users },
  { label: "Admin", href: "/admin", icon: ShieldCheck, adminOnly: true },
];
