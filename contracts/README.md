# Basic Spike Contracts v1

- **Contract ID**: `CMS-BASIC-CONTRACTS-V1`
- **核准日期**：2026-08-26
- **核准邊界**：Owner 已要求完成所有已定義 Spike 並以五角色審查收斂。本檔記錄 SP-001–SP-005 與 SP-A06 的已核准範圍與設計約束；決策來源、歷史紀錄與可重跑 evidence 已歸檔至 `logs/2026-08-26-2103-cms-spike-research/`，不自行升格為 contract。

## 從這裡開始

**已實作行為 SSOT**：程式碼與對應測試是目前可觀察行為的唯一事實來源。文件不得把尚未存在的行為寫成已實作；文件與程式衝突時，先以程式與測試判讀現況。

**本檔責任**：本檔是 `CMS-BASIC-CONTRACTS-V1` 已核准範圍與設計約束的唯一 contract，供尚未實作或準備變更的 CMS／renderer 工作使用。已核准行為變更必須在同一變更更新程式、測試與本檔；已核准範圍或約束的變更只改本檔。

**決策背景（2026-08-28）**：將可執行行為與未實作範圍分開，避免跨時間交接時把規劃誤當成現況，同時保留 contract 對未實作工作的一致邊界。

- `MEMORY.md` 只保存長期工程原則與本檔指標，不複製或覆蓋本檔契約。
- `logs/`、`source-drafts/`、`project-*` 歸檔、isolated Spike 與 working documents 只供 provenance 或可重跑 evidence；其中內容不得覆蓋已實作行為或本檔核准範圍。
- `source-drafts/` 中的檔案是 byte-preserved historical input，絕不發布為網站內容；其內部自稱的「source of truth」不具權威，未經新的 Owner 決策不得從中抽取需求。

## 已核准系統範圍與交付階段

- 系統由單一內容管理者使用；本機關聯式 SQL 是 canonical state，媒體保存於本機。公開端只讀 published projection 產生的靜態輸出，不依賴 production API、DB 或 auth。Publish 不執行 Git、build 或 deploy。
- CMS Workspace、Content、Persistence、Application、SiteDefinition、Media、PluginHost、ThemeHost、Projection、Renderer、Delivery 與 CLI 有各自 owner；任何跨 owner 行為只經本檔列出的 public seam。
- **#307 SEO 契約狀態**：下列 SEO／CMS／公開 build 邊界在本次已核准，但尚未實作；已實作行為仍以程式與對應測試為 SSOT。#308 必須完整實作此契約，不得從 discussion、draft 或 handoff artifact 取得補充需求。
- 產品尚未公開發布，SEO 工作採 pre-launch clean cutover：直接修改既有 `/v1` shape 並遷移所有 caller／fixture／test；不得建立 `v2`、舊 shape parser branch、alias、deprecated path 或相容層。首次公開發布後才恢復 breaking-change version bump。
- Authoring 採結構化 block。raw full-page 與 Interactive Demo 分別維持其公開 privilege、sandbox 與 non-empty static fallback 邊界；本契約不增加 marketplace、catalog/history/delete、auto-save、GitHub Pages deploy、off-origin canonical、social image、raw JSON-LD 或自訂 robots 文字。

## 1. Domain lifecycle、Content 與 durable state

`DomainApplication` 擁有 `SaveRevision`、`PublishRevision`、`RestoreRevision`、`ChangeRoute` 與下列 SEO production facade。每個 mutation 在 callback／CAS 前及 transaction 寫入前驗證 baseline；任一 preflight、constraint 或 fault 失敗時，所有 write-set digest 不變，回傳結構化 `{code, owner, subjectIds, remediation}`。

