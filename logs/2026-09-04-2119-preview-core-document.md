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

## 複審修正（2026-09-05）

- `sandbox` 空值會連 script 一起禁止，Interactive Demo 的 source 永遠不會執行，preview 等同 static fallback。demo iframe 改為 `sandbox="allow-scripts"`；不含 `allow-same-origin`，frame 仍在 opaque origin。raw article preview 維持全限制 sandbox。
- demo sandbox document 的 `<style>`／`<script>` 是 raw text element：css／javascript 內的 `</` 會提前關閉元素並截斷 source，違反「完整 source 進入 sandbox document」。組裝前以 `<\/` 保留原意。
- demo 的 `aria-label`／`title` 原本用 block index 編號，會跳號；改以 demo 序號。
- `producePublishedRendererInput()` 與 `preview()` 的 revision→structured content 驗證鏈收斂為 `resolveContent()`。
- `renderer-input/v1` 的 `entries[].content` 型別已收斂為 `site-content/v1`，但 Renderer 對 artifact bytes 只做 `as RendererInputV1` cast，未驗證 content shape；既有 fixture `{ title }` 即可通過並流入 Theme／Plugin callback。Renderer 依 owner 矩陣不可 import `core/content`，故在 boundary 重驗同一 shape，不符即 `INVALID_RENDERER_INPUT`。

### 待 Owner 決策

- `contracts/README.md` 對 Interactive Demo 只約束「不含 `allow-same-origin`」，未表述 sandbox 是否須允許 script；本次以「Interactive Demo 必須可互動」為前提加 `allow-scripts`。若要成為長期約束，需在 contract 明文化。
- CMS raw article preview 目前不執行 script。公開端的 Owner 核准 full-page privilege 若也涵蓋 script，preview 的擬真度與此不一致，需另行決策。

### 複審驗證

- `npm run check`：195/195 通過（新增 3 個 test；移除 Renderer 的 content 驗證後新 test 會失敗）。
