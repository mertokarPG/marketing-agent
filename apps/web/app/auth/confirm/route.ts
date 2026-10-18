import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { confirmAllowed } from "@/lib/brand-context";

// Local dev/screenshot aid only. A GET with a valid token_hash signs the visiting browser in, which would be login CSRF in production.
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (!token_hash || !confirmAllowed(process.env.NODE_ENV, type)) return NextResponse.redirect(new URL("/login?error=link", url.origin));
  const { error } = await (await createClient()).auth.verifyOtp({ token_hash, type: "magiclink" });
  if (error) return NextResponse.redirect(new URL("/login?error=link", url.origin));
  return NextResponse.redirect(new URL(safeNextPath(url.searchParams.get("next")), url.origin));
}
