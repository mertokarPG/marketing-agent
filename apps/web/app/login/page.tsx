import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const h = await headers();
  const site = process.env.NEXT_PUBLIC_SITE_URL || h.get("origin") || "";
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` } });
  redirect(error ? `/login?error=send&next=${encodeURIComponent(next)}` : "/login?sent=1");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; next?: string }> }) {
  const { error, sent, next } = await searchParams;
  return (
    <>
      <Nav />
      <main className="login">
        <h1 className="wide hero">Sign <b>in.</b></h1>
        {sent ? <p className="lede">Check your email. The link signs you in on this device.</p> : (
          <>
            {error === "send" ? <p role="alert">We couldn&apos;t send the link. Please try again.</p> : null}
            {error === "link" ? <p role="alert">That sign-in link is invalid or expired. Please request a new one.</p> : null}
            <form action={sendLink} className="login-form">
              <input type="hidden" name="next" value={safeNextPath(next)} />
              <label htmlFor="email" className="sr">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@brand.com" />
              <button type="submit" className="pill">Send me a link ↳</button>
            </form>
          </>
        )}
      </main>
    </>
  );
}
