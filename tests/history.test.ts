import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipmelt-history-"));
process.env.SEAM_DATA_DIR = dir;
const { db } = await import("@/db/client");
const { Generations, Projects, Users } = await import("@/db/repo");
const { generationHistory } = await import("@/lib/server/history");
const { DEFAULT_FINE_TUNE } = await import("@/core/types");
after(() => { db().close(); fs.rmSync(dir, { recursive: true, force: true }); });

test("history paginates finished footage across owned projects without leaking other owners or private paths", () => {
  const owner = "history-owner", other = "history-other";
  const projects = [Projects.create(owner), Projects.create(owner), Projects.create(other)];
  const create = (projectId: string) => Generations.create({
    projectId, opportunityId: "test-opportunity", recipeId: "dissolve-match", intent: "smooth", fineTune: DEFAULT_FINE_TUNE,
    mode: "preview", status: "ready", stage: "ready", stageLabel: "Ready", progress: 1, friendlyError: null, jobId: null, parentGenerationId: null,
    result: { fullPath: path.join(dir, "renders/full.mp4"), bridgePath: path.join(dir, "renders/transition.mp4"), posterPath: path.join(dir, "renders/poster.jpg"),
      bridgeDurationSec: 1, fullDurationSec: 3, cutA: 1, cutB: 0, providerId: "local", modelId: "local:xfade", quality: null, attempts: 1, fellBackToLocal: false, suggestion: null },
  });
  const owned = Array.from({ length: 26 }, (_, i) => create(projects[i % 2].id));
  // A shared timestamp must still produce stable pages with no duplicates or omissions.
  for (const g of owned) Generations.update(g.id, { createdAt: "2026-09-17T00:00:00.000Z" });
  const foreign = create(projects[2].id);
  const failed = create(projects[0].id);
  Generations.update(failed.id, { status: "failed" });
  const unfinished = create(projects[0].id);
  Generations.update(unfinished.id, { result: null });
  const first = generationHistory(owner);
  assert.equal(first.generations.length, 24);
  assert.ok(first.nextCursor);
  const second = generationHistory(owner, first.nextCursor);
  assert.equal(second.generations.length, 2);
  assert.equal(second.nextCursor, null);
  const ids = [...first.generations, ...second.generations].map(g => g.id);
  assert.deepEqual(ids, owned.map(g => g.id).sort().reverse());
  assert.equal(JSON.stringify(first).includes(dir), false);
  assert.equal(first.generations[0].fullUrl, "/api/media/renders/full.mp4");
  assert.deepEqual(generationHistory("unknown-owner").generations, []);
  assert.throws(() => generationHistory(owner, foreign.id), /Invalid history cursor/);
  assert.throws(() => generationHistory(owner, "gen_missing00000"), /Invalid history cursor/);
  Users.adopt(owner, "history-account");
  assert.equal(generationHistory(owner).generations.length, 0);
  assert.equal(generationHistory("history-account").generations.length, 24);
});
