---
id: WI-064
status: done
title: CMS authenticated runtime browser gate
work_group: WG-027
depends_on: ["WI-063"]
---

# CMS authenticated runtime browser gate

## Outcome

以真實 `startCmsRuntime`、credential、Theme、database 與 CMS assets 完成 GitHub #315 的 authenticated Chromium browser/a11y journey；不以 transport fixture 取代 production composition。

## Acceptance

真實 fixed-origin listener 上的 `/cms`、`/cms/entries`、`/cms/entries/new` 與 `/cms/entries/:entryId` 必須可由 authenticated Chromium 完成 Article create/edit/save、Current／Published preview、two-step Publish 及 published-with-draft；同時證明 landmark、heading focus、dialog、keyboard tabs、sandbox iframe 與 375px 操作。

## Notes

只補 production-composition browser proof 與必要的測試支援；不擴張 domain、HTTP transport、CMS routes 或 release scope。
