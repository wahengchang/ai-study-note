# Basic Spike Contracts v1

- **Contract ID**: `CMS-BASIC-CONTRACTS-V1`
- **核准日期**：2026-08-26
- **SEO target**：#307 的 SEO clauses 已核准；#308 已在 `site-reset` 實作。本檔記錄其核准 contract，程式碼與對應測試是現行 runtime 行為的 SSOT。

## Scope and authority

程式與對應測試是已實作可觀察行為的 SSOT。本檔只記錄 owner、跨 owner public seam、exact DTO/literal 與 observable matrix；private shape 由 public TypeScript、exact parser 與 tests 固定。

- 單一內容管理者；本機 SQL 是 canonical state、媒體在本機；公開端只讀 published projection 的 immutable static artifact。Publish 不 build、deploy 或 Git。
- semantic roots 是 `core/`、`apps/`、`extensions/`；各 owner/app/extension unit 僅有 root `index.ts` public entry。cross-owner import 僅至該 entry；core/extensions 不得 import apps。
- Content、Persistence、Application、SiteDefinition、Media、PluginHost、ThemeHost、Projection、Renderer、Delivery 與 CLI 各有 owner。Plugin/Theme repository source 不是 trusted/installed/active root；installed runtime 是 repository-external、realpath-validated、self-contained ESM。
- #308 是 pre-launch clean cutover：遷移所有 caller、fixture、test 與 wire；不留 `v2`、舊 parser branch、alias 或 deprecated path。它不增加 marketplace、catalog/history/delete、auto-save、deploy、off-origin canonical、social image、raw JSON-LD 或 custom robots text。

## 1. Domain, Content, route and media

### Implemented baseline

- `DomainApplication` owns `SaveRevision`、`PublishRevision`、`RestoreRevision`、`ChangeRoute`。immutable `Revision` uses `{entryId,revisionId,schemaIdentity:{schemaId,version},contentBytes,contentDigest,...}`; revisions/schema versions are append-only; pointers use composite revision foreign keys. Failed preflight/constraint/fault leaves the transaction write-set unchanged.
- `SiteDefinition` owns the unique normalized current/published route-claim graphs and their digest-bound replacement proposal. Route normalization remains locale-independent NFC → full case-fold → NFC plus slash canonicalization; malformed/ambiguous paths fail closed.
- `DataMedia` owns immutable object/version/logical-asset/reference state. Public selection is published pointer → revision references → available asset version → checksum object; missing, archived or corrupt evidence fails before projection.
- `ProjectionPreview` is the only `renderer-input/v1` producer. It reads published pointers/routes/media only; preview is read-only and distinguishes `current` from `published`. Raw full-page and Interactive Demo retain their approved privilege, sandbox and non-empty static-fallback boundaries.

### #308 contract — Content and save baseline

- `Content` owns the sole revision shape: `StructuredContent={contract:"site-content/v1",title,blocks,seo}` and `StructuredSeo={title?,description?,canonicalPath?}`. `seo` is required; any present string is non-empty; CMS trim-to-empty omits that field. Unknown/null/array/empty values fail closed. Optional `seo` is not a supported contract.
- The sole schema identity/evidence is immutable `SiteContentSchemaIdentity={schemaId:"site-content",version:1}` and defensive-copy `{identity,schema,schemaBytes,schemaDigest}` from `getSiteContentSchemaEvidence()`. Schema is Draft 2020-12, `$id:"site-content/v1"`, root exact/required `contract,title,blocks,seo`; subordinate block/schema details remain in Content public types, parser and tests.
- `InteractiveDemoBlock` is exact `{kind:"interactive-demo",identity:{id,version},hook:"cms/editor-block/resolve",manifestHash,source:{html,css,javascript},staticFallback}`. `pluginIdentity` and every prior block/schema identity are removed.
- Every save request/command/wire carries `expectedCurrentRevisionId:string|null`; Application compares it exactly with the persistence current pointer **before any Plugin callback**. Mismatch has a stable conflict and zero writes. Schema validation is the only SEO save gate: SEO score, suggestions, keywords and readability never gate Save or Publish.
- `resolvePublicRouteUrl({publicSiteUrl,normalizedRoute})` is SiteDefinition's only public URL builder. The base is canonical HTTPS; root equals base, non-root appends a trailing slash. A present canonical path/callback path must normalize without byte change.

