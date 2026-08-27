# Basic Spike Contracts v1

- **Contract ID**: `CMS-BASIC-CONTRACTS-V1`
- **核准日期**：2026-08-26
- **核准邊界**：Owner 已要求完成所有已定義 Spike 並以五角色審查收斂。本檔是 SP-001–SP-005 與 SP-A06 的唯一現行 SSOT／implementation contract；決策來源、歷史紀錄與可重跑 evidence 已歸檔至 `logs/2026-08-26-2103-cms-spike-research/`，不自行升格為 contract。

## 從這裡開始

**唯一現行 SSOT**：本檔是 `CMS-BASIC-CONTRACTS-V1` 唯一有權定義後續 CMS／renderer implementation 的檔案。發生衝突時，必須以本檔為準。

- `MEMORY.md` 只保存長期工程原則與本檔指標，不複製或覆蓋本檔契約。
- `logs/`、`source-drafts/`、`project-*` 歸檔、isolated Spike 與 working documents 只供 provenance 或可重跑 evidence；其中內容不得覆蓋本檔。
- `source-drafts/` 中的檔案是 byte-preserved historical input，絕不發布為網站內容；其內部自稱的「source of truth」不具權威，未經新的 Owner 決策不得從中抽取需求。
- 後續 SSOT 變更只改本檔；provenance 只追加至 `logs/`，不回寫 historical input。

## 已核准系統範圍

- 系統由單一內容管理者使用；本機關聯式 SQL 是 canonical state，媒體保存於本機。公開端只讀 published projection 所產生的 GitHub Pages 靜態輸出，不依賴 production API、DB 或 auth。Publish 不執行 Git、build 或 deploy。
- CMS Workspace、Content Core、Media Library、Site Definition、Projection & Preview、Static Rendering & Public UI、Build, Validation & Release 只作責任 taxonomy，不預先鎖定 package 或 code boundary。Content Type／schema 留在 Content Core；Site Definition 與 Projection & Preview 保持獨立 owner。
- JavaScript／TypeScript 是專案方向。Node 22、React+Vite、Hono、Zod、Drizzle、SQLite 的完整組合僅是既有 Spike baseline，未被核准為正式 stack。
- Authoring 採結構化 block。raw article code 與 Interactive Demo Plugin 分別遵守下列既有 sandbox／公開 privilege 邊界與 static fallback 義務。
- Theme 與 Plugin 是長期範圍；Controlled Command 與 SP-A01–SP-A05 維持 deferred／scope-gated。不得以歷史 Draft 的 production backend/API、object storage、多角色 auth、SQLite-in-Git、Publish push、Markdown／MDX editor 或 Astro 路由表擴張本檔範圍。

## 1. Domain lifecycle

`DomainApplication` 擁有 `SaveRevision`、`PublishRevision`、`RestoreRevision`、`ChangeRoute` application commands。每個 command 在寫入前完成 schema validation、media availability、route conflict/impact preflight；單一 transaction 的 write-set 包含 immutable revision、current/published pointer、對應 graph route claims 與 operation lineage。任一 preflight、constraint 或 fault 失敗時，所有 write-set digest 不變，回傳 `{code, owner, subjectIds, remediation}`。

`Revision` 是 immutable `{entryId, revisionId, schemaVersion, contentBytes, contentDigest, restoredFromRevisionId?}`。`schema_versions` 與 `revisions` 均 append-only；update/delete 必須被 persistence 拒絕。`entry_pointers(entryId, currentRevisionId, publishedRevisionId?)` 的兩個 revision ID 均以 `(entryId, revisionId)` composite foreign key 指向 Revision。

Schema migration 先回傳 impact report `{affectedPointers, historicalRevisions, mapping, blockedRows}`。不相容 migration 僅在 mapping 覆蓋所有受影響 current/published pointers、每個 transformed payload 通過新 schema validation 時提交；它建立新 immutable revisions、按 command 指定 policy 切換 pointers，或明確保留舊 pin。空/部分 mapping、缺 required field 或無效 select mapping 一律 rollback。

