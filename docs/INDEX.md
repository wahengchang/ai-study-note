# AI Study Note Reset 文件導覽

這是從任務或 domain 前往權威文件、現行程式入口與測試的最短路徑。程式碼與對應測試是已實作行為的 SSOT；文件只說明已核准範圍、決策背景與導航。

## 先從任務開始

| 我要進行 | 先讀 | 程式入口 | 測試或驗證 |
| --- | --- | --- | --- |
| 理解系統與核准範圍 | [implementation contract](../contracts/README.md)、[長期原則](../MEMORY.md) | [core/](../core/)、[apps/](../apps/)、[extensions/](../extensions/) | [architecture checker](../scripts/check-architecture.ts)、[checker test](../tests/core/foundation/check-architecture.test.ts)、`npm run check:architecture` |
| 修改 repository 結構、owner 依賴或 public entrypoint | [implementation contract 的 repository architecture](../contracts/README.md) | [architecture checker](../scripts/check-architecture.ts) | [checker test](../tests/core/foundation/check-architecture.test.ts)、`npm run check:architecture` |
| 修改 Foundation 的 result、canonical JSON、digest 或 byte-copy 行為 | [implementation contract](../contracts/README.md) | [Foundation public entry](../core/foundation/index.ts) | [canonical JSON](../tests/core/foundation/canonical-json.test.ts)、[digest](../tests/core/foundation/digest.test.ts)、[result](../tests/core/foundation/result.test.ts) |
| 修改 Persistence、schema/revision 或 SQL migration | [CMS-DB-01 Persistence 規格](../specs/cms-basic-contracts-v1/01-persistence-and-schema-migrations.md)；它定義核准範圍，不得覆蓋現行程式／測試行為 | [Persistence public entry](../core/persistence/index.ts)、[Persistence contracts](../core/persistence/contracts.ts)、[SQL migrations](../db/migrations/) | [migration runner](../tests/core/persistence/migration-runner.test.ts)、[revision store](../tests/core/persistence/revision-store.test.ts)、[schema migration impact](../tests/core/persistence/schema-migration-impact.test.ts)、[atomicity and failures](../tests/core/persistence/atomicity-and-failures.test.ts) |
| 執行或修改資料庫 migration CLI | [CMS-DB-01 Persistence 規格](../specs/cms-basic-contracts-v1/01-persistence-and-schema-migrations.md) | [db-migrate CLI](../apps/cli/db-migrate.ts)、[db:migrate script](../package.json) | [CLI test](../tests/apps/cli/db-migrate.test.ts)、`npm run db:migrate -- --database /tmp/ai-study-note-reset-cms.sqlite` |
| 修改 Plugin discovery／activation | [CMS-CORE-05 Plugin Host 規格](../specs/cms-basic-contracts-v1/05-plugin-host-core.md) | [Plugin Host public entry](../core/plugin-host/index.ts)、[Plugin Host contracts](../core/plugin-host/contracts.ts) | [Plugin Host test](../tests/core/plugin-host/plugin-host.test.ts)、[locale determinism](../tests/core/plugin-host/locale-determinism.test.ts)；[activation-probe](../extensions/plugins/activation-probe/) 是測試 fixture，不是正式範本 |
| 開始尚未實作的 CMS domain | [implementation contract](../contracts/README.md)、[CMS 工作包 router](../specs/cms-basic-contracts-v1/README.md) 中對應工作包 | 依規格的 primary seam 建立真實垂直切片；禁止建立 stub、`.gitkeep` 或假成功入口 | 依同一 primary seam 建立可觀察的契約測試 |
| 延續大型工作 | [Dev Hub workflow](dev-hub-workflow.md)、[本地 planned／active Dev Hub overview](../.dev-hub/overview/index.html)，再只讀 [active Cycle](../.dev-hub/active/) 中對應記錄 | 由 overview 對應的 Cycle 已記錄範圍決定 | overview 涵蓋已登錄 Dev Hub 的 planned、active、done Work Items，不代表 GitHub Issues 自動同步 |
| 修改 AI 指令或同步輸出 | [Rulesync canonical source](../.rulesync/rules/CLAUDE.md)、[Rulesync 設定](../rulesync.jsonc) | 根目錄 [AGENTS.md](../AGENTS.md) 與 [CLAUDE.md](../CLAUDE.md) 是 generated outputs | `npm run sync:ai`、`npm run check:ai-sync` |

## 先從 Domain 開始

