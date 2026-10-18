// Reproduces the worker's grain tile (apps/worker/src/lib/gradient.ts: 240px, density 0.45, seed 7).
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const size = 240, density = 0.45, seed = 7;
const buf = Buffer.alloc(size * size * 4);
let s = seed >>> 0;
const next = () => {
  s = (s + 0x6d2b79f5) | 0;
  let x = s;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
for (let i = 0; i < size * size; i++) {
  const r = next();
  if (r < density / 2) { buf[i * 4 + 3] = 255; }
  else if (r < density) { buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = 255; buf[i * 4 + 3] = 255; }
}
const out = fileURLToPath(new URL("../public/grain.png", import.meta.url));
await sharp(buf, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9 }).toFile(out);
console.log("wrote", out);
