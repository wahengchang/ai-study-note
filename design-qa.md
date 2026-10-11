# CMS 視覺實作 QA

**final result: passed**

## 比對證據

以下截圖是本機暫存稽核產物；`draft_*/` 已忽略，不隨 PR 提交。此文件保留比對條件、結論與驗證結果。

選定的 source visual truth 是 `draft_cms-ux-redesign_2026-10-11/concept-2-article-edit.png`、`concept-2-categories.png`、`concept-2-content-type-edit.png`（各 1487 × 1058 px）。實作畫面是同資料狀態的 `draft_cms-ux-redesign_2026-10-11/after/14-article-edit-desktop.png`（1440 × 1546 px）、`15-category-term-edit-desktop.png`（1440 × 1130 px）與 `06-content-type-edit-desktop.png`（1440 × 1699 px）。瀏覽器 CSS viewport 為 1440 × 900，擷取全頁；來源稿是約 1487 px 寬的靜態視覺稿，沒有可對應的 CSS viewport 或 device pixel ratio，因此以主內容區、側欄寬度與可見資訊層級比較，不以逐像素位置判斷。實作截圖為 1× CSS pixel。

同一次檢視中並列開啟來源稿與實作截圖，比較完整構圖；文章表單左欄／右欄、taxonomy 表格／term 面板、Builder 群組／欄位卡片均在原尺寸檢視，文字與控制可辨，不需另裁區域。窄螢幕補充證據為 `after/02-articles-mobile.png`（390 × 968 px，全頁）與 `after/14-article-edit-mobile.png`，CSS viewport 390 × 844、1×。13 個指定路由的桌面與手機截圖均存於 `after/`。

## 比對結果

| 面向 | 結果 |
| --- | --- |
| 字體與文字 | 使用系統字體與 `Noto Sans TC` fallback；標題、label、表格資訊層級清楚。稿中的文章標題作大標，實作把「編輯內容」作主標題、內容標題作副標，以穩定的頁面語意與焦點移動為準。 |
| 間距與版面 | 中性側欄、主區塊及雙欄編輯器與方向 2 一致。真實 Builder 的群組包含欄位，因此採巢狀卡片並顯示完整設定，頁面比生成稿長；這是資料契約造成的預期差異。 |
| 顏色與狀態 | 藍色主要操作／選中導覽、低彩度表面、成功／錯誤訊息具一致語意；公開發布暫停訊息在內容頁清楚可見。 |
| 圖像與圖示 | 導覽使用同一 Feather icon 套件。實作以真實媒體縮圖呈現綠色示範封面；稿中的合成圖案與真實 asset 不同，保留真實資料。 |
| 文案與功能 | 生成稿中不存在於 API 的控制未加入。內容工作台、term 面板、媒體引用與 Builder 設定採可運作的現行合約。 |

## 修正紀錄

1. 首輪桌面比對發現文章編輯主區與右欄缺少明確邊界、分類設定與列表缺少卡片層級、Builder 欄位過於縱向。修正 `apps/cms/tokens.css` 的編輯器、taxonomy 與 Builder 卡片和欄位 grid，再以同 viewport 重拍三頁；修正後區塊層級清楚，控制未裁切。
2. 首輪手機檢查發現搜尋欄後方有過大空白，原因是第一個 toolbar label 的 flex basis 未由手機規則覆寫。修正後的 `after/02-articles-mobile.png` 顯示連續排列的搜尋、狀態與分類欄位。
3. 第二輪文章比對發現右欄每個 taxonomy 的「新增 term」表單常駐，造成掃讀與捲動負擔。改為可展開的 `<details>`，最終 `after/14-article-edit-desktop.png` 保留選取與建立能力，且與方向 2 的資訊密度更接近。

目前沒有待修的 P0／P1／P2 視覺問題。生成稿的假媒體圖案、錯誤的 Builder 群組／欄位關係與額外控制已依真實 API 校正；細部像素與示意文字差異屬預期。

## 功能與無障礙驗證

瀏覽器實際驗證 13 個路由在 1440px 與 390px 顯示；390px 全部 `document.documentElement.scrollWidth === innerWidth`。檢查主標題、label、導覽目前位置、選單開啟焦點與 `Escape` 返回焦點、status／alert、刪除確認、空結果、必填驗證及 409 衝突。操作內容建立／儲存、搜尋與篩選保留、Builder 群組移動與儲存、term 建立、媒體匯入進度和媒體引用鎖定。瀏覽器 error／warn console 為空。`npm run check`：202 passed，0 failed。

沒有公開站 Preview、Build 或 Release 接線；此限制已在內容工作台與文件標明。
