# Public page engineer decision and review

- 日期：2026-08-25 20:54（本機時間）

## 交付

- 新增第四個 Codex custom subagent：`public_page_engineer`。
- 將 `architecture_planner` clean-cutover 為 `architecture_engineer`；其同時擁有 application service、Hono/Zod API、domain lifecycle 與 composition 的設計及實作。
- `public_page_engineer` 是待命角色：僅在 architecture_engineer 草擬、且專案擁有者核定獨立 published projection 架構文件後啟動。
- `.codex/config.toml` 的每 session concurrent subagent 上限為 4。

## 關鍵決策

- 公開頁工程是獨立的未來 ownership：它只能消費 published projection/media reference，不能存取 canonical SQLite、original media、current draft 或 CMS UI state。
- 當前 SQL CMS V1 authoring-state contract 明確把 static Theme/public output 排除在範圍外，因此 public role 不可現在實作，也不自行核定 projection。
- `architecture_engineer` 填補先前三角色缺少的 Hono adapter/application services/domain transaction implementation owner。

## 獨立審查與共識

- Claude Code 在唯讀 temporary repository copy 初審提出：public role 搶跑 future scope、持久紀錄未同步、projection handoff 無 owner。修訂後 F-001～F-003 均為 `FIX_VERIFIED`；後續 F-004 指出 self-certification，加入專案擁有者核定 gate 後為 `FIX_VERIFIED`，最終 `CONSENSUS_ACCEPTED`。
- OpenCode 使用 `opencode-go/deepseek-v4-pro` 在唯讀 temporary repository copy 審查：指出 service/API implementation owner 缺失、projection input 無 producer、MEMORY 漂移。修訂後 F-001～F-003 均為 `FIX_VERIFIED`，最終 `CONSENSUS_ACCEPTED`。

## 實際驗證

- `npm run sync:ai` 產生 4 份 `.codex/agents/*.toml`。
- `npm run check:ai-sync` 通過：`✓ All files are up to date.`
