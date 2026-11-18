import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // /siglum/* is the static LaTeX engine worker in /public — public static
    // assets must never go through the Supabase auth check (it would turn the
    // worker script into a login redirect, and add a network call per asset).
    "/((?!_next/static|_next/image|favicon.ico|siglum/|pdfjs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
