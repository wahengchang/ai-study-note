# AI Study Note Reset 文件導覽

這是從任務或 domain 前往權威文件、現行程式入口與測試的最短路徑。程式碼與對應測試是已實作行為的 SSOT；文件只說明已核准範圍、決策背景與導航。

## 先從任務開始

| 我要進行 | 先讀 | 程式入口 | 測試或驗證 |
| --- | --- | --- | --- |
| 理解系統與核准範圍 | [implementation contract](../contracts/README.md)、[長期原則](../MEMORY.md) | [core/](../core/)、[apps/](../apps/)、[extensions/](../extensions/) | [architecture checker](../scripts/check-architecture.ts)、[checker test](../tests/core/foundation/check-architecture.test.ts)、`npm run check:architecture` |
| 修改 repository 結構、owner 依賴或 public entrypoint | [implementation contract 的 repository architecture](../contracts/README.md) | [architecture checker](../scripts/check-architecture.ts) | [checker test](../tests/core/foundation/check-architecture.test.ts)、`npm run check:architecture` |
| 修改 Foundation 的 result、canonical JSON、digest 或 byte-copy 行為 | [implementation contract](../contracts/README.md) | [Foundation public entry](../core/foundation/index.ts) | [canonical JSON](../tests/core/foundation/canonical-json.test.ts)、[digest](../tests/core/foundation/digest.test.ts)、[result](../tests/core/foundation/result.test.ts) |
| 修改 Persistence、schema/revision 或 SQL migration | [CMS-DB-01 Persistence 規格](../specs/cms-basic-contracts-v1/01-persistence-and-schema-migrations.md)；它定義核准範圍，不得覆蓋現行程式／測試行為 | [Persistence public entry](../core/persistence/index.ts)、[Persistence contracts](../core/persistence/contracts.ts)、[SQL migrations](../db/migrations/) | [migration runner](../tests/core/persistence/migration-runner.test.ts)、[revision store](../tests/core/persistence/revision-store.test.ts)、[schema migration impact](../tests/core/persistence/schema-migration-impact.test.ts)、[atomicity and failures](../tests/core/persistence/atomicity-and-failures.test.ts)、[locale-independent ordering](../tests/core/persistence/locale-independent-ordering.test.ts) |
| 執行或修改資料庫 migration CLI | [CMS-DB-01 Persistence 規格](../specs/cms-basic-contracts-v1/01-persistence-and-schema-migrations.md) | [db-migrate CLI](../apps/cli/db-migrate.ts)、[db:migrate script](../package.json) | [CLI test](../tests/apps/cli/db-migrate.test.ts)、`npm run db:migrate -- --database /tmp/ai-study-note-reset-cms.sqlite` |
| 修改 Plugin discovery／activation | [CMS-CORE-05 Plugin Host 規格](../specs/cms-basic-contracts-v1/05-plugin-host-core.md) | [Plugin Host public entry](../core/plugin-host/index.ts)、[Plugin Host contracts](../core/plugin-host/contracts.ts) | [Plugin Host test](../tests/core/plugin-host/plugin-host.test.ts)、[locale determinism](../tests/core/plugin-host/locale-determinism.test.ts)；[activation-probe](../extensions/plugins/activation-probe/) 是測試 fixture，不是正式範本 |
| 開始尚未實作的 CMS domain | [implementation contract](../contracts/README.md)、[CMS 工作包 router](../specs/cms-basic-contracts-v1/README.md) 中對應工作包 | 依規格的 primary seam 建立真實垂直切片；禁止建立 stub、`.gitkeep` 或假成功入口 | 依同一 primary seam 建立可觀察的契約測試 |
| 延續大型工作 | [Dev Hub workflow](dev-hub-workflow.md)，再只讀 [active Cycle](../.dev-hub/active/) 中對應記錄 | 由對應 Cycle 已記錄範圍決定 | 依 Cycle 的 `hub.md` 與連結狀態確認 |
| 修改 AI 指令、技能或同步輸出 | [Rulesync canonical source](../.rulesync/rules/CLAUDE.md)、[技能 canonical source](../.rulesync/skills/)、[Rulesync 設定](../rulesync.jsonc) | 根目錄 [AGENTS.md](../AGENTS.md)、[CLAUDE.md](../CLAUDE.md) 與 `.agents/skills/`、`.claude/skills/`、`.opencode/skills/` 都是 generated outputs，不得直接編輯 | `npm run sync:ai`、`npm run check:ai-sync` |

## 先從 Domain 開始

