# CMS 全站 UX 稽核與改版完成紀錄

- Cycle ID：`cycle-2026-10-11-1053-cms-ux-redesign`
- 完成時間：2026-10-11T21:18:23+08:00
- 狀態：completed
- Branch：`codex/cms-ux-redesign`
- PR：[CMS 全站 UX 稽核與中性後台改版](https://github.com/wahengchang/ai-study-note/pull/393)

## 交付

13 個 CMS 指定路由的稽核截圖、問題清單、三個視覺方向及每方向的文章編輯／分類管理／Builder 延伸稿，存於 `draft_cms-ux-redesign_2026-10-11/`。完成方向 2 的中性側欄介面、內容清單與同路由編輯器、Builder 群組卡片、term 獨立面板、媒體庫與匯入佇列改版；另有 `docs/cms-workspace.md` 與 `design-qa.md`。

2026-10-12 依使用者回饋重構 CMS 原始碼：13 個路由的介面按工作區拆為獨立模組，Authoring API client、Builder model 與共用 shell 各有單一職責；`workspace.tsx` 只保留路由與啟動。CSS 依 token、共用控制項及工作區拆檔，合併後的規則內容和順序與原版一致。模組索引已加入 `docs/cms-workspace.md`。

同日依使用者決定將 `draft_*` 視為本機暫存資料：加入明確 ignore 規則，從 PR 追蹤清單移除 78 個稽核草稿及截圖，保留本機檔案。可供 PR 檢視的比對與驗證結論仍保留於 `design-qa.md`。

2026-10-12 再依使用者要求補上自訂 Content Type 與 taxonomy 定義的受保護 real Delete：新增 versioned Authoring API、Persistence transaction、CMS 確認操作與錯誤提示；Article／Categories／Tags、仍有 entry／term／attachment 的定義不得刪。契約與 CMS 文件同步更新。

## 關鍵決策

使用者授權 Codex 選定方向 2。生成稿中錯誤的 Builder 群組／欄位層級及非真實媒體圖樣以現行 Authoring API 與真實 asset 校正。stable ID、完整替換 payload、CAS 409 語意、媒體引用限制及雙併發匯入保留；公開網站發布仍暫停。

## 實際驗證

`npm run check`：202 passed、0 failed；`git diff --check` 通過。真實瀏覽器完成 13 路由桌面（1440px）與窄螢幕（390px）截圖，手機頁無水平溢出。驗證內容建立／編輯／儲存、搜尋與篩選保留、Builder 群組排序、term 建立、媒體匯入進度與引用鎖定、空結果、必填驗證、409 衝突、刪除確認與手機選單鍵盤焦點。瀏覽器 console 無 error／warn。

重構後再次執行 `npm run check`：202 passed、0 failed；固定埠示範服務在測試前暫停，測試後恢復於 `http://127.0.0.1:43127/cms`。

定義刪除擴充後再次執行 `npm run check`：202 passed、0 failed。`current-only-journey.test.ts` 以 Chromium 與 API 回讀驗證成功刪除、取消確認、固定定義／引用拒絕、CAS 409、strict body 400、列表更新、404 與 slug 釋放後重用。示範服務重啟於 `http://127.0.0.1:43127/cms`，保留原示範資料。

## 已知限制／後續

公開站 Preview、Build、Release 不在本輪，介面會明示「已發布」只代表 CMS 內容狀態。無其他阻塞事項。
