---
id: WI-008
status: pending
title: 執行 Legacy 單一狀態 Cutover
work_group: null
depends_on: [WI-002, WI-004, WI-006]
---

## Outcome

遷移操作者可先檢視完整legacy preflight，為每個current/published分歧entry選擇唯一保留內容，並在所有決策齊備後原子轉成current-only records；未轉換legacy entry保持唯讀但可real Delete。

## Acceptance

- [ ] Preflight從同一baseline列出所有legacy entries與deterministic state digest：無published selection標示為current→draft，current=published標示為published，分歧entry標示為required choice。
- [ ] 每個分歧entry只接受`keep-published-as-published`、`keep-current-as-draft`或`keep-current-as-published`；missing、duplicate、foreign或unknown choice拒絕且零寫入。
- [ ] 全量choices與`expectedStateDigest`相符時，單一atomic cutover產生CPT current entry/content/status、global slug、taxonomy/media binding與authoring route evidence；任何validation/storage fault回滾全部entries。
- [ ] Migration結果不帶入Revision history；每個published result的`publishedAt`/last-published digest有可解釋且deterministic來源，draft result不被誤判為目前公開。
- [ ] Cutover前`legacy-entry/v1`可detail read與real Delete但Save/Publish/Restore被拒絕；Delete同transaction移除active legacy state/relations/slug claim，且不承諾secure erase舊artifact。
- [ ] Cutover完成後原有內容可由新CPT-specific catalog/detail/search讀取並繼續Save；同一runtime不再允許任何entry回到legacy mutation path。
- [ ] 以production-like fixture涵蓋unpublished、equal與三種divergent choices、stale baseline及injected failure；Application/API/CMS journey證明preflight、decision gate、atomic result、read-only與Delete。

## Notes

- [規格](../../../../specs/cms-core-data-reset.md)
- [#315（其既有current/published資料是migration輸入；two-step lifecycle不保留）](https://github.com/wahengchang/ai-study-note/issues/315)
- 本 Work Item 必須縱切 Persistence→Core/Application→Authoring API→CMS→behavior tests；不遷移歷史Revision或改動public immutable artifacts。
