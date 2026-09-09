---
cycle: cycle-2026-08-29-1002-cms-issue-backlog
work_group: WG-023
status: completed
completed_at: 2026-09-09T20:50:00+08:00
---

# PR #337 review 後續修正

## 交付

- 修正 `GET /v1/entries/:entryId/revisions`：route claim 只綁 current／published 指標，第二次儲存後被取代的 revision 沒有 claim，整條 history 會回 `500 AUTHORING_READ_FAILED`。history item 的 `route` 改為 optional，只有仍持有 claim 的 revision 才帶；current／published 指標仍必須有 route，缺少時 fail closed。
- CMS 工作台建立新草稿後同步刷新內容目錄，避免新項目在重新載入前不出現於首頁與 `/cms/entries`。
- `articleDraft()` 只接受 exact 單一 article block 的 `site-content/v1`；多 block 內容改走既有「非 Article v1 工作台可編輯版本」路徑，不再於儲存時靜默丟棄其他 block。
- Authoring read seam 與 preview 404 改回可行動的 remediation；preview route 的 body 上限訊息改用自己的常數，符合「上限與訊息綁在同一處」的既有規則。

## 關鍵決策

- history 的舊 revision 沒有可回溯的 route（`route_claims` 為 `UNIQUE (graph, owner_entry_id)`，不保存歷史 claim），因此以 optional `route` 表達真實狀態，而不是回填空字串或假 route。型別上以 `AuthoringEntryPointerRevision` 表達「指標 revision 一定有 route」的 invariant，`entry-detail/v1` 的 `route` 維持 required。
- 契約變更只寫在 `contracts/README.md` 的 Entry read seam 條目。

## 實際驗證

- `npm run typecheck` 通過。
- `npm run check:architecture` 通過。
- `npm run cms:build` 通過。
- `node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`：16/16 passed；新增的 history regression test 在修正前確實失敗、修正後通過。
- `npm test`：219 tests，218 passed；唯一失敗為 `cms-browser-bootstrap.test.ts`，因本機容器只有 Playwright chromium 1194 而 `playwright@1.63` 需要 1243 build，於未修改的 PR head 上同樣失敗，與本次變更無關。

## 已知限制／後續

- CMS client 尚未呼叫 history route，`/v1/entries/:entryId/revisions` 目前只有 HTTP 契約測試覆蓋。
- 沒有正式 composition root 啟動 authoring listener；`startAuthoringApi()` 目前只在測試中組裝，`cms:open` 假設 listener 已在執行。此為既有落差，未在本次變更處理。

## 相關 Branch／PR

- Branch：`feat/article-workspace-runtime`
- PR：https://github.com/wahengchang/ai-study-note/pull/337
