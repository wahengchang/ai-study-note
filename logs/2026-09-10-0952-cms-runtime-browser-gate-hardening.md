---
cycle: cycle-2026-08-29-1002-cms-issue-backlog
work_group: WG-028
completed_at: 2026-09-10T09:52:24+08:00
status: completed
---

# CMS runtime browser gate acceptance hardening

## 交付

補強 #315 的真實 production CMS runtime browser/a11y gate。Publish dialog 現在以明確 `onKeyDown` 將最後的「確認發布」Tab wrap 至「取消」，並將第一個「取消」Shift+Tab wrap 至「確認發布」。journey 精確驗證兩個方向、第一次開啟／Escape 後 Published preview 仍為「尚未發布」，以及 Chromium launch 發生例外時仍會由涵蓋它的 `try/finally` 關閉 runtime listener。

## 關鍵決策

原 browser test 的「焦點仍在 dialog」不足以證明 focus trap，且 browser native dialog 行為並未提供所需 wrap。因此以兩個既有 dialog control 的 ref 做最小且可測的本地環狀焦點處理；不增加抽象或改變 Publish command boundary。原完成紀錄修正為只描述當時真正證明的行為。

## 實際驗證

- `npm run cms:build && node --import tsx --test-concurrency=1 --test tests/apps/cms/runtime-browser-gate.test.ts`：通過，實際跑過四條 canonical route 與補強後的 dialog／Publish 斷言。
- `npm run check`：typecheck、architecture check、CMS production build 與 252 tests 全數通過。

## 已知限制／後續

無。

## 相關 Branch／PR

- `feature/cms-runtime-browser-gate-hardening`
- PR 尚未建立。
