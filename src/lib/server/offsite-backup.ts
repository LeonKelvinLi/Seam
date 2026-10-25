/** Content-addressed private S3/R2 snapshots. The manifest is committed only after every object uploads. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { config } from "@/core/config";

export interface BackupObject { path: string; key: string; sha256: string; bytes: number }
export interface BackupManifest { version: 1; createdAt: string; dataRoot: string; files: BackupObject[] }
export interface ObjectStore {
  has(key: string): Promise<boolean>;
  put(key: string, file: string): Promise<void>;
  get(key: string, file: string): Promise<void>;
}
const prefix = () => (process.env.SEAM_BACKUP_PREFIX || "seamcut").replace(/^\/+|\/+$/g, "");
const receiptPath = () => path.join(config.dataDir, "backups", "offsite-status.json");

export function backupConfigured() { return !!process.env.SEAM_BACKUP_BUCKET; }
export function backupStatus() {
  if (!backupConfigured()) return { ok: false, state: "not_configured", lastSuccessAt: null };
  try {
    const receipt = JSON.parse(fs.readFileSync(receiptPath(), "utf8"));
    const fresh = Date.now() - Date.parse(receipt.lastSuccessAt) < 36 * 3_600_000;
    return { ok: fresh, state: fresh ? "uploaded" : "stale", lastSuccessAt: receipt.lastSuccessAt };
  } catch { return { ok: false, state: "no_successful_upload", lastSuccessAt: null }; }
}
export function s3Store(): ObjectStore {
  const bucket = process.env.SEAM_BACKUP_BUCKET;
  if (!bucket) throw new Error("SEAM_BACKUP_BUCKET is required");
  const endpoint = process.env.SEAM_BACKUP_ENDPOINT;
  if (endpoint && new URL(endpoint).protocol !== "https:") throw new Error("Backup endpoint must use HTTPS");
  const accessKeyId = process.env.SEAM_BACKUP_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SEAM_BACKUP_SECRET_ACCESS_KEY;
  if (!!accessKeyId !== !!secretAccessKey) throw new Error("Both backup credentials are required");
  const client = new S3Client({
    endpoint, region: process.env.SEAM_BACKUP_REGION || "auto", maxAttempts: 3,
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });
  return {
    async has(key) {
      try { await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(30_000) }); return true; }
      catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false; throw error; }
    },
    async put(key, file) {
      const body = fs.createReadStream(file);
      try { await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentLength: fs.statSync(file).size }), { abortSignal: AbortSignal.timeout(300_000) }); }
      finally { body.destroy(); }
    },
    async get(key, file) {
      const { pipeline } = await import("node:stream/promises");
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: AbortSignal.timeout(300_000) });
      if (!response.Body) throw new Error("Empty backup response");
      await pipeline(response.Body as NodeJS.ReadableStream, fs.createWriteStream(file, { flags: "wx", mode: 0o600 }));
    },
  };
}
async function hash(file: string) {
  const h = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) h.update(chunk);
  return h.digest("hex");
}
function relativeMedia(file: string, root: string) {
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || !/^(uploads|frames|renders)\//.test(relative)) {
    throw new Error("Snapshot references media outside the data directories");
  }
  return relative;
}
/** Read references from the frozen DB, not a changing directory listing. Missing files invalidate the snapshot. */
export function referencedMedia(snapshot: Database.Database): string[] {
  const files = new Set<string>();
  for (const [table, columns] of [["assets", "path,proxyPath,thumbnailPath"], ["frames", "path"], ["exports", "path"]]) {
    for (const row of snapshot.prepare(`SELECT ${columns} FROM ${table}`).all() as Record<string, string | null>[]) {
      for (const value of Object.values(row)) if (value) files.add(value);
    }
  }
  for (const row of snapshot.prepare("SELECT result FROM generations WHERE result IS NOT NULL").all() as { result: string }[]) {
    const result = JSON.parse(row.result);
    for (const key of ["fullPath", "bridgePath", "posterPath"]) if (result?.[key]) files.add(result[key]);
  }
  return [...files];
}
let running: Promise<string | null> | undefined;
export function backupOffsite(): Promise<string | null> {
  if (!backupConfigured()) return Promise.resolve(null);
  if (running) return running;
  running = createOffsiteSnapshot(s3Store()).finally(() => { running = undefined; });
  return running;
}
export async function createOffsiteSnapshot(store: ObjectStore, now = new Date()): Promise<string> {
  const backups = path.join(config.dataDir, "backups");
  fs.mkdirSync(backups, { recursive: true, mode: 0o700 });
  const stage = fs.mkdtempSync(path.join(backups, ".offsite-"));
  try {
    const databaseFile = path.join(stage, "seam.sqlite");
    // The operator CLI must not run application startup migrations or requeue live jobs.
    const live = new Database(config.dbPath, { readonly: true, fileMustExist: true });
    try { await live.backup(databaseFile); } finally { live.close(); }
    const snapshot = new Database(databaseFile, { readonly: true });
    let media: string[];
    try {
      if (snapshot.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Backup database integrity failed");
      media = referencedMedia(snapshot);
    } finally { snapshot.close(); }
    const manifest: BackupManifest = { version: 1, createdAt: now.toISOString(), dataRoot: config.dataDir, files: [] };
    // Stage one media file at a time to cap extra disk use, ensuring hash and uploaded bytes agree.
    for (const source of [databaseFile, ...media]) {
      const relative = source === databaseFile ? "seam.sqlite" : relativeMedia(source, config.dataDir);
      const staged = source === databaseFile ? source : path.join(stage, "media-copy");
      if (source !== databaseFile) {
        const real = fs.realpathSync(source);
        relativeMedia(real, fs.realpathSync(config.dataDir));
        fs.copyFileSync(source, staged);
      }
      const sha256 = await hash(staged);
      const key = `${prefix()}/objects/${sha256}`;
      const bytes = fs.statSync(staged).size;
      if (!await store.has(key)) await store.put(key, staged);
      manifest.files.push({ path: relative, key, sha256, bytes });
      if (source !== databaseFile) fs.rmSync(staged);
    }
    const manifestKey = `${prefix()}/snapshots/${now.toISOString().replace(/[:.]/g, "-")}.json`;
    const manifestFile = path.join(stage, "manifest.json");
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await store.put(manifestKey, manifestFile);
    const receipt = path.join(stage, "receipt.json");
    fs.writeFileSync(receipt, JSON.stringify({ lastSuccessAt: now.toISOString(), manifestKey, files: manifest.files.length }), { mode: 0o600 });
    fs.renameSync(receipt, receiptPath());
    return manifestKey;
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}
/** Download into a NEW isolated directory, verify every checksum and all DB media references. Never touches live data. */
export async function verifyOffsiteSnapshot(store: ObjectStore, key: string, destination: string) {
  const dest = path.resolve(destination);
  if (fs.existsSync(dest)) throw new Error("Restore verification requires a new, empty destination");
  if (dest === config.dataDir || dest.startsWith(config.dataDir + path.sep)) throw new Error("Restore outside the live data directory");
  fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
  const manifestFile = path.join(dest, "manifest.json");
  await store.get(key, manifestFile);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as BackupManifest;
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !path.isAbsolute(manifest.dataRoot)) throw new Error("Invalid backup manifest");
  const names = new Set<string>();
  for (const file of manifest.files) {
    if (file.path !== "seam.sqlite") relativeMedia(path.resolve(dest, file.path), dest);
    if (path.isAbsolute(file.path) || file.path.split(/[\\/]/).includes("..") || names.has(file.path)
      || !/^[a-f0-9]{64}$/.test(file.sha256) || file.key !== `${prefix()}/objects/${file.sha256}`) throw new Error("Unsafe backup entry");
    names.add(file.path);
    const target = path.join(dest, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    await store.get(file.key, target);
    if (fs.statSync(target).size !== file.bytes || await hash(target) !== file.sha256) throw new Error("Backup checksum mismatch");
  }
  if (!names.has("seam.sqlite")) throw new Error("Backup database missing");
  const restored = new Database(path.join(dest, "seam.sqlite"), { readonly: true, fileMustExist: true });
  try {
    if (restored.pragma("integrity_check", { simple: true }) !== "ok" || (restored.pragma("foreign_key_check") as unknown[]).length) throw new Error("Restored database integrity failed");
    for (const media of referencedMedia(restored)) {
      if (!names.has(relativeMedia(media, manifest.dataRoot))) throw new Error("Restored media missing");
    }
    return { integrity: "ok", files: names.size, createdAt: manifest.createdAt, originalDataRoot: manifest.dataRoot };
  } finally { restored.close(); }
}
