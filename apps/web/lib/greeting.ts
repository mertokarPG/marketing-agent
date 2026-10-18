import { localParts } from "@carepost/core/time";

export function greeting(now: Date, tz: string, _firstName: string | null): string {
  const h = localParts(now, tz).hour;
  if (h >= 5 && h < 12) return "GOOD MORNING";
  if (h >= 12 && h < 18) return "GOOD AFTERNOON";
  return "GOOD EVENING";
}

export function firstNameFromEmail(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const first = local.split(/[.+\d]/)[0] ?? "";
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
