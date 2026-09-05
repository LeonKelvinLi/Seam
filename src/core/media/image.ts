import sharp from "sharp";
import fs from "node:fs";

/** Small grayscale raster for cheap pixel statistics (features, judge). */
export async function gray(pathOrBuffer: string | Buffer, size = 48): Promise<{ data: Uint8Array; w: number; h: number }> {
  const { data, info } = await sharp(pathOrBuffer).rotate().resize(size, size, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), w: info.width, h: info.height };
}

/** Small RGB raster. */
export async function rgb(pathOrBuffer: string | Buffer, size = 32): Promise<{ data: Uint8Array; w: number; h: number }> {
  const { data, info } = await sharp(pathOrBuffer).rotate().resize(size, size, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), w: info.width, h: info.height };
}

/** JPEG bytes resized so the longest edge is <= maxEdge (what we send to vision / video models). */
export async function jpegForModel(input: string, maxEdge = 1024, quality = 88): Promise<Buffer> {
  return sharp(input).rotate().resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer();
}

export async function jpegDataUri(input: string, maxEdge = 1024): Promise<string> {
  const buf = await jpegForModel(input, maxEdge);
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

export async function thumbnail(input: string, output: string, width = 640) {
  await sharp(input).rotate().resize(width, width, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(output);
  return output;
}

export async function imageSize(input: string): Promise<{ width: number; height: number }> {
  const m = await sharp(input).rotate().metadata();
  return { width: m.width ?? 0, height: m.height ?? 0 };
}

/** Rasterise an SVG string to a JPEG/PNG file (used to synthesise sample footage). */
export async function rasterizeSvg(svg: string, output: string) {
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(output);
  return output;
}

export function fileExists(p: string | null | undefined): p is string {
  return !!p && fs.existsSync(p);
}
