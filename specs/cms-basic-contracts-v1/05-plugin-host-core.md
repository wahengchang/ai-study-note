# Plugin host core

- **規格 ID**：`CMS-CORE-05`
- **狀態**：已通過架構與安全複審
- **依據**：`CMS-BASIC-CONTRACTS-V1` §4，以及 `MEMORY.md` 的長期 Plugin boundary 原則。前者定義已核准範圍與設計約束；程式碼與對應測試是已實作行為的 SSOT。
- **前置規格**：`CMS-CORE-02`、`CMS-CORE-04`；published renderer 介面等待 projection work package。

## Problem Statement

內容管理者需要能手動啟用受信任 Plugin 來擴充 editor block、validator、renderer 與 assets，而核心仍須保有內容、媒體和資料庫的完整性。若 discovery、manifest validation、hook order、capability access 或 inactive Plugin 行為不明確，Plugin 會形成隱性 trusted code path，造成不相容、資料越界、不可重現的 published artifact，或在停用後遺失 revision source。

## Solution

建立 Hybrid Plugin host：只從 trusted local folder discovery manifest，經 manual activation 驗證 manifest 與 capability contract，並固定使用 `plugin-hooks/v1`。Plugin callback 只能藉由 injected application services 操作允許能力；Actions 不回傳、Filters 接 immutable input 並回傳 replacement，順序由 priority 再 Plugin ID 決定。公開 renderer 只接收 published `renderer-input/v1` block，任何 active callback exception 均 fail operation/build；inactive 或 missing Plugin 保留 revision source、提供 diagnostic，且不執行任何 capability。

## User Stories

1. As a content manager, I want plugin discovery to list available manifests without executing plugins, so that inspecting installed code does not change CMS state.
2. As a content manager, I want plugin activation to be manual, so that an installed folder cannot silently obtain capabilities.
3. As a content manager, I want activation to reject an invalid ID, semantic version, trust declaration, hook contract, or capability declaration, so that invalid plugins never enter the active set.
4. As a plugin author, I want a stable `plugin-hooks/v1` contract, so that I can implement documented extension points without importing core internals.
5. As a plugin author, I want Action hooks to have no return value and Filter hooks to receive immutable input and return a replacement, so that hook behavior remains composable.
6. As a plugin author, I want deterministic hook order by priority and Plugin ID, so that the same active configuration has repeatable results.
7. As a content manager, I want plugin editor-block, validator, renderer, and asset callbacks to use injected application services, so that plugins can work without direct SQL or media access.
8. As a core maintainer, I want the host to reject direct database and media access attempts, so that plugin code cannot bypass domain invariants.
9. As a release operator, I want a public plugin renderer to receive only a published `renderer-input/v1` block, so that draft authoring revisions cannot leak to public output.
10. As a release operator, I want an exception from an active plugin callback to fail the affected operation or build, so that artifacts are not emitted from partial plugin execution.
11. As an operator, I want callback diagnostics to identify Plugin, capability, Entry, stable code, sanitized cause, and remediation, so that I can repair a failed extension safely.
12. As a content manager, I want an inactive or missing plugin block to remain in revision source, so that temporarily disabling a plugin does not destroy authored content.
13. As a content manager, I want inactive or missing plugins not to execute hooks or capabilities, so that disabled code has no hidden effect.
14. As a content manager, I want CMS to show an inactive block and a new artifact to omit its output with a diagnostic, so that the missing extension is explicit rather than silently rendered incorrectly.
15. As a content manager, I want re-enabling the same plugin to restore behavior for the same revision, so that recovery does not require rewriting historical content.
16. As a release operator, I want an old artifact reproducible from its recorded manifest even after plugin state changes, so that historical delivery bytes remain stable.
17. As a future maintainer, I want public hook and manifest changes versioned, so that dependent plugins receive a compatibility and deprecation path.

## Implementation Decisions

