/** Waits for all in-flight promises to settle, but never longer than timeoutMs. Returns true if all settled. */
export async function drain(promises: Iterable<Promise<unknown>>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); });
  const settled = Promise.allSettled([...promises]).then(() => true as const);
  try { return await Promise.race([settled, timeout]); } finally { clearTimeout(timer); }
}
