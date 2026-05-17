import "dotenv/config";
import { getBrandLogo, type GetBrandLogoInput } from "../src/tools/brand-logo.js";

const cases: GetBrandLogoInput[] = [
  { brand: "openai.com", variant: "logo", theme: "dark" },
  { brand: "anthropic.com", variant: "logo", theme: "light" },
  { brand: "figma.com", variant: "symbol", theme: "dark" },
  { brand: "OpenAI", variant: "icon", theme: "dark" },
];

async function main() {
  for (const c of cases) {
    const r = await getBrandLogo(c);
    console.log(
      `${c.brand.padEnd(18)} variant=${c.variant}/${c.theme} → ${r.source} ${r.variant}/${r.theme}  ${r.filePath}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
