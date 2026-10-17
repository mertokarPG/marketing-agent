import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Anon key + the user's session only: RLS enforces tenancy. Never use a service-role key here.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* server component: proxy refreshes */ }
      },
    },
  });
}