| Domain | 責任與現況 | 先讀 | 現行程式與測試入口 |
| --- | --- | --- | --- |
| Foundation | 共用 result、canonical JSON、digest 與 byte-copy runtime。 | [implementation contract](../contracts/README.md) | [public entry](../core/foundation/index.ts)；[canonical JSON test](../tests/core/foundation/canonical-json.test.ts)、[digest test](../tests/core/foundation/digest.test.ts)、[result test](../tests/core/foundation/result.test.ts) |
| Persistence | migration ledger、schema version、revision、operation lineage，以及 schema migration 的 preflight／原子 execution durable lineage；production `db:migrate` 會 reconcile exact `site-content@1` evidence，`runReadSnapshot()` 提供 capability-safe 同 generation 唯讀讀取。 | [CMS-DB-01](../specs/cms-basic-contracts-v1/01-persistence-and-schema-migrations.md) | [public entry](../core/persistence/index.ts)；[migration runner](../tests/core/persistence/migration-runner.test.ts)、[read snapshot](../tests/core/persistence/read-snapshot.test.ts)。 |
| Plugin Host | durable exact-identity activation／deactivation／drift latch、canonical HTTPS Plugin settings、CMS SEO／editor-block resolution、SaveRevision validator 與 sealed public renderer snapshot 已實作；CMS SEO callback path 必須為 normalized fixed point，public SEO site contribution 保留 `indexing` evidence。 | [CMS-CORE-05](../specs/cms-basic-contracts-v1/05-plugin-host-core.md) | [public entry](../core/plugin-host/index.ts)；[Plugin Host test](../tests/core/plugin-host/plugin-host.test.ts)、[public snapshot](../tests/core/plugin-host/public-build-snapshot.test.ts)、[CMS SEO analysis](../tests/core/plugin-host/seo-analysis.test.ts)。 |
| Content + Application | `SaveRevision` 在 canonical write 前以 real PluginHost snapshot 執行 validator，並從 required `taxonomyTerms` materialize immutable taxonomy evidence；`analyzeCmsSeo` 在 callback 前驗 entry/current revision/schema/content/current route，並只經 SiteDefinition 建立 absolute canonical URL。Publish／Restore／ChangeRoute 保有各自既有的 atomic state boundary。 | [CMS-CORE-02](../specs/cms-basic-contracts-v1/02-content-application-core.md) | [public entry](../core/application/index.ts)；[SEO admission](../tests/core/application/seo-analysis.test.ts)、[SaveRevision](../tests/core/application/save-revision.test.ts)、[PublishRevision](../tests/core/application/publish-revision.test.ts)。 |
| Taxonomy | flat catalog、immutable term/term-ID ledger、revision taxonomy evidence materialization、lifecycle usage impact 與 append-only revision migration 已實作；migration 搬動 current／published pointer 時會在同一 transaction 內把對應 graph 的 route claim 一併改指 replacement Revision。Projection 只信任 published Revision 的 immutable bindings。 | [implementation contract 的 Taxonomy](../contracts/README.md#8-291-contract--taxonomy)；[accepted limitations ADR](adr/2026-09-10-taxonomy-accepted-limitations.md) | [public entry](../core/taxonomy/index.ts)；[administration](../tests/core/taxonomy/administration.test.ts)、[revision store](../tests/core/persistence/revision-store.test.ts)、[projection strict parse](../tests/core/projection/strict-parse.test.ts)。 |
| Site Definition | current/published route normalization、claim proposal、configured-store active transaction-bound token，以及 route/source replacement 的完整 retained impact 已實作；`resolvePublicRouteUrl()` 是 canonical HTTPS public URL 的唯一 builder。 | [CMS-CORE-03](../specs/cms-basic-contracts-v1/03-route-graph-application-core.md) | [public entry](../core/site-definition/index.ts)；[public route URL](../tests/core/site-definition/public-route-url.test.ts)、[route replacement](../tests/core/site-definition/route-claim-replacement.test.ts) |
| DataMedia | local import 建立 ready asset version；safe catalog/detail projection 在 Media/Persistence snapshot drift 時 fail closed，`readReadyObject()` 仍在同一 descriptor 驗證並回傳 fresh exact bytes，其他 published selection／archive／restore 行為維持。 | [CMS-CORE-04](../specs/cms-basic-contracts-v1/04-media-lifecycle-application-core.md) | [public entry](../core/media/index.ts)；[local import/catalog](../tests/core/media/local-import.test.ts)、[verified object read](../tests/core/media/verified-object-read.test.ts)、[archive and restore](../tests/core/media/archive-restore-asset.test.ts) |
| External Authoring API | local credential lifecycle、fixed-origin server proof、one-time browser ticket／memory-only session bootstrap，以及 finite Content Type、Plugin、Taxonomy、current entry／SEO analysis 與 Media catalog/import/detail/version replacement/archive/restore API routes 已實作；CMS Media workspace 提供 catalog、檔案匯入、asset detail、explicit current-reference replacement、confirmation-protected archive/restore 與 local recovery bytes/metadata restore。 | [implementation contract](../contracts/README.md) | [public entry](../apps/authoring-api/index.ts)；[HTTP contract](../tests/apps/authoring-api/http-contract.test.ts)、[CMS browser bootstrap](../tests/apps/authoring-api/cms-browser-bootstrap.test.ts)、[CMS runtime browser gate](../tests/apps/cms/runtime-browser-gate.test.ts)。 |
| Theme Host | repository-external Theme identity、manifest/evidence 與 self-contained runtime import graph validation、durable activation CAS 與 active Theme resolution 已實作；Renderer 只執行 Projection 封存後的 verified bytes。 | [implementation contract](../contracts/README.md) | [public entry](../core/theme-host/index.ts)；[Theme Host contract test](../tests/core/theme-host/theme-host.test.ts)。 |
| Projection + Preview | published-only `renderer-input/v1` artifact、single-subject current/published Preview、canonical parser 與 sandboxed preview document 已實作；Projection 準備並驗證一次 Plugin public snapshot，materialize exact Theme／Plugin／SEO evidence，不讓 current/draft 進入 public build。 | [implementation contract](../contracts/README.md) | [public entry](../core/projection/index.ts)；[published isolation](../tests/core/projection/preview-isolation.test.ts)；[strict parse 與 capture 診斷](../tests/core/projection/strict-parse.test.ts)。 |
| Renderer + Delivery + Public UI／Release | static Renderer 僅接受 strict parsed artifact；它輸出 escaped SEO head、`sitemap.xml` 與依 sealed `indexing` evidence 的 `robots.txt`，Delivery 產生並重新驗證 immutable artifact；Public UI 只服務 verified snapshot；release 仍是 deferred boundary。 | [implementation contract](../contracts/README.md) | [Renderer](../core/renderer/index.ts)、[Delivery](../core/delivery/index.ts)、[Public UI](../apps/public-ui/index.ts)；[Renderer](../tests/core/renderer/renderer.test.ts)、[Delivery](../tests/core/delivery/delivery.test.ts)、[Public UI](../tests/apps/public-ui/server.test.ts)。 |

## 文件權威

- 程式碼與對應測試是已實作行為的 SSOT；文件不得把規劃誤寫成現況。
- [contracts/README.md](../contracts/README.md) 是已核准範圍與設計約束的唯一 contract，供尚未實作或準備變更的工作使用。
- [specs/cms-basic-contracts-v1/](../specs/cms-basic-contracts-v1/) 只拆分已核准工作，不得擴張範圍。
- [MEMORY.md](../MEMORY.md) 只保存長期原則與文件指標。
- [.dev-hub/active/](../.dev-hub/active/) 是進行中狀態；[logs/](../logs/) 是完成 provenance；兩者都不是行為或 architecture contract。

## 目前工作

恢復大型工作時，先讀 [Dev Hub workflow](dev-hub-workflow.md)，再直接選取 [active Cycle](../.dev-hub/active/) 中的對應記錄，讀取其 `hub.md`／連結狀態；歷史 handoff 目錄維持唯讀。

## 閱讀規則

1. 只選當前任務列。
2. 跟隨該列的文件路徑。
3. 閱讀列出的 public source 與測試。
4. 只有任務需要才擴大。

## 文件與圖表原則

- 核心文件在需要跨時間或跨 AI 交接時，於開頭加入簡短的「決策背景」：當時的設定、選擇與原因；不為沒有交接價值的文件增添固定模板。
- ASCII 圖是給人快速理解架構與流程使用，不是裝飾或程式碼替身。只有流程不容易直接從程式碼看懂時才畫。
- 依形態選圖：module／owner 封裝用元件與依賴箭頭；同步 command 或資料流用由輸入到結果的線性流程；事件流或 stateful lifecycle 用狀態轉移與事件箭頭。圖只保留核心流程。
- 圖放在相關 module、class 或主要函式附近的註解或文件；詳細原因連回 architecture 文件。程式碼改變時同步更新圖；過期的圖比沒有圖更糟。
- 只有在資料夾內有多個責任、公開入口或跨 AI 交接資訊而無法從一次導覽理解時，才建立 `README.md`。內容只做責任、入口與權威連結的 router，不複製程式或 contract。

## 維護規則

- 每項事實只保留一個 canonical source，以連結取代複製。
- 所有維護中文件必須在兩個連結內可達。
- 行為、邊界、資料流、公開介面或維運程序變更時，在同一變更更新受影響的文件與鄰近 ASCII flow 註解。
- 刪除 stale route。
- 目前不新增 `docs/domains/`：現有文件量小，[docs/INDEX.md](INDEX.md) 加既有 [CMS 工作包 router](../specs/cms-basic-contracts-v1/README.md) 已足夠。