- The Plugin host owns local folder manifest discovery, activation state, manifest validation, capability mediation, hook registry execution, and plugin diagnostics. Discovery only enumerates manifests; it does not import, execute, or activate plugin callbacks.
- Activation is explicit and validates Plugin ID, semver version, trusted declaration, declared hook contract, and capability declarations. The baseline accepts only trusted local folders; npm package location does not itself constitute a runtime sandbox.
- The released hook contract is `plugin-hooks/v1`. Actions broadcast and return no value. Filters receive immutable input, have no side effects on that input, and return a replacement value. Hook execution order is ascending priority followed by stable Plugin ID ordering.
- Plugin capabilities are limited to editor-block, validator, renderer, and assets callbacks invoked with injected application services. For every invocation the host grants only a manifest-declared, callback-specific minimal facade; undeclared or cross-capability requests fail before mutation with a stable denial and no effect. Host-provided facades never expose raw SQL, persistence internals, media paths, authoring revisions, current pointers, or unpublished media.
- The public renderer boundary is narrow: it accepts only the published `renderer-input/v1` block supplied by the future ProjectionPreview producer. Its facade has no authority to query authoring revision storage, current pointers, unpublished media, SQL, or media paths.
- An exception in an active callback fails the enclosing operation or build. Command-participating effects join the enclosing transaction, and any callback fault restores the canonical write-set digest; build effects remain staged until every callback succeeds. The host emits only a fixed host-owned diagnostic DTO containing Plugin, capability, Entry, stable error code, host-mapped cause category, and host-authored remediation. It must not copy raw exception messages/stacks, callback payloads, content bytes, credentials, SQL, filesystem paths, or media paths.
- Inactive or missing plugins execute neither hooks nor capabilities. Revision source remains unchanged. CMS-facing consumers receive an inactive-block representation; a new artifact omits plugin output and carries a diagnostic. Re-enabling the compatible plugin restores behavior for that same source revision.
- Artifact reproducibility remains the responsibility of later PublicDelivery. This host preserves the Plugin manifest identity needed for that manifest to re-deliver existing immutable artifact bytes.
- Plugin IDs, hook payloads, public data formats, and manifest contracts are versioned public boundaries. Breaking changes require a documented compatibility/deprecation path and must not be introduced as an internal refactor.
- The host is a trust and capability boundary, not a process sandbox. Its denial guarantees apply to every host-mediated core capability and host-provided handle; trusted local Plugin code remains outside a runtime-containment threat model. A stronger isolation model requires an explicit runtime/process design and must not be implied by local folder discovery.

## Testing Decisions

- **Primary test seam**：`PluginHost` application contract is the only primary seam. Tests supply fixture manifests and controlled callback plugins, then observe discovery, activation, invocation results, callback ordering, per-callback capability grant or stable denial, diagnostics, transaction outcome, and active/inactive outcomes. Tests do not inspect registry arrays, dynamic-import mechanisms, or private callback wrappers.
- Good tests cover discovery without execution; each activation validation failure; deterministic Action and Filter ordering; immutable Filter input; only manifest-declared minimal facade access; rejected undeclared/cross-capability and host-mediated direct persistence/media access; and public renderer input narrowing.
- Failure tests assert an active callback exception fails the enclosing operation/build, returns the fixed sanitized diagnostic, leaves the before/after canonical digest identical after an earlier allowed callback effect, and emits no success artifact/result. Canary exceptions containing draft HTML, token-like values, stacks, and filesystem paths must prove none of those values appear in diagnostics.
- Inactive/missing Plugin tests assert source preservation, zero hooks/capabilities execution, inactive-block diagnostic, omitted new output, and behavior recovery after re-enable. Historical artifact reproducibility is verified at the later PublicDelivery seam using recorded manifest identity.
- `plugin-hooks/v1` is a public contract. Tests should be fixture-driven at the host boundary and fail on observable API incompatibility, not on source-layout refactors.

## Out of Scope

- Process/runtime sandboxing, remote plugin marketplace, automatic updates, Plugin payment/licensing, and third-party package trust distribution.
- CMS UI design for plugin management and block editing.
- ProjectionPreview producer, `renderer-input/v1` byte serialization, static artifact manifest generation, and public rendering implementation.
- Core content, route, schema migration, and media lifecycle implementation except the injected-service contracts the host consumes.

## Further Notes

- 「trusted local」縮小 discovery 與 activation 範圍，但不等於 sandbox。此限制必須在 implementation documentation 和 operator workflow 中清楚保留。
- 本規格不允許為 Plugin 便利性增加 direct SQL 或 filesystem escape hatch；需要新能力時，應新增受版本管理的 injected application service 或 Hook contract。
