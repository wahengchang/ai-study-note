---
name: do-work
description: 從 Dev Hub 進行中的 Cycle 領取一個可執行 Work Item，完成理解、實作、驗證與該 Work Group 唯一 PR，交接後停止。
---

本技能每次只處理一個 Work Item：認領、實作、驗證、建立或更新該 Work Group 唯一 PR，完成 Dev Hub 收尾後立即停止。下一個 Work Item 必須由人工再次呼叫 `/do-work`；本技能不得遞迴呼叫自己，也不呼叫其他 workflow skill。

## 1. 確認工作邊界

開始 mutation、建立 branch/worktree 或寫碼前，先讀取 `AGENTS.md`、`MEMORY.md`、`docs/INDEX.md`、`contracts/README.md` 與 `docs/dev-hub-workflow.md`。再依 `docs/INDEX.md` 的當前任務路徑，讀取相關程式入口、測試與 active Cycle 的 `hub.md`。

確認 repository、`origin` remote 與目前 integration branch；新的 Work Group branch 必須從使用者指定的 integration base 建立，不得假定 `main`。不得在承載其他工作或既有 PR 的 worktree 切換 branch 或寫碼；遇到不屬於本 Work Item 的變更時停止，不 stash、reset、force 或覆蓋。

本技能只處理 `.dev-hub/active/` 的 active Cycle；不得從 `dev-hub-*/`、`draft/`、`source-drafts/` 或 `project-*/` 歷史 artifact 取用工作內容。

## 2. 選取並認領 Work Item

從 active Cycle 選取一個 `pending`、`work_group: null`、所有 `depends_on` 皆為 `done` 或 `cancelled` 的 Work Item；`blocked`、未解除依賴或已認領項目不得入選。沒有候選時回報「目前沒有可執行的 Dev Hub Work Item」，不做 mutation。

寫碼前建立本輪專用 Work Group、branch 與 worktree，並依固定 schema 將 Work Item 設為 `in_progress`、雙向連結其唯一 Work Group。Work Group 必須記錄單一 branch、worktree 與 `pr: null`；不得建立只為認領狀態的預先 commit。

完整讀取 Work Item、Cycle context、接受條件、依賴、相關 source、tests 與 repository 規範。若現有證據仍無法解答會改變產品行為的決策，將 Work Item 或 Work Group 設為 `blocked`，寫明原因與解除條件後交接；不得猜測或擴張範圍。

## 3. 探索與實作

沿用 repository 既有 pattern，先確認影響面與所有 caller，再完成 Work Item 的 acceptance criteria。bug 先以最便宜可靠的既有命令或場景重現，確認 root cause 後修正；修改 exported symbol 時確認所有 references，並清理 obsolete path。

涉及 core module 時，實作前的計畫必須安排兩個不同角色的 agent 交叉審查；將結論納入實作決策。程式行為、邊界、資料流、公開介面或維運程序改變時，同步更新受影響文件與必要的鄰近 ASCII flow 註解。

## 4. 不可跳過的驗證 gate

先驗證 Work Item 指定的可觀察行為（具體 input → observable output）；必要時補上能對合理 regression 失敗、且符合既有風格的測試。接著執行 `docs/INDEX.md`、Work Item 或受影響 domain 所要求的具體驗證，記錄實際命令與結果；不得以未執行的 generic check 取代行為驗證。

## 5. Work Group 唯一 PR 與 Dev Hub 收尾

每個 Work Group 僅建立或更新一個 PR。第一個 commit 必須包含完整交付、實際驗證，以及可審閱的 Cycle／Work Item／Work Group 最終狀態；PR 尚未建立時 `pr` 保持 `null`。建立或更新 PR 後，第二個且最後一個 commit 只做追蹤收尾：

- 非最後 Work Group：填入真實 PR URL，active Cycle 保留。
- 最後 Work Group：確認所有 Work Item 與 Work Group 已達完成閘門，建立 `logs/YYYY-MM-DD-HHmm-<cycle-slug>.md` 完成摘要，並刪除整個 active Cycle。

每個 Work Group 的 PR 固定恰好兩個 commit。推送後必須修正時，amend 對應的第一或第二個 commit，再以 `--force-with-lease` 更新同一 PR；不得新增第三個 commit。

PR title/body 使用繁體中文、以 outcome 為主；body 必須包含變更摘要、實際驗證命令與結果、剩餘風險，以及 Cycle／Work Item／Work Group 路徑。

## 6. 整理與交接

清理本輪 worktree、process 與 temporary artifacts。需要將狀態交給下一個 session 或 agent 時，直接呼叫 `/handoff`。

完成交接後停止本輪。下一個 Work Item 必須由人工再次呼叫 `/do-work` 領取。
