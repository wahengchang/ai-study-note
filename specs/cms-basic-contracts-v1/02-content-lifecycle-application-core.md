# 內容生命週期 application core

- **規格 ID**：`CMS-CORE-02`
- **狀態**：已通過架構與安全複審
- **依據**：`CMS-BASIC-CONTRACTS-V1` §1；它定義已核准範圍與設計約束。程式碼與對應測試是已實作行為的 SSOT。
- **前置規格**：`CMS-DB-01`。

## 目前實作 surface

`SaveRevision` 在 schema、route 與完整 media preflight 後只 prepare 一次 real `PluginHost` validator snapshot；`PublishRevision` 原子更新 published pointer／claim。`RestoreRevision` 以 exact own-data request 從已驗證 immutable source 建立新 current revision，保留 published pointer、標記 `restoredFromRevisionId`，並在寫入前以 ordered `RestoreAsset` descriptors 阻擋 unavailable media；revision、references、pointer、current claim 與 lineage 均在單一 transaction 寫入。

## Problem Statement

內容管理者需要一個可信任且可預期的入口，將草稿內容儲存、發布、還原與變更路由。若各功能各自寫資料，schema 驗證、媒體可用性、路由衝突檢查和 error handling 將不一致，失敗時更可能留下新 revision、pointer 或 route claim 的部分狀態。

## Solution

建立 `DomainApplication` 作為內容生命週期唯一 application command boundary，提供 `SaveRevision`、`PublishRevision`、`RestoreRevision` 與 `ChangeRoute`。每個 command 在寫入前完成必要 preflight，並將 immutable revision、pointer、相關 route claim 與 operation lineage 以一個 transaction 提交；任何失敗均維持 canonical state 不變並回傳可行動的結構化錯誤。

## User Stories

1. As a content manager, I want to save a valid draft revision without publishing it, so that I can continue editing safely.
2. As a content manager, I want a saved revision to receive a stable digest, so that I can prove which bytes were reviewed or restored.
3. As a content manager, I want an invalid content payload rejected before persistence, so that an invalid revision never enters history.
4. As a content manager, I want publication to select a valid current revision for one entry, so that public content changes deliberately.
5. As a content manager, I want publication to verify linked media availability before it changes the published pointer, so that the public projection never points to unavailable media.
6. As a content manager, I want publication to detect current and published route collisions before it writes, so that a public route is never ambiguously owned.
7. As a content manager, I want to restore an earlier immutable revision as a new revision, so that the history remains truthful while I recover content.
8. As a content manager, I want a restore blocked before mutation when its media is archived or missing, so that a restored revision cannot reference unusable assets.
9. As a content manager, I want a route change to show retained-claim collisions and impact before it commits, so that I understand draft and published consequences.
10. As a content manager, I want saving, publishing, restoring, and changing a route to either fully commit or not change state at all, so that failures are safe to retry.
11. As an operator, I want every command failure to include a stable code, responsible owner, subject IDs, and remediation, so that support can resolve it without guessing.
12. As a future core maintainer, I want all content mutations to use one command boundary, so that direct table writes cannot bypass validation or lineage.
13. As a preview or delivery subsystem, I want published pointers to change only through validated commands, so that published selections remain reliable inputs.
14. As a plugin author, I want to integrate through injected application services and published hooks, so that my plugin cannot bypass content invariants.
15. As a release operator, I want canonical state digests to remain identical after a rejected command, so that integrity checks distinguish failed attempts from committed changes.

## Implementation Decisions

