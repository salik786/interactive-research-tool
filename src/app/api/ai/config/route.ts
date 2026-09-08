import { NextResponse } from "next/server";
import { availableProviders } from "@/lib/ai/generate";

export async function GET() {
  return NextResponse.json({ providers: availableProviders() });
}