## 2. Persistence and durable activation state

### Implemented baseline

- Persistence owns transactions, immutable revisions/pointers and `persistence-canonical-state/v2`. Cross-host ordering and canonical bytes use locale-independent JSON code-unit order, never `localeCompare`.

### #308 contract — CAS state

- Reuse the opaque-bytes/digest singleton CAS pattern; do not create a second store. `theme_activation_state` and `plugin_settings_state` are `STRICT(singleton=1,state_bytes,state_digest)` with prevent-delete triggers.
- `0009-add-theme-activation-state.sql` seeds JCS `{"contract":"theme-activation-state/v1"}`; `0010-add-plugin-settings-state.sql` seeds JCS `{"contract":"plugin-settings-state/v1","records":[]}`. Each has its SHA-256. Fresh migration has ten rows and current migration `0010-add-plugin-settings-state`.
- Public persistence ports add theme activation and Plugin settings `read`/`compareAndReplace` opaque bytes+digest. Malformed bytes, stale expected digest, constraint and storage faults produce zero mutation.
- `persistence-canonical-state/v2` gains exact `{singleton,stateDigest}` code-unit-sorted `pluginActivationStates`, `themeActivationStates`, `pluginSettingsStates` plus same-named counts. Missing rows read as `[]`/`0`, never as invented defaults. Production migration reconciles Content public schema evidence only: absent `site-content@1` appends exact evidence, equal is zero-write, same identity/different bytes or digest fails and requires a new pre-release DB.

## 3. ThemeHost

### Implemented baseline

`core/theme-host/index.ts` owns installed-root discovery, manifest/identity validation and defensive verified-file evidence. `ThemeIdentity={id,version,manifestHash}` is manifest-derived; duplicate `{id,version}` candidates fail closed. Trusted roots/files must be current-UID-owned, safe-mode regular files; symlink/path/evidence drift fails closed. Runtime bytes are verified but not executed by ThemeHost and may not import dependencies.

### #308 contract — durable active Theme

- Add `ThemeActivationStatePort`, `ThemeActivationSnapshot={active?:ThemeIdentity,stateDigest}`, `getActivationSnapshot()`, CAS `activate({identity,expectedActivationStateDigest})`, and `resolveActive(): ThemeHostResult<{identity,activationStateDigest,theme:VerifiedThemePackage}>`.
- `theme:activate --id study-notes` discovers exactly one candidate and CAS-writes its complete `{id,version,manifestHash}` using a fresh digest. Zero candidate, same-ID multi-version ambiguity, malformed/empty state, evidence drift or stale CAS fails with no write.
- CMS serve, site build, Projection and Preview resolve the durable active Theme. Caller-supplied Theme identity is not an approved boundary.

## 4. PluginHost, settings and CMS analysis

### Implemented baseline

`PluginHost` owns trusted installed Plugin discovery, explicit hook catalog, immutable callback input and hook ordering (priority then Plugin ID). Public Plugin rendering receives published renderer input only; it cannot read authoring revision state. Missing/inactive callback owners never gain direct SQL, media, route-graph or artifact-directory access.

### #308 contract — Plugin identity/settings/execution

