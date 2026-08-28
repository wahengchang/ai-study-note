# CMS-BASIC-CONTRACTS-V1：資料庫與核心規格拆分

本目錄將 `CMS-BASIC-CONTRACTS-V1` 拆為可獨立實作、依序交付的資料庫與核心工作包。`contracts/README.md` 仍是唯一現行 SSOT；本目錄不修改或擴張其已核准範圍。

## 實作順序

1. [資料持久化與 schema migration](01-persistence-and-schema-migrations.md)
2. [內容生命週期 application core](02-content-lifecycle-application-core.md)
3. [路由圖 application core](03-route-graph-application-core.md)
4. [媒體生命週期 application core](04-media-lifecycle-application-core.md)
5. [Plugin host core](05-plugin-host-core.md)

每份規格均指定一個最高層級的行為測試接縫，避免以資料表欄位或內部 class 結構作為測試對象。路由、媒體與 Plugin host 完成後，才規劃 `ProjectionPreview`、Static Rendering 與 Public UI；這些 UI／delivery 範圍不在本批工作內。
