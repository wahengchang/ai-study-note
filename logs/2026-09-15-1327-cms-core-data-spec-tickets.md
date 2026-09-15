# CMS Core/Data 規格與票券交付

- Cycle：`cycle-2026-09-15-1316-cms-core-data-reset`
- 完成時間：2026-09-15T13:27:30+08:00
- 狀態：規格與 Work Item 拆解完成；Cycle 維持 `active`，等待後續 `/do-work` 認領。

## 交付

- `contracts/README.md` 新增明確標示尚未實作的 current-only CMS/Core approved target，保留現行 implemented baseline。
- `specs/cms-core-data-reset.md` 定義 56 個 user stories、external contracts、testing seams 與 out-of-scope boundary。
- `docs/INDEX.md` 新增 contract→spec→Persistence/Application/API/CMS→tests 的工作路由；`MEMORY.md` 保存長期 Owner 決策並 supersede 新 CPT 的 schema migration 路徑。
- 功能稽核 `draft_2026-09-14/pages-audit/uiux-todo-report.md` 同步為 current-only CMS/Core scope；此 dated draft 受 repository ignore 規則管理，只是本工作樹的本地稽核 artifact。
- 專用 active Cycle 建立 WI-001～WI-009；每張為未認領的 vertical slice，帶真實 blocking edges、可觀察 Acceptance、規格與 #315 precedent 連結。未建立 Work Group、GitHub Issue 或 PR。

## 關鍵決策

- Content Type definition、entry、taxonomy／term 與 media asset 都只保留目前值；Save 覆寫，所有 mutation 使用 `expectedStateDigest` CAS。
- Entry status 只有 `draft|published`；沒有獨立 Publish、Revision history、Restore 或 current/published 雙 snapshot。`publishedAt` 只在 published content digest 實質改變時更新，回到 draft 後保留。
- 所有可命名 entity 共用 NFC/full-case-fold global slug namespace；server 原子配置 collision suffix，Rename/Delete 立即釋放舊 slug。
- 新 Content Type 採固定 system fields加 ACF-like 平面 custom fields；Taxonomy 是 current reusable registry；Media 是最高 400 MiB 的單次 streaming multipart current asset。
- Projection、Renderer、archive、canonical public URL、Release、Public UI 與視覺重設全部延後；content-hashed artifact 的技術 immutable/atomic性質維持。
- #315 的 body payload與browser/a11y precedent保留，two-step Publish/current-published lifecycle由新規格 supersede。

## 實際驗證

- `git diff --check`：通過，零輸出。
- `npm run check:architecture`：通過，exit 0。
- `npm run dev-hub:overview:check`：通過，exit 0；九張 Work Items 的 schema、ID、dependency與未認領狀態有效。
- 讀回 contract、spec、Cycle、WI-001～WI-009 與 session-local trace table；throwaway trace check確認US-01～US-56連號且全數至少映射一張Work Item、WI-001～WI-009齊備、dependency graph無cycle。

## 已知限制／後續

- 本工作只交付 contract、spec、文件路由、active Cycle 與 Work Items；沒有產品程式碼、Public pipeline、視覺、Work Group、GitHub Issue 或 PR。
- 後續從 frontier WI-001 開始使用 `/do-work`；WI-003、WI-004、WI-005 在 blockers 完成後可平行，WI-009 最後做 clean cutover。
- `draft_2026-09-14/` 依 `.gitignore` 不會進入 branch diff；其同步版本留在本規格 worktree作本地參考。

## 相關變更

- Branch：`spec/cms-core-data-reset`
- Worktree：`.dev-hub/worktrees/cms-core-data-reset`
- PR：待建立