- `PluginActivationIdentity` is required exact `{id,version,hookContract,manifestHash,capabilities}`. Capabilities are code-unit sorted and exactly match the manifest. `activate` and `deactivate` require `expectedActivationStateDigest`; `CreatePluginHostInput` requires the settings port.
- The additive catalog includes `cms/seo/analyze` ↔ `cms-seo-analysis`, `public/seo/page` ↔ `public-seo-page-contribution`, and `public/seo/site` ↔ `public-seo-site-contribution`; at most one callback per Plugin/hook.
- `SeoPluginSettingsV1={contract:"seo-plugin-settings/v1",publicSiteUrl,indexing:"allow"|"disallow"}`. State is exact `plugin-settings-state/v1` records `{identity,settingsContract,settings,settingsDigest}`, unique/code-unit-sorted by Plugin ID. `getSettingsSnapshot()` and CAS `replaceSettings({identity,expectedSettingsStateDigest,settingsContract,settings})` neither default nor migrate a mismatch. Activation without an exact saved settings record returns `INVALID_PLUGIN_SETTINGS` and changes no activation state.
- `analyzeCmsSeo()` is the only CMS SEO execution seam. It accepts exact `CmsSeoAnalysisInputV1={contract:"cms-seo-analysis-input/v1",entryId,inputDigest,schemaIdentity,content,route,settings}` and synchronous exact `CmsSeoAnalysisOutputV1={contract:"cms-seo-analysis-output/v1",preview:{title,description?,canonicalPath},suggestions}`; `inputDigest` binds the JCS input excluding itself. Zero/one valid producer is usable; two valid producers return non-blocking unavailable `SEO_ANALYSIS_CONFLICT`. Inactive/missing/drift/settings mismatch/invalid output/throw yield sanitized sorted entry/site diagnostics and never gate Save/Publish.
- `resolveCmsEditorBlock()` 只接受 revision 可精確持久化的 immutable binding `{id,version,hook:"cms/editor-block/resolve",manifestHash}` 與 source；Host 內部以 installed manifest、callback capability 與完整 durable activation evidence 進行 exact 驗證。`DomainApplication.resolveCurrentCmsEditorBlocks()` 是它唯一的 CMS production caller：從 current canonical revision 依 block index 導出 binding，回傳 exact `cms-editor-block-resolutions/v1` 的 active `{output,outputDigest}` 或 source-preserving `inactive|missing|identity-changed` Host diagnostic。CMS 只消費此 DTO，絕不 import installed Plugin module、callback 或 verified entry bytes。
- `resolvePublicBuildSnapshot({contract:"public-plugin-build-request/v1",published})` is the only public-build execution seam. It returns `PreparedPublicBuildSnapshot={snapshot,token:opaque}` containing activation/settings/public-renderer/SEO evidence and omission digest. `validatePublicBuildSnapshot(token)` soft rereads and rejects stale/foreign tokens. SEO-only unavailable may latch a post-latch safe omission with zero contribution; a selected generic block/assets owner unresolved remains hard failure. Settings mismatch, invalid output, semantic conflict and callback fault are hard failure with zero Delivery.
- Stable diagnostics include `INVALID_PLUGIN_SETTINGS`, `PLUGIN_SETTINGS_MISMATCH`, `PLUGIN_SETTINGS_STATE_CONFLICT`, `PLUGIN_SETTINGS_STATE_FAILURE`, `SEO_ANALYSIS_CONFLICT`, and Renderer-only `SEO_CONTRIBUTION_CONFLICT`. Raw causes, installed paths, runtime handles, credentials and complete diagnostics never enter canonical/public bytes.

## 5. Application, HTTP and CMS

### Implemented baseline

`apps/authoring-api` is the sole localhost transport composition root. It binds only `127.0.0.1:43127` / `http://127.0.0.1:43127`; rejects alternate Host/origin/forwarding/CORS/redirects. Credential rotation, server proof, one-time browser ticket, memory-only session bootstrap, authenticated content read/mutation and Preview transport are implemented. Every response is no-store/no-cache/nosniff/no-referrer; logs use only `{requestId,stableEventCode,method,routeTemplate,status}` and diagnostics redact `asn_v1_` / `asn_bt_v1_`.

Before secret/auth/body parsing, every `/_local` and `/v1` route rejects Cookie and query. The middleware order is Host/forwarded → Origin/Fetch Metadata → Bearer → media/body/schema → Application; admission failure runs no command or canonical mutation. Browser `POST` requires exact Origin, exactly one `Sec-Fetch-Site:same-origin`, and Bearer. API `GET` requires exact Host/Bearer/exactly one same-origin Fetch Site, with absent Origin or one exact Origin. CLI keeps its existing absent-Origin/no-Fetch-Metadata Bearer profile.

