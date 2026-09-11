/**
 * Pixel check for dissolves and hard cuts (src/core/quality/seamless.ts) on any video, to audit library previews and
 * proof takes before they ship.
 *
 *   npx tsx scripts/check-seams.ts <video> [more videos]
 *
 * Exit code 1 when any file has a break.
 */
import "./_env";
import path from "node:path";
import { detectSeamBreaks } from "@/core/quality/seamless";

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error("usage: check-seams.ts <video> [more videos]");
  let broken = 0;
  for (const f of files) {
    const breaks = await detectSeamBreaks(f);
    if (breaks.length) broken++;
    const detail = breaks.map((b) => `  ${b.kind} at ${b.atSec.toFixed(2)}s (${b.strength})`).join("");
    console.log(`${breaks.length ? "BREAK" : "clean"}  ${path.basename(path.dirname(f))}/${path.basename(f)}${detail}`);
  }
  process.exit(broken ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
