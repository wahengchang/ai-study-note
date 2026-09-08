# PR #324 site-reset integration

- **Cycle**：`cycle-2026-09-07-2242-pr-324-site-reset-integration`
- **完成時間**：2026-09-08T09:32:07+08:00
- **狀態**：completed；等待 PR review／merge。

## 交付

- 以 `site-reset` safety seam 整合 PR #324：ThemeHost、PluginHost、structured content projection、preview document、Renderer、immutable Delivery、Public UI 與 CMS browser bootstrap。
- 移除舊 Projection producer 與 Theme source manifest；Renderer 只載入 strict parsed、封存且 digest-bound 的 Theme／Plugin bytes。
- Delivery 現在驗證 Renderer provenance、route/file closure 與 output digest；redelivery 使用 destination sibling staging 和 atomic rename，拒絕 artifacts root 內目的地。
- CMS session 在 browser ticket exchange 前安裝 `pagehide` abort，避免離頁期間完成 session 建立。
- 修正 Study Notes Theme 對 route snapshot 的 `normalizedRoute`／`owner`／`sourceRevisionId` 介面。

## 關鍵決策

- target 的 ThemeHost 與 PluginHost exact-identity／trusted-root 安全邊界優先；不保留 source 的第二套 producer 或 compatibility shim。
- public media 仍 fail closed 為 `PUBLIC_MEDIA_UNSUPPORTED`；public media emission、`cms:serve`／open flags、release 維持 deferred。
- Plugin manifest bytes 與 activation identity 一併封存；Renderer parser 重新核對 identity、manifest hash、entry/resource digest 與 callback declaration。

## 實際驗證

- runtime：Node `24.20.0`、npm `11.19.0`；`npm ci` 成功。
- `npm run check`：TypeScript、architecture、CMS Vite build、217/217 tests 全數通過。
- 兩角色複審後補強：route graph digest 與 claims 重算綁定、Plugin manifest 重用 PluginHost parser、Delivery 拒絕 accessor/Proxy 並封存輸入、Renderer Proxy 結果轉 stable failure。

## 已知限制／後續

- public media emission、production `cms:serve`、`cms:open` flags、GitHub Pages/release 仍為 deferred scope；無其他已知限制。

## 相關 Branch／PR

- Branch：`integration/pr-324-site-reset`
- PR：https://github.com/wahengchang/ai-study-note/pull/326