### #308 contract — Application façade and finite routes
- `Application` is the only authoring façade for existing type/catalog/history/Save/Publish/current/published Preview plus `readCurrentEntry`, `resolveCurrentCmsEditorBlocks`, `listPlugins`, `activatePlugin`, `replacePluginSettings`, `analyzeCmsSeo`. Authoring API/browser code must not call Projection, ThemeHost, PluginHost or Persistence directly.
- `PluginManagementSnapshotV1={contract:"plugin-management-snapshot/v1",activationStateDigest,settingsStateDigest,plugins,diagnostics}`; Plugin items use current verified evidence and, only on exact identity match, settings `{settingsContract:"seo-plugin-settings/v1",settings:SeoPluginSettingsV1,settingsDigest}`. Items sort by ID; diagnostics sort by code/scope. Requests are exact `plugin-activation-request/v1 {identity,expectedActivationStateDigest}` and `plugin-settings-replace-request/v1 {identity,expectedSettingsStateDigest,settingsContract:"seo-plugin-settings/v1",settings}`; both CAS mutations return a fresh snapshot.
- `CmsSeoAnalysisRequest` is exact `{contract:"cms-seo-analysis-request/v1",entryId,expectedCurrentRevisionId,schemaIdentity,content,route,documentDigest}` where `documentDigest=SHA-256(JCS({entryId,expectedCurrentRevisionId,schemaIdentity,content,route}))`. Application recomputes it constant-time, validates schema/content/normalized route/baseline, then has SiteDefinition form the absolute canonical URL. `ENTRY_NOT_FOUND`, `CURRENT_REVISION_MISMATCH`, `INVALID_SEO_ANALYSIS_REQUEST` leave unrelated state unchanged.
- `AuthoringEntryV1={contract:"authoring-entry/v1",entryId,current:{revisionId,schemaIdentity,content,contentDigest,route,assets},stateDigest}` is current-only; assets sort by ID/version. It carries no published/history/dual route graph.
- Add only finite routes: `GET /v1/plugins`, `POST /v1/plugins/activate`, `POST /v1/plugins/settings`, `GET /v1/entries/:entryId/current`, `GET /v1/entries/:entryId/current/editor-blocks`, `POST /v1/entries/:entryId/seo-analysis`. GET miss is `404`; CAS conflict or Plugin operation snapshot drift is `409`; invalid request/digest/identity/settings `422`; callback SEO unavailable and editor block `inactive|missing|identity-changed` are `200`; inability to form a DTO from storage/Application fault `500`. Central classification rejects unknown, trailing-slash, nested, encoded paths and `OPTIONS`.
- CMS browser code moves to the sole `apps/cms/index.ts` entry. It owns Plugin settings/activation and entry-editor SEO UI plus source-preserving Plugin editor-block UI: normalized-document dirty/save bytes retain every canonical interactive block, while active Host output and safe Host diagnostics are derived display-only bytes. The editor has normalized-document dirty/save/analysis bytes, 400ms trailing analysis, stale-response suppression, conflict lock/reload focus, and accessible status. SEO unavailable is non-blocking; SEO never disables eligible Save/Publish.

### #308 contract — CMS document admission

CMS document routing is a finite exact allowlist: `GET /cms`, `GET /cms/`, `GET /cms/entries/new`, `GET /cms/entries/:entryId`, and `GET /cms/plugins`. Built assets are admitted only from the built manifest allowlist. `GET /cms/plugins` **must** be in both the CMS-document allowlist and the central logger's document route-template union; no `/cms/*`, prefix, history, SPA or wildcard fallback is permitted.

Every CMS document route, including `/cms/plugins`, requires exact Host; document/navigation request semantics; exactly one `Sec-Fetch-Site` of `none` or `same-origin`; and absent Origin, Bearer, Cookie and query. Unknown, encoded, nested or trailing-slash variants fail closed. This profile is distinct from authenticated API admission.

## 6. Published snapshot, Renderer and Delivery

### Implemented baseline

Renderer consumes Projection's immutable renderer input; Delivery creates immutable artifact directories with a manifest, verifies route/file closure and bytes before write, and uses sibling staging then atomic rename. Identical verified artifacts are re-deliverable without mutation; changed input changes provenance. Public rendering remains published-only.

### #308 contract — prepared published build

