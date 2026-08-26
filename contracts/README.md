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
