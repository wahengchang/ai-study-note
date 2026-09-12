# Content Type migration transport route class 修正

## 交付

- 將 `/v1/content-types/:schemaId/migrations` 與 `.../migrations/preview` 從 `content-type` route class 拆出，改用專屬的 `content-type-migrations`。
- 還原 `POST_READ_ROUTES`：不再包含 `content-type`。
- `AuthoringApiLogEvent.routeTemplate` 新增兩個 migration route template，`templateFor` 依 pathname 區分 preview 與 execution。
- `StartAuthoringApiInput.contentTypeMigrationAdministration` 由 optional 改為 required，移除 handler 內的 `undefined → 500` 分支。
- 併入 `site-reset`（#372 release transport），與 `releaseTransport` 共存。

## 關鍵決策

原本為了讓 migrations 能 POST，把 `content-type` 加進 `POST_READ_ROUTES`。但 `routeFor` 將
`/v1/content-types/:schemaId` 與 `.../migrations` 對應到同一個 route class，方法閘門無法區分兩者，
因此 detail route 也被放寬成可 POST。Hono 沒有註冊該 POST handler，request 會落到 Hono 預設 404
（`text/plain`、無 `no-store`／`nosniff`／`no-referrer`、非 `authoring-error/v1`），違反 contract §7 的
status 與 response header 規定。拆出獨立 route class 同時修正方法閘門與 log routeTemplate 失真。

## 實際驗證

- `npm run typecheck`：通過。
- `npm run check:architecture`：通過。
- `npm run cms:build`：通過。
- `node --import tsx --test-concurrency=1 --test tests/apps/authoring-api/http-contract.test.ts`：30/30 通過
  （含兩個新增 regression test：detail route POST → 405 envelope；migration route 自有 routeTemplate 且拒絕 GET）。

## 已知限制／後續

見 PR #369 的 review 留言：strict DTO 仍有 `z.unknown()` 欄位、blocked outcome 以 422 回傳非 error envelope、
Application 層對 `pointerPolicies`／`mappings` 元素缺少輸入驗證、HTTP 層缺 CAS／blocked／未授權的迴歸測試。
