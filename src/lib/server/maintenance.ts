/**
 * Housekeeping for a single-instance deployment with a persistent disk:
 *  - guest projects (no email on the account) are deleted after a period of inactivity, files included
 *  - temp files older than a day are removed
 *  - the SQLite database is backed up daily, keeping the newest copies
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "@/core/config";
import { db } from "@/db/client";
import { storage } from "@/core/media/storage";
import { logger } from "@/core/log";
import { backupOffsite } from "@/lib/server/offsite-backup";

const log = logger("maintenance");
export const GUEST_RETENTION_DAYS = 30;
export const BACKUPS_TO_KEEP = 7;

declare global {
  // eslint-disable-next-line no-var
  var __seamMaintenance: { timer: NodeJS.Timeout | null } | undefined;
}

const rm = (p: string | null | undefined) => { if (p) fs.rmSync(p, { recursive: true, force: true }); };

/** Delete a project and everything hanging off it. Learning records and cost rows stay: they are analytics, not user content. */
export function deleteProjectCascade(projectId: string): void {
  const d = db();
  const assets = d.prepare("SELECT id, path, proxyPath, thumbnailPath FROM assets WHERE projectId=?").all(projectId) as { id: string; path: string; proxyPath: string | null; thumbnailPath: string | null }[];
  const generations = d.prepare("SELECT id FROM generations WHERE projectId=?").all(projectId) as { id: string }[];
  for (const a of assets) { rm(a.path); rm(a.proxyPath); rm(a.thumbnailPath); rm(storage.frameDir(a.id)); }
  for (const g of generations) {
    rm(storage.renderDir(g.id));
    for (const e of d.prepare("SELECT path FROM exports WHERE generationId=?").all(g.id) as { path: string }[]) rm(e.path);
  }
  d.transaction(() => {
    for (const a of assets) {
      d.prepare("DELETE FROM frames WHERE assetId=?").run(a.id);
      d.prepare("DELETE FROM visualAnalyses WHERE assetId=?").run(a.id);
    }
    for (const g of generations) {
      d.prepare("DELETE FROM qualityEvaluations WHERE attemptId IN (SELECT id FROM attempts WHERE generationId=?)").run(g.id);
      d.prepare("DELETE FROM attempts WHERE generationId=?").run(g.id);
      d.prepare("DELETE FROM exports WHERE generationId=?").run(g.id);
      d.prepare("DELETE FROM shares WHERE generationId=?").run(g.id);
    }
    for (const t of ["generations", "recommendations", "opportunities", "pairAnalyses", "assets"]) d.prepare(`DELETE FROM ${t} WHERE projectId=?`).run(projectId);
    d.prepare("DELETE FROM projects WHERE id=?").run(projectId);
  })();
}

/** Remove guest projects untouched for `days`. Returns the number deleted. */
export function sweepGuestProjects(days = GUEST_RETENTION_DAYS, now = Date.now()): number {
  const cutoff = new Date(now - days * 86_400_000).toISOString();
  const rows = db().prepare("SELECT p.id FROM projects p JOIN users u ON u.id = p.userId WHERE u.email IS NULL AND p.updatedAt < ?").all(cutoff) as { id: string }[];
  for (const r of rows) deleteProjectCascade(r.id);
  return rows.length;
}

export function sweepTmp(maxAgeMs = 86_400_000, now = Date.now()): number {
  if (!fs.existsSync(config.tmpDir)) return 0;
  let n = 0;
  for (const name of fs.readdirSync(config.tmpDir)) {
    const p = path.join(config.tmpDir, name);
    try { if (fs.statSync(p).mtimeMs < now - maxAgeMs) { rm(p); n++; } } catch { /* raced with a running job */ }
  }
  return n;
}

/** Online SQLite backup into <dataDir>/backups/seam-YYYYMMDD.sqlite, keeping the newest BACKUPS_TO_KEEP files. */
export async function backupDatabase(now = new Date()): Promise<string | null> {
  const dir = path.join(config.dataDir, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const dest = path.join(dir, `seam-${stamp}.sqlite`);
  if (fs.existsSync(dest)) return null;
  const pending = `${dest}.partial`;
  try {
    await db().backup(pending);
    fs.renameSync(pending, dest);
  } finally { fs.rmSync(pending, { force: true }); }
  const files = fs.readdirSync(dir).filter((f) => /^seam-\d{8}\.sqlite$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - BACKUPS_TO_KEEP))) rm(path.join(dir, f));
  return dest;
}

export async function runMaintenance(): Promise<void> {
  try {
    const projects = sweepGuestProjects();
    const tmp = sweepTmp();
    const backup = await backupDatabase();
    const offsite = await backupOffsite();
    log.info("maintenance", { guestProjectsDeleted: projects, tmpFilesDeleted: tmp, backup, offsite });
  } catch (e) {
    log.error("maintenance failed", { error: (e as Error).message });
  }
}

/** Start the housekeeping timer once per process: first run a minute after boot, then every six hours. */
export function startMaintenance() {
  if (!globalThis.__seamMaintenance) globalThis.__seamMaintenance = { timer: null };
  const s = globalThis.__seamMaintenance;
  if (s.timer) return;
  const first = setTimeout(() => { void runMaintenance(); }, 60_000);
  first.unref?.();
  s.timer = setInterval(() => { void runMaintenance(); }, 6 * 60 * 60_000);
  s.timer.unref?.();
}
