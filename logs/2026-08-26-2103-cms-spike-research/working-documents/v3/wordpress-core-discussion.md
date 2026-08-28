# WordPress 與 CMS 的核心討論

## 「核心」有兩種層次

討論「核心」前，必須先分清兩種不同的邊界：**WordPress Runtime kernel** 是讓 WordPress 在每次 PHP 請求中啟動、處理請求並讓外掛介入的執行骨架；**CMS product core** 則是沒有它便無法安全建立、修改、發布與還原內容的業務能力。前者回答 WordPress 如何運作，後者回答本專案必須先交付什麼；兩者不可互相替代。

WordPress 官方文件將 Hooks 定義為外掛與 Theme 在預先定義位置介入 Core 的基礎，並以 Actions 與 Filters 區分行為執行與資料轉換；Template Hierarchy 則由 URL 相關查詢資訊決定載入哪個模板。這些是 Runtime kernel 的可驗證事實，而不是本專案功能範圍的預設答案。[Hooks](https://developer.wordpress.org/plugins/hooks/)｜[Template Hierarchy](https://developer.wordpress.org/themes/templates/template-hierarchy/)

## 對研究草稿的判讀

`draft_research.md` 成功涵蓋 WordPress 的執行環境、請求生命週期與外掛生命週期，尤其清楚呈現啟動、外掛載入、Hook、路由、查詢與渲染之間的關係。

草稿列出的項目並非都能作為平行、可獨立交付的核心單元：REST、Admin、CLI、Cron、快取、更新、國際化、隱私與多站台多屬跨切面能力、介面或部署／營運功能，應依產品需求加入。

本專案已確認 authoring canonical source 為本機關聯式 SQL CMS 與 local media，公開端採 GitHub Pages 靜態輸出；因此不應把 WordPress 的 PHP request-per-page runtime、Plugin 市集、登入、留言或遠端更新當作架構前提。WordPress 的外掛主檔發現與載入機制可作為理解 Runtime 的參考，但不構成本專案技術選型依據。[Plugin Basics](https://developer.wordpress.org/plugins/plugin-basics/)

## WordPress 的不可替代核心

- **啟動與設定**：在每次執行時建立可用 Runtime、載入環境設定與核心服務，讓後續請求處理有一致的起點。
- **Hook 擴充機制**：以具順序的 Actions 與 Filters 讓 Core、外掛與 Theme 在既定位置安全協作，而無須修改 Core。[官方 Hooks 文件](https://developer.wordpress.org/plugins/hooks/)
- **內容資料模型**：以 Post Type 為內容分類與查詢、公開渲染的共同語言，承載文章、頁面、修訂與附件等內容實體。[Custom Post Types](https://developer.wordpress.org/plugins/post-types/)
- **請求到渲染管線**：將 URL 與查詢狀態轉換為內容選取與模板載入，使單一 HTTP 請求能產生對應回應。[Template Hierarchy](https://developer.wordpress.org/themes/templates/template-hierarchy/)
- **持久化與資料演進**：保存網站與擴充功能的狀態，並提供可隨程式版本變更而安全演進的資料結構基礎。
- **身份與授權**：辨識目前使用者並以角色、能力與權限檢查限制可執行的操作，保護 CMS 管理邊界。

REST、Admin、CLI、Cron、快取、更新、國際化、隱私與多站台應視產品需求加上的介面或營運能力，而不是第七至第十五個平行核心。

## 本專案最核心的東西

- **內容模型與 schema 演進**：以本機關聯式 SQL 的 Post Type 一級模型定義欄位、關係、驗證與公開版型，並以明確 migration 契約演進 schema。
- **內容生命週期與 revision**：使內容能在建立、修改、審閱、發布與還原之間保留可追溯狀態，而非只覆寫目前文字。
- **SQL transaction／constraint／backup restore**：讓每次作者操作具原子性與資料完整性，並能從本機備份可靠還原 canonical state。
- **媒體 bytes 與引用一致性**：把 local media 的實體檔案與 SQL 中的內容引用視為同一個一致性邊界，避免孤兒檔或失效引用。
- **published projection 與靜態發行**：只讓公開 static output、Theme 與 release artifact 消費已發布 projection，並輸出供 GitHub Pages 發行的靜態網站；Publish 本身不執行 Git、build 或 deploy。

這五項直接對應已確認的本機 SQL canonical source、local media 與 GitHub Pages 靜態輸出；本專案不借用 WordPress 的 `wp_posts`、metadata EAV 或 global hook API。

## 接下來要確認的邊界

- **Post Type schema 的可變程度與 migration 契約**：哪些欄位與關係可由管理端調整，以及調整後如何驗證、遷移與回復，仍需 Owner 決定。
- **revision／published projection 的資料模型邊界**：revision 保存的粒度、發布快照與 projection 的關係及還原語意，仍是待討論的資料模型決策。
- **CMS automation 可擴充點是否需要受控 command API**：是否提供受限、可授權且可審計的自動化命令邊界，尚未核定實作方式。
