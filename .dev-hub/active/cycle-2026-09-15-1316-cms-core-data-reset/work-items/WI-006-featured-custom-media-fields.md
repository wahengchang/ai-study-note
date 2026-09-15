---
id: WI-006
status: pending
title: 交付 Featured 與 Custom Media 欄位
work_group: null
depends_on: [WI-003, WI-005]
---

## Outcome

內容管理者可從current media library為entry選取featured media與single/multi-media custom values；Save與readback使用exact asset stable IDs，並讓所有draft/published usage可靠阻擋破壞性media操作。

## Acceptance

- [ ] Entry editor的featured media、single-media與multi-media controls只列出目前存在且符合field MIME policy的assets，並以可辨識metadata/thumbnail選取，不暴露asset version概念。
- [ ] Save/readback精確保存asset stable ID；reload後featured/custom選取不因label、slug或metadata變更漂移，multi-media值有deterministic order且不得重複identity。
- [ ] Published Save對missing asset、MIME mismatch與max count失敗且entry零寫入；draft依核准required規則保存未完成狀態，但不得建立指向不存在asset的reference。
- [ ] 新增、替換或移除entry media value與entry content/status在同一CAS transaction提交；stale digest回409且entry與media usage都維持原狀。
- [ ] 任一featured/custom reference無論entry為draft或published，都出現在media detail usage並阻擋Replace/Delete；移除最後reference並Save後即可Replace/Delete。
- [ ] 真實CMS journey涵蓋import asset→featured/custom select→draft/published Save→reload→usage阻擋→解除reference→media operation成功；Application/API tests驗證atomic relation與validation，不assertpicker wiring。

## Notes

- [規格](../../../../specs/cms-core-data-reset.md)
- [#315（沿用 entry editor 與 browser/a11y precedent）](https://github.com/wahengchang/ai-study-note/issues/315)
- 本 Work Item 必須縱切 Persistence→Core/Application→Authoring API→CMS→behavior tests；public Theme/SEO對featured media的使用不在本票。
