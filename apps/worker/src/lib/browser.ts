import puppeteer, { type LaunchOptions } from "puppeteer";

export function sandboxArgs(env: NodeJS.ProcessEnv = process.env): string[] {
  return env.PUPPETEER_NO_SANDBOX === "1" ? ["--no-sandbox", "--disable-setuid-sandbox"] : [];
}

export function launchBrowser(opts: LaunchOptions = {}) {
  return puppeteer.launch({ ...opts, args: [...(opts.args ?? []), ...sandboxArgs()] });
}
