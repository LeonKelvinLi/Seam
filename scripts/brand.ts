/**
 * Brand assets: rasterise the vector mark at large sizes, build the wordmark lockup, and (optionally)
 * upscale a raster logo you drop at data/brand/logo.png (Lanczos + light sharpening; use this when only a
 * low-res PNG of the mark exists).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "brand");
const MARK = fs.readFileSync(path.join(OUT, "seamcut-mark.svg"), "utf8");

async function main() {
  for (const size of [256, 1024, 2048]) {
    await sharp(Buffer.from(MARK), { density: 600 }).resize(size, size).png().toFile(path.join(OUT, `seamcut-mark-${size}.png`));
  }
  const lockup = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="640">
    <rect width="2400" height="640" fill="none"/>
    <g transform="translate(60 40) scale(5.6)">${MARK.replace(/^[\s\S]*?<defs>/, "<defs>").replace(/<\/svg>\s*$/, "")}</g>
    <text x="700" y="410" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="300" font-weight="700" fill="#f2f0ea" letter-spacing="-8">Clipmelt</text>
    <text x="712" y="520" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="62" font-weight="400" fill="#c9c7c1" letter-spacing="22">TURN IDEAS INTO SEAMLESS VIDEOS</text>
  </svg>`;
  await sharp(Buffer.from(lockup), { density: 300 }).png().toFile(path.join(OUT, "clipmelt-lockup.png"));
  const raster = path.join(process.cwd(), "data", "brand", "logo.png");
  if (fs.existsSync(raster)) {
    const meta = await sharp(raster).metadata();
    const target = Math.max(2048, (meta.width ?? 512) * 4);
    await sharp(raster).resize(target, target, { fit: "inside", kernel: sharp.kernel.lanczos3 }).sharpen({ sigma: 1.2 }).png().toFile(path.join(OUT, "seamcut-mark-upscaled.png"));
    console.log("upscaled raster logo ->", path.join(OUT, "seamcut-mark-upscaled.png"));
  }
  console.log("brand assets written to", OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