| Domain | 責任與現況 | 先讀 | 現行程式與測試入口 |
| --- | --- | --- | --- |
| Foundation | 共用 result、canonical JSON、digest 與 byte-copy runtime。 | [implementation contract](../contracts/README.md) | [public entry](../core/foundation/index.ts)；[canonical JSON test](../tests/core/foundation/canonical-json.test.ts)、[digest test](../tests/core/foundation/digest.test.ts)、[result test](../tests/core/foundation/result.test.ts) |
| Persistence | migration ledger、schema version、revision、operation lineage，以及唯讀、去敏、issuer-bound 的 schema migration impact preflight。 | [CMS-DB-01](../specs/cms-basic-contracts-v1/01-persistence-and-schema-migrations.md) | [public entry](../core/persistence/index.ts)；[migration runner](../tests/core/persistence/migration-runner.test.ts)、[revision store](../tests/core/persistence/revision-store.test.ts)、[schema migration impact](../tests/core/persistence/schema-migration-impact.test.ts)、[atomicity and failures](../tests/core/persistence/atomicity-and-failures.test.ts) |
| Plugin Host | durable exact-identity activation／deactivation／drift latch、CMS editor-block resolution，以及 SaveRevision validator preparation／execution seam 已實作。 | [CMS-CORE-05](../specs/cms-basic-contracts-v1/05-plugin-host-core.md) | [public entry](../core/plugin-host/index.ts)；[Plugin Host test](../tests/core/plugin-host/plugin-host.test.ts)、[locale determinism](../tests/core/plugin-host/locale-determinism.test.ts) |
| Content + Application | `SaveRevision` application command 在 canonical write 前以 real PluginHost snapshot 執行 validator，成功回傳分離 lifecycle／activation digests，並只更新 current revision／pointer／claim。 | [CMS-CORE-02](../specs/cms-basic-contracts-v1/02-content-lifecycle-application-core.md) | [public entry](../core/application/index.ts)；[SaveRevision](../tests/core/application/save-revision.test.ts)、[SaveRevision failures](../tests/core/application/save-revision-failures.test.ts)、[Plugin composition](../tests/core/application/save-revision-plugin-composition.test.ts) |
| Site Definition | current/published route normalization、claim proposal 與 transaction-bound token 已實作；同 normalized route 跨圖可並存，mutation、collision 與 digest 維持雙圖隔離。 | [CMS-CORE-03](../specs/cms-basic-contracts-v1/03-route-graph-application-core.md) | [public entry](../core/site-definition/index.ts)；[current route claim](../tests/core/site-definition/current-route-claim.test.ts)、[published route claim](../tests/core/site-definition/published-route-claim.test.ts) |
| DataMedia | local import 建立 ready asset version，且只解析已驗證的 final bytes 已實作。 | [CMS-CORE-04](../specs/cms-basic-contracts-v1/04-media-lifecycle-application-core.md) | [public entry](../core/media/index.ts)；[local import](../tests/core/media/local-import.test.ts) |
| Theme Host | Theme 的 host boundary 與 repository source boundary 已核准，尚無程式與測試入口。 | [implementation contract](../contracts/README.md) | 尚無程式與測試入口。 |
| Projection + Preview | `renderer-input/v1` producer 與 read-only preview 已核准，尚無程式與測試入口。 | [implementation contract](../contracts/README.md) | 尚無程式與測試入口。 |
| Renderer + Delivery + Public UI／Release | static rendering、immutable artifact delivery、公開 UI 與 release boundary 已核准，尚無程式與測試入口。 | [implementation contract](../contracts/README.md) | 尚無程式與測試入口。 |

## 文件權威

- 程式碼與對應測試是已實作行為的 SSOT；文件不得把規劃誤寫成現況。
- [contracts/README.md](../contracts/README.md) 是已核准範圍與設計約束的唯一 contract，供尚未實作或準備變更的工作使用。
- [specs/cms-basic-contracts-v1/](../specs/cms-basic-contracts-v1/) 只拆分已核准工作，不得擴張範圍。
- [MEMORY.md](../MEMORY.md) 只保存長期原則與文件指標。
- [.dev-hub/active/](../.dev-hub/active/) 是進行中狀態；[logs/](../logs/) 是完成 provenance；兩者都不是行為或 architecture contract。

## 目前工作

恢復大型工作時，先開 [本地 active work overview](../.dev-hub/overview/index.html) 確認 planned／active Work Item，再讀 [Dev Hub workflow](dev-hub-workflow.md) 與對應 Cycle 的 `hub.md`／連結狀態。overview 是 repository-local projection，不代表全部 GitHub Issues；歷史 handoff 目錄維持唯讀。

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
