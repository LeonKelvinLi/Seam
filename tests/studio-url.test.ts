import { test } from "node:test";
import assert from "node:assert/strict";
import { studioUrl } from "@/lib/studio-url";

test("refreshing after either clip upload retains the library pick; resuming a result cannot submit it again", () => {
  const firstUpload = new URL(studioUrl("project", null, "push-through"), "https://clipmelt.test");
  const resumedPick = firstUpload.searchParams.get("recipe");
  assert.equal(resumedPick, "push-through");
  const secondUpload = new URL(studioUrl(firstUpload.searchParams.get("p"), null, resumedPick), firstUpload.origin);
  assert.equal(secondUpload.searchParams.get("recipe"), "push-through");
  const result = new URL(studioUrl("project", "generation", resumedPick), firstUpload.origin);
  assert.equal(result.searchParams.get("g"), "generation");
  assert.equal(result.searchParams.has("recipe"), false);
  assert.equal(new URL(studioUrl("project", null), firstUpload.origin).searchParams.has("recipe"), false, "a consumed or rejected pick is not submitted again on refresh");
  assert.equal(studioUrl(null, null), "/create", "starting over clears the previous choice");
});