## 2. Route and media

`SiteDefinition` 擁有唯一 normalized route-claim registry。claim identity 為 `{graph: current|published, routeNfcCasefoldSlash, owner, sourceRevisionId}`。同 owner 的 current/published claim 可並存；mutation 只更新目標 graph，但 preflight 必須計算全部仍保留 claims 的 collision 與 impact。每個 impact item 含 graph、owner、from、to、sourceRevisionId。所有 snapshot 在 mutation 前 canonical copy/hash；commit 或 rollback 後各 graph hash 可驗證。

`DataMedia` 擁有 immutable checksum object、immutable asset version、logical asset、revision reference registry。`revision_refs(entryId, revisionId, assetVersionId)` 有 composite Revision FK 與 asset-version FK；replace 一律建立新 asset version/object 加新 revision，歷史 revision bytes/metadata/checksum 不變。published media selection 只沿 published pointer → revision refs → available asset version → checksum object 解析；missing、archived、corrupt metadata/object 均在 projection 前 fail closed。

Import 採 durable `staged → pending → ready` state。startup reconciliation 是 idempotent：沒有 canonical ready asset/reference 的 staged/final bytes 會移除；pending intent 的 physical bytes 缺失則移除 intent；可驗證 object promotion 則完成為 ready。任何 archived/missing media 使 `RestoreRevision` 在 mutation 前回傳 `BLOCKED_ARCHIVED_MEDIA_RESTORE`，含可呼叫的 `RestoreAsset` remediation；`RestoreAsset` 是 Media/Application command，CMS 不直接 SQL/filesystem。

## 3. Projection, preview, delivery

`ProjectionPreview` 擁有唯一 `renderer-input/v1` producer。public input 是 immutable bytes，至少含 `{contract, inputDigest, selection: {publishedRevisionIds, routeGraphDigest, mediaSelectionDigest}, entries, routes, media, theme, plugins}`。producer 只讀 published pointers、published route graph 與 published media selection，先 resolve route/media references；任何 unresolved reference fail closed。Static builder 只消費這個 bytes。

`Preview(selection: current|published, subject)` 是唯讀：current 可見 draft、published 不可見；兩者的 canonical state digest 在呼叫前後相同。CMS raw article preview 受 sandbox；公開 raw article code 具 Owner 核准的 full-page privilege，兩者都含 static fallback。Interactive Demo Plugin 的 CMS/public output 都使用不含 `allow-same-origin` 的 sandbox；其 source HTML/CSS/JS 都必須進 sandbox document。

`PublicDelivery` 產出 immutable artifact directory 與 `artifact-manifest.json`。manifest 包含 renderer-input digest、published selection IDs、Theme id/version/manifest hash、active Plugin id/version/manifest hash、逐檔 hash 與 total digest。相同 inputs 的 manifest/artifact 必須 byte-identical；任何 input 改變都改變 provenance。re-delivery 只複製既有 immutable artifact bytes。

## 4. Plugin host

trusted local folder discovery 只列出 manifest；manual activation 以結構化 validation 驗證 id、semver version、trusted flag、hook contract、capability declarations。Hybrid host 固定 `plugin-hooks/v1`：Actions 不回傳；Filters 接 immutable input、回 replacement；順序為 priority 再 Plugin ID。editor-block、validator、renderer、assets 由 Plugin callbacks 經 injected application services 執行，direct SQL/media access 被 host boundary 拒絕。

public Plugin renderer 只接收 published `renderer-input/v1` block；不得讀 authoring revision store。active callback exception 使 operation/build fail，diagnostic 含 Plugin、capability、Entry、stable code、sanitized cause/remediation。inactive/missing Plugin 不執行 hooks/capabilities；revision source 保留，CMS 顯示 inactive block，new artifact 省略 output 並產生 diagnostic；re-enable 對同 revision 恢復。old artifact 可由其 manifest 重新交付且 bytes 不變。

