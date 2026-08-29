---
root: true
targets:
  - '*'
globs:
  - '**/*'
---
# AI Study Note Reset — 專案設定

此專案從零打造 JavaScript／TypeScript CMS 平台，並由 published projection 產生 AI 學習筆記的公開靜態網站。
- 將 `draft/`、`source-drafts/`、`dev-hub-*/` 與 `project-*/` handoff artifact 視為唯讀歷史參考資料。不得編輯、刪除、將其發布為網站內容，或在未經新的 Owner 決策下從中抽取需求。

## 專案持久紀錄

- `MEMORY.md` 保存跨工作階段仍有效的專案脈絡。開始涉及既有決策、架構或工作方式的工作前先閱讀；僅記錄已確認且具長期價值的資訊。
- 任何 CMS／renderer 規劃、issue 或實作前必須閱讀 `contracts/README.md`。該檔是已核准範圍與設計約束的唯一 contract；程式碼與對應測試是已實作行為的 SSOT。已核准範圍或約束的變更只改該檔。
- 每個大型工作使用獨立的 `logs/YYYY-MM-DD-HHmm-{slug}.md` 檔案，`date-time` 採本地完成時間、`slug` 採描述工作的英文 kebab-case。完成、準備結束前，檢視是否有長期資訊應更新至 `MEMORY.md`，或有交付、驗證、限制、風險應新增工作紀錄；若皆無，無須新增形式化紀錄。
- 「大型工作」指跨多個檔案或元件、改變使用者可見行為／專案架構，或需要非直觀交接資訊的工作。每份紀錄列出交付、關鍵決策（如有）、實際驗證、已知限制／後續（如有）與相關變更。

### Dev Hub 大型工作流程

- 只有上述定義的「大型工作」必須在執行前閱讀並遵循 `docs/dev-hub-workflow.md`；純問答、小型修正與唯讀查詢不建立 Cycle。該檔是 `.dev-hub/` 狀態流程的唯一操作入口。
- `.dev-hub/active/` 只保存進行中的 Cycle 協作狀態。Cycle 完成時整包刪除，永久摘要改寫入上述 `logs/` 工作紀錄；因此查詢已完成工作一律看 `logs/`，不看 `.dev-hub/`。

## 專案文件

修改程式碼前：

1. 閱讀 `docs/INDEX.md`。
2. 只跟隨與當前工作相關的任務或 domain 路徑。
3. 在作出假設前，閱讀路徑列出的程式入口與相關測試。

程式碼與對應測試是已實作行為的 SSOT；已核准範圍與設計約束以 `contracts/README.md` 為準。文件不得把規劃誤寫成現況。

文件、決策背景、ASCII 圖與資料夾 `README.md` 的判斷與維護，必須遵循 `docs/INDEX.md` 的「文件與圖表原則」及「維護規則」。程式碼變更行為、邊界、資料流、公開介面、維運方式或既有程序時，必須在同一變更更新受影響的文件與鄰近 ASCII flow 註解。

## 開發溝通語言

- 開發溝通一律使用臺灣繁體中文（`zh-TW`），包括 AI 回覆、計畫、程式碼註解、提交訊息與文件；程式碼識別字與既有外部 API／產品名稱除外。

## OMP 任務路由

- 當平台 delegation policy 允許且確有必要委派時，依工作類型選擇最精確的 agent：唯讀研究使用 `scout` 或 `librarian`、UI/UX 使用 `designer`、程式碼審查使用 `reviewer`、安全審查使用 `security-reviewer`、機械性工作使用 `sonic`、實作使用 `task`。
- 專案本地模型路由定義於 `.omp/config.yml`；當已設定的 role 適合工作時，不得臨時覆寫 agent 的模型。
- 主 session 不會依任務語意自行切換模型；工作需要不同模型能力時，使用綁定 role 的 subagent。
- 涉及核心組件（core module）的工作，必須在實作前的計畫階段安排至少兩個不同角色的 agent 交叉審查，以取得第二意見；可多輪交換意見至達成共識，並將結論納入實作計畫。
