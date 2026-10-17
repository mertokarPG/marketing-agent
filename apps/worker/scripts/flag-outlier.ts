import path from "path";
import dotenv from "dotenv";
dotenv.config();
import { createDatabase } from "../src/db/schema.js";
import { setPostOutlier } from "../src/db/queries.js";

interface Args {
  postId?: number;
  reason?: string;
  unflag?: boolean;
  list?: boolean;
  find?: string;
  dbPath: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { dbPath: path.resolve("marketing-agent.db") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--reason") out.reason = argv[++i];
    else if (a === "--unflag") out.unflag = true;
    else if (a === "--list") out.list = true;
    else if (a === "--find") out.find = argv[++i];
    else if (a === "--db") out.dbPath = path.resolve(argv[++i]);
    else if (/^\d+$/.test(a)) out.postId = parseInt(a, 10);
  }
  return out;
}

function usage(): never {
  console.log(`Flag a post as an outlier so the agent discounts it when looking for patterns.

Usage:
  npm run flag-outlier -- --list                              # recent posts with ids + IG URLs
  npm run flag-outlier -- --find <keyword>                    # search captions/themes
  npm run flag-outlier -- <post-id> --reason "<why>"          # flag
  npm run flag-outlier -- <post-id> --unflag                  # clear flag

Notes:
  Post id is the internal DB id (integer), not the Postiz id.
  --list and --find both show the internal id, which is what you pass to flag.`);
  process.exit(1);
}

async function fetchPostizReleaseUrls(
  externalIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const apiKey = process.env.POSTIZ_API_KEY;
  if (!apiKey || externalIds.length === 0) return out;
  const baseUrl =
    process.env.POSTIZ_BASE_URL ?? "https://app.postiz.com/api/public/v1";
  // Fetch a 90-day window covering everything we show.
  const end = new Date();
  const start = new Date(end.getTime() - 90 * 24 * 3600 * 1000);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = new Date(end.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  try {
    const res = await fetch(
      `${baseUrl}/posts?startDate=${startDate}&endDate=${endDate}`,
      { headers: { Authorization: apiKey } }
    );
    if (!res.ok) return out;
    const body = (await res.json()) as {
      posts?: Array<{ id: string; releaseURL: string | null }>;
    };
    for (const p of body.posts ?? []) {
      if (p.releaseURL) out.set(p.id, p.releaseURL);
    }
  } catch {
    // network errors are non-fatal — we just omit the URLs
  }
  return out;
}

interface ListRow {
  id: number;
  posted_at: string | null;
  is_outlier: number;
  notes: string | null;
  content_theme: string | null;
  caption: string;
  external_post_id: string | null;
}

async function printList(rows: ListRow[]): Promise<void> {
  const externalIds = rows
    .map((r) => r.external_post_id)
    .filter((x): x is string => typeof x === "string" && x.length > 0);
  const urls = await fetchPostizReleaseUrls(externalIds);

  for (const r of rows) {
    const flag = r.is_outlier ? "[OUTLIER]" : "         ";
    const note = r.notes ? ` — ${r.notes}` : "";
    const theme = r.content_theme ? ` (${r.content_theme})` : "";
    const url = r.external_post_id ? urls.get(r.external_post_id) : undefined;
    const preview = r.caption.slice(0, 110).replace(/\s+/g, " ");
    console.log(
      `${String(r.id).padStart(4)} ${flag} ${r.posted_at ?? "(unposted)"}${theme}`
    );
    console.log(`       ${preview}${r.caption.length > 110 ? "…" : ""}${note}`);
    if (url) console.log(`       ${url}`);
    console.log("");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = createDatabase(args.dbPath);

  if (args.list) {
    const rows = db
      .prepare(
        `SELECT id, posted_at, is_outlier, notes, content_theme, caption, external_post_id
         FROM posts ORDER BY id DESC LIMIT 25`
      )
      .all() as ListRow[];
    await printList(rows);
    db.close();
    return;
  }

  if (args.find) {
    const needle = `%${args.find}%`;
    const rows = db
      .prepare(
        `SELECT id, posted_at, is_outlier, notes, content_theme, caption, external_post_id
         FROM posts
         WHERE caption LIKE ? OR content_theme LIKE ? OR COALESCE(notes,'') LIKE ?
         ORDER BY id DESC LIMIT 25`
      )
      .all(needle, needle, needle) as ListRow[];
    if (rows.length === 0) {
      console.log(`No posts matched "${args.find}".`);
      db.close();
      return;
    }
    await printList(rows);
    db.close();
    return;
  }

  if (!args.postId) usage();

  if (args.unflag) {
    setPostOutlier(db, args.postId, false, null);
    console.log(`Post #${args.postId}: unflagged.`);
  } else {
    if (!args.reason) {
      console.error("Error: --reason is required when flagging. Use --unflag to clear.");
      process.exit(1);
    }
    setPostOutlier(db, args.postId, true, args.reason);
    console.log(`Post #${args.postId}: flagged as outlier — "${args.reason}"`);
  }
  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
