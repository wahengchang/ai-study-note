# SEO Basics happy path

## 交付

- 完成 `seo-basics` 外掛、CMS SEO 分析與設定、公開 projection、Renderer SEO head／sitemap／robots，以及 immutable delivery evidence。
- 提供 `plugin:package`、`theme:package`、`theme:activate`、`site:build`、`cms:serve`、`cms:open` 可執行組合。
- CMS 由 fixed Authoring origin 的受限 `/cms/` 靜態路由供應；`cms:open` 以 server proof 綁定 socket mint 一次性 fragment ticket，前端交換 session 後清除 fragment。

## 關鍵決策

- Theme 僅產生 body 與已宣告 stylesheet；完整 HTML document 和固定 SEO head 順序由 Renderer 擁有。
- 已存在 artifact digest 會重新驗證並回傳相同交付，而非當成衝突；腐敗或不同 bytes 仍 fail closed。
- CMS 啟動組合使用實作的受限 JSON Schema validator，拒絕非有限數值、違反 required／properties／items／const／enum／anyOf／oneOf 的 revision。

## 驗證

- `npm test`：213 passed。
- `npm run check:architecture`：passed。
- `npm run cms:build`：passed。
- 實際 smoke：migrate、plugin/theme package、theme activate、兩次相同 `site:build`；CMS static `/cms/` 與 asset 回應；provisioned credential 下 `cms:open` 回 `CMS_OPEN_OK`。

## 限制

- Browser automation 工具對已回應的本機 `/cms/` 頁面於 `domcontentloaded` 逾時；已回報工具問題。靜態首頁、資產、same-socket ticket mint 與 CMS open command 已以實際 loopback 服務驗證。
