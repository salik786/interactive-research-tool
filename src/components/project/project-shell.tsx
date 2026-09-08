"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Menu, BookOpenText } from "lucide-react";
import { ProjectSidebarNav } from "./project-sidebar-nav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/visually-hidden";
import { ThemeToggle } from "@/components/theme-toggle";

export function ProjectShell({
  projectId,
  projectName,
  children,
}: {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <SidebarHeader projectName={projectName} />
        <ProjectSidebarNav projectId={projectId} />
      </aside>

      {/* Mobile top bar */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <span className="flex-1 truncate font-serif text-base font-semibold">{projectName}</span>
          <ThemeToggle />
        </header>

        <main className="flex-1 bg-bg">{children}</main>
      </div>

      {/* Mobile drawer */}
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogContent className="left-0 top-0 h-full max-h-full w-72 max-w-[85vw] translate-x-0 translate-y-0 rounded-none p-0 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left">
          <VisuallyHidden>
            <DialogTitle>Navigation</DialogTitle>
          </VisuallyHidden>
          <div className="flex h-full flex-col">
            <SidebarHeader projectName={projectName} />
            <ProjectSidebarNav projectId={projectId} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SidebarHeader({ projectName }: { projectName: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border p-4">
      <div className="flex items-center justify-between">
        <Link
          href="/projects"
          className="flex min-h-11 items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          All projects
        </Link>
        <ThemeToggle />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
          <BookOpenText className="h-4 w-4" />
        </div>
        <span className="truncate font-serif text-base font-semibold">{projectName}</span>
      </div>
    </div>
  );
}
