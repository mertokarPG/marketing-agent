import { Archivo } from "next/font/google";

// Extra-wide face for headlines/numbers (jolt uses a paid face; Archivo at 125% width is our stand-in).
export const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-wide",
  display: "swap",
});
