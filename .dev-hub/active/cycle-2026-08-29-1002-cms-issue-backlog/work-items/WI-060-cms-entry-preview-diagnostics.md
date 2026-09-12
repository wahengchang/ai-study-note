---
id: WI-060
status: done
title: CMS entry preview diagnostics
work_group: WG-043
depends_on: ["WI-040", "WI-049"]
---

# CMS entry preview diagnostics

## Outcome

完成 [GitHub Issue #319](https://github.com/wahengchang/ai-study-note/issues/319) 的 entry 內嵌 preview diagnostics。

## Acceptance

`/cms/entries/:entryId` 內的 current/published preview 具實際 browser outcome 與 a11y gate；不建立 `/cms/preview`。

## Notes

完成：entry route 的 current/published/未發布/safe-error preview diagnostics 與 a11y browser proof 已交付；PR #371。