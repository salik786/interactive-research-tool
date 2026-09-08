import { BookOpenText } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white">
            <BookOpenText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-semibold">{title}</h1>
            <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
