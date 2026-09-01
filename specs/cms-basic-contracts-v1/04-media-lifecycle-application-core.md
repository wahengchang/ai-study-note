# 媒體生命週期 application core

- **規格 ID**：`CMS-CORE-04`
- **狀態**：已通過架構與安全複審
- **依據**：`CMS-BASIC-CONTRACTS-V1` §2；它定義已核准範圍與設計約束。程式碼與對應測試是已實作行為的 SSOT。
- **前置規格**：`CMS-DB-01`；供 `CMS-CORE-02` 與後續 published projection 使用。

## 目前實作 surface

`startDataMedia()` 是唯一 operational factory：它先用 immutable Persistence／filesystem snapshots 同步收斂 durable `staged → pending → ready` evidence，任一不安全、歧義或 fault 都不回 instance；完成後只刪未受 canonical asset version 保護的合法 orphan，重跑不改 canonical digests。ready 但 physical bytes 已遺失的 asset version 不是收斂 fault，而是降級為 `missing`：CMS 仍可啟動，該版本的解析與 projection 依既有規則 fail closed，並由 `RestoreAsset` 作為唯一 remediation。已啟動的 `DataMedia` 建立 ready asset version；`DomainApplication.SaveRevision` 的 `media-reference-replacement` derived request 從 immutable current revision 派生 schema、content、normalized route 與完整 reference set，只把一個 ready 同 logical asset 的 version 替換為另一 version。成功只移動 current pointer／claim，published pointer／claim 保持 pin 直到明確 `PublishRevision`。target reference 不存在時回傳 `MEDIA_REFERENCE_NOT_FOUND`；source 已引用 replacement version 時回傳 `MEDIA_REFERENCE_CONFLICT`，不靜默去除重複引用。

`ArchiveAsset` 在寫入交易外驗證 object health，交易內重驗 immutable evidence、active published references 與 availability transition，仍被 active published pointer 引用時回傳完整 `archive-asset-impact/v1` 並保持 digest 不變。`RestoreAsset` 只接受對既有 digest、length 與 canonical metadata 完全相符的 bytes recovery，並以受控 object store 驗證 final object；stage 釋放先於 canonical availability 寫入，因此任一 host fault 都不會留下已翻成 ready 的紀錄，重送同一份 recovery 仍是可重試的成功。published selection 對任何 archived、missing 或不健康 reference fail closed。

## Problem Statement

內容管理者需要能安全匯入、替換、封存與還原本機媒體，而內容 revision 必須永遠指向當時可驗證的 asset version。若媒體檔案和資料庫 intent 沒有可恢復的狀態機，或 replace 覆寫舊版本，重新啟動、部分失敗與還原舊內容都可能讓 published selection 指向遺失、損壞或被悄悄改寫的檔案。

## Solution

建立 `DataMedia` 作為 checksum object、immutable asset version、logical asset、revision reference registry 和 durable import lifecycle 的唯一 owner。媒體匯入走 `staged → pending → ready`，startup reconciliation 可重複執行且只完成已驗證 promotion；replace 建立新 version；published selection 僅從 published pointer 所引用且可用的 version 解析，任何未解析或不健康狀態一律 fail closed。

## User Stories

1. As a content manager, I want every stored media object to have an immutable checksum, so that I can verify the bytes referenced by content.
2. As a content manager, I want an asset replacement to create a new version, so that a historical revision never changes when I upload a newer image or file.
3. As a content manager, I want a logical asset to retain its version history, so that I can understand which content used which media bytes.
4. As a content manager, I want revision-media references to point to a specific asset version, so that published content resolves deterministic media.
5. As a content manager, I want import to survive restart safely, so that an interrupted upload cannot become a falsely ready asset.
6. As an operator, I want startup reconciliation to be idempotent, so that repeating recovery does not create duplicate assets or mutate verified history.
7. As an operator, I want orphan staged or final bytes removed when no canonical ready asset or reference exists, so that partial filesystem state does not masquerade as content.
8. As an operator, I want pending intent removed when its physical bytes are absent, so that recovery does not claim unavailable media is recoverable.
9. As an operator, I want a verifiable promotion completed to ready during reconciliation, so that a recoverable interruption can finish without manual database repair.
10. As a content manager, I want restore blocked before mutation when a historical revision references archived or missing media, so that restored content is usable by design.
11. As a content manager, I want `RestoreAsset` offered as a remediation through the media application boundary, so that the CMS does not repair SQL rows or filesystem bytes directly.
12. As a projection subsystem, I want published media selected only through the published pointer and available asset version, so that draft or corrupt media cannot leak into output.
13. As a public-site operator, I want missing, archived, corrupt, or inconsistent media to fail closed before projection, so that a release never silently emits an untrustworthy artifact.
14. As a plugin author, I want media access mediated by injected services, so that my plugin cannot directly alter immutable objects or another owner's files.
15. As a future maintainer, I want media health failures to identify an actionable remediation, so that recovery follows supported application commands.

