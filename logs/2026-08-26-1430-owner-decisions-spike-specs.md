# Owner 決策與 Spike 規格

- **完成時間**：2026-08-26 14:30（本地時間）
- **交付**：建立 `project-2026-08-26-1425/project.md`，固定 Q-001–Q-012 Owner 決策、SP-001–SP-005 Basic P0 Spike 與 SP-A06 Interactive Demo Plugin 原型的可執行規格。
- **關鍵決策**：Basic 七模組為責任 taxonomy；Site Definition、結構化 block editor、raw article code、Theme/Plugin 信任與 build-input 邊界依 Owner 決策明列。Q-006 取代 V1 的 GFM-only/raw HTML 拒絕候選；Plugin 停用規則取代非 canonical Advanced story 的有引用即阻止停用規則。
- **實際驗證**：session-local draft 與寫入後 `project.md` 均通過結構檢查；新 project 目錄只含 `project.md`。本輪未執行 Spike。
- **已知限制／後續**：含 raw HTML/CSS/JS full-page code 的公開頁預設允許其 runtime 行為破壞完整靜態閱讀；靜態 fallback 仍為必填。後續依 SP-001 → SP-002 → SP-003/SP-004 → SP-005 → SP-A06 執行，任何 `BLOCKED_*` 結果停止下游。

## 交談確認

- Owner 已於交付後確認「good」與完成狀態；未提出範圍、決策或後續執行變更。
