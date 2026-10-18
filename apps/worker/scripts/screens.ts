// Local dev tool: screenshot a signed-in web page. Prints only the output path.
// Usage (cwd apps/worker): npx tsx --env-file=.env scripts/screens.ts <path> <out.png> [--width 1440|390] [--theme dark|light]
import { createClient } from "@supabase/supabase-js";
import { launchBrowser } from "../src/lib/browser.js";

const ORIGIN = "http://localhost:3000";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const [path, out] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
  if (!path?.startsWith("/") || !out) throw new Error("usage: screens.ts <path> <out.png> [--width 1440|390] [--theme dark|light]");
  const width = Number(arg("width", "1440"));
  const theme = arg("theme", "dark") === "light" ? "light" : "dark";
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OWNER_EMAIL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OWNER_EMAIL) throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OWNER_EMAIL must be set");

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER_EMAIL });
  if (error || !data.properties?.hashed_token) throw new Error("could not generate a sign-in link");

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
    await page.setCookie({ name: "cp-theme", value: theme, url: ORIGIN });
    const confirm = `${ORIGIN}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=${encodeURIComponent(path)}`;
    await page.goto(confirm, { waitUntil: "networkidle0", timeout: 60_000 });
    await page.screenshot({ path: out as `${string}.png`, fullPage: true });
  } finally {
    await browser.close();
  }
  console.log(out);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "screens failed");
  process.exit(1);
});
