---
id: WI-001
status: done
title: CMS local initialization commands
work_group: WG-001
depends_on: []
---

# CMS local initialization commands

## Outcome

使用者執行 `npm run cms:init` 後，取得 repository 外的 migration database、media root、installed Plugin/Theme、active Theme、local credential 與 built CMS assets；執行 `npm run cms:start` 後啟動同一 runtime。

## Acceptance

- 初始化與啟動不接受 runtime path argv，且不在 repository 內建立 state。
- 重複初始化成功且不變更既有有效 runtime。
- 受控 temporary HOME 的真實 CLI flow 先初始化，後以 `cms:start` 成功提供 CMS runtime。
- `cms:init` 會建置 CMS assets，使用者不需要另跑 `cms:build`。

## Notes

固定 demo state 僅供本機體驗，不取代現有 production CLI。
