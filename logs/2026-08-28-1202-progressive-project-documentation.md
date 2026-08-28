# 漸進式專案文件導入完成紀錄

- **Cycle ID**：`cycle-2026-08-28-1157-progressive-project-documentation`
- **完成時間**：2026-08-28T13:15:43+08:00
- **狀態**：completed

## 交付

- 新增 [docs/INDEX.md](../docs/INDEX.md)，以九項任務與九個 domain 路由連結權威文件、真實 public source 與現有測試；並集中維護決策背景、ASCII 圖與資料夾 `README.md` 原則。
- 更新 [contracts/README.md](../contracts/README.md)、[CMS 工作包 router](../specs/cms-basic-contracts-v1/README.md) 與五份核心規格：程式碼與對應測試是已實作行為的 SSOT，contract 只定義已核准範圍與設計約束。
- 在 [.rulesync/rules/CLAUDE.md](../.rulesync/rules/CLAUDE.md) 新增「專案文件」指令，並由 Rulesync 生成根目錄 [AGENTS.md](../AGENTS.md) 與 [CLAUDE.md](../CLAUDE.md)。
- 未新增 `docs/domains/`，未為尚未實作 domain 建立 how-to/reference。

## 關鍵決策

- 程式碼與對應測試是目前可觀察行為的 SSOT；`contracts/README.md` 保留已核准範圍與設計約束，避免跨時間交接把規劃誤當現況。
- ASCII 圖只在流程難以直接從程式碼理解時，依 module、同步資料流或事件／狀態形態選擇對應表示；細節以連結取代圖中複製，過期圖必須移除或同步更新。

## 實際驗證

- `npm run sync:ai`：exit 0。
- `npm run check:ai-sync`：exit 0。
- AI 文件 section count command：exit 0；三個目標檔各為一次。
- 本地 Markdown link command：exit 0；verified 69 local links。
- 範本殘留 command：exit 0。
- 現行文件權威用語檢查：exit 0；沒有過時的「唯一現行 SSOT」宣告。
- 三個導航走讀：Persistence migration 到達 `CMS-DB-01`、Persistence public entry、SQL migrations 和三個 Persistence tests；Site Definition 到達 `CMS-CORE-03` 並明示尚無 code/test；AI 指令先到 Rulesync canonical source。
- `npm run check`：exit 0；typecheck、architecture checker 與 Node test suite 全數通過（51 passed、0 failed）。

## 已知限制／後續

無。

## 相關 Branch／PR

- Branch：`docs/progressive-project-documentation`
- PR：[\#249](https://github.com/wahengchang/ai-study-note/pull/249)
