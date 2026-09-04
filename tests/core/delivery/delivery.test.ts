import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { sha256Digest } from "../../../core/foundation/index.js";
import { createPublicDelivery } from "../../../core/delivery/index.js";
test("Delivery writes, verifies, and re-delivers immutable Renderer bytes", () => { const root=mkdtempSync(path.join(tmpdir(),"delivery-")); try { const delivery=createPublicDelivery({artifactsRoot:path.join(root,"artifacts")}); assert.equal(delivery.ok,true); if(!delivery.ok)return; const bytes=new TextEncoder().encode("<main>public</main>\n"); const output={contract:"renderer-output/v1" as const,rendererInputDigest:"sha256:input" as const,provenance:{publishedRevisionIds:[],routeGraphDigest:"sha256:routes" as const,mediaSelectionDigest:"sha256:media" as const,theme:{id:"theme",version:"1.0.0",manifestHash:"sha256:theme" as const},plugins:[]},files:[{path:"guide/index.html",bytes,digest:sha256Digest(bytes)}],outputDigest:"sha256:output" as const}; const built=delivery.value.deliver(output); assert.equal(built.ok,true); if(!built.ok)return; assert.equal(existsSync(path.join(built.value.directory,"artifact-manifest.json")),true); const copied=path.join(root,"copy"); const copiedResult=delivery.value.redeliver({artifactDigest:built.value.artifactDigest,destination:copied}); assert.equal(copiedResult.ok,true); if(!copiedResult.ok)return; writeFileSync(path.join(built.value.directory,"guide/index.html"),"tampered"); const rejected=delivery.value.redeliver({artifactDigest:built.value.artifactDigest,destination:path.join(root,"rejected")}); assert.equal(rejected.ok,false); } finally { rmSync(root,{recursive:true,force:true}); } });

test("Re-delivery 拒絕未經 manifest 列舉的額外 bytes 與未驗證的 artifact 位址", () => {
  const root = mkdtempSync(path.join(tmpdir(), "delivery-"));
  try {
    const delivery = createPublicDelivery({ artifactsRoot: path.join(root, "artifacts") });
    assert.equal(delivery.ok, true);
    if (!delivery.ok) return;
    const bytes = new TextEncoder().encode("<main>public</main>\n");
    const built = delivery.value.deliver({ contract: "renderer-output/v1", rendererInputDigest: "sha256:input", provenance: { publishedRevisionIds: [], routeGraphDigest: "sha256:routes", mediaSelectionDigest: "sha256:media", theme: { id: "theme", version: "1.0.0", manifestHash: "sha256:theme" }, plugins: [] }, files: [{ path: "guide/index.html", bytes, digest: sha256Digest(bytes) }], outputDigest: "sha256:output" });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const traversal = delivery.value.redeliver({ artifactDigest: "../../etc" as `sha256:${string}`, destination: path.join(root, "traversal") });
    assert.equal(traversal.ok, false);
    if (!traversal.ok) assert.equal(traversal.error.code, "REDELIVERY_SOURCE_INVALID");
    const relative = delivery.value.redeliver({ artifactDigest: built.value.artifactDigest, destination: "relative-destination" });
    assert.equal(relative.ok, false);
    writeFileSync(path.join(built.value.directory, "injected.html"), "injected");
    const injected = delivery.value.redeliver({ artifactDigest: built.value.artifactDigest, destination: path.join(root, "injected") });
    assert.equal(injected.ok, false);
    if (!injected.ok) assert.equal(injected.error.code, "REDELIVERY_SOURCE_INVALID");
    assert.equal(existsSync(path.join(root, "injected")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