## Implementation Decisions

- `DataMedia` owns checksum objects, immutable asset versions, logical assets, revision-reference registry behavior, and import/reconciliation state. DomainApplication may request availability checks or `RestoreAsset`, but must not access media SQL tables or filesystem paths directly.
- A checksum object represents immutable bytes. An asset version is immutable and associates a logical asset with its checksum object and metadata. Replacing a media asset always creates a new checksum object and asset version. The replacement use case coordinates with DomainApplication in one transaction to create a new immutable revision and new revision reference; it never mutates prior revision bytes, metadata, checksum, or reference.
- Each revision reference identifies an immutable entry revision and immutable asset version and is itself append-only: an existing reference cannot be updated or deleted to point at another version. The persistence foundation enforces the relevant foreign-key identities; DataMedia defines availability and resolution semantics.
- Import uses the durable ordered states `staged`, `pending`, and `ready`. A state transition must make it impossible for a ready record to refer to unverified bytes.
- Startup reconciliation is idempotent and classifies each candidate before cleanup. A pending intent with verifiable candidate bytes is a live promotion candidate: reconciliation completes it to ready, or retains it for retry if promotion faults. Only bytes with neither canonical ready asset/reference nor a live pending promotion candidate are removed; a pending intent with absent physical bytes is removed.
- Media availability is explicit. Archived assets, absent bytes, checksum mismatch, corrupt metadata, and unresolved object/version relationships are unavailable. The subsystem never supplies a substitute asset or silently falls back to a different version.
- Published media selection follows exactly: published entry pointer → referenced revision → revision reference → available asset version → checksum object. Any failure along that chain blocks projection before output generation.
- `RestoreAsset` is a Media/Application command and the only supported remediation for archived or missing media. `RestoreRevision` encountering that media returns `BLOCKED_ARCHIVED_MEDIA_RESTORE` before mutation with structured remediation containing a callable `RestoreAsset`; a CMS caller must not repair the database or filesystem as an out-of-band shortcut.
- Media status and failures use `{code, owner, subjectIds, remediation}`. Diagnostics include enough status and asset identity for a local operator, while avoiding secret storage credentials or unrelated content bytes.
- Plugin media work runs through injected application services. Direct SQL and direct filesystem/media-object mutation are rejected at the host boundary.

## Testing Decisions

- **Primary test seam**：`DataMedia` application contract over a disposable local storage root and local relational state is the single highest seam. Tests invoke import, reconcile, resolve published selection, archive/restore, and the replacement use case through the domain interface; replacement assertions observe the newly created revision/reference while proving old revision resolution and published selection remain unchanged until explicit DomainApplication pointer policy moves them.
- Good tests prove immutable replacement history, revision-reference specificity, valid `staged → pending → ready` transition, each restart-recovery branch, pending-plus-verifiable-final-byte precedence, promotion-fault retention, and repeated reconciliation producing the same result.
- Published-selection tests must cover the complete pointer-to-checksum chain and assert fail-closed behavior for missing, archived, checksum-mismatched, corrupt-metadata, and unresolved references.
- Restore tests belong at the cross-domain DomainApplication seam only for the observable blocked command and `RestoreAsset` remediation. Media tests cover the asset state transitions and recovery contract.
- The persistence spec covers foreign-key integrity; this specification covers media lifecycle semantics. Tests must not mirror SQL constraint implementation or depend on storage directory naming.

## Out of Scope

- CMS media-library UI, drag-and-drop upload, preview thumbnails, image transforms, CDN/object storage, and remote media providers.
- Revision schema validation, general pointer lifecycle, and route graph mutation, except the atomic new-revision/reference handoff required by media replacement.
- Projection serialization, static artifact generation, GitHub Pages deployment, and Public UI rendering.
- Plugin discovery and capability declaration mechanics; only the no-direct-access boundary is assumed here.

## Further Notes

- 「fail closed」是 published media selection 的必要行為，而非可選 error policy。公開輸出不得用未驗證替代檔案掩蓋資料損壞。
- 本規格選擇本機媒體作為已核准範圍；新增外部 object storage 需新的 Owner 決策，不得以 storage adapter 名義偷渡進入本工作包。
