# 資料持久化與 schema migration

- **規格 ID**：`CMS-DB-01`
- **狀態**：已通過架構與安全複審
- **依據**：`CMS-BASIC-CONTRACTS-V1` §1、§2；其為唯一現行 SSOT。

## Problem Statement

內容管理者需要能在本機關聯式 SQL 中長期、安全地保存 CMS 的 canonical state。若 revision、schema 版本、pointer、media reference 或 migration 不是可驗證且具原子性的持久化契約，升級或失敗操作就可能損毀內容、遺失歷史，或讓不同子系統觀察到不一致的 state。

## Solution

提供由 CMS 擁有的持久化基礎：以 immutable revision、append-only schema version、entry pointer、operation lineage 與 revision-media reference 為核心資料模型；以受版本管理的 migration 管理 schema 演進。所有會影響 canonical state 的寫入必須經 transaction、constraint 與可驗證 digest，migration 在提交前產生 impact report 並拒絕不完整或不可驗證的轉換。

## User Stories

1. As a content manager, I want every saved revision to remain immutable, so that I can inspect and restore a trustworthy content history.
2. As a content manager, I want current and published content pointers to identify revisions of the same entry, so that a pointer cannot silently reference another entry's history.
3. As a content manager, I want schema versions to be retained append-only, so that historical content remains interpretable after a schema evolves.
4. As a content manager, I want a schema change to show its affected pointers, historical revisions, mappings, and blocked rows before it runs, so that I can decide whether it is safe to proceed.
5. As a content manager, I want an incompatible schema migration rejected unless every affected current or published payload is mapped and valid, so that publishing state cannot be partially corrupted.
6. As a content manager, I want an accepted migration to create new revisions instead of rewriting existing bytes, so that the original evidence remains available.
7. As a content manager, I want the command policy to determine whether an affected pointer moves or remains pinned, so that migration consequences are explicit.
8. As a content manager, I want media references to be tied to a specific revision and asset version, so that a replaced asset never mutates an older revision.
9. As a content manager, I want a failed write, preflight, or constraint check to leave every relevant digest unchanged, so that retrying cannot compound damage.
10. As an operator, I want migration execution to validate and dry-run before an irreversible change, so that production data receives a safe forward repair path rather than an assumed rollback.
11. As an operator, I want structured persistence failures with an owner, affected subjects, and remediation, so that an operational fault can be diagnosed without exposing private content.
12. As a future core maintainer, I want one owner for each canonical table or collection, so that plugins and adjacent modules cannot create competing write paths.
13. As a plugin author, I want persistence internals to remain inaccessible, so that my integration uses stable core APIs rather than undocumented tables.
14. As a release operator, I want canonical snapshots to be hashable before and after a transaction, so that commit and rollback outcomes can be independently verified.

## Implementation Decisions

- Local relational SQL is the canonical CMS state. This specification establishes persistence ownership and integrity contracts only; it does not select an ORM, migration library, web framework, or package topology.
- The persistence boundary owns immutable `Revision` records containing entry identity, revision identity, schema version, canonical content bytes, content digest, and an optional restoration origin. Update and delete operations against revisions and schema versions are rejected.
- The entry-pointer model stores current and optional published revision IDs. Both relationships must be constrained by the entry ID and revision ID together, preventing cross-entry pointers.
- The migration subsystem owns append-only schema-version history. It exposes an impact analysis before any migration writes canonical state. The report contains affected pointers, historical revisions, transformation mapping, and blocked rows.
- An incompatible migration may commit only after its mapping covers every affected current and published pointer and every transformed payload validates under the target schema. Empty or partial mappings, missing required fields, and invalid select mappings produce no write.
- Accepted migrations create replacement immutable revisions. Pointer movement is an explicit command policy; an old pointer may remain intentionally pinned. Historical revisions are never transformed in place.
- A single transaction encompasses each command's persistence write-set: newly created immutable revisions, entry pointers when requested, owned route claims when invoked by the application layer, owned revision references, and operation lineage. Any preflight, constraint, or persistence failure leaves its observable canonical digest unchanged.
- Revision-media references identify an entry, revision, and asset version. The relation must enforce both revision identity and asset-version identity. This defines the durable seam consumed by the later Media core; it does not implement media import behavior here.
- Operation lineage is retained with each committed mutation so that a later audit can identify which command produced each pointer and reference state without treating logs as canonical state.
- Migration execution follows expand/contract or forward repair. A destructive mutation requires a verified backup or impact report and is never assumed to have a safe down migration.
- Storage failures are surfaced as the shared structured error shape `{code, owner, subjectIds, remediation}`. Error diagnostics may identify records and corrective action but must not include passwords, tokens, or plaintext personal data.
- Plugins have no direct SQL or persistence-internal access. A plugin-owned persistence namespace, if introduced later, carries its own owner and migration history rather than extending these core tables.

## Testing Decisions

- **Primary test seam**：以 disposable local SQL database 上的「migration runner 與 application-facing persistence contract」作為唯一最高層行為接縫。測試從空資料庫套用 migration、執行代表性的持久化 mutation，並透過公開查詢／digest 驗證結果；不對 SQL statement 排序、table helper 或 ORM implementation 寫單元測試。
- Good tests observe durable behavior: immutability rejection, composite pointer integrity, impact-report contents, fully mapped versus partially mapped migration outcomes, transaction atomicity, and sanitized structured failures.
- 必須涵蓋 migration 前後的 canonical digest、同一 entry 的 current/published pointer、跨 entry pointer 拒絕、舊 revision bytes 不變、以及失敗後完全不產生半成品。
- 媒體 reference 的測試只確認它綁定特定 immutable revision 與 asset version；import、reconciliation、archive 與 restore 行為由媒體規格測試。
- 現有 `CMS-BASIC-CONTRACTS-V1` consensus verifier 是可執行契約驗證的 prior art，但它不是未來應用程式測試框架。正式測試應在新的最高層 persistence seam 驗證外部契約。

## Out of Scope

- 內容 schema 的編輯介面、內容 block 編輯體驗與任何 CMS UI。
- `SaveRevision`、`PublishRevision`、`RestoreRevision` 與 `ChangeRoute` 的 application orchestration；它們由後續 core 規格定義並使用本持久化契約。
- Route graph 演算法、媒體 import/recovery、ProjectionPreview、static rendering、GitHub Pages release，以及 Plugin lifecycle。
- 選定未經核准的完整技術 stack，或將 SQL internals 視為 Plugin contract。

## Further Notes

- 本規格的測試 seam 是新系統尚未存在程式碼時可採用的最高層單一 seam；實作前應以其公開 contract 確認所有 persistence test 都從此入口進入。
- 完成條件是可由後續 Content、Route 與 Media core 使用的持久化契約，而不是先建立一組無 caller 的泛用 repository abstraction。
