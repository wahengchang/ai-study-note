---
name: demo-e2e
description: 用可見 Chromium 實際示範一次已完成的 end-to-end 行為，並保留結果畫面。
disable-model-invocation: true
---

Don't tell me it works. Show me the behavior. 啟動實際 app，用可見（非 headless）的 Chromium 親自走完本次變更的主要 end-to-end flow，讓使用者看到具體 input → observable output；tests、screenshots 或 source inspection 都不能替代。
完成後停在結果畫面，保留瀏覽器視窗與必要服務直到使用者手動關閉；若真實流程受無法取得的環境、帳號或密鑰阻擋，直接顯示並回報 blocker，不得偽造成功。
