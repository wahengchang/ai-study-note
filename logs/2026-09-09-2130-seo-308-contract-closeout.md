# SEO-308 Contract Closeout

- **Cycle**：`cycle-2026-09-09-2116-seo-308-contract-closeout`
- **完成時間**：2026-09-09T21:30:44+08:00
- **狀態**：completed

## 交付

- 關閉過時的 PR #331 為 superseded；它已由以 `site-reset` 為 base 的 #332 取代，且沒有可安全擷取的獨有修正。
- `db:migrate` 使用 Content public evidence reconcile `site-content@1`：缺失時原子插入、相同 evidence 零寫入、相同 identity 但不同 bytes/digest fail closed。
- CMS SEO analysis 在 Plugin callback 前驗 entry/current revision/schema/content/current route，並只透過 SiteDefinition 組成 canonical URL；新增 domain failure HTTP status 分類。
- Plugin settings 拒絕非 canonical HTTPS public site URL；`indexing` 經 sealed public SEO evidence 傳至 Renderer，精確決定 `robots.txt` 的 `Allow` 或 `Disallow`。
- 更新 contract 與文件導航，新增 migration、Application admission、Plugin settings/public snapshot、Renderer robots 的契約測試。

## 關鍵決策

- 不 retarget、合併或 cherry-pick #331。安全與 core 審查均確認其落後於 #332；剩餘 gap 以 current `site-reset` 的最小修正處理。
- Persistence 不依賴 Content owner：`apps/cli/db-migrate.ts` 將 Content evidence 注入 Persistence 的 public reconciliation seam，符合 owner direction。
- PluginHost 不依賴 SiteDefinition owner：Application 以唯一的 `resolvePublicRouteUrl()` builder fail closed，避免 callback canonical path 形成 off-origin URL。

## 實際驗證

- `npm run check`：typecheck、architecture、CMS build 與 250 tests 全數通過。
- `/tmp/seo-308-smoke.NdV46H`：`plugin:package`、`theme:package`、`db:migrate`、`theme:activate`、`site:build` 全部成功；`schema_versions` 有 exact `site-content@1` evidence；artifact digest 為 `sha256:3a2ed8d81c19c27e34f4c292192c4f4662e0e1843a3579975bc0b9e0d40fb90f`。

## 已知限制／後續

無。

## 相關 Branch／PR

- Branch：`fix/seo-308-contract-closeout`
- PR：[ #340 ](https://github.com/wahengchang/ai-study-note/pull/340)
- Superseded PR：[ #331 ](https://github.com/wahengchang/ai-study-note/pull/331)
- 先前整合：[ #332 ](https://github.com/wahengchang/ai-study-note/pull/332)
