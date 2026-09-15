---
id: WI-007
status: pending
title: 交付 CPT Entry 搜尋與篩選
work_group: null
depends_on: [WI-002, WI-004]
---

## Outcome

內容管理者可在每個CPT-specific catalog以title/slug、status與taxonomy條件搜尋current entries，並透過固定20筆server pagination取得一致結果。

## Acceptance

- [ ] `POST /v1/content-types/:typeId/entries/search`只接受exact `entry-search-request/v1`；path type ID必須等於body typeId，unknown/extra/invalid search、statuses、taxonomy filters或page欄位fail closed。
- [ ] Title/slug search只回傳指定CPT的matching current entries；status可選draft、published或兩者，taxonomy filters使用stable taxonomy/term IDs且不從label/slug推測identity。
- [ ] Response固定`pageSize:20`並回page、totalItems、totalPages、items、stateDigest；empty/first/middle/last/out-of-range page有明確且deterministic結果，排序不使用locale collation。
- [ ] Categories、Tags與custom taxonomy filters按規格化組合語意產生可重複結果；retired但仍綁定的term可用來找到既有entry，不把child assignment擴張為parent match。
- [ ] Search是read-only：相同state產生相同digest/result；查詢期間state drift不回partial/mixed-generation items，而是可重試的stable failure。
- [ ] 每個動態CPT menu開啟自身catalog，CMS可組合search/status/taxonomy filters、翻頁、清除條件並開啟result detail；keyboard/focus/status feedback符合既有precedent。
- [ ] Authoring API contract與真實CMS journey以超過20筆fixture證明filter/pagination/empty/error；測試assert consumer result而非query implementation。

## Notes

- [規格](../../../../specs/cms-core-data-reset.md)
- [#315（沿用 CMS navigation、keyboard、focus 與 status precedent）](https://github.com/wahengchang/ai-study-note/issues/315)
- 本 Work Item 必須縱切 Persistence→Core/Application→Authoring API→CMS→behavior tests；public archive與`?page=2`不在本票。
