---
id: WI-009
status: pending
title: 移除 Revision 與 Version 舊路徑
work_group: null
depends_on: [WI-003, WI-004, WI-005, WI-006, WI-007, WI-008]
---

## Outcome

所有CMS/Core data consumer完成current-only cutover後，平台移除舊Revision、雙snapshot、schema migration、media version與`/cms/entries*` lifecycle，只對外暴露一套可操作、可驗證的current data contract。

## Acceptance

- [ ] CMS、Authoring API與Application不再提供SaveRevision、PublishRevision、RestoreRevision、history、current/published preview、raw JSON Schema administration或Content Type schema migration的可呼叫入口。
- [ ] Media catalog/import/detail不再暴露asset version、Base64 JSON import、archive或restore；只保留`media-asset/v2` current metadata、streaming import/replace與real Delete workflow。
- [ ] `/cms/entries`、`/cms/entries/new`、`/cms/entries/:entryId`及所有encoded/nested/trailing變體不在document allowlist、navigation或logger route union，且不redirect；Article只使用`/cms/content/:typeId*`。
- [ ] 所有已遷移caller、fixtures、tests與維護文件只使用current-only DTO/status/CAS；不存在alias、shim、deprecated export、fallback parser或可成功寫入的parallel legacy lifecycle。
- [ ] Implemented baseline在clean cutover完成後精確描述current-only CPT/entry/taxonomy/media行為；舊規格只保留明確historical/superseded身分，不會被文件router當作新工作入口。
- [ ] Fresh runtime與完成WI-008的legacy fixture都可完成CPT建立→menu出現→draft→custom/taxonomy/media→published Save→search→Delete journey，且repository-wide consumer checks不再要求舊lifecycle。
- [ ] Application、Authoring API、CMS Chromium與architecture verification全數通過；針對已移除route/DTO的negative proof顯示fail closed，而非轉送相容層。

## Notes

- [規格](../../../../specs/cms-core-data-reset.md)
- [#315（body/editor/a11y precedent保留；其Publish與current/published contract在本票完成後正式superseded）](https://github.com/wahengchang/ai-study-note/issues/315)
- 本 Work Item 是contract階段，必須等所有consumer slices完成後一次收斂；不得提前移除讓其他Work Item無法維持green，也不得以永久expand/compatibility層結案。
