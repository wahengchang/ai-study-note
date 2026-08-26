# 進階版：用戶故事與核心模組討論

## 定位與邊界

進階版建立在 [Basic 用戶故事與核心模組討論](user-stories-and-core-modules-discussion.md) 之上，只討論 Basic 已成立後才值得加入的能力。它不修改 Basic 的 30 條用戶故事、單一內容管理者、local SQL canonical source、local media、published projection 或 GitHub Pages 靜態發行邊界。

本文件不是實作規格，也不核定 Theme、Plugin、多人協作、登入、遠端服務或 Plugin 市集。Theme 作者、Plugin 作者與 automation 使用者都是同一位本機內容管理者的操作情境，不代表帳號、多人角色或權限模型；command 的限制是 Plugin manifest 宣告的 capability scope，不是使用者授權。文件的目的是先列出進階能力的候選用戶故事，再判斷哪些需要成為獨立核心，哪些只是既有模組的延伸。

WordPress 的 Hooks 與 Template Hierarchy 可作為理解外掛擴充和版型選擇的參考，但不代表本系統採用 PHP request-per-page runtime、global hook API、外掛市集或遠端更新。[Hooks](https://developer.wordpress.org/plugins/hooks/)｜[Template Hierarchy](https://developer.wordpress.org/themes/templates/template-hierarchy/)

## 進階用戶故事：Theme

### Theme 作者：設計系統與模板

- 身為 Theme 作者，我要建立可版本化的 Theme，定義色彩、字體、版面、元件與前端資源，讓同一份 published projection 可有一致的視覺呈現。
- 身為 Theme 作者，我要讓 Theme System 擁有 Theme 的 CSS、字體、JavaScript 與其他前端資源 bytes，讓 Build 能驗證並把已選 Theme 的完整資源複製到 static artifact，而不混入內容媒體。
- 身為 Theme 作者，我要為內容類型、單篇內容、分類／標籤彙整與站點頁面定義呈現模板，讓公開頁能按內容語意選取正確版型，而不定義或變更 Site Definition 擁有的公開路由、slug 與階層。
- 身為 Theme 作者，我要建立可重用的 layout、section 與元件組合，讓版型變更不需要複製整份頁面結構。
- 身為 Theme 作者，我要宣告 Theme 需要的 projection 欄位與支援的內容類型，讓不相容的 Theme 無法被選為公開渲染來源。
- 身為 Theme 作者，我要在啟用 Theme 前檢查模板、資源與 projection contract 相容性，讓不完整的 Theme 不會產生壞的 static artifact。

### 內容管理者：Theme 使用與預覽

- 身為內容管理者，我要在不改變目前公開網站的前提下預覽候選 Theme，讓我可比較其首頁、單篇、彙整頁與媒體呈現。
- 身為內容管理者，我要切換已驗證的 Theme，讓後續靜態發行使用新的公開呈現規則。
- 身為內容管理者，我要將一個已驗證 Theme 設為唯一的啟用 Theme；此選擇由 Site Definition 的 site settings 保存，而候選 Theme 的隔離預覽由 Projection & Preview 處理，兩者都不得改變目前公開 Theme。
- 身為內容管理者，我要在 Theme 切換被拒絕時看見缺少的模板、資源或 projection capability，讓我知道應修正 Theme 還是內容模型。
- 身為內容管理者，我要在靜態發行前確認 selected Theme 的前端資源已由 Build, Validation & Release 驗證並納入 artifact，讓公開讀者不會因 CSS、字體或 JavaScript 遺漏而得到不完整頁面。
- 身為公開讀者，我要在同一個 Theme 版本中得到一致、可存取且完整的靜態 HTML、CSS 與媒體體驗。

## 進階用戶故事：Plugin 與受控擴充

### Plugin 作者：封裝與生命週期

- 身為 Plugin 作者，我要以明確 manifest 封裝本機 Plugin 的名稱、版本、相容性、提供能力與資料需求，讓系統可在載入前檢查是否可安全啟用。
- 身為 Plugin 作者，我要宣告 Plugin 是否提供內容欄位、內容類型、分類、投影轉換、Theme 元件或受控 command，讓擴充範圍可被檢視與限制。
- 身為 Plugin 作者，我要在安裝、首次啟用、升級、主動停用與移除時執行受控生命週期步驟，讓 Plugin 資料與註冊能力不會留下未知狀態。
- 身為 Plugin 作者，我要為 Plugin 的資料演進宣告相容性與 migration 需求，讓升級不會靜默破壞既有 canonical state。
- 身為 Plugin 作者，我要使任何會寫入 canonical state 的 migration 具可驗證的全有全無結果：已啟用 Plugin 升級失敗時，系統必須保留升級前已啟用的版本與 capabilities；首次啟用失敗時，Plugin 必須保持停用且 canonical state 不變，避免 Basic 沒有 backup／restore 契約時留下部分遷移。
- 身為 Plugin 作者，我要在 Plugin 失敗時取得可診斷的錯誤，而不是讓整個 CMS、preview 或靜態建置在沒有歸因的情況下失效。

### 內容管理者：啟用與治理

- 身為內容管理者，我要檢視 Plugin 的 manifest、能力、相容性與將受影響的內容／Theme／發行流程，讓我能在啟用前判斷風險。
- 身為內容管理者，我要啟用或停用已驗證的本機 Plugin，讓功能可加入或移除，而不需要改動 Core。
- 身為內容管理者，我要在主動停用或移除 Plugin、且此操作會移除其 capabilities 前看見仍引用其欄位、內容類型、分類、投影轉換或 Theme 元件的內容；只要仍有引用，系統必須阻止操作並要求我先遷移或封存受影響內容。
- 身為內容管理者，我要在 Plugin 提供的 schema、projection 或 Theme capability 不相容時阻止啟用或發行，讓公開 output 保持可用。
- 身為內容管理者，我要查看 Plugin 造成的命令、資料變更與失敗紀錄，讓單一管理者仍能追溯擴充的作用。
- 身為內容管理者，我要檢視每份已交付 artifact 使用的 Theme 與已啟用 Plugin 版本，讓重新交付既有 artifact 時能辨識其公開呈現來源，而不把它誤解為 canonical state 還原。

### Automation 使用者：受控 command

- 身為 automation 使用者，我要呼叫明確註冊、具輸入輸出契約且可追溯的 command，讓自動化能完成允許的內容或發行操作。
- 身為內容管理者，我要以 Plugin manifest 宣告的 capability scope 限制 Plugin 或 automation 可呼叫的 command，讓擴充不能任意存取 SQL、local media 或公開發行環境。
- 身為內容管理者，我要使重複 command 不會重複產生非預期內容、媒體或發行副作用，讓可重試操作具可理解結果。

## 候選進階核心與 Basic 的關係

| 候選核心 | 主要承接故事 | 必須擁有的責任 | 明確不負責 |
|---|---|---|---|
| Theme System | Theme 建立、相容性、預覽、切換 | Theme manifest、Theme 模板與前端資源 bytes、僅呈現層的模板選取、design tokens、Theme-to-projection compatibility | canonical content 寫入、公開路由／slug／階層定義、artifact 交付、啟用 Theme 的 site setting |
| Plugin System | Plugin manifest、安裝、啟用、升級、停用、移除、相容性、能力宣告、migration 與診斷 | 本機 Plugin registry、生命週期狀態、capability registry、衝突與相容性決策、migration gate、升級失敗回到既有版本、error attribution、Plugin operation log | 任意第三方下載、遠端更新、global hook dispatch |
| Controlled Command API | automation command、輸入輸出契約、限制、追溯與重試 | command registry、manifest capability scope、idempotency、operation audit | 取代既有 application service 或暴露任意 SQL |

Site Definition 保持公開路由、slug、階層與唯一啟用 Theme 的 site setting owner；Theme System 只提供呈現層模板、設計規則與 Theme 資源 source bytes，Projection & Preview 擁有候選 Theme 的隔離預覽，Static Rendering & Public UI 消費已選 Theme 規則與資源產生 HTML。Build, Validation & Release 驗證並在 artifact 中交付 Theme 資源 bytes。Theme System 消費 Projection & Preview 擁有的 versioned renderer input contract。Plugin 只能經由 Plugin System 的 capability registry 與 Controlled Command API 介入；它不得改寫 Core state owner，也不得建立未受控的 global hook API。Build, Validation & Release 擁有 artifact 的 Theme／Plugin 版本溯源與重新交付。

## 必須先決定的邊界

1. **Theme 可否自訂投影資料？** Theme 若只能消費既有 versioned contract，邊界最穩定；若 Theme 可要求新欄位，必須由 Content Core／Projection & Preview 明確核定後才能加入。
2. **Plugin 能否定義 Content Type 與欄位？** 這會影響 schema migration、內容類型 ownership 與卸載語意；應先決定是允許、只允許內建、或只提供受限宣告。
3. **Plugin migration 的失敗語意是什麼？** 在 Basic 沒有 backup／restore 契約的前提下，已啟用 Plugin 的升級失敗必須回到升級前版本與 capabilities；首次啟用失敗才保持停用。任何會寫入 canonical state 的 migration 都必須有全有全無結果。這個條件先於 Plugin Registry 定案。
4. **Plugin 的隔離強度是什麼？** 本機 trusted package、受限 process、或另行的 sandbox 各有開發成本與失敗隔離差異；不能假裝只有 manifest 就足夠。
5. **Controlled Command API 的呼叫者是誰？** Basic 沒有多人帳號；需決定它只供本機 CLI／腳本、CMS UI 共用，還是未來才擴大。
6. **Theme／Plugin 變更如何進入發布？** 應確認它們是發布內容前必須驗證的 input，還是只有 Build, Validation & Release 可選擇的 artifact input。
7. **哪些能力不屬於進階版？** 多人協作、登入與權限、Plugin 市集、遠端更新、公開 runtime API、評論與雲端資料庫都必須逐項明確選擇，不能因為有 Plugin 而自動帶入。

## 討論順序

先決定 Theme System 與 Plugin System 是否都應成為獨立進階核心；接著依序處理 Theme-to-projection contract、Plugin capability 宣告與 Controlled Command API。只有這三個邊界穩定後，才討論 Plugin migration、失敗隔離與診斷資料模型。
