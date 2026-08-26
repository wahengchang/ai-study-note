# V2 核心模組交接

本文件是下一個工作階段的**暫存交接與溝通輸入**，不是 canonical 架構規格；文件定位依 [docs/README.md](../README.md)，任何決策須經 Owner 明確核准才生效。

## 目前目標

先定義整個系統的核心模組，再逐模組完成系統設計；本輪不實作、不建立 v2 machine-readable API、SQL 或 fixtures，也不重啟既有細節訪談。

## 既有材料索引

### V1 架構討論（只供參考，不自動承接）

- [README.md](../architecture-v1/2026-08-25-1758-sql-cms/README.md)：V1 的範圍、定位與文件索引。
- [cms.md](../architecture-v1/2026-08-25-1758-sql-cms/cms.md)：V1 CMS 的內容模型與生命週期討論。
- [api.md](../architecture-v1/2026-08-25-1758-sql-cms/api.md)：V1 localhost API 邊界討論。
- [database.md](../architecture-v1/2026-08-25-1758-sql-cms/database.md)：V1 SQLite ownership、migration 與備份邊界討論。
- [media.md](../architecture-v1/2026-08-25-1758-sql-cms/media.md)：V1 media storage、恢復與 retention 討論。
- [decision-sources.md](../architecture-v1/2026-08-25-1758-sql-cms/decision-sources.md)：V1 借鑑的 WordPress 等一手來源索引。

### 本輪唯讀研究 artifact

- [agent://V1ArchitectureScout](agent://V1ArchitectureScout)：V1 架構脈絡盤點（session artifact，若不可用須重新查證官方來源）。
- [agent://WPCMSLifecycle](agent://WPCMSLifecycle)：WordPress CMS lifecycle 研究（session artifact，若不可用須重新查證官方來源）。
- [agent://WPPublicLifecycle](agent://WPPublicLifecycle)：WordPress 公開頁 lifecycle 研究（session artifact，若不可用須重新查證官方來源）。
- [agent://WPUsefulMechanisms](agent://WPUsefulMechanisms)：WordPress 可借鑑機制研究（session artifact，若不可用須重新查證官方來源）。

## 本輪已確認

- V2 現階段是確定、可溝通的 RFC；僅在 Owner 核准後生效。machine-readable API、SQL、fixtures 等細節留待下一輪。
- V1 只作參考，不自動承接成 V2 決策。
- WordPress CMS 並非單一事件系統：PHP hooks、React/DOM events、`@wordpress/data` store／selector／resolver／subscription 與 REST persistence 屬不同層；細節見本輪研究 artifact。
- CMS client/data architecture 暫不選型；下一輪 spike 保留分層 command/state、WordPress-like registry/store、全域 event bus 三個候選。
- autosave 的產品方向是獨立恢復緩衝，不等同正式 revision；多分頁 lock/lease 等互動細節延後，不將先前暫定偏好寫成已核准規格。
- 公開頁採 build-time complete HTML 加 progressive enhancement；公開頁不依賴 production API、DB 或 auth，也不寫入 authoring state。
- builder 要直接讀 SQLite、版本化 projection 或 Markdown export 尚未決定，交由 renderer spike。
- extension/hook 邊界尚未回答；不得代替 Owner 選定。

## 建議核心模組骨架（待 Owner 確認）

此七模組是提案，不是已核准決策。

| Plane | 模組 | 責任 | 不負責 |
|---|---|---|---|
| Authoring | M1 CMS Workspace | 管理介面與編輯工作區 | domain rules |
| Authoring | M2 Content Core | 內容 schema、Entry、Taxonomy、revision、Save-Publish lifecycle | HTML 決策 |
| Authoring | M3 Media Library | media bytes、metadata、reference、retention | 版型決策 |
| Authoring | M4 Site Definition | route、slug、hierarchy、navigation、site settings | render |
| Publication | M5 Projection & Preview | current、published、preview 與 projection contract | build、deploy |
| Publication | M6 Static Rendering & Public UI | template/theme、GFM-to-HTML、public routes、progressive enhancement | authoring state 寫入 |
| Delivery | M7 Build, Validation & Release | deterministic build、validation、artifact、GitHub Pages delivery | 內容語意變更 |

以下屬跨模組支撐能力，待模組責任確認後才設計：Local API/application services、SQLite/migrations/backup、events/extensions、security、accessibility/i18n、observability。

## 下一個 session 的工作順序

1. 先以**單一問題**請 Owner 確認、合併或拆分上述七模組骨架。
2. 模組骨架未確認前，不得開始 autosave、lock、store、hook、SQL 或 API 等細節。
3. 模組確認後，逐一以相同格式完成系統設計：目的、owner state、輸入／輸出、主要生命週期、對外契約、依賴、不可跨越的邊界、失敗類型、需要 spike 的未知。
4. 建議依賴順序為 `M2 → M4 → M3 → M5 → M6 → M1 → M7`；此順序同樣待 Owner 先確認模組骨架。

## Suggested Skills

下一個 agent 應依序透過 Skill tool 讀取：

1. `grill-me`：只訪談模組邊界與模組級責任；Owner 明確延後的互動細節不得提前追問。
2. `x-say`：用樹狀圖呈現模組階層、用依賴圖呈現模組資料流、用表格比較責任與邊界。
3. `x-discovery`：模組骨架確認後盤點每個模組的資料流與工作表；不得將 `draft/`、`dev-hub-*`、`project-*` 內容轉成網站規格。
4. `x-plan-eng`：只在單一模組的產品邊界已確認後，將該模組深化為可執行工程設計；若仍有產品、設計或 DevEx 決策，改由 `x-plan` 路由，不得直接補猜。

## 注意事項

- 本輪未修改既有 working tree 內容，未執行實作或驗證；本文件是唯一新增的暫存交接文件。
- 先前兩次互動問答均被使用者取消；extension/hook 選項與七模組提案均不得視為已選結果。
- 不加入對話逐字稿、研究全文、V1 決策全文、Git 狀態或與接續工作無關的歷史。