`Revision` 是 immutable `{entryId, revisionId, schemaIdentity{schemaId,version}, contentBytes, contentDigest, restoredFromRevisionId?, lineage{operationId,operationKind}}`；`schema_versions`、`revisions` append-only，`entry_pointers(entryId,currentRevisionId,publishedRevisionId?)` 的 revision ID 皆有 `(entryId,revisionId)` composite FK。Persistence record、`persistence-canonical-state/v2` bytes/digest 的所有排序皆為 locale-independent code-unit order。

`Content` 擁有 revision 內唯一 `StructuredContent`：`{contract:"site-content/v1",title,blocks,seo}`。root 與 `seo` 都是 exact object，`seo` 必須存在且為 `{title?:string,description?:string,canonicalPath?:string}`；present string 必須 non-empty，CMS 空白欄位以 missing key 保存。Content 的 `ContentReadModel`（current/published 共用）只解讀已驗證 canonical revision bytes，做 exact-key canonical copy，不讀 route/theme/asset URL、不寫 canonical state；未知 block、缺欄位、digest／canonicalization 失敗或未核准 raw full-page 一律 fail closed，不回 partial output。

`Content` 唯一批准的 schema evidence 是 `SiteContentSchemaIdentity={schemaId:"site-content",version:1}` 與 JCS schema bytes/digest：`$schema` 為 `https://json-schema.org/draft/2020-12/schema`、`$id` 為 `site-content/v1`；root required/exact `contract,title,blocks,seo`、title `minLength:1`、seo exact 且 optional strings `minLength:1`。blocks item 僅可為 exact article `{text}`、raw-full-page `{html,staticFallback}`，或 interactive-demo `{identity:{id,version},hook,manifestHash,source:{html,css,javascript},staticFallback}`；article/raw fallback/identity strings 為 non-empty、source strings 可空、hook 為 const、manifestHash 符合 `^sha256:[0-9a-f]{64}$`，所有 object `additionalProperties:false`。production Content model 只允許此 schema 的 raw-full-page。

`SaveRevisionRequest` 必須帶 `expectedCurrentRevisionId:string|null`。`null` 只在 current pointer 不存在時成立；string 必須 exact current revision。`RevisionSchemaValidator` 是唯一 Save SEO hard gate，先要求 schema identity、bytes、digest exact 等於上述 Content evidence，再委派同一 `ContentReadModel`；`seo-basics` 不宣告 replacement validator。低 SEO 分數、keyword、readability 與 SEO suggestions 永不阻止 Save 或 Publish。

Persistence 的 extension singleton tables 都是 `STRICT {singleton=1,state_bytes,state_digest}`、有 prevent-delete trigger，port 只搬 opaque canonical bytes。migration 依序為 `0009-add-theme-activation-state.sql` 預置 JCS `{"contract":"theme-activation-state/v1"}` 與 `0010-add-plugin-settings-state.sql` 預置 JCS `{"contract":"plugin-settings-state/v1","records":[]}`，並保存各自 SHA-256；fresh migrate 有十筆 applied migration，current 為 `0010-add-plugin-settings-state`。CAS conflict、malformed bytes、storage fault 均 zero mutation。

`persistence-canonical-state/v2` 原地增加 `pluginActivationStates`、`themeActivationStates`、`pluginSettingsStates` arrays；每列 exact `{singleton,stateDigest}` 並按 JSON code-unit sort；counts 增加同名 number。正常各為 `1`；缺列以 `[]`／`0` 表示，禁止 invent default、保存 bytes 或 decoded records。既有 DB 同 identity 而有不同 `site-content/v1` schema/settings state 必須 fail 並要求新的 pre-release DB，不得暗中 migration、update append-only row 或刪資料。

## 2. Route、media 與公開 URL

`SiteDefinition` 擁有唯一 normalized route-claim registry、`route-normalization/v1`、route graph digest 與 `resolvePublicRouteUrl({publicSiteUrl,normalizedRoute})`；Application 與 Projection 不得另行組 URL。route normalization 保持 NFC、full case fold、再次 NFC 與 slash canonicalization，只接受單一 leading `/`、合併重複 slash、root 外移除 trailing slash，拒絕 backslash、dot segment、raw percent ambiguity、control、bidi control、default-ignorable。

