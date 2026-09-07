import test from "node:test";
import assert from "node:assert/strict";
import { crossSiteRequest } from "../src/lib/server/csrf";

test("cross-site guard blocks foreign origins and passes same-origin, safe and header-less requests", () => {
  const host = "seamcut.onrender.com";
  assert.equal(crossSiteRequest("GET", new Headers({ origin: "https://evil.example" }), host), false);
  assert.equal(crossSiteRequest("POST", new Headers({ "sec-fetch-site": "cross-site" }), host), true);
  assert.equal(crossSiteRequest("POST", new Headers({ "sec-fetch-site": "same-origin" }), host), false);
  assert.equal(crossSiteRequest("POST", new Headers({ origin: "https://evil.example" }), host), true);
  assert.equal(crossSiteRequest("POST", new Headers({ origin: "https://seamcut.onrender.com" }), host), false);
  assert.equal(crossSiteRequest("POST", new Headers({ origin: "not a url" }), host), true);
  assert.equal(crossSiteRequest("POST", new Headers(), host), false);
});
