# Basic 技術團隊重組

## 交付

- `.rulesync/subagents/` 已由四個舊角色 clean-cutover 為五個 Basic role：`domain_application_engineer`、`data_media_engineer`、`cms_workspace_engineer`、`projection_preview_engineer`、`public_delivery_engineer`。
- `.codex/agents/` 已由 Rulesync 重建為對應五份 generated TOML；舊角色不保留 alias 或 deprecated path。
- `MEMORY.md` 已同步五角色責任流、契約審核矩陣、SSOT／import 禁令與 Owner 決策 pointer closure 規則。

## 關鍵決策

- Rulesync source 是唯一 SSOT；generated Codex view 不得反向維護。`rulesync import --targets codexcli --features subagents` 僅供 Owner／Technical Lead 明確授權的一次性 bootstrap/recovery。
- 五個 role identity 不等於五個同時 worker；`.codex/config.toml` 的 `max_concurrent_threads_per_session = 4` 保持不變。
- Q-003～Q-007 的未決邊界維持 gated；角色內容保持 stack/editor-format neutral，不預先固化技術選型。

## 驗證

- `npm run sync:ai`：成功產生五份 Codex subagent TOML。
- `npm run check:ai-sync`：輸出 `✓ All files are up to date.`。
- `.rulesync/subagents/`、`.codex/agents/`、`MEMORY.md` 的淘汰 identity、舊 basename、失效 architecture path 與既定技術前提掃描均無結果。
- 已逐一讀取五份 source 與五份 generated TOML；SP-004、WK-023、WK-024～WK-026 與 SP-005 的 owner、reviewer、published/draft isolation、static fixture 邊界均符合核准計畫。
- `draft/`、`project-2026-08-26-1254/`、`dev-hub-*` 無狀態變更；既有歷史 logs 狀態與執行前基線相同。

## 限制／後續

- 本次只重組角色與 generated runtime view；未啟動任何尚缺 Owner canonical pointer 的 Basic 實作工作。
