import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let pending: { name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }[] = [];
  let pendingHeaders: Record<string, string> = {};
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        pending = list;
        pendingHeaders = headers ?? {};
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(pendingHeaders).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const p = request.nextUrl.pathname;
  const open = p === "/login" || p.startsWith("/auth/");
  if (!user && !open) {
    const redirect = NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(p + request.nextUrl.search)}`, request.url));
    pending.forEach(({ name, value, options }) => redirect.cookies.set(name, value, options));
    Object.entries(pendingHeaders).forEach(([k, v]) => redirect.headers.set(k, v));
    return redirect;
  }
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"] };
