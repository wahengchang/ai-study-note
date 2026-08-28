# 路由圖 application core

- **規格 ID**：`CMS-CORE-03`
- **狀態**：已通過架構與安全複審
- **依據**：`CMS-BASIC-CONTRACTS-V1` §2；它定義已核准範圍與設計約束。程式碼與對應測試是已實作行為的 SSOT。
- **前置規格**：`CMS-DB-01`；由 `CMS-CORE-02` 的 `ChangeRoute` command 協調。

## Problem Statement

內容管理者必須能在草稿與已發布內容各自管理路由，而不因相近的 Unicode、大小寫或尾斜線形式產生重複擁有者。若 route claim 沒有單一 owner、normalization 和 impact preflight，變更草稿路由也可能意外破壞已發布路由，或在失敗後留下無法解釋的圖狀態。

## Solution

建立 `SiteDefinition` 作為唯一 normalized route-claim registry owner。它在 current 與 published graph 中以穩定 claim identity 管理路由，對單一 target graph 做 mutation，但在 commit 前檢查所有保留 claim 的 collision 與 impact；並為每個 graph 保存可驗證的 canonical snapshot digest。

## User Stories

1. As a content manager, I want each normalized route in a graph to have one owner, so that navigation resolves unambiguously.
2. As a content manager, I want routes differing only by Unicode normalization, case, or trailing slash to be treated consistently, so that visually similar paths cannot collide unexpectedly.
3. As a content manager, I want the same owner to hold distinct current and published claims, so that I can prepare a draft route without overwriting the live one.
4. As a content manager, I want a route mutation to affect only the graph I selected, so that changing draft navigation does not directly rewrite published navigation.
5. As a content manager, I want route preflight to consider all retained claims in both graph contexts, so that a change cannot create a hidden collision.
6. As a content manager, I want each impact item to identify its graph, owner, source revision, and before/after route, so that I can understand the consequence before committing.
7. As a content manager, I want a conflicting route rejected before any write, so that existing route ownership remains intact.
8. As a content manager, I want the current and published graph digests to be independently verifiable before and after a change, so that I can audit exactly which graph changed.
9. As an operator, I want commit and rollback to preserve canonical snapshot integrity, so that a fault cannot leave an unverified route graph.
10. As a content lifecycle command, I want route preflight and mutation returned as one domain-owned result, so that I do not duplicate route rules outside SiteDefinition.
11. As a projection subsystem, I want published routes to come from a dedicated published graph, so that public rendering never follows draft-only route claims.
12. As a future maintainer, I want source revision IDs recorded on claims, so that a route can be traced to the content state that asserted it.
13. As a plugin author, I want route changes mediated by core APIs, so that no plugin can directly mutate another owner's route claims.

## Implementation Decisions

- `SiteDefinition` is the single owner of the normalized route-claim registry. Other domains request route preflight and mutation through its application-facing contract; they do not construct or write claims directly.
- A claim identity contains `{graph: current|published, routeNfcCasefoldSlash, owner, sourceRevisionId}`. The route key is normalized by NFC Unicode normalization, case folding, and slash canonicalization before uniqueness checks or persistence.
- Current and published claims for the same owner may coexist. A mutation targets exactly one graph; the other graph is retained unchanged unless a separate command explicitly targets it.
- Before mutation, SiteDefinition canonicalizes and hashes both graph snapshots. It computes collision and impact across every claim that remains after the proposed target-graph change, not merely the directly edited claim.
- Each impact record includes graph, owner, from route, to route, and source revision ID. A collision or invalid route returns the shared structured error contract and no mutation result.
- A successful mutation updates the target graph claim set atomically with its caller's application transaction. The resulting hash for each graph must be reproducible from that graph's canonical snapshot. On rollback, both graph hashes equal their pre-command values.
- `ChangeRoute` remains owned by DomainApplication. DomainApplication delegates all route rule evaluation and claim-state mutation to SiteDefinition, receives a preflight result, and combines the approved mutation with its command write-set.
- Published projection may consume only the published graph. The registry must not infer public routes from current claims or perform a draft-to-published promotion implicitly.
- Route ownership is domain-owned, not a plugin table. Any future extension point must carry a declared owner and use this registry; it may not bypass normalization or uniqueness constraints.
- Errors must use `{code, owner, subjectIds, remediation}`. Route diagnostics identify the conflicting normalized route and claim owners only to the degree safe for the local CMS operator.

## Testing Decisions

- **Primary test seam**：`SiteDefinition` route-claim application contract 是唯一最高層測試入口。測試提交 route mutation proposal，觀察 preflight impact、accepted/rejected result 與 current/published canonical graph digest，不針對 normalizer helper 或 registry storage 寫 implementation test。
- Good tests cover equivalent NFC/case/slash inputs, independent current and published claims for one owner, same-graph collision rejection, target-graph isolation, impact content, and source-revision attribution.
- Every rejected proposal must assert unchanged graph snapshots and hashes. Every accepted proposal must assert only the target graph changes and that the returned digest is reproducible from its public canonical representation.
- Integration coverage at the DomainApplication seam verifies `ChangeRoute` consumes SiteDefinition rather than duplicating validation. Route-specific tests stop at the SiteDefinition seam, avoiding duplicated command tests.
- There is no existing route implementation test suite. The consensus contract verifier is prior art for invariants only; new tests must exercise the published route application contract in a disposable local state.

## Out of Scope

- Content revision creation, schema validation, pointer updates, and operation-lineage persistence.
- Media availability and revision-reference behavior.
- URL rendering, navigation UI, static Pages file layout, redirects, SEO metadata, and public delivery.
- Plugin discovery or plugin-owned routing conventions beyond the requirement to use the core registry.

## Further Notes

- Route normalization is a content identity safeguard, not a presentation preference. Any proposed change to normalization changes the claim contract and requires versioned migration analysis.
- This specification intentionally separates route graph behavior from public UI. It supplies the published graph selection that later ProjectionPreview and renderer work consume.
