import { loadDesignSystem } from "../src/config/load-design-system.js";
import path from "path";

for (const id of ["editorial-paper", "atelier", "signal", "mute", "gridos", "bloom", "nocturne"]) {
  const ds = loadDesignSystem(id, path.resolve("design-systems"));
  console.log(`${id}: engine=${ds.engine} name=${ds.name}`);
}
