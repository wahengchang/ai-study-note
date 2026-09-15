---
id: WI-003
status: pending
title: 交付 ACF-like 自訂欄位閉環
work_group: null
depends_on: [WI-001, WI-002]
---

## Outcome

內容設計者可在 CPT Builder 定義有順序的 ACF-like 平面 custom fields，內容管理者可在動態 editor 填寫、驗證、Save並精確讀回 stable field/option values。

## Acceptance

- [ ] Builder可建立、排序與更新field groups，以及text、textarea、number、boolean、URL、date、datetime、single-select、multi-select、single-media、multi-media fields；每個group、field與select option由server配置immutable stable ID。
- [ ] Label/help/order可更新而既有entry values仍以stable field/option IDs精確讀回；select option label更新不改已存語意。
- [ ] Definition可表達required、文字長度、數值範圍、media MIME/max count與`showInGenericTemplate`；不提供relationship、repeater、nested group或conditional logic。
- [ ] 新entry初始化一次defaults；definition新增或修改default不回填、覆寫既有entry，readback的custom values按field ID deterministic排序。
- [ ] Draft可缺少custom required values；published Save對required、string length、number range、URL/date/datetime、select option identity執行完整驗證，任一失敗整筆零寫入並在CMS把focus導向可修正欄位。
- [ ] `showInGenericTemplate` default為false並可Save/readback，但不觸發任何public rendering、archive或canonical行為。
- [ ] 真實CMS journey以新建CPT→定義fields→建立draft→填值→published Save→reload精確讀回證明閉環；Application/API tests固定CAS與validation observable contract而非field forwarding。

## Notes

- [規格](../../../../specs/cms-core-data-reset.md)
- [#315（沿用 editor document、keyboard、focus 與 status precedent）](https://github.com/wahengchang/ai-study-note/issues/315)
- 本 Work Item 必須縱切 Persistence→Core/Application→Authoring API→CMS→behavior tests；media asset selection與usage integration由WI-006完成。
