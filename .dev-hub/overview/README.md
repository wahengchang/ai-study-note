# Dev Hub Overview v2

## 重建

1. `config.json` 只填 `github_repository`；Issue 與 PR URL 必須是該 repository 衍生的完整 URL。
2. 以同一 `captured_at` 更新 `issues.json` 的 Issue、Cycle、Work Item、Work Group snapshot，以及 `links.json` 唯一 Issue↔Dev Hub join。
3. `Cycle.path` 固定為 `.dev-hub/active/<cycle_id>`；active link 的所有 recursive Issue dependency 必須在 snapshot 中。
4. 執行 `npm run dev-hub:overview:check`，再執行一次 `npm run dev-hub:overview` 建立 `index.html`。

renderer 不讀網路、不接受其他 CLI input，且拒絕覆寫 `index.html`。複製到另一 repository 時，只改 config 與兩個 JSON snapshot；URL 由驗證後的 repository identity 決定。