## 5. 已核准的 v1 執行契約

- **內容 command**：`SaveRevision` 建立新 revision／references 並只移動 current pointer／current claim；`PublishRevision` 必須帶 `expectedCurrentRevisionId`，僅在仍等於 canonical current 時移動 published pointer／published claim；`RestoreRevision` 建立新 revision 並只移動 current pointer／current claim，published 維持不變。`ChangeRoute` 先由 `SiteDefinition` 做唯讀 prepare，回傳綁定兩圖 digest 的 proposal／impact；`DomainApplication` 只接受同一新鮮 proposal，並在單一 transaction 內 commit。v1 不釋出 lifecycle mutation Plugin hook。
- **路由 identity**：`route-normalization/v1` 為 locale-independent profile：NFC、full case fold、再次 NFC，再做 slash canonicalization；只接受單一前導 `/`、合併重複 slash、root 以外移除尾 slash，拒絕反斜線、dot segment、raw percent ambiguity、control、bidi control 與 default-ignorable。UTS #39 confusable 不併入 collision key；診斷以 escaped、code-point-safe route 表示。每個 `{graph, normalizedRoute}` 只能有一筆 active claim，每個 `{graph, owner}` 最多一筆；`sourceRevisionId` 是可替換 attribution。current 與 published graph 的同 key 不互相 collision。每圖公開 `route-graph-snapshot/v1`，以 UTF-8 JCS canonical bytes、穩定 claim 排序及 `sha256:<lowercase hex>` digest 表示；profile 或 snapshot 版本變更必須走 migration analysis。
- **媒體 replace／復原**：replace 先以 `DataMedia` 建立 ready asset version，再由 `SaveRevision` 只替換一個 current source revision 的 target reference，複製其餘 references，並只移動 current pointer；published 只由 `PublishRevision` 移動。archive 作用於單一 asset version；仍被 active published pointer 引用時拒絕。缺失 bytes 的 `RestoreAsset` 只接受與既有 digest、byte length 及 immutable metadata 關係完全相符的本機 recovery bytes；每個 unavailable version 都有 transport-neutral remediation descriptor。
- **Plugin host**：`plugin-hooks/v1` 採明確列舉、可 additive 的 catalog，未知 hook 一律拒絕；首批只發布 `SaveRevision` validator 與 CMS-facing editor-block resolution。每個 Plugin 每個 hook 最多一個 callback，順序為 ascending priority 再 canonical Plugin ID。activation identity 為 `{id, version, hookContract, manifestHash}`，manifest hash 必須傳遞涵蓋 callback／renderer executable 與 resource digests；trusted root 由 operator／host 設定，顯式 activation 持久保存 exact identity，identity mismatch／missing 時轉為非執行狀態，提供 explicit deactivation，v1 只允許 exact-identity re-enable；同 ID collision fail closed。

## 6. Repository architecture and Foundation runtime

