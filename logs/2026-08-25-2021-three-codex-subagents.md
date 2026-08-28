# Three Codex subagents

- 日期：2026-08-25 20:21（本機時間）

## 交付

- 以 SQL CMS 架構層次重設為三個 custom subagent：`architecture_planner`、`cms_engineer`、`database_engineer`。
- Rulesync source 位於 `.rulesync/subagents/`；產生的 Codex 官方 TOML 位於 `.codex/agents/`。
- `.codex/config.toml` 將每個 session 的並行上限調整為 3。

## 關鍵決策

- `architecture_planner` 擁有跨層規劃與 API design，不實作。
- `cms_engineer` 僅消費核定的 API/domain contract，不複製 domain rule。
- `database_engineer` 擁有 SQLite/Drizzle/migration 與資料庫不變量，不設計 HTTP/UI。
- 移除先前唯一的 `cms_contract_reviewer`，不保留額外角色。

## 實際驗證

- `npm run sync:ai` 產生三份 `.codex/agents/*.toml`。
- `npm run check:ai-sync` 通過：`✓ All files are up to date.`
