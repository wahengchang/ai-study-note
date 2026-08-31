# SiteDefinition route claim replacement

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **完成時間**：2026-08-31T12:20:48+08:00
- **狀態**：completed（本 Work Group；Cycle 仍有其他 Work Item）

## 交付

完成 GitHub #231／WI-017：`SiteDefinition` 新增 `route-claim-replacement-proposal/v1`、route/source revision 原子替換與完整 retained impact；同時為所有 SiteDefinition proposal 加入 configured persistence store 的 active transaction authority。

## 關鍵決策

- replacement impact 固定列出 after-state 兩圖全部 active claims，按 current/published、canonical `to`、owner 的 code-unit 順序；target 以 `route-move` 或 `attribution-only` 標示，其餘為 `retained`。
- validate 與 apply 都驗證 store-private active transaction；apply 在寫入前重讀 baseline、寫入後重驗兩圖 digest 和 impact，避免 cross-store 與 TOCTOU 寫入。

## 實際驗證

- `node --import tsx --test tests/core/site-definition/route-claim-replacement.test.ts`：4 pass。
- `node --import tsx --test "tests/core/site-definition/*.test.ts"`：12 pass。
- `npm run check`：TypeScript、architecture checker 與全套測試共 101 pass。

## Review 後補強

同一 PR 的 review 追加下列修正：

- **Persistence 排序 locale 依賴（correctness）**：`core/persistence/store.ts` 的 `listRouteClaims`、`getRevisionReferences` 與 `canonicalState` 都以 `localeCompare(…, "en", { sensitivity: "variant" })` 排序。ICU collation 會把 `/école` 排在 `/facile` 之前、`note_a` 排在 `note-a` 之前，與 contract 要求的 code-unit 順序相反，因此 `persistence-canonical-state/v2` 的 canonical bytes 與 digest 會隨 host ICU 版本改變——而該 digest 正是 `SaveRevision` 對外回傳的 `stateDigest`。三處改用 code-unit 比較，並在 `contracts/README.md` 補上此規則。
- **Spec 回歸**：`03-route-graph-application-core.md` 原本的「Each impact record includes graph, owner, from route, to route, and source revision ID. A collision or invalid route returns the shared structured error contract and no mutation result.」在改寫時被整句移除；程式與 #231 acceptance 仍要求該規則，已還原。
- **#231 acceptance 覆蓋缺口**：補上 accepted 路徑的 `baselineDigests`／`resultingDigests` 可由 public snapshot 重算、rejected 路徑的**目標圖** digest／bytes 不變（原測試只驗非目標圖）、fault 路徑（caller abort 與 apply 前 baseline 被移動）兩圖回滾至 pre-command digest，以及 token 單次使用限制。

## 已知限制／後續

- `applyClaim` 將 `used = true` 從 binding 檢查之前移到之後，等於把既有 create proposal 的 token 由「任何 apply 嘗試都燒毀」放寬為「只有被接受的 apply 才燒毀」。在 transaction binding 與兩圖 digest 重驗下仍 fail closed，但這是 pre-existing 路徑的行為變更，已由新測試釘住單次使用語意。
- #238 的 Application command orchestration 不在本 Work Group 範圍。

## 相關 Branch／PR

- Branch：`cms/site-definition-route-replacement`
- PR：https://github.com/wahengchang/ai-study-note/pull/273
