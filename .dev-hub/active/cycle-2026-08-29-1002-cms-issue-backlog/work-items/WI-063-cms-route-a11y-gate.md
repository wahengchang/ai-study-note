---
id: WI-063
status: done
title: CMS canonical route accessibility gate
work_group: WG-026
depends_on: ["WI-056"]
---

# CMS canonical route accessibility gate

## Outcome

補齊 GitHub #315 四條 CMS canonical route 的 action-oriented home 與實際 browser/a11y gate；不新增未交付 domain、假導航或 `/cms/preview`。

## Acceptance

`/cms` 顯示可處理文章與明確 actions；每條 canonical route 都有可聚焦主 heading、具名 landmarks、可鍵盤完成的 preview／Publish 流程，以及 375px 可操作性。Chromium browser journey 對四條 route、focus、live status、dialog 與 sandboxed preview 做可觀察斷言。

## Notes

此 Work Item 從既有 WI-056 的 route review 衍生，僅補足已核准 #315 acceptance；保留 `/cms/plugins`，因為它是既有已交付的 Plugin management route，不是未交付的 Plugin editor workspace。