public base 必為 canonical `https:` URL，default port、無 userinfo/query/fragment；pathname 只允許 structural leading/trailing `/`，interior segment non-empty，拒絕 encoded slash/backslash、dot segment、control/bidi。root route 等於 base，non-root 接在 base pathname 後且一律 trailing `/`。present `canonicalPath`／callback path 必須由 `normalizeRoute()` 成功且 bytes 不變；所有參與同一 build 的 SEO settings `publicSiteUrl` 必須 byte-equal。

`DataMedia` 擁有 immutable checksum object、asset version、logical asset、revision reference registry 與 published selection。published resolution 只沿 published pointer → revision refs → available asset version → checksum object；missing、archived、corrupt metadata/object 都在 projection 前 fail closed。CMS 不直接 SQL 或 filesystem。

## 3. PluginHost、SEO settings 與 diagnostics

Plugin source 永不等於 installed/trusted/active root；Host 接收 repository-external、absolute realpath-validated installed root。operator-reviewed installed Plugin 是 arbitrary Node code，不是 sandbox；但 callback 只得到 Host 深度 freeze 的 typed input/facade，不能取得 direct SQL、media path、authoring store、route graph mutation 或 artifact-directory write。

`plugin-hooks/v1` 是明確 additive catalog，未知 hook 拒絕。既有 hooks 外新增 `cms/seo/analyze`↔`cms-seo-analysis`、`public/seo/page`↔`public-seo-page-contribution`、`public/seo/site`↔`public-seo-site-contribution`；每 Plugin 每 hook 最多一個 callback，順序一律 ascending priority 再 Plugin ID。`PluginActivationIdentity` 原地改為 exact `{id,version,hookContract,manifestHash,capabilities}`，`capabilities:PluginCapability[]` required、code-unit sorted 且 exact match manifest，讓 missing/drift 能區分 SEO-only omission 與 selected required generic dependency。

`SeoPluginSettingsV1` 是 exact `{contract:"seo-plugin-settings/v1",publicSiteUrl,indexing:"allow"|"disallow"}`。`plugin-settings-state/v1` 是 exact `{contract:"plugin-settings-state/v1",records:[{identity,settingsContract:"seo-plugin-settings/v1",settings:SeoPluginSettingsV1,settingsDigest}]}`；records 唯一且按 Plugin ID code-unit sort，`settingsContract===settings.contract`。PluginHost 提供 `getSettingsSnapshot()` 與 `replaceSettings({identity,expectedSettingsStateDigest,settingsContract,settings})`；Application 是唯一 management／transport caller，mismatch 不 migration/default，只能 operator exact re-enable。

`PluginHost.analyzeCmsSeo()` 與 `resolvePublicBuildSnapshot()` 是唯一 SEO execution points。Host 驗證 exact object、binding、digest、ordering 與 callback result，拒絕 Promise、extra key、stale opaque token、invalid binding 或 digest；runtime handles／raw diagnostics 不進 canonical bytes。`activate/deactivate` 皆必帶 expected activation state digest，`CreatePluginHostInput` 必注入 settings port。

`PluginDiagnosticDetail.scope` 固定為 `{kind:"entry",entryId}|{kind:"site"}`。新增 stable codes `INVALID_PLUGIN_SETTINGS`、`PLUGIN_SETTINGS_MISMATCH`、`PLUGIN_SETTINGS_STATE_CONFLICT`、`PLUGIN_SETTINGS_STATE_FAILURE`、`SEO_ANALYSIS_CONFLICT`；Renderer 使用 `SEO_CONTRIBUTION_CONFLICT`。diagnostic 必 sanitized；完整 diagnostic 只可供 in-process／CLI sidecar，絕不進 public HTML、artifact manifest 或 public files。