- Repository semantic roots are `core/` (platform owners and hosts), `apps/` (composition/transport entrypoints), and `extensions/` (versioned Plugin/Theme source templates). `db/migrations/` holds versioned SQL; `dist/` is generated and never source. Do not create reserved roots, `.gitkeep`, stubs, no-op scripts, or fake-success paths before a real caller exists.
- Exact core owners are Foundation, Content, Persistence, Application, SiteDefinition, Media, PluginHost, ThemeHost, Projection, Renderer, and Delivery. Each owner and every `apps/<app>/`, `extensions/plugins/<id>/`, `extensions/themes/<id>/` unit has exactly one root `index.ts` public entrypoint. Cross-owner imports target only that entrypoint; package-local imports remain allowed.
- Plugin and Theme repository source is never an installed, trusted, or active root. Hosts receive absolute realpath-validated repository-external installed roots. Filesystem package paths are Host inputs; Projection/Renderer/Delivery inject public URLs. Plugin source may type-import only `core/plugin-host/index.ts`; Theme source may type-import only `core/renderer/index.ts`; installed runtime modules are self-contained ESM with no repository-relative value import.
- Foundation depends only on itself, Node builtins, and JCS. Content/Persistence/SiteDefinition/Media/PluginHost/ThemeHost depend only on themselves and Foundation; Application composes owner entries; Projection may read Foundation/Content/Persistence/SiteDefinition/Media/PluginHost/ThemeHost entries; Renderer reads Foundation/Projection; Delivery reads Foundation/Projection/Renderer; apps compose core entries. Core and extensions never import apps. The architecture checker enforces this matrix, public entrypoints, root placement, naming, parse/module-resolution errors, symlink escape, and one deterministic violation per import edge by its documented precedence.
- The checker scans the whole repository (`**/*.ts`, `**/*.sql`) minus generated and read-only handoff roots, so files outside the semantic roots are reported rather than silently unscanned. Import-edge precedence is fixed: `UNRESOLVED_IMPORT` → `SYMLINK_ESCAPE` → `FOUNDATION_ISOLATION` → `RUNTIME_SELF_CONTAINED` → `EXTENSION_TYPE_ONLY` → `APP_COMPOSITION` → `HOST_EXTENSION_ISOLATION` → `RENDERER_THEME_ISOLATION` → `DEEP_IMPORT` → `OWNER_DIRECTION`. `tests/` and `scripts/` may reach implementation files directly; every other cross-unit edge must target the unit's root `index.ts`. Every rule identifier the checker declares has a failing fixture in `tests/core/foundation/check-architecture.test.ts`; no identifier may be declared without an enforcing branch.
- General directories and TypeScript filenames use kebab-case; tests use `<behavior>.test.ts`; SQL migrations use `NNNN-<kebab-case>.sql`; exported types/classes use PascalCase, functions/variables camelCase, and error codes SCREAMING_SNAKE_CASE. Cross-owner `common`, `utils`, `services`, and `repositories` roots are prohibited.
- Tooling is strict ESM on Node `24.20.0`, npm `11.19.0`, and TypeScript `5.9.3`; `json-canonicalize@3.0.0` is the sole Foundation runtime package. `node:sqlite` is accepted at Node 24 Stability 1.2 only behind a Persistence-private adapter; #219 must prove migration/FK/constraint/transaction compatibility and public API must not expose the driver. React/Vite, Hono/Zod, and hand-written SQL are the production technology map, not Foundation dependencies.
- `core/foundation/index.ts` is the only shared public entrypoint: `CoreResult`, safe `CoreFailure`, `Digest`, `canonicalJsonBytes`, `sha256Digest`, `isDigest`, and `copyBytes`. JCS uses a descriptor snapshot, rejects Proxy/accessors/invalid prototypes/cycles/lone surrogates before library invocation, preserves `__proto__` as data, and returns only `INVALID_CANONICAL_JSON` / `CoreFoundation` / empty IDs / the fixed Chinese message.
- Present scripts are `typecheck`, `test`, `check:architecture`, and `check`; existing Rulesync scripts remain unchanged. Reserved scripts (`cms:*`, `db:*`, `plugin:*`, `theme:*`, `projection:*`, `preview:*`, `site:*`, `artifact:*`, `release:*`) enter the manifest only with a real entrypoint and contract test. PublishRevision, build, and release remain separate.
- WordPress informs the separation of [core Plugin API](https://github.com/WordPress/wordpress-develop/blob/trunk/src/wp-includes/plugin.php), installed enumeration/activation, and relocatable [Plugin paths](https://developer.wordpress.org/plugins/plugin-basics/determining-plugin-and-content-directories/); this project does not adopt PHP headers, global mutable hooks, include execution, or `wp-*` naming.
