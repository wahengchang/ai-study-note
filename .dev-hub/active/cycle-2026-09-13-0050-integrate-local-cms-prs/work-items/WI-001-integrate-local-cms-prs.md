---
id: WI-001
status: done
title: 整合仍有效的 local CMS PR
work_group: WG-001
depends_on: []
---

# 整合仍有效的 local CMS PR

## Outcome
將 #361、#364、#368 的仍有效功能以 current `site-reset` contract 和測試收斂，並排除已由 WG-045 取代的 #366。

## Acceptance
local CMS init/start/kill 與 direct-browser mode 均可觀察、符合 updated contract；所有受影響的既有測試與 targeted runtime smoke test 有實際結果。

## Notes
#364 的 same-machine anonymous `/v1` 決策是 Owner 核准範圍；審查補上 document/asset admission、safe local-runtime initialization、exact CMS listener termination，並更新 stale test/contract。#366 的 route graph 已由 WG-045 取代，未整合。