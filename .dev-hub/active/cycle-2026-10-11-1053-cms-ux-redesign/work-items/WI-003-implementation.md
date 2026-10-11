---
id: WI-003
status: done
title: 實作 CMS 介面並驗證
work_group: WG-001
depends_on: [WI-002]
---

# Outcome

完成共用 layout、內容工作台與管理頁面改版，保留既有 API 與資料契約。

# Acceptance

13 個路由及主要流程可操作；桌面和窄螢幕版面、鍵盤與狀態訊息通過檢查；`npm run check` 通過。

# Notes

13 個路由桌面與 390px 窄螢幕均可載入且沒有水平溢出；內容、Builder、term、媒體與 409／驗證／空結果流程已於隔離 runtime 瀏覽器驗證。`npm run check`：202 passed、0 failed。公開站 Preview、Build 與 Release 不納入。
