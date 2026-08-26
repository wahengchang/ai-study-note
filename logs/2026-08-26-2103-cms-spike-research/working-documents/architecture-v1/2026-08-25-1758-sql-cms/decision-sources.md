# Decision sources：借鑑，不複製

本文件只記錄本 session 查證並借鑑的概念。WordPress 的 PHP runtime、資料表、template loader、rewrite implementation 與 deploy model **不會**被繼承；V1 是 Node.js/TypeScript、SQLite、local authoring state，沒有 Theme/deploy contract。

| 主題 | 一手來源 | 借鑑 | 本契約的獨立決定 |
|---|---|---|---|
| Post Type | [WordPress: Registering Custom Post Types](https://developer.wordpress.org/plugins/post-types/registering-custom-post-types/) | custom type 有 stable identifier、admin surface、single/archive URL concern | immutable `key`、versioned schema、global claim；不用 WordPress runtime |
| Metadata | [WordPress: Metadata](https://developer.wordpress.org/plugins/metadata/) | metadata 與 content 可是 many-to-one，需有明確 ownership | typed immutable field-value rows 與 schema membership trigger，非 loose meta table |
| Taxonomy | [WordPress: Working with Custom Taxonomies](https://developer.wordpress.org/plugins/taxonomies/working-with-custom-taxonomies/) | distinct custom classification、Post Type attachment、hierarchical term/archive | versioned taxonomy/term revisions，`PublishTermRevisionService` batch fork |
| Meta Boxes | [WordPress: Custom Meta Boxes](https://developer.wordpress.org/plugins/metadata/custom-meta-boxes/) | content fields 的 admin layout 是 authoring concern | editor group/order 只存 form layout；不存 template/component code |
| Template hierarchy | [WordPress: Template Hierarchy](https://developer.wordpress.org/themes/templates/template-hierarchy/) | content identity 與 rendering selection 分離 | Theme/projection consumption 留待後續，完全不納入 V1 state contract |
| rewrite | [WordPress: add_rewrite_rule](https://developer.wordpress.org/reference/functions/add_rewrite_rule/) | path/rewrite 是 globally ordered routing concern | SQLite `route_claims` global unique + source-owner triggers + atomic RouteMigrationService |
| slug | [WordPress: sanitize_title](https://developer.wordpress.org/reference/functions/sanitize_title/) | URL identifier 需要正規化的可重複規則 | trim/NFC/case-folded claim key/UTF-8 percent encoding/trailing slash；拒絕 embedded slash |
| SQLite constraints | [SQLite: Foreign Key Support](https://www.sqlite.org/foreignkeys.html) | FK 必須 per connection 開啟，parent key/index 關係需要 schema-level驗證 | `PRAGMA foreign_keys=ON`、STRICT tables、FK + trigger 複合 ownership guard、integrity/foreign-key checks |
| Node verifier | [Node.js: SQLite](https://nodejs.org/api/sqlite.html) | `node:sqlite` 的 `DatabaseSync`、`exec`、prepared statement 可在宣告 Node runtime 內建立 gate | Node 22.22+ verifier，不依賴 system `sqlite3`；module 仍屬 experimental，environment error code 78 保留 |

## 已排除的來源模式

- 不採 WordPress 的 PHP/plugin/theme execution、metadata 儲存格式、rewrite priority 或 template fallback。
- 不採 Git-tracked Markdown/YAML canonical source、Keystatic、remote database、公開 runtime API、舊 corpus migration。
- 不把 WordPress document 視為安全、authorisation、idempotency、migration 或 immutable-history 規格；這些規則由本目錄獨立定義與 `verify-contract.mjs` 機械驗證。
