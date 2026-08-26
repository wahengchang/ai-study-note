# CMS 專案宣言（JS/TS 全新打造版）

> 我們要從零打造一個全新的 CMS 平台，用 JavaScript／TypeScript 全端實作。
> 精神上參考 WordPress「核心穩定、擴充在邊緣」的哲學，但這是我們自己的程式碼、自己的 Hook 系統、自己的 Plugin/Theme 機制——不是架在別人的 WordPress PHP 之上。
> 核心保持穩定、簡單、可預期；能力透過清楚、受控、可相容的擴充點增加。

面向從零開始這個平台的架構師與開發同事：定義怎麼切 core / plugin / theme、怎麼設計 hook、怎麼處理資料與相容性、怎麼交付變更的共同準則。

> **先釐清一個容易誤會的地方**：這份文件裡「核心穩定」「核心不可碰」不是說你們不能開發或修改核心——核心正是這個專案最主要的開發標的，從第一行程式碼到後續每個版本都是你們自己寫、自己演進的。真正被限制的是：**一旦核心對外公開的東西（API、hook、資料結構）被 plugin 或其他模組開始依賴，就不能說改就改、沒版本化就直接打破。** 開發核心、擴充核心、重構核心，都是分內工作；破壞已經被依賴的契約而不打招呼，才是這份宣言要擋下的事。

## 目前 SSOT

`CMS-BASIC-CONTRACTS-V1` 的唯一現行 SSOT 是 [`contracts/README.md`](contracts/README.md)。本檔只保存長期工程原則與該指標；`logs/`、historical input 與 Spike evidence 僅供 provenance／驗證，不能覆蓋此契約。

## 真理

1. **核心是我們自己寫的最小可信任內核，沒有人替我們維護它。** 它必須無聊、穩定、被充分測試，不為每個需求長特例。
2. **選擇性或特定場域的能力走 Plugin / Theme + Hook API。** 所有安裝環境共通且長期必要的 domain logic 可以進 core；特定產品／產業邏輯不寫死進核心。
3. **公開的 API schema、hook 名稱、公開資料格式與 plugin manifest 格式，一旦有人依賴，就是要維護相容性的契約。** Core 的內部資料表結構不是 Plugin contract。
4. **內容資料庫比任何一次程式重寫都活得久。** 換掉整個後端框架，也不能讓內容變得無法讀取。
5. **慣例優先於設定。** 提供合理的預設 content model 與預設權限，複雜設定只在真正需要差異化時開放。
6. **明確邊界才有可組合性。** 每個 plugin 有自己的 namespace，不能互相碰對方的資料表，不能互相 monkey-patch。
7. **簡單是對未來工程師的責任。** 不為「未來可能要支援的功能」預先蓋一堆抽象框架。
8. **安全、可觀測、可回退是平台功能本身。** 認證授權、驗證、必要的審計紀錄、DB migration 與 plugin 版本檢查必須隨相關能力設計與交付，不能事後補強。

## 原則

**1. Core 提供什麼、不提供什麼**
Core 負責：content model 基礎（entity/內容型別系統）、auth & capability、hook/event bus、plugin loader、DB migration 引擎，以及需求成立後的版本化對外 API boundary。Core 不做：特定產業欄位、特定版面渲染、任何一個 plugin 該做的商業邏輯。新增 core 能力前，先確認它是「所有 plugin 都需要的地基」，不是「某個 plugin 想要的功能」。

**2. Hook / Event 系統是自己的契約，要設計成第一等公民**
用統一的 hook registry：action 廣播事件、不回傳值；filter 接收 immutable input、回傳 replacement、不可有副作用。每個 hook 要有 TypeScript type 定義 payload，並文件化觸發時機與順序；執行順序依 priority 再 Plugin ID 決定。Hook 一旦釋出給 plugin 開發者使用，改參數或拿掉前要走 deprecation 週期（至少一個 major version）。

