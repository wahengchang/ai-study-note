# 進階版 Theme 與 Plugin 討論

## 交付

- 新增 `docs/v3/advanced-user-stories-and-core-modules-discussion.md`。
- 文件列出 27 條進階候選用戶故事：Theme 建立、資源、模板、預覽與切換；Plugin manifest、生命週期、migration、治理與診斷；以及受控 automation command。
- 文件提出三個候選進階核心：Theme System、Plugin System、Controlled Command API。

## 關鍵界線

- 進階版不修改 Basic 的 30 條用戶故事、單一內容管理者、本機 SQL canonical source、local media、published projection 或 GitHub Pages 靜態發行邊界。
- Theme System 擁有 Theme 模板與前端資源 source bytes；Site Definition 擁有唯一啟用 Theme 的 site setting；Projection & Preview 擁有候選 Theme 隔離預覽；Build, Validation & Release 驗證並交付 Theme 資源 artifact。
- Plugin System 不假設 WordPress PHP runtime、global hook API、外掛市集、遠端更新或任意 SQL 存取。已啟用 Plugin 升級失敗時保留既有版本與 capabilities；首次啟用失敗時才保持停用。
- Plugin 主動停用或移除 capabilities 時，若仍有內容引用則必須阻止操作。Plugin 是否可宣告 Content Type／欄位、隔離策略、Controlled Command API 的呼叫者，以及變更如何進入發布，仍待討論。

## 驗證

- 完整讀取新文件，確認 Theme 與 Plugin 的故事、候選核心與待決邊界均存在。
- Node 結構檢查確認 27 條用戶故事、Theme 資源、唯一啟用 Theme、Plugin 升級回退、引用阻擋與 Basic 的 Theme 邊界存在，exit code `0`。

## Claude 審查

- Claude Opus 以唯讀方式首輪審查提出 Theme 路由與資源 ownership、Theme 預覽／啟用狀態、Plugin 退場與 migration、artifact 溯源、單一管理者語意與候選核心過度拆分等 finding。
- 修訂後，Claude 對 F-001、F-002、F-003、F-004、F-005、F-006、F-017 全數標記 `FIX_VERIFIED`，最終為 `CONSENSUS_ACCEPTED`。

## 限制與後續

- 本文件是討論輸入，不是架構決策或實作規格。
- 下一步是由 Owner 確認 Theme System 與 Plugin System 是否都要作為獨立進階核心，才可深化 contract 與生命週期。
