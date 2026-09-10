---
id: WI-065
status: done
title: CMS runtime browser gate acceptance hardening
work_group: WG-028
depends_on: ["WI-064"]
---

# CMS runtime browser gate acceptance hardening

## Outcome

以 real `startCmsRuntime` browser journey 鎖住 Publish dialog 的雙向 focus wrap、確認前 published pointer 不變，以及 Chromium 啟動失敗時 listener 一定關閉；驗證紀錄只宣稱實際覆蓋的證據。

## Acceptance

將焦點精確置於「確認發布」與「取消」，分別驗證 Tab／Shift+Tab 在 dialog 內雙向 wrap；第一次開啟 Publish dialog 後 Escape，Published preview 仍為「尚未發布」；Chromium launch 位於涵蓋 runtime close 的 `try/finally`；完成紀錄與測試結果一致。

## Notes

只補 #315 的 production-composition browser/a11y 驗收證據；不變更 CMS domain、HTTP route 或 release scope。
