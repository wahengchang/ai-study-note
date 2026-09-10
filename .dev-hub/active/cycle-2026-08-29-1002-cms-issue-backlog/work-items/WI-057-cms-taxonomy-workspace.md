---
id: WI-057
status: done
title: CMS taxonomy administration workspace
work_group: WG-033
depends_on: ["WI-040", "WI-035", "WI-043"]
---

# CMS taxonomy administration workspace

## Outcome

完成 [GitHub Issue #316](https://github.com/wahengchang/ai-study-note/issues/316) 的 taxonomy 管理介面。

## Acceptance

`/cms/taxonomies`、`/cms/taxonomies/new`、`/cms/taxonomies/:taxonomyId` 具實際 `startCmsRuntime` Chromium browser/a11y gate：鍵盤 list → new → detail、skip link、每次導航 heading focus、loading／empty／safe error／success live status、invalid／duplicate taxonomy label-error association 與 375px layout。維持 finite exact routes；不加入 lifecycle command UI、entry selector、history route 或 catalog fallback。

## Notes

GitHub #316；由 WG-033 完成。交付 finite exact CMS document routes、Application-only taxonomy list/create/detail UI 與 real `startCmsRuntime` Chromium/a11y gate；未加入 entry selector、歷史路由或 lifecycle command UI。

2026-09-10 acceptance hardening：create form 在 `aria-busy` 狀態提供 polite busy status；成功後 detail 以暫態 navigation state 顯示 polite success status。`TAXONOMY_CONFLICT` 僅以 Authoring API 已驗證的 remediation 映射至 Taxonomy ID field error；其他 API 失敗維持安全的 form alert。Chromium journey 以真實 runtime 驗證 loading hold、empty list、鍵盤導覽、skip/focus、invalid／duplicate association、success 與 missing-detail safe error；未新增 CMS route 或未核准 UI。