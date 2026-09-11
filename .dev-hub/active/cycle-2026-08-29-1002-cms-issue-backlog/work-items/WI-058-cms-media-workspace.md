---
id: WI-058
status: done
title: CMS media library workspace
work_group: WG-038
depends_on: ["WI-040", "WI-035", "WI-046", "WI-047"]
---

# CMS media library workspace

## Outcome

完成 [GitHub Issue #317](https://github.com/wahengchang/ai-study-note/issues/317) 的 Media Library 介面。

## Acceptance

`/cms/media`、`/cms/media/import`、`/cms/media/:assetId` 具實際 browser outcome 與 a11y gate；未實作前不進 production nav 或 history allowlist。

## Notes

GitHub #317；依 Media continuous-delivery exception，以 PR #362 的 `feature/media-lifecycle-commands` 作 stacked base。PR #363 已開啟並完成。