import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { sha256Digest } from "../../../core/foundation/index.js";
import { createPublicDelivery } from "../../../core/delivery/index.js";
function digest(value: string) { return sha256Digest(new TextEncoder().encode(value)); }
test("Delivery writes, verifies, and re-delivers immutable Renderer bytes", () => { const root=mkdtempSync(path.join(tmpdir(),"delivery-")); try { const delivery=createPublicDelivery({artifactsRoot:path.join(root,"artifacts")}); assert.equal(delivery.ok,true); if(!delivery.ok)return; const bytes=new TextEncoder().encode("<main>public</main>\n"); const output={contract:"renderer-output/v1" as const,rendererInputDigest:digest("input"),provenance:{publishedRevisionIds:[],routeGraphDigest:"sha256:routes" as const,mediaSelectionDigest:"sha256:media" as const,theme:{id:"theme",version:"1.0.0",manifestHash:"sha256:theme" as const},plugins:[]},seo:{evidenceDigest:digest("seo"),omissionCount:0},routes:[{route:"/guide",filePath:"guide/index.html"}],files:[{path:"guide/index.html",bytes,digest:sha256Digest(bytes)}],outputDigest:digest("output")}; const built=delivery.value.deliver(output); assert.equal(built.ok,true); if(!built.ok)return; assert.equal(existsSync(path.join(built.value.directory,"artifact-manifest.json")),true); const copied=path.join(root,"copy"); const copiedResult=delivery.value.redeliver({artifactDigest:built.value.artifactDigest,destination:copied}); assert.equal(copiedResult.ok,true); if(!copiedResult.ok)return; writeFileSync(path.join(built.value.directory,"guide/index.html"),"tampered"); const rejected=delivery.value.redeliver({artifactDigest:built.value.artifactDigest,destination:path.join(root,"rejected")}); assert.equal(rejected.ok,false); } finally { rmSync(root,{recursive:true,force:true}); } });

test("Re-delivery 拒絕未經 manifest 列舉的額外 bytes 與未驗證的 artifact 位址", () => {
  const root = mkdtempSync(path.join(tmpdir(), "delivery-"));
  try {
    const delivery = createPublicDelivery({ artifactsRoot: path.join(root, "artifacts") });
    assert.equal(delivery.ok, true);
    if (!delivery.ok) return;
    const bytes = new TextEncoder().encode("<main>public</main>\n");
    const built = delivery.value.deliver({ contract: "renderer-output/v1", rendererInputDigest: digest("input"), provenance: { publishedRevisionIds: [], routeGraphDigest: "sha256:routes", mediaSelectionDigest: "sha256:media", theme: { id: "theme", version: "1.0.0", manifestHash: "sha256:theme" }, plugins: [] }, seo: { evidenceDigest: digest("seo"), omissionCount: 0 }, routes: [{ route: "/guide", filePath: "guide/index.html" }], files: [{ path: "guide/index.html", bytes, digest: sha256Digest(bytes) }], outputDigest: digest("output") });
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

test("落敗的並行交付只回收自己的 staging，不刪除已存在的 digest 目錄", () => {
  const root = mkdtempSync(path.join(tmpdir(), "delivery-"));
  try {
    const artifacts = path.join(root, "artifacts");
    const delivery = createPublicDelivery({ artifactsRoot: artifacts });
    assert.equal(delivery.ok, true);
    if (!delivery.ok) return;
    const bytes = new TextEncoder().encode("<main>public</main>\n");
    const output = { contract: "renderer-output/v1" as const, rendererInputDigest: digest("input"), provenance: { publishedRevisionIds: [], routeGraphDigest: digest("routes"), mediaSelectionDigest: digest("media"), theme: { id: "theme", version: "1.0.0", manifestHash: digest("theme") }, plugins: [] }, seo: { evidenceDigest: digest("seo"), omissionCount: 0 }, routes: [{ route: "/guide", filePath: "guide/index.html" }], files: [{ path: "guide/index.html", bytes, digest: sha256Digest(bytes) }], outputDigest: digest("output") };
    const probe = delivery.value.deliver(output);
    assert.equal(probe.ok, true);
    if (!probe.ok) return;
    const occupied = probe.value.directory;
    rmSync(occupied, { recursive: true, force: true });
    // 並行交付的危險視窗是 existsSync 與 mkdir 之間：勝出者已取得 digest 目錄，落敗者的 existsSync 仍是 false。
    // dangling symlink 讓 existsSync 為 false 而 mkdir 擲出 EEXIST，可在單一 process 重現同一分支。
    symlinkSync(path.join(root, "absent-target"), occupied);
    assert.equal(existsSync(occupied), false);
    const losing = delivery.value.deliver(output);
    assert.equal(losing.ok, false);
    if (!losing.ok) assert.equal(losing.error.code, "ARTIFACT_IMMUTABILITY_CONFLICT");
    // 落敗者不得刪除自己沒有建立的 digest 目錄：那是勝出者已回報成功的 immutable artifact。
    assert.equal(lstatSync(occupied).isSymbolicLink(), true);
    assert.deepEqual(readdirSync(artifacts).filter((entry) => entry.startsWith(".staging-")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
