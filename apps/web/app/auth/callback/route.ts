import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/login?error=link", url.origin));
  const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=link", url.origin));
  // Only same-origin relative paths; anything else falls back to "/".
  return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next")), url.origin));
}
