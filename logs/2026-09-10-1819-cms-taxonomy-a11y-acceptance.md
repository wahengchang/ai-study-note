# WI-067：CMS taxonomy a11y acceptance hardening

- **完成時間**：2026-09-10T18:19:00+08:00
- **狀態**：completed

## 交付

- Taxonomy create form 以 `aria-busy` 和 polite live region 公告 in-flight 狀態；建立成功後，taxonomy detail 顯示 polite success status。
- `TAXONOMY_CONFLICT` 的 Authoring API 安全 remediation 與 Taxonomy ID field error 關聯；其他 API 失敗保持 form-level safe alert。
- 真實 `startCmsRuntime` Chromium journey 覆蓋鍵盤 list → new → detail、skip link、每次 route heading focus、loading、empty、invalid、duplicate、success、missing-detail safe error 與 375px 寬度。

## 關鍵決策

- 成功訊息以同一次 SPA navigation 的暫態 state 傳至既有 detail route；不新增 query、history route 或 CMS document route。
- 沿用既有 API schema 驗證與 `CmsApiError` remediation，不新增 client-side API error parser 或 fallback。

## 實際驗證

- `npm run typecheck` 通過。
- `npm run cms:build` 通過。
- `npm run check:architecture` 通過。
- `node --import tsx --test-concurrency=1 --test tests/apps/cms/runtime-browser-gate.test.ts`：5/5 通過。

## 已知限制／後續

- 無。

## 相關 Branch／PR

- Branch：`fix/cms-taxonomy-a11y`
- PR：建立後由追蹤 closeout 補入。