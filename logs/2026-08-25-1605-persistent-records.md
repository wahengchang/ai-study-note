# 建立持久專案紀錄機制

- **交付**：新增 `MEMORY.md` 作為跨工作階段的精選專案脈絡；大型工作改為各自使用 `logs/YYYY-MM-DD-HHmm-{slug}.md` 保存交付與驗證紀錄；結束前檢查已納入專案 AI 規則來源。
- **關鍵決策**：長期穩定資訊與單次工作交接資訊分開保存，避免 `MEMORY.md` 退化為流水帳；每個大型工作獨立成檔，避免集中式日誌的合併衝突與內容膨脹。
- **驗證**：已執行 `npm run check:ai-sync`；RuleSync 回報所有生成檔均為最新狀態。
- **相關變更**：`MEMORY.md`、`.rulesync/rules/CLAUDE.md`、`AGENTS.md`、`CLAUDE.md`。
