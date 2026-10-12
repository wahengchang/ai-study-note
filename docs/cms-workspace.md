# CMS 工作台介面

`/cms` 的 13 個管理路由共用桌面側欄、窄螢幕導覽、主標題焦點、表單與狀態樣式。內容類型可決定側欄中的內容項目；目前路由以 `aria-current="page"` 標示。窄螢幕選單開啟時，主區域暫停互動，`Escape` 關閉選單並把焦點送回開啟按鈕。

## 程式碼位置

| 模組 | 職責 |
| --- | --- |
| `apps/cms/workspace.tsx` | 啟動 React、宣告 CMS 路由 |
| `apps/cms/cms-api.ts` | Authoring API client、response parser、DTO 與錯誤語意 |
| `apps/cms/cms-shell.tsx` | 導覽、共用 layout、頁面標題與公開發布提示 |
| `apps/cms/content-workspace.tsx` | 共用內容清單與建立／編輯工作台 |
| `apps/cms/content-type-model.ts` | Builder draft、欄位轉換及驗證 |
| `apps/cms/content-types.tsx` | 內容類型清單、建立及詳情 Builder |
| `apps/cms/taxonomies.tsx` | taxonomy 清單、建立及 term 管理 |
| `apps/cms/media.tsx` | 媒體清單、匯入及詳情 |
| `apps/cms/home.tsx` | CMS 首頁 |
| `apps/cms/tokens.css`、`apps/cms/styles/` | 設計 token、共用控制項、各工作區樣式及 responsive 規則 |

頁面樣式依工作區檔案維護；`styles/index.css` 固定匯入順序。跨頁面狀態與資料請求集中在 shell 和 API client，避免每個頁面另寫一套契約解析。

## 內容工作台

文章與自訂內容類型共用 `/cms/content/:typeId`。清單提供文字搜尋、草稿／已發布狀態、taxonomy、term 篩選和分頁；建立或開啟內容後，同一路由顯示完整編輯畫面。返回清單會保留當前元件中的篩選與頁碼。編輯器顯示未儲存狀態，返回清單、側欄導航或離開頁面時提醒。儲存使用既有 Authoring API 的完整替換 payload 與 state digest；409 衝突會鎖住舊表單並要求重新載入。刪除前顯示不可復原確認。

「已發布」只代表 CMS 內部狀態。公開網站發布、Preview、Build 與 Release 仍暫停，內容頁會直接說明此事。

## 結構與媒體

Content Type Builder 依群組、欄位、選項顯示並提供順序操作，stable ID 由 server 配置。分類與標籤沿用同一 taxonomy 詳情頁；term 在獨立面板編輯。媒體庫展示縮圖與 metadata；媒體詳情分開顯示 metadata、引用和替換／刪除操作。被內容引用的媒體不可替換或刪除。匯入佇列維持最多兩項同時上傳與每項進度。

自訂 Content Type 在沒有 current entry 時可刪除；自訂 taxonomy 在沒有 term、也未被任何 Content Type 附掛時可刪除。系統 Article、Categories 與 Tags 不可刪除。兩種刪除都先要求確認，並以當前 state digest 執行 CAS；受引用或過期的操作保留原資料並顯示錯誤。Category／Tag term 可在零 entry 引用且零子項目時刪除；自訂類型的 entry 可刪除。`current-only-journey.test.ts` 以獨立 SQLite 和真實 Chromium 操作，並在每次 CMS 變更後回讀 API，覆蓋 Category／Tag term、taxonomy 定義、Content Type 定義和 CPT entry 的建立、編輯與刪除，也驗證引用限制與 CAS 衝突。

稽核、三個視覺方向、選定稿與桌面／窄螢幕驗證截圖保留在本機暫存目錄 `draft_cms-ux-redesign_2026-10-11/`，不納入 Git。可供 PR 檢視的視覺比對與功能驗證結論見 [`design-qa.md`](../design-qa.md)。