## 4. CMS SEO analysis、Application 與 browser wire

Browser/Application request 是 exact `CmsSeoAnalysisRequest={contract:"cms-seo-analysis-request/v1",entryId,expectedCurrentRevisionId:string|null,schemaIdentity,content:StructuredContent,route,documentDigest}`。server 重算並 constant-compare `documentDigest=SHA-256(JCS({entryId,expectedCurrentRevisionId,schemaIdentity,content,route}))`；查 schema、驗證 Content/route/baseline。null baseline 要 pointer 不存在，string 要 current revision 及 schema exact；unsaved new entry 可分析。stored invalid content 回 sanitized unavailable；invalid settings mutation 為 `422`，新增 Application codes `ENTRY_NOT_FOUND`、`CURRENT_REVISION_MISMATCH`、`INVALID_SEO_ANALYSIS_REQUEST`，且失敗不寫無關 state。

Host 在注入 valid settings 後建立 exact `CmsSeoAnalysisInputV1={contract:"cms-seo-analysis-input/v1",entryId,inputDigest,schemaIdentity,content,route,settings}`，其中 `inputDigest` 是不含 digest 的 JCS SHA-256。Plugin 僅回 exact `{contract:"cms-seo-analysis-output/v1",preview:{title,description?,canonicalPath},suggestions:[{code:"SEO_TITLE_MISSING"|"SEO_DESCRIPTION_MISSING",field:"title"|"description"}]}`。title 缺值 fallback 非空 content title；description 缺值不補值、只 suggestion；canonicalPath 缺值 fallback selected normalized route。

Host `PluginSeoAnalysisResult` 為 available `{status:"available",preview:{title,description?,canonicalPath},suggestions,producers:[{identity,hook,priority,inputDigest,outputDigest,settingsDigest}],settings,settingsDigest}` 或 unavailable `{status:"unavailable",diagnostics}`。只允許零或一個 valid preview producer；第二 valid output 不以 priority override，而是 non-blocking unavailable `SEO_ANALYSIS_CONFLICT`。Application 才以 `SiteDefinition` 解析 absolute URL，回 exact `CmsSeoAnalysisResultV1` available `{contract:"cms-seo-analysis-result/v1",status:"available",documentDigest,preview:{title,description?,canonicalUrl},suggestions,producers}` 或 unavailable `{contract:"cms-seo-analysis-result/v1",status:"unavailable",documentDigest,diagnostics}`；成功 wire 固定 `{contract:"cms-seo-analysis-success/v1",entryId,result}`，不得回 settings。

CMS inactive/missing/drift/settings mismatch/invalid result/callback fault/conflict 都是 sanitized non-blocking unavailable，Save/Publish eligibility 不變。CMS workspace 擁有 React rendering、a11y、form state、feedback 與 400ms trailing-edge analysis；Host/Plugin 不擁有 UI。SEO fields 共用 trim→empty omit，request/Save 使用同 normalized content/route/baseline bytes；response 只在 server documentDigest 等於 current document 時採用，舊 preview 為 stale/`aria-busy`。

Application 也提供 `readCurrentEntry`、`listPlugins`、`activatePlugin`、`replacePluginSettings`。`PluginManagementSnapshotV1` exact `{contract:"plugin-management-snapshot/v1",activationStateDigest,settingsStateDigest,plugins,diagnostics}`，plugins 按 ID、diagnostics 按 code/scope；activation request 為 exact `{contract:"plugin-activation-request/v1",identity,expectedActivationStateDigest}`，settings replace 為 exact `{contract:"plugin-settings-replace-request/v1",identity,expectedSettingsStateDigest,settingsContract:"seo-plugin-settings/v1",settings}`。current GET 回 exact `AuthoringEntryV1`，assets 按 ID/version 排序；transport status 固定 GET miss `404`、CAS conflict `409`、invalid request/digest/settings `422`、已收斂 callback fault `200 unavailable`，僅不能形成 DTO 的 application/transport/storage fault 為 `500`。

