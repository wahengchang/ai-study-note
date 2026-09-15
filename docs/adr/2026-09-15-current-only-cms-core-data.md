# ADR：CMS/Core authoring data 改採 current-only records

- **日期：** 2026-09-15
- **狀態：** 已接受
- **相關：** [current-only CMS/Core contract](../../contracts/README.md)、[CMS Core/Data Reset 規格](../../specs/cms-core-data-reset.md)、[原 Content Type migration ADR](2026-09-12-content-type-migration-transport-boundary.md)、[原 immutable canonical state ADR](2026-08-26-owner-boundary-and-immutable-canonical-state.md)

## 決策背景

既有 authoring lifecycle 以 append-only schema／Revision／asset version、current/published pointers、Restore 與 migration 管理內容。Owner 決定日常 CMS 只保留目前值，避免維護使用者不需要的平行狀態；公開 content-hashed artifact 的 immutable/atomic delivery 仍是另一個 boundary。

## 決策

Content Type definition、entry、taxonomy／term 與 media asset 改為單一 mutable current record。Entry 以一次 Save 寫入完整 content 與 `draft|published` status；不保留 Revision history、Restore、獨立 Publish、雙 snapshot、schema-version migration 或 media version/archive/restore。

所有可命名 entity 使用 server-generated stable ID、可變 slug 與 NFC/full-case-fold global slug namespace。所有 current mutation 使用 `expectedStateDigest` CAS；stale input 與任何 validation failure 都必須零寫入。Legacy `site-content@1` 先完成全量 divergent-entry decision，再原子 cutover成單一 content/status。

## 被取代範圍

- `2026-09-12-content-type-migration-transport-boundary` 不再是新 CPT 的演進路徑，只描述 clean cutover 前的現行 implemented baseline。
- `2026-08-26-owner-boundary-and-immutable-canonical-state` 中 authoring Revision、schema version 與 media version必須 append-only 的部分被本 ADR 取代；owner boundary、public entry、stable failure、single transaction與公開 artifact immutability仍有效。
- #315 的 body payload及browser/a11y precedent仍有效；two-step Publish與current/published preview lifecycle被取代。

## 後果

- Contract與spec必須明確區分approved target和clean cutover前的implemented baseline。
- 實作以Dev Hub垂直Work Items遷移所有Persistence、Application、Authoring API、CMS、tests與文件caller；最後才刪除舊contract/routes，不保留alias或shim。
- Projection、Renderer、archive、canonical public URL、Release、Public UI與視覺重設另案處理，不得擴張本決策。
