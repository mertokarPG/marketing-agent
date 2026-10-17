import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const h = await headers();
  const site = process.env.NEXT_PUBLIC_SITE_URL || h.get("origin") || "";
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` } });
  redirect(error ? "/login?error=send" : "/login?sent=1");
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; next?: string }> }) {
  const { error, sent, next } = await searchParams;
  return (
    <main>
      <h1>Sign in to Carepost</h1>
      {sent ? <p>Check your email for a sign-in link.</p> : (
        <>
          <p>We&apos;ll email you a sign-in link.</p>
          {error === "send" ? <p role="alert">We couldn&apos;t send the link. Please try again.</p> : null}
          {error === "link" ? <p role="alert">That sign-in link is invalid or expired. Please request a new one.</p> : null}
          <form action={sendLink}>
            <input type="hidden" name="next" value={safeNextPath(next)} />
            <input name="email" type="email" required placeholder="you@brand.com" />
            <button type="submit">Email me a link</button>
          </form>
        </>
      )}
    </main>
  );
}