## 5. Public snapshot、Theme、Projection、Renderer 與 Delivery

`ResolvePublicBuildSnapshotInput` 是 exact `{contract:"public-plugin-build-request/v1",published:[{entryId,revisionId,schemaIdentity,route,content:StructuredContent}]}`；published 按 route→entryId→revisionId code-unit sort，identity／route 不得重複。Host 逐 Plugin 注入 settings 並建 page input `{contract:"public-seo-page-input/v1",inputDigest,entryId,revisionId,schemaIdentity,route,content,settings}`，site input `{contract:"public-seo-site-input/v1",inputDigest,routes:[{entryId,revisionId,route}],settings}`，routes 同排序。

page output 是 exact `{contract:"public-seo-page-contribution/v1",entryId,revisionId,route,title,description?,canonicalPath,openGraph:{title,description?,urlPath,type:"article"},jsonLd:{type:"WebPage",name,description?,urlPath}}`；site output 是 exact `{contract:"public-seo-site-contribution/v1",sitemap:{include:"all-published"},robots:{indexing:"allow"|"disallow"}}`。page IDs/route 必 exact echo input、`openGraph.urlPath===jsonLd.urlPath===canonicalPath`、site indexing echo settings，否則 invalid。Plugin 不回 raw markup、JSON-LD、XML、robots text 或 artifact path。

evidence 是 `PublicRendererEvidence={identity,entryDigest,callbacks:[{hook,exportName,priority}],resources:[{file,digest}]}`（callbacks priority→hook→exportName，resources file sort）、`PublicSeoEvidence={identity,hook,priority,inputDigest,outputDigest,settingsContract,settingsDigest}` 與 `PublicSeoContributionRecord={evidence,contribution}`。aggregate exact `PublicPluginBuildSnapshotV1={contract:"public-plugin-build-snapshot/v1",activationStateDigest,settingsStateDigest,publicRenderers,publicRendererEvidence,pageContributions,siteContributions,diagnostics,snapshotDigest}`；contributions priority→Plugin ID→entry/route sort，site 保持 array 供 Renderer 偵測 duplicate。

一次 `resolvePublicBuildSnapshot()` 讀 raw activation/settings、驗證/latch evidence，回 `PreparedPublicBuildSnapshot={snapshot,token:opaque}`。Projection 不得另呼叫 hard snapshot/resolver；完成後必 `validatePublicBuildSnapshot(token)` soft reread/compare，再分別重驗 route/media/theme，任一 drift 不 Delivery。SEO-only 且非 selected required generic owner 的 inactive/missing/drift 以 CAS latch 後重讀、post-latch activation digest 封 token、不執行 SEO callback、產零 SEO output，且回 sanitized omission sidecar；stable reactivation-required 維持同 omission。selected required published block/assets owner unresolved 仍 hard fail；settings mismatch、invalid result、semantic conflict、callback fault 都 structured failure、zero Delivery。

digest 固定為 input=`SHA-256(JCS(input without digest))`、output=`SHA-256(JCS(validated output))`、settings=canonical settings bytes SHA-256、omission=`SHA-256(JCS(sorted sanitized code/scope/identityDigest))`、snapshot=`SHA-256(JCS(activation/settings/public-renderer/contribution evidence 與 optional omissionDigest))`。所有 object 拒絕 extra key；set-like array 先依本檔 order canonicalize 再 digest，語意 sequence（例如 content blocks）保留來源順序並在 JCS 中原樣 digest。

