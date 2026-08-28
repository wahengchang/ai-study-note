# 用戶故事與核心模組討論

## 目的與討論規則

本文件把後續系統設計拉回兩個順序不可顛倒的問題：先列出完整的用戶故事，再判斷哪些責任必須合併或拆分為核心模組。此版本定名為 **Basic**，其 30 條啟用中的用戶故事是後續討論的基線；它不核定任何技術、資料模型、API 或最終模組邊界。

目前可確認的是 authoring canonical source 為本機關聯式 SQL CMS 與 local media，公開端由已發布 projection 產生 GitHub Pages 靜態輸出。Basic 只有一位內容管理者，不預設多人角色、登入或權限模型；該管理者也執行靜態發行。內容變更以 Git commit 管理版本歷史，但這不等同於已定義 SQL canonical state 與 local media 的完整 backup／restore 契約。

## 用戶故事盤點

### 內容管理者：內容類型與結構

- 身為內容管理者，我要建立內容類型，定義欄位、驗證規則、可關聯的分類與公開版型；此能力相當於傳統 CMS 的 Custom Post Type 搭配 ACF，但必須由本系統內建預設能力提供，讓不同內容有一致且可演進的結構。
- 身為內容管理者，我要修改內容類型的結構，並在變更不相容時看見需要遷移、驗證或回復的影響，避免既有內容失真。
- 身為內容管理者，我要在封存或停用內容類型前看見仍使用它的已發布內容；只要仍有已發布內容，系統必須阻止封存並要求我先封存內容，避免公開頁失去可用版型。
- 身為內容管理者，我要建立、調整與封存分類法及分類詞彙，讓內容可依清楚語意組織與瀏覽。
- 身為內容管理者，我要為內容指派、變更或移除允許的分類詞彙，讓發布版本能正確供分類與標籤頁瀏覽。

### 內容管理者：內容工作流

- 身為內容管理者，我要建立一筆內容、填寫欄位與編輯本文，讓它先存在於未發布工作狀態。
- 身為內容管理者，我要儲存修改而不影響公開版本，讓我可安全持續編輯。
- 身為內容管理者，我要明確得知儲存、發布、封存或還原等狀態變更是否成功，並在失敗時看見可採取行動的結果，避免誤以為內容已安全寫入或公開。
- 身為內容管理者，我要檢視內容的目前草稿與公開預覽，確認公開效果後才發布。
- 身為內容管理者，我要發布指定版本，讓公開端只取得明確選定的內容快照。
- 身為內容管理者，我要查看 revision 歷史並還原到先前版本，讓誤改可復原且保留可追溯性；若目標版本引用已封存媒體，系統必須阻止還原並要求我先恢復媒體。
- 身為內容管理者，我要封存內容而非直接毀損歷史，讓內容停止公開但仍能保留與復原。
- 身為內容管理者，我要看見欄位驗證、關聯、路由或發布條件不成立的具體原因，讓我能修正內容而非發布壞資料。

### 內容管理者：站點結構與路由

- 身為內容管理者，我要為內容設定 slug、階層與公開路由，讓讀者能以穩定 URL 存取內容。
- 身為內容管理者，我要在修改路由前知道衝突與受影響內容，避免兩筆內容宣告同一個公開位置。
- 身為內容管理者，我要管理導覽、站點設定與內容在站點中的編排，讓公開網站可被理解與瀏覽。
- 身為內容管理者，我要在變更內容或站點結構後檢視其預覽，讓公開資訊架構在發布前可驗證。

### 內容管理者：媒體

- 身為內容管理者，我要匯入本機媒體檔案並取得可用的媒體資產，讓內容可引用圖片、檔案或其他媒體。
- 身為內容管理者，我要看見媒體的 metadata、使用位置與引用狀態，讓我不會誤刪仍被內容使用的檔案。
- 身為內容管理者，我要在內容中加入、替換或移除媒體引用，並由 Media Library 維護唯一的媒體引用登錄，讓內容記錄與本機 bytes 保持一致。
- 身為內容管理者，我要封存媒體並在安全條件下恢復，避免造成孤兒 bytes 或失效引用。

### 內容管理者：管理工作區

- 身為內容管理者，我要列出並依內容類型、內容狀態與媒體引用定位內容及媒體，讓我能開始編輯、檢視 revision 或處理引用，而不需要全文搜尋或批次操作。

### ~~內容管理者：資料安全與恢復（Basic 不納入）~~

本版本刻意跳過獨立 backup／restore 與還原後一致性驗證兩條產品故事。內容變更以 Git commit 管理版本歷史；Basic 不因此宣稱可從 Git 重建本機 SQL canonical state 與 local media，也不提供該恢復保證。

### 內容管理者：靜態發行

