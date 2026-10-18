import { cookies } from "next/headers";

export type Theme = "dark" | "light";
export async function getTheme(): Promise<Theme> {
  const v = (await cookies()).get("cp-theme")?.value;
  return v === "light" ? "light" : "dark";
}