Projection 只從 published selection 用 `ContentReadModel` 建 SEO input，回 `PublishedProjectionResult={artifact:RendererInputArtifact,diagnostics}`；artifact.seo 是 `{pageContributions:ResolvedPageSeoContribution[],siteContributions:ResolvedSiteSeoContribution[],evidence:PublicSeoEvidence[],omissionCount,omissionDigest?}`，維持 Host order。它以 SiteDefinition 將 path DTO 轉為 absolute `ResolvedPageSeoContribution`（canonicalUrl、OG url、JSON-LD url）和 `ResolvedSiteSeoContribution`（sitemapUrls、robots indexing/sitemapUrl）；current/draft 不可見。Orchestrator 只把 artifact 傳 Renderer，diagnostic sidecar 只供 CLI。

Theme output clean-cutover 為 exact `theme-render-output/v1 {pages:[{route,language,bodyHtml,stylesheetResources:string[]}]}`；Theme 只序列化 body，structured value HTML-text escape，保留 raw-full-page/Interactive Demo privilege/sandbox，沒有 head/path/site files。Theme packaging／activation 與 Plugin packaging 都採 source→external installed root 的 atomic/idempotent evidence；existing byte-identical destination zero-write，mismatch fail 並保留 destination，不能 raw-copy TypeScript 或留 staging。

Renderer 驗每 route 恰一 Theme page，從 verified Theme resource 取 CSS，copy 至 `assets/theme/<digest>.css`，以 depth-relative escaped link 引用。head 順序固定 charset→viewport→stylesheet→title→description?→canonical→`og:title`→`og:description`?→`og:url`→`og:type`→ordered JSON-LD。SEO RCDATA/attribute escape `&<>"'`；JSON-LD 先 JCS，再 escape `\u003c`、`\u003e`、`\u0026`、`\u2028`、`\u2029`。title、canonical、ASCII-lowercased meta key、site contribution、publicSiteUrl 或 artifact path 重複／矛盾回 `SEO_CONTRIBUTION_CONFLICT`，不得 override。

`sitemap.xml` 固定 UTF-8 declaration/urlset、route code-unit order、XML-escaped absolute `<loc>`、final newline、無 lastmod；`robots.txt` 固定 User-agent、Allow/Disallow、absolute Sitemap、final newline，typed values拒絕 CR/LF/NUL。`RendererOutput`、`ArtifactManifest` 只含 SEO evidence digest/count，不含 diagnostic DTO。`PublicDelivery.deliver()` 若 digest directory 已存在，完整驗 manifest、listed bytes 與無 extra files；相同即 existing success/zero write，corrupt/mismatch 為 `ARTIFACT_IMMUTABILITY_CONFLICT`。

## 6. Repository architecture、production entrypoints 與 observable matrix

semantic roots 是 `core/`、`apps/`、`extensions/`；每個 owner 與 `apps/<app>/`、`extensions/plugins/<id>/`、`extensions/themes/<id>/` 恰有一個 root `index.ts` public entry。cross-owner import 只到 root entry；core/extensions 不 import apps。Foundation 只依自身/Node/JCS；Content/Persistence/SiteDefinition/Media/PluginHost/ThemeHost 只依自身/Foundation；Application compose owner entries；Projection 可讀各 owner；Renderer 讀 Projection；Delivery 讀 Projection/Renderer；apps compose core。

architecture checker scan whole repository `**/*.{ts,tsx}`、`**/*.sql`，排除 generated/read-only handoff roots；`.tsx` 與 `.ts` 同受 semantic-root、import、naming、parser/module-resolution 規則與 failing fixture 覆蓋。`apps/cms/index.ts` 是唯一 CMS public entry；CMS 使用 exact pinned React 19.2.8/React DOM 19.2.8、Vite 8.2.2 與相關 type/plugin pins，`cms:build` 產 manifest/content-hashed `/cms/assets/`，`cms:serve` 只 serve allowlist。