- 身為內容管理者，我要從已發布 projection 取得確定的輸入，讓公開建置不會讀到草稿或 authoring state。
- 身為內容管理者，我要執行可重現的靜態建置與驗證，讓產物可安全交付至 GitHub Pages。
- 身為內容管理者，我要在建置失敗時知道是哪個已發布資料、媒體或模板契約不成立，讓問題可回到正確 owner 修正。
- 身為內容管理者，我要辨識並保存已交付的靜態 artifact，並能重新交付其中一份 artifact；此回退只改公開交付結果，不還原 authoring canonical state。

### 公開讀者

- 身為公開讀者，我要在不登入、沒有 production API 或資料庫連線的情況下讀取已發布內容。
- 身為公開讀者，我要透過固定公開路由、分類、標籤或內容階層瀏覽網站，讓我能找到相關筆記。
- 身為公開讀者，我要在各種螢幕與輔助技術下使用完整 HTML 內容，讓靜態網站的基本閱讀與導覽可靠可用。
- 身為公開讀者，我要在靜態網站讀取已發布內容引用的媒體，讓圖片、檔案或其他媒體不會因仍指向本機位置或未被交付而失效。

## 從故事推導的候選核心模組

下列候選以 V2 的七模組骨架為起點；只有先確認所有故事都有明確 owner，才可核定它們。

| 候選模組 | 主要承接的故事 | 必須擁有的狀態與規則 | 不應承擔的責任 |
|---|---|---|---|
| CMS Workspace | 管理者的建立、編輯、檢視、錯誤理解與定位內容／媒體 | 編輯工作區互動、內容與媒體的列出和定位 | Domain 規則、直接 SQL、build 或 deploy |
| Content Core | 內容類型、內容、分類、revision、儲存與發布 | schema、Entry、Taxonomy、revision、current／published lifecycle、內容類型封存限制 | media bytes 或媒體引用登錄 |
| Media Library | 匯入、引用、封存與恢復媒體 | media bytes、metadata、唯一媒體引用登錄、媒體可用性與封存限制、retention、已發布媒體的選取 | 內容版型與公開 URL |
| Site Definition | slug、route、hierarchy、navigation、site settings | 全域路由宣告與站點結構規則 | 內容本文語意、HTML render |
| Projection & Preview | 草稿預覽、發布快照、發行輸入 | current、published、preview、站點預覽輸入契約、內容與媒體 references、版本化的 renderer input contract | 靜態建置與 deploy |
| Static Rendering & Public UI | 公開讀取、導覽與完整 HTML | Basic 預設模板的靜態渲染、公開路由、靜態 HTML、已發布媒體的公開 URL、漸進增強；進階 Theme System 啟用時只消費其已選模板與資源 | authoring state 寫入、renderer input 定義、Theme source bytes、artifact 組裝 |
| Build, Validation & Release | 建置、驗證、artifact、GitHub Pages 發行 | deterministic build、包含已發布媒體的 artifact、artifact 重新交付、交付檢查 | 內容語意變更與 canonical state 還原 |

SQL transaction、constraint、migration，及可能的 local API、automation、events/extensions、安全性、a11y/i18n 與 observability，是跨模組支撐能力；它們不能因為跨模組就失去明確 owner，應在模組骨架確認後逐一指定。Basic 不把 backup／restore 視為獨立產品模組或用戶故事，亦不以 Git commit 宣稱提供本機 canonical state 的恢復契約。

## 要先討論的問題

1. 上列用戶故事是否缺少任何內容管理、發行或公開閱讀的必要行為？不在範圍的故事應明確刪除。
2. 「內容類型與結構」是否與「內容工作流」同屬 Content Core，或需要獨立為 Schema Core？判斷依據是其資料生命週期與 migration 是否能由同一個 aggregate 邊界安全承擔。
3. Site Definition 是否應從 Content Core 獨立？判斷依據是 route、hierarchy 與 navigation 是否跨越多種內容與分類 owner。
4. Projection & Preview 是否須在第一版獨立於 Content Core？判斷依據是 preview／published snapshot／renderer input 是否需要穩定、可版本化的對外契約。
5. automation 是否需要受控 command API？若需要，必須先定義可執行命令、授權邊界、idempotency 與 audit 的 owner，而不是先建立通用事件匯流排或 global hook API。

## 本輪產出與非決策

本輪產出是可審閱的用戶故事清單與候選模組對照，不是 V3 架構決策。未在此核定 Post Type schema 的可變程度、migration 契約、revision／published projection 資料模型、預覽實作、renderer input、automation 擴充方式、API、SQL、登入、權限或發行流程。任何下一步都必須先由 Owner 針對上述故事與模組邊界作出明確選擇。
