import assert from "node:assert/strict";
import test from "node:test";

import { createSiteDefinition } from "../../../core/site-definition/index.js";

const definition = createSiteDefinition({ persistence: {} as never });

test("public route URLs preserve a canonical HTTPS base and append non-root routes", () => {
  assert.deepEqual(definition.resolvePublicRouteUrl({ publicSiteUrl: "https://example.test/study-notes/", normalizedRoute: "/" }), { ok: true, value: "https://example.test/study-notes/" });
  assert.deepEqual(definition.resolvePublicRouteUrl({ publicSiteUrl: "https://example.test/study-notes/", normalizedRoute: "/guide" }), { ok: true, value: "https://example.test/study-notes/guide/" });
});

test("public route URL resolution rejects noncanonical bases and routes", () => {
  assert.equal(definition.resolvePublicRouteUrl({ publicSiteUrl: "http://example.test/", normalizedRoute: "/guide" }).ok, false);
  assert.equal(definition.resolvePublicRouteUrl({ publicSiteUrl: "https://example.test/study-notes", normalizedRoute: "/guide" }).ok, false);
  assert.equal(definition.resolvePublicRouteUrl({ publicSiteUrl: "https://example.test/", normalizedRoute: "/Guide" }).ok, false);
});
