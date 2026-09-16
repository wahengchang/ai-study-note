---
id: WI-002
status: done
title: 交付 mutable entry 儲存與狀態
work_group: WG-002
depends_on: [WI-001]
---

## Outcome

內容管理者可在 CPT-specific CMS routes 建立、讀取、覆寫與 real Delete Article current entry；一次 Save 同時提交完整 content 與 `draft|published` status，並以可信的 `publishedAt` 取代獨立 Publish／current-published lifecycle。

## Acceptance

- [x] Article entry catalog/document 唯一使用 `/cms/post`；其他 CPT 唯一使用 `/cms/post?cpt=<typeId>`，query 僅接受無引號 canonical UUID。Article `cpt` query、缺值、重複/額外 query、encoded separator與non-canonical value皆 fail closed，沒有 alias。
- [x] Create/Save 回傳 `cpt-entry/v1`，包含 stable entry ID、type ID、實際 slug、沿用 #315 body-block payload的 `cpt-content/v1`、`draft|published` status、state digest與適用時的 `publishedAt`。
- [x] 每次 Save 都要求 title、slug與非空 body；draft可保存尚未完成的後續custom/taxonomy/media必填值，published Save則在缺少任何目前已知publishable requirement時零寫入失敗。
- [x] status=`published` 且publishable content digest改變時更新UTC `publishedAt`與last-published digest；相同bytes重複Save不改時間；改回draft保留時間但readback status仍為draft。
- [x] Stale `expectedStateDigest` Save回409，content、status、slug、`publishedAt`與authoring route evidence皆不變；server不自動retry或merge。
- [x] Draft或published entry都可用Delete command一次移除entry、slug claim、目前relations與authoring route evidence；catalog/detail後續讀取皆顯示不存在，且舊slug可重用。
- [x] CMS不要求獨立Publish、Restore或current/published preview才能完成上述journey；成功與validation/conflict/Delete feedback符合既有keyboard、focus、live-region precedent。
- [x] Application與Authoring API contract proof涵蓋完整replacement、atomic mutation/Delete、CAS precedence與stable HTTP failures。

## Notes

- [規格](../../../../specs/cms-core-data-reset.md)
- [#315（沿用 body payload 與 browser/a11y precedent；Publish/current-published lifecycle 由本票取代）](https://github.com/wahengchang/ai-study-note/issues/315)
- 本 Work Item 必須縱切 Persistence→Core/Application→Authoring API→CMS→behavior tests；obsolete exports/routes 的最終移除由 WI-009 收斂。
- 實作決策：current entry 的 API 走 type-scoped `/v1/content-types/:typeId/entries*`（legacy `/v1/entries*` 由 WI-009 移除，WI-007 的 `.../entries/search` 是其後續讀取面）；`cpt-content/v1` 本輪只納入 title、body-block payload、excerpt、SEO，custom field／featured media／taxonomy binding 由 WI-003／WI-004／WI-005／WI-006 擴充；entry 的 authoring route evidence 為 `/{實際 slug}`，只作為 CAS 與 Delete 的 evidence，不接 Projection／SiteDefinition。
- CMS 的 entry 編輯在同一 document 內完成（`/cms/post[?cpt=]`），因為核准 contract 只允許該路由帶單一 canonical `cpt` query，entry 不以 query 定址。
