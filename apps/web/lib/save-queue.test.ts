import { describe, it, expect } from "vitest";
import { createSaveQueue, type SaveState } from "./save-queue";

type Res = { ok: true } | { ok: false; message: string };
function setup(opts: { validate?: (v: string) => string | null; results?: Res[] } = {}) {
  const calls: string[] = [];
  const states: SaveState[] = [];
  const gates: (() => void)[] = [];
  const results = [...(opts.results ?? [])];
  const q = createSaveQueue<string>({
    initial: "a",
    equals: (x, y) => x === y,
    validate: opts.validate ?? (() => null),
    save: (v) => {
      calls.push(v);
      return new Promise<Res>((resolve) => gates.push(() => resolve(results.shift() ?? { ok: true })));
    },
    onState: (s) => states.push(s),
  });
  const release = async () => { await Promise.resolve(); gates.shift()?.(); await new Promise((r) => setTimeout(r, 0)); };
  return { q, calls, states, release, gates };
}

describe("createSaveQueue", () => {
  it("flush with nothing changed is ok and saves nothing", async () => {
    const { q, calls } = setup();
    expect(await q.flush()).toBe(true);
    expect(calls).toEqual([]);
  });

  it("an invalid value blocks flush and reports the problem, every time", async () => {
    const { q, calls, states } = setup({ validate: (v) => (v === "" ? "empty" : null) });
    q.set("");
    expect(await q.flush()).toBe(false);
    expect(await q.flush()).toBe(false); // a failed attempt doesn't count as saved
    expect(calls).toEqual([]);
    expect(states.at(-1)).toEqual({ kind: "error", message: "empty" });
  });

  it("a failed save blocks flush; the next flush retries", async () => {
    const { q, calls, release, states } = setup({ results: [{ ok: false, message: "nope" }, { ok: true }] });
    q.set("b");
    const f1 = q.flush(); await release();
    expect(await f1).toBe(false);
    expect(states.at(-1)).toEqual({ kind: "error", message: "nope" });
    const f2 = q.flush(); await release();
    expect(await f2).toBe(true);
    expect(calls).toEqual(["b", "b"]);
    expect(states.at(-1)).toEqual({ kind: "saved", message: null });
  });

  it("flush waits for a save already in flight, then saves newer text", async () => {
    const { q, calls, release } = setup();
    q.set("b");
    const first = q.flush();          // in flight with "b"
    q.set("c");
    let done = false;
    const second = q.flush().then((r) => { done = true; return r; });
    await Promise.resolve();
    expect(done).toBe(false);         // still waiting on "b"
    await release();                  // "b" saved
    await release();                  // "c" saved
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(calls).toEqual(["b", "c"]);
    expect(q.dirty()).toBe(false);
  });

  it("concurrent flushes don't save the same value twice", async () => {
    const { q, calls, release } = setup();
    q.set("b");
    const a = q.flush();
    const b = q.flush();
    await release();
    expect(await a).toBe(true);
    expect(await b).toBe(true);
    expect(calls).toEqual(["b"]);
  });
});
