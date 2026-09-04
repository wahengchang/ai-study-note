---
id: WI-053
status: done
title: Projection Preview core document
work_group: WG-017
depends_on: ["WI-052"]
---

# Projection Preview core document

## Outcome

完成 GitHub #254 尚未交付的 `Preview(selection, subject)` core seam：current/published 選取、zero canonical mutation，以及 raw/demo sandbox/static fallback document。

## Acceptance

選取 pointer 後只讀 canonical state；current 可見 draft、published 不可見；任何 unresolved input 無 partial document；raw 與 demo source 只進入 sandbox document，demo sandbox 不含 `allow-same-origin`。

## Notes
GitHub #254 residual core seam 已完成。API-12 transport 仍依 GitHub #289 的 application/HTTP 依賴，未建立 stub。
GitHub #254 的 published `renderer-input/v1` 已由 WG-015 完成。本項不建立 API-12 transport，該 transport 仍依其獨立 Issue 的 application/HTTP 依賴。
