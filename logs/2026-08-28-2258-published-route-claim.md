# Published Route Claim 完成紀錄

- **Cycle**：`cycle-2026-08-28-2245-published-route-claim`
- **完成時間**：2026-08-28T22:58:35+08:00
- **狀態**：completed

## 交付

- 新增 SiteDefinition published claim proposal、opaque transaction token 與 create／validate／apply 公開 seam。
- current/published claim 收斂為同一個 graph-aware prepare、validate、apply、create 流程；proposal 同時綁定兩圖 digest，token 綁定 target graph 與 transaction。
- 以真實 SQLite Persistence 驗證跨圖 route 共存、同圖 Unicode collision、source revision 替換、rollback、proposal 防竄改及 token 單次使用。
- 更新 SiteDefinition 現況與 published claim 測試入口。

## 關鍵決策

無。依既有 SiteDefinition、Persistence transaction 與 #225 核准 contract 交付；未新增 migration、Persistence API、ChangeRoute、PublishRevision、Projection 或 Plugin 行為。

## 實際驗證

- Node `24.20.0`／npm `11.19.0`：`node --import tsx --test "tests/core/site-definition/*.test.ts"`，6 tests passed。
- Node `24.20.0`／npm `11.19.0`：`npm run check`，80 tests passed；TypeScript 與 architecture checker 均通過。
- Node `24.20.0`／npm `11.19.0`：`npm run dev-hub:overview`、`npm run dev-hub:overview:check` 與 `node --import tsx --test tests/scripts/render-dev-hub-overview.test.ts`，12 tests passed。

## 已知限制／後續

無。

## 相關 Branch／PR

- Branch：`cms/published-route-claim`
- PR：[ #263 實作 published route claim 雙圖隔離](https://github.com/wahengchang/ai-study-note/pull/263)
