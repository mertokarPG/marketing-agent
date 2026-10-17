import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) await (await createClient()).auth.exchangeCodeForSession(code);
  // Only same-origin relative paths; anything else falls back to "/".
  return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next")), url.origin));
}