**3. Plugin 是獨立套件，有清楚的 API 邊界**
Plugin 以本機 folder + manifest discovery、manual activation 的方式載入；其 source 可位於 monorepo 或獨立套件，但不得因位置而耦合進 core package。Plugin 只能透過 core 暴露的 API/hook 或 injected application service 存取資料，不能 import core 內部模組或直接連 DB。每個 plugin 有自己的資料表/collection namespace（前綴區隔），不能寫別的 plugin 的表。若要實際執行隔離，必須另行提供明確的 process/runtime sandbox；npm package 本身不是 sandbox。

**4. Schema / DB 變更走版本化 migration**
用 migration 工具管理 schema 版本；有持久化 state 的 plugin 各自擁有 migration 歷史。Plugin 停用/移除時，明確定義資料保留、匯出或清除策略；清除不可預設執行，必須經明確確認。Breaking schema change 一定先提供轉換腳本或相容層，不能讓資料在升級後憑空壞掉。

**5. 預設值與漸進複雜度**
全新安裝要有一組「開箱即用」的預設 content type 與預設角色權限，不用先讀文件才能開始用。進階功能（自訂 schema、外部整合）走顯性設定，不因為想要特殊行為就在 core 塞一堆 if-else。設定名稱對應使用者理解的概念（例如「誰可以發佈內容」），不暴露內部實作旗標。

**6. 邊界處清楚失敗**
權限不足、資料驗證失敗、plugin 版本不相容，直接擋下並回傳結構化錯誤（code + message + 可行動建議），不吞錯誤、不悄悄用預設值頂替。API 錯誤格式全站統一，前端與 plugin 都能穩定處理。Log 要能定位問題，但絕不紀錄密碼、token、使用者個資明碼。

**7. 小步上線，完整收尾**
用最小垂直切片交付：一個功能的 API、hook、migration、測試、文件同時完成，不留半成品。新舊 API 版本並存只在有期限的過渡期內，過期後移除舊版本。部署走 CI/CD：測試與 migration validation 通過才允許上線；應用程式必須可回退。資料庫 migration 不預設有安全的 down，應採 expand/contract 或 forward repair；破壞性變更執行前必須完成可驗證的備份或 impact report。

## 規則

1. 不把 plugin 才需要的功能塞進 core。
2. Plugin 不得 import core 內部模組、不得直接連 DB、不得存取其他 plugin 的資料表。
3. 不改動已發布的 API schema、hook payload、公開資料格式或 plugin manifest，除非同時提供版本化與遷移路徑；Core 內部資料表不可被當成公開 contract。
4. 一張表/collection 只有一個 owner（core 或某個 plugin），別人只能經 API 存取。
5. Cache、索引、衍生資料永遠可重建，不可成為唯一資料來源。
6. Migration 執行前先跑驗證與 dry-run/impact check，不確定就不執行。
7. 不用 try/catch 吞掉錯誤裝作成功；失敗要往外拋出結構化錯誤。
8. 新增 hook、API、plugin 設定前，必須先定義 owner、payload type、權限邊界、測試案例。
9. 不用一堆布林 config 疊加控制行為分支；需要分支就用具名 strategy/mode 表達。
10. 適用的安全檢查（auth、驗證、對外入口的 rate limit）、migration、監控不能排在功能完成之後才做。
11. Build/deploy 腳本不能有沒寫進文件的副作用（例如偷偷改 production 資料）。
12. 沒有淘汰期限的相容層（舊 API alias、雙寫欄位）不能無限期留著。

## 工作方法

1. **先定義 contract**：這個功能要暴露什麼 API/hook/資料結構，寫成 TypeScript type 或 OpenAPI/GraphQL schema。
2. **設計最小垂直切片**：API + migration + 測試 + 文件一次做完，不分批留尾巴。
3. **用真實情境測試**：正常路徑、權限不足、資料衝突、plugin 停用時的行為都要測；測試盯著對外契約，不測內部實作細節。
4. **完整 cutover**：舊版本 API/hook 移除前，先確認所有內部呼叫端都換完。
5. **保持可回退或可修復。** 每次上線前能講清楚改了什麼、誰負責、怎麼監控、怎麼緊急關閉；應用程式可回退，資料庫則依 migration 策略安全地前移修復或回復資料。
