# Structured Content Read Model

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **完成時間**：2026-09-04T21:12:52+08:00
- **狀態**：completed

## 交付

- 新增 `core/content` 的唯一 public seam：`site-content/v1` canonical revision bytes 轉為 immutable `StructuredContent`。
- 支援 structured article、由 composition 明確核准 schema identity 的 raw full-page，以及保留 exact Plugin identity、完整 HTML/CSS/JS source 與 static fallback 的 Interactive Demo。
- 無效 digest、非 canonical bytes、未知 block、缺欄位與未核准 raw full-page 一律 fail closed，沒有 partial output 或 canonical mutation。

## 關鍵決策

- Owner 選擇先完成 typed Content read model，再接續 Preview；raw full-page 核准清單由 composition 注入，不把 operator policy 寫入 revision source。

## 實際驗證

- `npm run typecheck`
- `node --import tsx --test tests/core/content/structured-read-model.test.ts`：5/5 通過。
- `npm run check`：189/189 通過。

## 已知限制／後續

- Preview core 與 API-12 transport 尚未實作；前者可消費此 seam，後者仍需其 Issue 依賴。
- 預設 Public Theme、route/media artifact mapping、release validation 與 GitHub Pages artifact source 依 Owner 已確認決策後續實作。

## 相關 Branch／PR

- Branch：`feature/preview-public-ui-release`
- PR：https://github.com/wahengchang/ai-study-note/pull/310