- `DomainApplication` owns the four named application commands and is the sole core mutation boundary for entry lifecycle state. It coordinates owned services but does not absorb SiteDefinition, DataMedia, or Plugin host persistence ownership.
- Every `SaveRevision`, `PublishRevision`, `RestoreRevision`, and `ChangeRoute` command completes schema validation, media-availability validation, and route conflict/impact preflight before its transaction begins. A command may use an empty applicable media or route set, but it may not omit the corresponding gate.
- Each successful command writes one atomic write-set: an immutable revision when the command creates one, current and/or published entry pointer changes, corresponding target-graph route claims, and operation lineage. When a pointer moves for an entry with a route, its graph claim's `sourceRevisionId` must equal the selected pointer revision even when the normalized route is unchanged. The underlying persistence transaction from `CMS-DB-01` is the atomicity mechanism.
- Failed preflight, constraint failures, and unexpected persistence faults must not change the command's canonical write-set digest. No command may create a revision as a side effect before every required preflight has passed.
- Revision content is validated against the selected schema version before it is accepted. Commands consume the schema/migration capability exposed by the persistence foundation; schema administration UI and schema design are outside this work package.
- Publishing changes only the published selection after all preflight succeeds and atomically updates its corresponding published route claim. Saving changes current state without making content publicly selectable. Restoring always records a new immutable revision with restoration provenance rather than rewinding or mutating the original revision.
- Restore requests that encounter unavailable archived or missing media return `BLOCKED_ARCHIVED_MEDIA_RESTORE` before mutation and include a callable `RestoreAsset` remediation owned by the Media/Application boundary.
- Route changes are delegated to SiteDefinition for normalization, retained-claim collision detection, impact calculation, and graph mutation. DomainApplication supplies command intent and incorporates the result in its transaction; it must not independently reproduce route rules.
- Every rejection uses `{code, owner, subjectIds, remediation}`. The code is stable for machine handling, owner names the responsible domain, subject IDs identify affected entities, and remediation is safe to display or invoke.
- The command API is application-facing, not a public production HTTP API. Transport, authentication, capability enforcement, and rate limits must be added at a later external-entry boundary without permitting an alternate mutation path.
- Public hooks and plugin callbacks may observe or extend only explicitly released extension points. They cannot obtain raw database handles or alter a command's committed state outside the transaction; any callback effect that participates in a command is transaction-scoped and rolls back with a callback fault.

## Testing Decisions

- **Primary test seam**：`DomainApplication` command interface 是此規格唯一測試入口。每個測試以可控制的 local persistence、route、media collaborator 執行 command，僅驗證 command 回應與 observable canonical state，不驗證 coordinator 的 private call sequence。
- Good tests execute each command through each required preflight class: schema-invalid, media-unavailable, and route-conflicting inputs must be rejected before a write; valid save, publish, restore, and route-change paths verify their distinct selections.
- Every failing preflight class must assert the shared structured error shape and identical before/after canonical digest. Every successful command must assert the intended immutable revision, pointer selection, matching route-claim `sourceRevisionId` when the entry owns a route, and lineage. Same-route republish must prove that a new published revision updates claim attribution while the current graph remains isolated.
- Atomicity tests must prove no partially created revision, pointer movement, or route-claim mutation can be observed following route, media, validation, persistence, or participating Plugin callback failure.
- The persistence specification supplies the real transaction and constraint behavior; collaborator fakes are permitted only to create deterministic route/media preflight outcomes at the DomainApplication seam. They must not reimplement persistence invariants.
- No test should inspect private validators, repository invocations, transaction callbacks, or internal event order. Those are implementation choices and would weaken refactoring safety.

## Out of Scope

- SQL schema, migration runner, and revision-table constraint implementation.
- Route normalization and route-claim registry internals; covered by `CMS-CORE-03`.
- Media import, checksums, reconciliation, archive, and `RestoreAsset` implementation; covered by `CMS-CORE-04`.
- ProjectionPreview, preview UI, static artifact delivery, raw-code sandbox UI, authentication UI, and public HTTP transport.
- Plugin discovery, activation, hook ordering, and renderer lifecycle; covered by `CMS-CORE-05`.

## Further Notes

- 這是後續跨 domain mutation 唯一的 command seam。實作時若需要新 service，應以注入 collaborator 支援這四個 command，而非另外暴露能繞過 preflight 的寫入入口。
- 此處的 application boundary 是建議驗證 seam；Owner 尚未另行指定不同的使用者可見 command API，因此規格先以契約指定的 `DomainApplication` 為準。
