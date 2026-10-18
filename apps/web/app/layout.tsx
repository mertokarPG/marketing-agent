import type { ReactNode } from "react";
import "./globals.css";
import { archivo } from "./fonts";
import { getTheme } from "@/lib/theme";
import { Ribbon } from "@/components/ribbon";

export const metadata = { title: "Carepost" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await getTheme();
  return (
    <html lang="en" data-theme={theme} className={archivo.variable}>
      <body>
        <Ribbon />
        <div className="page">
          {children}
        </div>
      </body>
    </html>
  );
}
