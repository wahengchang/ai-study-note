---
id: WI-002
status: pending
title: 交付 mutable entry 儲存與狀態
work_group: null
depends_on: [WI-001]
---

## Outcome

內容管理者可在 CPT-specific CMS routes 建立、讀取、覆寫與 real Delete Article current entry；一次 Save 同時提交完整 content 與 `draft|published` status，並以可信的 `publishedAt` 取代獨立 Publish／current-published lifecycle。

## Acceptance

- [ ] `/cms/content/:typeId`、`/cms/content/:typeId/new` 與 `/cms/content/:typeId/:entryId` 可完成 default Article catalog、create、read與edit；route 使用 CPT stable ID，不存在 Article 特例。
- [ ] Create/Save 回傳 `cpt-entry/v1`，包含 stable entry ID、type ID、實際 slug、沿用 #315 body-block payload的 `cpt-content/v1`、`draft|published` status、state digest與適用時的 `publishedAt`。
- [ ] 每次 Save 都要求 title、slug與非空 body；draft可保存尚未完成的後續custom/taxonomy/media必填值，published Save則在缺少任何目前已知publishable requirement時零寫入失敗。
- [ ] status=`published` 且publishable content digest改變時更新UTC `publishedAt`與last-published digest；相同bytes重複Save不改時間；改回draft保留時間但readback status仍為draft。
- [ ] Stale `expectedStateDigest` Save回409，content、status、slug、`publishedAt`與authoring route evidence皆不變；server不自動retry或merge。
- [ ] Draft或published entry都可用Delete command一次移除entry、slug claim、目前relations與authoring route evidence；catalog/detail後續讀取皆顯示不存在，且舊slug可重用。
- [ ] CMS不要求獨立Publish、Restore或current/published preview才能完成上述journey；成功與validation/conflict/Delete feedback符合既有keyboard、focus、live-region precedent。
- [ ] Application與Authoring API contract proof涵蓋完整replacement、atomic mutation/Delete、CAS precedence與stable HTTP failures。

## Notes

- [規格](../../../../specs/cms-core-data-reset.md)
- [#315（沿用 body payload 與 browser/a11y precedent；Publish/current-published lifecycle 由本票取代）](https://github.com/wahengchang/ai-study-note/issues/315)
- 本 Work Item 必須縱切 Persistence→Core/Application→Authoring API→CMS→behavior tests；obsolete exports/routes 的最終移除由 WI-009 收斂。
