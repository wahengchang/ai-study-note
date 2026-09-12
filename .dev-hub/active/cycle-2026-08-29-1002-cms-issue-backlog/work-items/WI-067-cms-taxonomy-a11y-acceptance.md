---
id: WI-067
status: done
title: CMS taxonomy a11y acceptance hardening
work_group: WG-034
depends_on: ["WI-057"]
---

# CMS taxonomy a11y acceptance hardening

## Outcome

完成 GitHub #316 的 post-merge production-composition a11y acceptance hardening。

## Acceptance

真實 `startCmsRuntime` Chromium journey 以鍵盤驗證 taxonomy list → new → detail、skip link、每次導航的 heading focus、loading／empty／safe error／success、invalid 與 duplicate field label-error association，以及 375px 寬度；不增加 lifecycle command UI、entry selector、history route、catalog fallback 或 CMS route。

## Notes

僅調整既有 taxonomy create 的可及性回饋與 production-composition browser gate。