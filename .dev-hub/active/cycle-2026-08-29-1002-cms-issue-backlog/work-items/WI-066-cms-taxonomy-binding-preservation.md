---
id: WI-066
status: done
title: CMS taxonomy binding preservation
work_group: WG-032
depends_on: ["WI-043"]
---

# CMS taxonomy binding preservation

## Outcome

在 Taxonomy selector 尚未實作前，CMS 編輯既有 entry 後儲存不得把 current Revision 的 taxonomy bindings 改成空陣列；完成 [PR #348](https://github.com/wahengchang/ai-study-note/pull/348) 審閱發現的資料遺失修正。

## Acceptance

`AuthoringEntryV1` 回傳的 current taxonomy binding identities 在 CMS save 時原樣保留；儲存與發布後的 Revision／published projection 仍保有相同 immutable taxonomy evidence。以 real `startCmsRuntime` 的 authenticated browser journey 建立含 binding 的 entry、經 CMS 編輯儲存並發布，驗證 bindings 未遺失。未實作 Taxonomy selector、nav 或新 CMS document route；該範圍屬 WI-057。

## Notes

GitHub #283／PR #348 後續；由 WG-032 完成。reviewer 與 security-reviewer 確認只可從 `AuthoringEntryV1` 投影 exact `{taxonomyId,termId}`，transport／Application 既有 strict admission、CAS 與 transaction materialization 已維持 zero-write failure；未加入 selector、current catalog fallback 或 immutable evidence 回送。