- Projection reads published content/routes/media only, builds code-unit sorted `{entryId,revisionId,schemaIdentity,route,content}` input, calls `resolvePublicBuildSnapshot()` exactly once, materializes only prepared evidence, validates its token exactly once, then rereads/compares published selection and active Theme evidence before renderer encoding. Current/draft never enter Host input, diagnostic, digest or output.
- Projection returns `PublishedProjectionResult={artifact,diagnostics}`. It converts typed SEO path DTOs to absolute URLs through SiteDefinition; diagnostics/omission evidence are sidecar/internal provenance only.
- Theme output is exact `theme-render-output/v1 {pages:[{route,language,bodyHtml,stylesheetResources}]}`. Theme supplies body only; renderer owns document head/site files. Packaging is source → external installed root with verified atomic/idempotent evidence: no raw TypeScript copy or retained staging.
- Renderer requires one Theme page per route, copies only verified Theme CSS to `assets/theme/<digest>.css`, and emits head order charset → viewport → stylesheet → title → description? → canonical → Open Graph → ordered JCS JSON-LD. It applies HTML/RCDATA and JSON-LD escaping; duplicate/contradictory SEO contribution, meta key, site contribution, public URL or artifact path is `SEO_CONTRIBUTION_CONFLICT`, never priority override.
- Valid site SEO alone produces route-sorted escaped final-newline `sitemap.xml` and fixed final-newline `robots.txt`; typed CR/LF/NUL is rejected. Renderer/Delivery manifest exposes aggregate SEO evidence count/digest only—never diagnostics or omission fields. Existing artifact directories require full listed-byte/no-extra-file verification; mismatch is `ARTIFACT_IMMUTABILITY_CONFLICT` and is never overwritten.

## 7. Production CLI and observable matrix

### #308 approved command matrix

Real entrypoints, not test hosts or hand-built artifacts, are required:

| Command | Contract |
| --- | --- |
| `plugin:package --id seo-basics --installed-plugins-root <path>` | packages `seo-basics@1.0.0` with self-contained synchronous callbacks |
| `theme:package --id study-notes --installed-themes-root <path>` | packages `study-notes@1.0.0` body-only Theme and stylesheet |
| `db:migrate --database <path>` | applies migrations and reconciles Content evidence only |
| `theme:activate --database <path> --installed-themes-root <path> --id study-notes` | discovers one candidate and durable-CAS activates it |
| `cms:build` | emits content-hashed assets plus manifest |
| `cms:serve --database <path> --media-root <path> --installed-plugins-root <path> --installed-themes-root <path> --cms-assets-root <path>` | composes Application-only authoring transport |
| `cms:open --plugins\|--entry-id <id>` | accepts exactly one selector and opens the exact CMS route |
| `site:build --database <path> --media-root <path> --installed-plugins-root <path> --installed-themes-root <path> --artifacts-root <path>` | composes published Projection → Renderer → Delivery; only successful Delivery prints artifact digest/directory and sanitized sorted sidecar |

| Area | Required observable proof |
| --- | --- |
| Content/save | required exact SEO/read model, old optional SEO/identity rejection, expected-current conflict before Plugin callbacks, and SEO never gates Save/Publish |
| Persistence/Theme | migrations `0010`/count ten, canonical-state additions, malformed/stale CAS zero-write, same-ID Theme ambiguity, durable active Theme |
| Plugin/Application | settings-before-activation, fresh snapshots/CAS conflicts, analysis digest/baseline/route binding, one producer or unavailable conflict, sanitized diagnostics |
| HTTP/CMS | five finite API routes and exact `/cms/plugins` document admission; hostile host/origin/metadata/cookie/query/path/OPTIONS reject before credential/body/Application; no secret canary in output/logs |
| Browser | Plugins settings then activation, stale/conflict state and a11y feedback; 400ms latest-only SEO preview; unavailable does not affect Save/Publish |
| Public build | published-only input, prepare/validate once, prepared-token drift failure zero Delivery, SEO-only safe omission, generic owner hard failure |
| Renderer/Delivery | head/escape/JSON-LD/XML/robots order, duplicate SEO conflict, immutable delivery idempotence and no diagnostic/omission leakage |
| CLI/architecture | real package/migrate/activate/serve/open/build flow, deterministic rerun, `apps/cms/index.ts` sole browser entry, public-seam/type-only extension boundaries |
