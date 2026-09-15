---
id: WI-004
status: pending
title: 交付階層 Taxonomy 與 Entry 綁定
work_group: null
depends_on: [WI-001, WI-002]
---

## Outcome

內容設計者可管理current reusable taxonomies與CPT attachments；內容管理者可在entry editor選取Categories、Tags、custom terms或依政策inline建立term，並由entry Save原子保存validated bindings。

## Acceptance

- [ ] Categories以hierarchical mode、Tags以flat mode存在且自動附加每個CPT；custom taxonomy建立後回傳`taxonomy/v2` stable ID、實際global slug、immutable hierarchical mode、current terms與state digest。
- [ ] CPT attachment可Save/readback taxonomy stable ID、cardinality、required與`allowTermCreation`；移除已有entries使用的attachment依non-breaking gate失敗且零寫入。
- [ ] Create/update term可變更核准current metadata與slug；parent只接受同taxonomy stable term ID。Missing/retired parent、self cycle或indirect cycle回stable failure，term graph與slug claims零變更。
- [ ] Categories接受`0..1`、Tags接受`0..many`且child assignment不推導parent binding；custom attachment依自身cardinality/required驗證，published failure不建立partial entry relation。
- [ ] `allowTermCreation=true`時可從entry editor inline建立並立即選取term；false時相同操作不可用且API直接請求被拒絕。
- [ ] Retire term保留既有entry readback但不再提供新選取；Delete只在零draft/published usage且零children時成功，否則回完整deterministic usage/children且零寫入。
- [ ] Stale taxonomy、term、attachment或entry state digest都回409且不改任一registry、binding或entry；CMS提供reload/recovery feedback。
- [ ] Application/API contract與真實CMS journey證明taxonomy管理、inline create、entry Save/reload、cycle與used-delete失敗，不以private row或component props作assertion。

## Notes

- [規格](../../../../specs/cms-core-data-reset.md)
- [#315（沿用 entry editor 與 browser/a11y precedent）](https://github.com/wahengchang/ai-study-note/issues/315)
- 本 Work Item 必須縱切 Persistence→Core/Application→Authoring API→CMS→behavior tests；term public paths、archives與descendant aggregation不在本票。
