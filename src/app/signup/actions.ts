"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SignUpActionResult {
  error?: string;
  needsEmailConfirmation?: boolean;
}

export async function signUpWithPassword(
  _prev: SignUpActionResult,
  formData: FormData
): Promise<SignUpActionResult> {
  const fullName = String(formData.get("fullName") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const { error, data } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) return { error: error.message };

  if (!data.session) {
    return { needsEmailConfirmation: true };
  }

  redirect("/projects");
}
