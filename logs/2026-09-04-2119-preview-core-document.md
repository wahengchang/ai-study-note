# Projection Preview Core Document

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **完成時間**：2026-09-04T21:19:32+08:00
- **狀態**：completed

## 交付

- `Projection.preview()` 以 entry subject 依 current/published pointer 選取 revision，再透過 `site-content/v1` 建立 immutable `preview-document/v1`。
- Preview 前後讀取 `persistence-canonical-state/v2`；digest 不同、pointer/revision/content 不可解決時都 fail closed，不回 partial document。
- raw full-page 與 Interactive Demo 的完整 source 都只出現在 `sandbox srcdoc`；Demo 未含 `allow-same-origin`，兩者保留 visible static fallback。
- public `renderer-input/v1` clean-cutover 為 structured Content，仍只讀 published selection。

## 關鍵決策

- Preview core 不重用 public `renderer-input/v1`，避免 current draft 進入 static builder 或 public Plugin renderer。

## 實際驗證

- `npm run typecheck`
- `node --import tsx --test tests/core/projection/preview.test.ts tests/core/projection/producer.test.ts`：5/5 通過。
- `npm run check`：192/192 通過。

## 已知限制／後續

- API-12 `POST /v1/preview` 仍依 API-09A read/history facade，不能在未滿足 Issue #289 dependencies 時建立 transport stub。
- 預設 Public Theme、route/media mapping、release validation 與 GitHub Pages artifact source 仍為後續交付。

## 相關 Branch／PR

- Branch：`feature/preview-core`
- PR：https://github.com/wahengchang/ai-study-note/pull/311
