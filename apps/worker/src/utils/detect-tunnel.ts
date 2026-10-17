import { execFileSync } from "child_process";

/**
 * Auto-detect the Cloudflare quick tunnel URL from Docker logs.
 * Sets process.env.POSTIZ_TUNNEL_URL so schedule-post can rewrite
 * localhost paths to public URLs that Instagram can reach.
 */
export function detectTunnelUrl(): string | null {
  try {
    // docker logs writes to stderr, so we merge streams via shell
    const output = execFileSync(
      "/bin/sh",
      ["-c", "docker logs postiz-tunnel 2>&1"],
      { timeout: 5000, encoding: "utf-8" }
    );

    const matches = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
    if (!matches || matches.length === 0) return null;

    // Always use the LAST match — tunnels restart and get new URLs
    const url = matches[matches.length - 1];
    process.env.POSTIZ_TUNNEL_URL = url;
    console.log(`[Tunnel] Detected: ${url}`);
    return url;
  } catch {
    console.warn("[Tunnel] Could not detect tunnel URL (is Docker running?)");
    return null;
  }
}
