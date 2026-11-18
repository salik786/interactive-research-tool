"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Target,
  ListTree,
  FlaskConical,
  FileStack,
  GitBranch,
  Layers,
  PenLine,
  FileCode2,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "overview", label: "Overview", icon: LayoutDashboard },
  { href: "scope", label: "Scope & PCC", icon: Target },
  { href: "search-blocks", label: "Search blocks", icon: ListTree },
  { href: "search-testing", label: "Search testing", icon: FlaskConical },
  { href: "papers", label: "Papers & screening", icon: FileStack },
  { href: "prisma-flow", label: "PRISMA flow", icon: GitBranch },
  { href: "themes", label: "Themes", icon: Layers },
  { href: "outline", label: "Outline", icon: PenLine },
  { href: "latex", label: "LaTeX", icon: FileCode2 },
  { href: "settings", label: "Settings", icon: Settings },
];

export function ProjectSidebarNav({ projectId, onNavigate }: { projectId: string; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {NAV_ITEMS.map((item) => {
        const href = `/projects/${projectId}/${item.href}`;
        const active = pathname === href || pathname.startsWith(href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-primary/10 text-primary"
                : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
