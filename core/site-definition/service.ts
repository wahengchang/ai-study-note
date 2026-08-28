import { canonicalJsonBytes, copyBytes, sha256Digest } from "../foundation/index.js";

import type { RouteClaim, RouteGraph, RouteGraphSnapshot, SiteDefinition, SiteDefinitionPersistence, SiteDefinitionResult, SiteDefinitionTransaction, ValidatedCurrentRouteClaim } from "./contracts.js";
import { normalizeRoute } from "./normalization.js";

const messages = { INVALID_SITE_DEFINITION_INPUT: "請提供有效的 route owner 與 source Revision。", INVALID_ROUTE: "請修正不符合 route-normalization/v1 的 route。", ROUTE_CONFLICT: "請選擇未被其他內容占用的 route。", ROUTE_CHANGE_REQUIRED: "請改用 ChangeRoute 變更既有 route。", STALE_ROUTE_PROPOSAL: "Route graph 已變更，請重新取得 proposal。", SITE_DEFINITION_STORAGE_FAILURE: "SiteDefinition 操作未完成。" } as const;
type TokenState = { transaction: SiteDefinitionTransaction; claim: RouteClaim; used: boolean };

export function createSiteDefinition({ persistence }: Readonly<{ persistence: SiteDefinitionPersistence }>): SiteDefinition {
  const tokens = new WeakMap<object, TokenState>();
  const fail = <T>(code: keyof typeof messages, subjectIds: readonly string[] = []): SiteDefinitionResult<T> => ({ ok: false, error: { code, owner: "SiteDefinition", subjectIds, remediation: { kind: "message", message: messages[code] } } });
  const graphSnapshot = (graph: RouteGraph, transaction: SiteDefinitionTransaction = persistence): SiteDefinitionResult<RouteGraphSnapshot> => {
    const listed = transaction.listRouteClaims(graph);
    if (!listed.ok) return fail("SITE_DEFINITION_STORAGE_FAILURE");
    const claims = [...listed.value].sort((a, b) => a.normalizedRoute.localeCompare(b.normalizedRoute, "en") || a.owner.localeCompare(b.owner, "en"));
    const encoded = canonicalJsonBytes({ contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph, claims: claims.map(({ normalizedRoute, owner, sourceRevisionId }) => ({ normalizedRoute, owner, sourceRevisionId })) });
    if (!encoded.ok) return fail("SITE_DEFINITION_STORAGE_FAILURE");
    return { ok: true, value: { contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph, claims, bytes: copyBytes(encoded.value), digest: sha256Digest(encoded.value) } };
  };
  return {
    snapshot(graph) { return graph === "current" || graph === "published" ? graphSnapshot(graph) : fail("INVALID_SITE_DEFINITION_INPUT"); },
    prepareCurrentClaim(input) {
      if (!valid(input.owner) || !valid(input.sourceRevisionId)) return fail("INVALID_SITE_DEFINITION_INPUT");
      const normalized = normalizeRoute(input.route);
      if (normalized === null) return fail("INVALID_ROUTE", [input.owner]);
      const current = graphSnapshot("current"); const published = graphSnapshot("published");
      if (!current.ok || !published.ok) return fail("SITE_DEFINITION_STORAGE_FAILURE");
      const previousOwner = current.value.claims.find((claim) => claim.owner === input.owner);
      const conflict = current.value.claims.find((claim) => claim.normalizedRoute === normalized.normalizedRoute && claim.owner !== input.owner);
      if (conflict !== undefined) return fail("ROUTE_CONFLICT", [input.owner, normalized.diagnostic]);
      if (previousOwner !== undefined && previousOwner.normalizedRoute !== normalized.normalizedRoute) return fail("ROUTE_CHANGE_REQUIRED", [input.owner]);
      const claim: RouteClaim = { graph: "current", normalizedRoute: normalized.normalizedRoute, owner: input.owner, sourceRevisionId: input.sourceRevisionId };
      const nextClaims = [...current.value.claims.filter((item) => item.owner !== input.owner), claim];
      const encoded = canonicalJsonBytes({ contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph: "current", claims: nextClaims.sort((a,b) => a.normalizedRoute.localeCompare(b.normalizedRoute,"en") || a.owner.localeCompare(b.owner,"en")).map(({ normalizedRoute, owner, sourceRevisionId }) => ({ normalizedRoute, owner, sourceRevisionId })) });
      if (!encoded.ok) return fail("SITE_DEFINITION_STORAGE_FAILURE");
      return { ok: true, value: { contract: "current-route-claim-proposal/v1", baselineDigests: { current: current.value.digest, published: published.value.digest }, claim, resultingDigests: { current: sha256Digest(encoded.value), published: published.value.digest }, nextCurrentBytes: copyBytes(encoded.value) } };
    },
    validateCurrentClaimInTransaction(proposal, transaction) {
      const current = graphSnapshot("current", transaction); const published = graphSnapshot("published", transaction);
      if (!current.ok || !published.ok || current.value.digest !== proposal.baselineDigests.current || published.value.digest !== proposal.baselineDigests.published) return fail("STALE_ROUTE_PROPOSAL");
      const token = {} as ValidatedCurrentRouteClaim; tokens.set(token, { transaction, claim: proposal.claim, used: false }); return { ok: true, value: token };
    },
    applyValidatedCurrentClaimInTransaction(token, transaction) {
      const state = tokens.get(token);
      if (state === undefined || state.transaction !== transaction || state.used) return fail("STALE_ROUTE_PROPOSAL");
      state.used = true; const replaced = transaction.replaceRouteClaim(state.claim);
      return replaced.ok ? replaced : fail("SITE_DEFINITION_STORAGE_FAILURE");
    },
    createCurrentClaim(input) {
      const prepared = this.prepareCurrentClaim(input); if (!prepared.ok) return prepared;
      const committed = persistence.runTransaction<RouteClaim, unknown>((transaction) => { const token = this.validateCurrentClaimInTransaction(prepared.value, transaction); if (!token.ok) return token; const applied = this.applyValidatedCurrentClaimInTransaction(token.value, transaction); return applied; });
      if (!committed.ok || !committed.value) return fail("SITE_DEFINITION_STORAGE_FAILURE"); return committed as SiteDefinitionResult<RouteClaim>;
    },
  };
}
function valid(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
