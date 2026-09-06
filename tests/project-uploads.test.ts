import { test } from "node:test";
import assert from "node:assert/strict";
import { createProjectUploadQueue } from "@/lib/project-uploads";

type Result = { state: { project: { id: string }; assets: string[] } };
const result = (assets: string[]): Result => ({ state: { project: { id: "project-one" }, assets } });

test("two immediate clip selections create one project and retain both assets", async () => {
  const queue = createProjectUploadQueue<Result>();
  const sentProjectIds: (string | null)[] = [];
  let finishFirst!: (value: Result) => void;
  const first = queue.run((projectId) => {
    sentProjectIds.push(projectId);
    return new Promise((resolve) => { finishFirst = resolve; });
  });
  const second = queue.run(async (projectId) => {
    sentProjectIds.push(projectId);
    return result(["start", "end"]);
  });
  assert.equal(queue.pending, 2);
  await Promise.resolve();
  assert.deepEqual(sentProjectIds, [null]);
  finishFirst(result(["start"]));
  const uploaded = await Promise.all([first, second]);
  assert.deepEqual(sentProjectIds, [null, "project-one"]);
  assert.deepEqual(uploaded[1].state.assets, ["start", "end"]);
  assert.equal(queue.pending, 0);
});

test("an upload failure releases the queue and preserves an existing project for retry", async () => {
  const queue = createProjectUploadQueue<Result>("project-one");
  const failed = queue.run(async () => { throw new Error("unreadable clip"); });
  const next = queue.run(async (projectId) => {
    assert.equal(projectId, "project-one");
    return result(["end"]);
  });
  await assert.rejects(failed, /unreadable clip/);
  assert.deepEqual((await next).state.assets, ["end"]);
  assert.equal(queue.pending, 0);
  const retried = await queue.run(async (projectId) => {
    assert.equal(projectId, "project-one");
    return result(["start", "end"]);
  });
  assert.equal(retried.state.assets.length, 2);
});