production CLI 只在真實 entrypoint 與 contract test 存在時加入：`plugin:package --id seo-basics --installed-plugins-root <path>`、`theme:package --id study-notes --installed-themes-root <path>`、`db:migrate --database <path>`、`theme:activate --database <path> --installed-themes-root <path> --id study-notes`、`cms:serve --database <path> --media-root <path> --installed-plugins-root <path> --installed-themes-root <path> --cms-assets-root <path>`、`cms:open --plugins|--entry-id <id>`、`site:build --database <path> --media-root <path> --installed-plugins-root <path> --installed-themes-root <path> --artifacts-root <path>`。`site:build` 僅在 Projection→Renderer 完整成功後 Delivery，stdout 於成功後列 artifact digest/directory 與 sanitized sidecar；Publish 不 build/deploy。

可觀察驗收必覆蓋 Content SEO exact shape、migration 0010/count 10/canonical extension arrays、CAS/fault、new-entry nullable baseline、CMS DTO/digest/path binding、400ms stale response/second-tab conflict、Host ordering/settings/opaque prepare-final validate/soft omission、callback fault 200 unavailable、public failure zero Delivery、duplicate contribution、Theme escaping/CSS、Renderer head/JSON-LD/XML/robots/newlines、Delivery idempotence、TSX architecture、package/CLI composition。真實 flow 必驗證 browser 無 fragment/storage/log/DOM secret，published build byte-identical，未 publish current 不影響 build，SEO package missing/drift 只留 CLI omission diagnostic 並產 body-only artifact。

## 7. External Authoring API v1（已核准；runtime 部分實作）

`apps/authoring-api` 是唯一 localhost transport composition root；adapter 只能經 `core/application/index.ts`，公開訪客只讀 immutable static artifact。listener 固定 `127.0.0.1:43127`／`http://127.0.0.1:43127`，拒絕 localhost、IPv6、alternative IP、forwarded headers、CORS、redirect。所有 response 有 no-store/no-cache/nosniff/no-referrer，logger 只記 requestId/stable event/method/template/status，diagnostic 先移 secret 再 redact `asn_v1_`／`asn_bt_v1_`。

唯一 secret-body carve-out：CLI 經同一 keep-alive TCP socket proof 後 mint `browser-ticket/v1`；page 先同步清 fragment，再以 exact `browser-session-exchange/v1 {ticket}` 兌換 memory-only `browser-session/v1 {generation,apiKey}`。dedicated no-store writer 不走通用 redaction；ticket 60 秒、單次、generation-bound。ticket/key 僅在 lexical/module closure，pagehide 清 key，reload/401 鎖定。

在任何 secret/auth/body parse 前，所有 `/_local`／`/v1` route 拒絕 Cookie/query。`POST /_local/server-proof` 只允許 absent Origin/no Bearer；`POST /_local/browser-tickets` 只允許 absent Origin+Bearer 且 same proof-bound socket；`POST /_local/browser-session` 只允許 exact Origin/`Sec-Fetch-Site:same-origin`/no Bearer。Save/Publish POST 保留 browser exact Origin+same-origin+Bearer 與 CLI absent Origin+no Fetch Metadata+Bearer profiles；`GET /v1/plugins`、`POST /v1/plugins/activate`、`POST /v1/plugins/settings`、`GET /v1/entries/:entryId/current`、`POST /v1/entries/:entryId/seo-analysis` 是 finite routes，path/body entry／identity ID 必 exact；前兩 Plugin mutation 與 SEO analysis POST 只允許 browser profile。Plugin/entry GET 只允許 exact Host+Bearer+`Sec-Fetch-Site:same-origin`、無 cookie/query/body，Origin 可缺席但 present 必 exact。browser fetch 固定 `credentials:"omit"`、`cache:"no-store"`、`redirect:"error"`、`referrerPolicy:"no-referrer"`；CMS shell/assets 永不 set cookie。未列 route、OPTIONS、wrong Host/Origin/forwarded、malformed/duplicate/old/revoked credential 都不得 command/canonical mutation，且 response/log/diagnostic 不得洩漏 canary。
