---
id: WI-061
status: blocked
title: CMS release diagnostics workspace
work_group: null
depends_on: ["WI-040", "WI-050"]
---

# CMS release diagnostics workspace

## Outcome

完成 [GitHub Issue #320](https://github.com/wahengchang/ai-study-note/issues/320) 的 release diagnostics 介面。

## Acceptance

`/cms/release` 具實際 browser outcome 與 a11y gate；PublishRevision 不得擴張為 build、delivery 或 deploy。

## Notes

GitHub #320；blocked。解除條件：Owner 對 release／GitHub Pages 最終階段做出明確決策。未實作前不進 production nav 或 history allowlist。