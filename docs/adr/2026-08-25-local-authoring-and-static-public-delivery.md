# ADR：採 local authoring 與 static public delivery

- **日期：** 2026-08-25
- **狀態：** 已接受
- **相關：** [implementation contract](../../contracts/README.md#scope-and-authority)、[Core platform 工作摘要](../../logs/2026-08-25-2026-09-03-core-platform.md)

## 決策背景

CMS 需要可驗證的 canonical authoring state，同時公開網站必須不依賴 production database 或本機 runtime。

## 決策

Authoring canonical state 使用本機 SQL 與本機 media storage；公開網站只服務從 published projection 產生並驗證的 immutable static artifact。

## 後果

- Publish 不等於 build、delivery、deploy 或 Git 操作。
- Public path 不可讀取 current draft、authoring database、raw media path 或 credential。
- 新公開功能必須經 Projection、Renderer、Delivery 的既有 verified boundary；不得建立第二條從 authoring state 到公開頁面的捷徑。
