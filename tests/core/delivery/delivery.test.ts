import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJsonBytes, sha256Digest } from "../../../core/foundation/index.js";
import { createPublicDelivery } from "../../../core/delivery/index.js";

function canonical(value: unknown): Uint8Array { const result = canonicalJsonBytes(value); assert.equal(result.ok, true); if (!result.ok) throw new Error("canonical"); return result.value; }
function digest(value: unknown) { return sha256Digest(canonical(value)); }
function output(route = "/guide") {
  const bytes = new TextEncoder().encode("<main>public</main>\n");
  const provenance = { publishedRevisionIds: [], routeGraphDigest: digest("routes"), mediaSelectionDigest: digest("media"), theme: { id: "theme", version: "1.0.0", manifestHash: digest("theme") }, plugins: [], seo: { count: 0, digest: digest("seo") } };
  const routes = [{ route, filePath: "guide/index.html" }];
  const files = [{ path: "guide/index.html", bytes, digest: sha256Digest(bytes) }];
  return { contract: "renderer-output/v1" as const, rendererInputDigest: digest("input"), provenance, routes, files, outputDigest: digest({ provenance, routes, files: files.map((file) => ({ path: file.path, digest: file.digest })) }) };
}

test("Delivery writes an immediately verified immutable artifact", () => {
  const root = mkdtempSync(path.join(tmpdir(), "delivery-"));
  try {
    const delivery = createPublicDelivery({ artifactsRoot: path.join(root, "artifacts") });
    assert.equal(delivery.ok, true);
    if (!delivery.ok) return;
    const first = delivery.value.deliver(output());
    const second = delivery.value.deliver(output());
    assert.equal(first.ok && second.ok, true);
    if (!first.ok) return;
    assert.equal(delivery.value.loadVerifiedArtifact({ artifactDigest: first.value.artifactDigest }).ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Re-delivery atomically writes beside the destination and never enters artifacts root", () => {
  const root = mkdtempSync(path.join(tmpdir(), "delivery-"));
  try {
    const artifacts = path.join(root, "artifacts");
    const delivery = createPublicDelivery({ artifactsRoot: artifacts });
    assert.equal(delivery.ok, true);
    if (!delivery.ok) return;
    const built = delivery.value.deliver(output());
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const destination = path.join(root, "published");
    assert.equal(delivery.value.redeliver({ artifactDigest: built.value.artifactDigest, destination }).ok, true);
    assert.equal(existsSync(path.join(destination, "guide/index.html")), true);
    assert.equal(delivery.value.redeliver({ artifactDigest: built.value.artifactDigest, destination: path.join(artifacts, "forbidden") }).ok, false);

    const raced = path.join(root, "raced");
    symlinkSync(path.join(root, "absent-target"), raced);
    assert.equal(delivery.value.redeliver({ artifactDigest: built.value.artifactDigest, destination: raced }).ok, false);
    assert.equal(lstatSync(raced).isSymbolicLink(), true);
    assert.deepEqual(readdirSync(root).filter((entry) => entry.startsWith(".redelivery-")), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("Delivery 拒絕會在驗證後改變 path 的 accessor 輸入", () => {
  const root = mkdtempSync(path.join(tmpdir(), "delivery-"));
  try {
    const delivery = createPublicDelivery({ artifactsRoot: path.join(root, "artifacts") });
    assert.equal(delivery.ok, true);
    if (!delivery.ok) return;
    const poisoned = { ...output() } as Record<string, unknown>;
    Object.defineProperty(poisoned, "files", { enumerable: true, get: () => [{ path: "../../escaped", bytes: new Uint8Array([1]), digest: sha256Digest(new Uint8Array([1])) }] });
    assert.equal(delivery.value.deliver(poisoned as never).ok, false);
    assert.equal(existsSync(path.join(root, "escaped")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Delivery rejects forged output evidence before writing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "delivery-"));
  try {
    const delivery = createPublicDelivery({ artifactsRoot: path.join(root, "artifacts") });
    assert.equal(delivery.ok, true);
    if (!delivery.ok) return;
    const invalidRoute = delivery.value.deliver(output("guide"));
    const forged = { ...output(), outputDigest: digest("forged") };
    const invalidDigest = delivery.value.deliver(forged);
    assert.equal(invalidRoute.ok, false);
    assert.equal(invalidDigest.ok, false);
    assert.deepEqual(readdirSync(path.join(root, "artifacts")), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Delivery loser only removes its own staging", () => {
  const root = mkdtempSync(path.join(tmpdir(), "delivery-"));
  try {
    const artifacts = path.join(root, "artifacts");
    const delivery = createPublicDelivery({ artifactsRoot: artifacts });
    assert.equal(delivery.ok, true);
    if (!delivery.ok) return;
    const probe = delivery.value.deliver(output());
    assert.equal(probe.ok, true);
    if (!probe.ok) return;
    rmSync(probe.value.directory, { recursive: true, force: true });
    symlinkSync(path.join(root, "absent-target"), probe.value.directory);
    const loser = delivery.value.deliver(output());
    assert.equal(loser.ok, false);
    if (!loser.ok) assert.equal(loser.error.code, "ARTIFACT_IMMUTABILITY_CONFLICT");
    assert.equal(lstatSync(probe.value.directory).isSymbolicLink(), true);
    assert.deepEqual(readdirSync(artifacts).filter((entry) => entry.startsWith(".staging-")), []);
    assert.equal(existsSync(probe.value.directory), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
