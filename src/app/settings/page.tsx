import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountForm } from "./account-form";

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (
    <div className="min-h-screen bg-bg">
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-4 sm:px-8">
        <Link href="/projects" className="flex min-h-11 w-fit items-center gap-2 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-4 w-4" /> All projects
        </Link>
        <ThemeToggle />
      </div>
      <PageHeader title="Account settings" />
      <div className="mx-auto max-w-lg p-4 sm:p-8">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountForm
              email={user.email ?? ""}
              initialFullName={profile?.full_name ?? ""}
              initialAvatarUrl={profile?.avatar_url ?? ""}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
