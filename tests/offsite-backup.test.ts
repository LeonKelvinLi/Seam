import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-offsite-"));
process.env.SEAM_DATA_DIR = path.join(dir, "live");
const { db } = await import("@/db/client");
const { Users, Projects, Assets } = await import("@/db/repo");
const { createOffsiteSnapshot, verifyOffsiteSnapshot } = await import("@/lib/server/offsite-backup");
const objects = new Map<string, Buffer>();
const store = {
  async has(key: string) { return objects.has(key); },
  async put(key: string, file: string) { objects.set(key, fs.readFileSync(file)); },
  async get(key: string, file: string) { const data = objects.get(key); if (!data) throw new Error("missing"); fs.writeFileSync(file, data, { flag: "wx" }); },
};
after(() => { db().close(); fs.rmSync(dir, { recursive: true, force: true }); });
test("off-site snapshot round trips DB and referenced media and catches corruption", async () => {
  const user = Users.ensure("usr_backup");
  const project = Projects.create(user.id, "backup test");
  const media = path.join(process.env.SEAM_DATA_DIR!, "uploads", "source.mp4");
  fs.writeFileSync(media, Buffer.from("fixture footage bytes"));
  Assets.create({ projectId: project.id, role: "start", kind: "video", originalName: "source.mp4", mime: "video/mp4", path: media,
    sizeBytes: fs.statSync(media).size, durationSec: 1, width: 16, height: 16, fps: 30, hasAudio: false, thumbnailPath: null, proxyPath: null });
  const key = await createOffsiteSnapshot(store);
  const receipt = await verifyOffsiteSnapshot(store, key, path.join(dir, "restored"));
  assert.equal(receipt.integrity, "ok"); assert.equal(receipt.files, 2);
  assert.deepEqual(fs.readFileSync(path.join(dir, "restored/uploads/source.mp4")), fs.readFileSync(media));
  const restored = new Database(path.join(dir, "restored/seam.sqlite"), { readonly: true });
  assert.equal((restored.prepare("SELECT credits FROM users WHERE id=?").get(user.id) as { credits: number }).credits, user.credits);
  restored.close();
  await assert.rejects(verifyOffsiteSnapshot(store, key, process.env.SEAM_DATA_DIR!), /new, empty/);
  const manifest = JSON.parse(objects.get(key)!.toString());
  objects.set(manifest.files[1].key, Buffer.from("broken"));
  await assert.rejects(verifyOffsiteSnapshot(store, key, path.join(dir, "corrupt")), /checksum/);
});
test("missing referenced media never publishes a completed snapshot", async () => {
  const count = [...objects.keys()].filter(k => k.includes("snapshots/")).length;
  fs.rmSync(path.join(process.env.SEAM_DATA_DIR!, "uploads/source.mp4"));
  await assert.rejects(createOffsiteSnapshot(store, new Date(Date.now() + 1000)));
  assert.equal([...objects.keys()].filter(k => k.includes("snapshots/")).length, count);
});
test("manifest traversal is rejected without writing outside the restore directory", async () => {
  objects.set("bad.json", Buffer.from(JSON.stringify({ version: 1, dataRoot: "/var/data/seam", files: [{ path: "../escape" }] })));
  await assert.rejects(verifyOffsiteSnapshot(store, "bad.json", path.join(dir, "unsafe")), /outside/);
  assert.equal(fs.existsSync(path.join(dir, "escape")), false);
});
