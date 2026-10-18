import { localParts } from "@carepost/core/time";

export function greeting(now: Date, tz: string): string {
  const h = localParts(now, tz).hour;
  if (h >= 5 && h < 12) return "GOOD MORNING";
  if (h >= 12 && h < 18) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

type UserLike = { email?: string | null; user_metadata?: Record<string, unknown> | null } | null | undefined;

const word = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  return v.trim().split(/\s+/)[0] || null;
};

/** The user's first name from their profile metadata. Never guessed from the email address. */
export function firstName(user: UserLike): string | null {
  const m = user?.user_metadata ?? {};
  return word(m.first_name) ?? word(m.full_name) ?? word(m.name);
}
