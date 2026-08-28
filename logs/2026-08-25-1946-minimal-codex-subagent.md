# Minimal Codex subagent

- 日期：2026-08-25 19:46（本機時間）

## 交付

- 移除先前自訂的 `agent/` 九角色目錄。
- 新增唯一的 Rulesync source：`.rulesync/subagents/cms-contract-reviewer.md`。
- Rulesync 產生官方 Codex project-scoped agent：`.codex/agents/cms-contract-reviewer.toml`。
- 新增 `.codex/config.toml`，每個 session 最多 2 個並行子代理。

## 關鍵決策

- 不重複建立 implementation／exploration 角色；使用 Codex built-in `worker` 與 `explorer`。
- 唯一 custom agent 是 read-only `cms_contract_reviewer`，用於 SQL CMS 高風險變更的 cross-contract review。
- OMP 沿用既有 `.omp/config.yml` 的 `reviewer`，不建立不存在的自訂 OMP runtime type。
- 因 repository 使用 Rulesync 且 `delete: true`，subagent 必須在 `.rulesync/subagents/` 維護，再由 Rulesync 產生 `.codex/agents/`；直接寫 output 會被同步檢查判定為 orphan。

## 實際驗證

- `npm run sync:ai` 產生 1 份 Codex subagent output。
- `npm run check:ai-sync` 通過：`✓ All files are up to date.`
