import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seam-access-"));
process.env.SEAM_DATA_DIR = dir;
const { db } = await import("@/db/client");
const { Assets, Generations, Projects, Shares } = await import("@/db/repo");
const { ownedGeneration, ownedProject, canReadMedia } = await import("@/lib/server/access");
const { ingestFile } = await import("@/lib/server/ingest");
const { createGeneration } = await import("@/lib/server/generate");
const { sharePayload } = await import("@/lib/server/share");
const { DEFAULT_FINE_TUNE } = await import("@/core/types");
after(() => { db().close(); fs.rmSync(dir, { recursive: true, force: true }); });

test("project and generation capabilities stay with their owner; public shares expose only their own registered media", async () => {
  const owner = "test-owner", other = "test-other";
  const project = Projects.create(owner);
  const otherProject = Projects.create(other);
  const asset = Assets.create({
    projectId: project.id, role: "start", kind: "image", originalName: "first.png", mime: "image/png",
    path: path.join(dir, "uploads/first.png"), thumbnailPath: path.join(dir, "uploads/first.thumb.jpg"),
    proxyPath: path.join(dir, "uploads/first.proxy.mp4"), sizeBytes: 10, durationSec: null, width: 32, height: 24, fps: null, hasAudio: false,
  });
  const generation = Generations.create({
    projectId: project.id, opportunityId: "test-opportunity", recipeId: "dissolve-match", intent: "smooth", fineTune: DEFAULT_FINE_TUNE,
    mode: "preview", status: "ready", stage: "ready", stageLabel: "Ready", progress: 1, friendlyError: null, jobId: null, parentGenerationId: null,
    result: { fullPath: path.join(dir, "renders/first/full.mp4"), bridgePath: path.join(dir, "renders/first/transition.mp4"), posterPath: path.join(dir, "renders/first/poster.jpg"),
      bridgeDurationSec: 1, fullDurationSec: 3, cutA: 1, cutB: 0, providerId: "local", modelId: "local:xfade", quality: null, attempts: 1, fellBackToLocal: false, suggestion: null },
  });
  assert.ok(ownedProject(project.id, owner));
  assert.equal(ownedProject(project.id, other), undefined);
  assert.ok(ownedGeneration(generation.id, owner));
  assert.equal(ownedGeneration(generation.id, other), undefined);
  for (const file of [asset.path, asset.proxyPath!, asset.thumbnailPath!, generation.result!.fullPath, generation.result!.bridgePath, generation.result!.posterPath]) {
    assert.equal(canReadMedia(file, owner, null), true);
    assert.equal(canReadMedia(file, other, null), false);
  }
  assert.equal(canReadMedia(path.join(dir, "seam.sqlite"), owner, null), false, "dataDir membership alone grants no access");
  assert.equal(canReadMedia(path.join(dir, "renders/first/attempt_1_raw.mp4"), owner, null), false);
  await assert.rejects(ingestFile({ projectId: project.id, userId: other, role: "start", buffer: Buffer.from("bad"), originalName: "bad.png", mime: "image/png" }), /project not found/);
  assert.equal(Assets.byRole(project.id, "start")?.id, asset.id, "unauthorized replacement leaves original asset registered");
  assert.throws(() => createGeneration({ projectId: project.id, userId: other }), /project not found/);
  Projects.update(otherProject.id, { status: "analyzed" });
  assert.throws(() => createGeneration({ projectId: otherProject.id, userId: other, from: { generationId: generation.id, action: "regenerate" } }), /parent generation not found/);
  assert.throws(() => createGeneration({ projectId: otherProject.id, userId: other, opportunityId: "missing-opportunity" }), /transition opportunity not found/);

  const share = Shares.create(generation.id);
  assert.equal(canReadMedia(generation.result!.fullPath, other, share.id), true);
  assert.equal(canReadMedia(asset.thumbnailPath!, other, share.id), true);
  assert.equal(canReadMedia(generation.result!.fullPath, other, "wrong-share"), false);
  assert.equal(canReadMedia(path.join(dir, "seam.sqlite"), other, share.id), false);
  const unrelated = Assets.create({ ...asset, projectId: otherProject.id, path: path.join(dir, "uploads/other.png"), proxyPath: null, thumbnailPath: null });
  assert.equal(canReadMedia(unrelated.path, "third-user", share.id), false);
  const payload = sharePayload(share.id)!;
  assert.ok(payload.generation.result?.fullUrl?.endsWith(`?share=${share.id}`));
  assert.ok(payload.start?.thumbnailUrl?.endsWith(`?share=${share.id}`));
});
