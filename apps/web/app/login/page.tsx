import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback` } });
}

export default function Login() {
  return (
    <main>
      <h1>Sign in to Carepost</h1>
      <p>We&apos;ll email you a sign-in link.</p>
      <form action={sendLink}>
        <input name="email" type="email" required placeholder="you@brand.com" />
        <button type="submit">Email me a link</button>
      </form>
    </main>
  );
}
