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

`/cms/taxonomies`、`/cms/taxonomies/new`、`/cms/taxonomies/:taxonomyId` 具實際 browser outcome 與 a11y gate；未實作前不進 production nav 或 history allowlist。

## Notes

GitHub #316；由 WG-033 完成。交付 finite exact CMS document routes、Application-only taxonomy list/create/detail UI 與 real `startCmsRuntime` Chromium/a11y gate；未加入 entry selector、歷史路由或 lifecycle command UI。