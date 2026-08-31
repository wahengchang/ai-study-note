import { canonicalJsonBytes, copyBytes, sha256Digest, type Digest } from "../foundation/index.js";

import type {
  CurrentRouteClaimProposal, PublishedRouteClaimProposal, RouteClaim, RouteClaimImpact,
  RouteClaimReplacementProposal, RouteClaimReplacementResult, RouteGraph, RouteGraphSnapshot, SiteDefinition,
  SiteDefinitionFailure, SiteDefinitionPersistence, SiteDefinitionResult, SiteDefinitionTransaction,
  ValidatedCurrentRouteClaim, ValidatedPublishedRouteClaim, ValidatedRouteClaimReplacement,
} from "./contracts.js";
import { normalizeRoute } from "./normalization.js";

const messages = {
  INVALID_SITE_DEFINITION_INPUT: "請提供有效的 route owner 與 source Revision。",
  INVALID_ROUTE: "請修正不符合 route-normalization/v1 的 route。",
  ROUTE_CONFLICT: "請選擇未被其他內容占用的 route。",
  ROUTE_CHANGE_REQUIRED: "請改用 ChangeRoute 變更既有 route。",
  ROUTE_CLAIM_NOT_FOUND: "目標 graph 尚無可替換的 active route claim。",
  ROUTE_REPLACEMENT_REQUIRED: "Route 或 source Revision 必須至少變更一項。",
  STALE_ROUTE_PROPOSAL: "Route graph 已變更，請重新取得 proposal。",
  SITE_DEFINITION_STORAGE_FAILURE: "SiteDefinition 操作未完成。",
} as const;
type ClaimInput = Readonly<{ owner: string; route: string; sourceRevisionId: string }>;
type Digests = Readonly<{ current: Digest; published: Digest }>;
type ClaimOperation = "create" | "replacement";
type PreparedState = {
  operation: ClaimOperation;
  targetGraph: RouteGraph;
  previousClaim?: RouteClaim;
  claim: RouteClaim;
  impact?: readonly RouteClaimImpact[];
  baselineDigests: Digests;
  resultingDigests: Digests;
  nextBytes: Uint8Array;
};
type TokenState = { transaction: SiteDefinitionTransaction; state: PreparedState; used: boolean };

export function createSiteDefinition({ persistence }: Readonly<{ persistence: SiteDefinitionPersistence }>): SiteDefinition {
  const prepared = new WeakMap<object, PreparedState>();
  const tokens = new WeakMap<object, TokenState>();
  const fail = <T>(code: keyof typeof messages, subjectIds: readonly string[] = []): SiteDefinitionResult<T> => ({ ok: false, error: { code, owner: "SiteDefinition", subjectIds, remediation: { kind: "message", message: messages[code] } } });
  const graphSnapshot = (graph: RouteGraph, transaction: SiteDefinitionTransaction = persistence): SiteDefinitionResult<RouteGraphSnapshot> => {
    try {
      const listed = transaction.listRouteClaims(graph);
      if (!listed.ok) return fail("SITE_DEFINITION_STORAGE_FAILURE");
      const claims = [...listed.value].sort(compareClaims);
      const encoded = encodeSnapshot(graph, claims);
      if (!encoded.ok) return fail("SITE_DEFINITION_STORAGE_FAILURE");
      return { ok: true, value: { contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph, claims, bytes: copyBytes(encoded.value), digest: sha256Digest(encoded.value) } };
    } catch { return fail("SITE_DEFINITION_STORAGE_FAILURE"); }
  };
  const snapshots = (transaction: SiteDefinitionTransaction = persistence): SiteDefinitionResult<Readonly<{ current: RouteGraphSnapshot; published: RouteGraphSnapshot }>> => {
    const current = graphSnapshot("current", transaction);
    const published = graphSnapshot("published", transaction);
    if (!current.ok || !published.ok) return fail("SITE_DEFINITION_STORAGE_FAILURE");
    return { ok: true, value: { current: current.value, published: published.value } };
  };
  const prepareClaim = (targetGraph: RouteGraph, input: ClaimInput, operation: ClaimOperation): SiteDefinitionResult<PreparedState> => {
    if (!valid(input.owner) || !valid(input.sourceRevisionId)) return fail("INVALID_SITE_DEFINITION_INPUT");
    const normalized = normalizeRoute(input.route);
    if (normalized === null) return fail("INVALID_ROUTE", [input.owner]);
    const all = snapshots();
    if (!all.ok) return all;
    const target = all.value[targetGraph];
    const previousClaim = target.claims.find((claim) => claim.owner === input.owner);
    if (operation === "replacement") {
      if (previousClaim === undefined) return fail("ROUTE_CLAIM_NOT_FOUND", [targetGraph, input.owner]);
      if (previousClaim.normalizedRoute === normalized.normalizedRoute && previousClaim.sourceRevisionId === input.sourceRevisionId) return fail("ROUTE_REPLACEMENT_REQUIRED", [targetGraph, input.owner]);
    }
    const conflict = target.claims.find((claim) => claim.normalizedRoute === normalized.normalizedRoute && claim.owner !== input.owner);
    if (conflict !== undefined) return fail("ROUTE_CONFLICT", [input.owner, normalized.diagnostic]);
    if (operation === "create" && previousClaim !== undefined && previousClaim.normalizedRoute !== normalized.normalizedRoute) return fail("ROUTE_CHANGE_REQUIRED", [input.owner]);
    const claim: RouteClaim = { graph: targetGraph, normalizedRoute: normalized.normalizedRoute, owner: input.owner, sourceRevisionId: input.sourceRevisionId };
    const nextClaims = [...target.claims.filter((item) => item.owner !== input.owner), claim];
    const encoded = encodeSnapshot(targetGraph, nextClaims);
    if (!encoded.ok) return fail("SITE_DEFINITION_STORAGE_FAILURE");
    const baselineDigests = { current: all.value.current.digest, published: all.value.published.digest };
    const resultingDigests = targetGraph === "current"
      ? { current: sha256Digest(encoded.value), published: baselineDigests.published }
      : { current: baselineDigests.current, published: sha256Digest(encoded.value) };
    let impact: readonly RouteClaimImpact[] | undefined;
    if (operation === "replacement" && previousClaim !== undefined) impact = createImpact(targetGraph, previousClaim, claim, targetGraph === "current" ? nextClaims : all.value.current.claims, targetGraph === "published" ? nextClaims : all.value.published.claims);
    return { ok: true, value: { operation, targetGraph, ...(previousClaim === undefined ? {} : { previousClaim: { ...previousClaim } }), claim: { ...claim }, ...(impact === undefined ? {} : { impact }), baselineDigests, resultingDigests, nextBytes: copyBytes(encoded.value) } };
  };
  const validateClaim = (proposal: unknown, transaction: SiteDefinitionTransaction, targetGraph: RouteGraph, operation: ClaimOperation): SiteDefinitionResult<object> => {
    try {
      if (!isObject(proposal)) return fail("STALE_ROUTE_PROPOSAL");
      const state = prepared.get(proposal);
      if (state === undefined || state.operation !== operation || state.targetGraph !== targetGraph || !matchesProposal(proposal, state)) return fail("STALE_ROUTE_PROPOSAL");
      if (!persistence.ownsActiveTransaction(transaction)) return fail("STALE_ROUTE_PROPOSAL");
      const current = graphSnapshot("current", transaction);
      const published = graphSnapshot("published", transaction);
      if (!current.ok || !published.ok || current.value.digest !== state.baselineDigests.current || published.value.digest !== state.baselineDigests.published) return fail("STALE_ROUTE_PROPOSAL");
      const token = {};
      tokens.set(token, { transaction, state, used: false });
      return { ok: true, value: token };
    } catch { return fail("STALE_ROUTE_PROPOSAL"); }
  };
  const applyClaim = (token: object, transaction: SiteDefinitionTransaction, targetGraph: RouteGraph, operation: ClaimOperation): SiteDefinitionResult<RouteClaim | RouteClaimReplacementResult> => {
    try {
      const tokenState = tokens.get(token);
      if (tokenState === undefined || tokenState.used) return fail("STALE_ROUTE_PROPOSAL");
      if (!persistence.ownsActiveTransaction(transaction) || tokenState.transaction !== transaction || tokenState.state.operation !== operation || tokenState.state.targetGraph !== targetGraph) return fail("STALE_ROUTE_PROPOSAL");
      const before = snapshots(transaction);
      if (!before.ok || before.value.current.digest !== tokenState.state.baselineDigests.current || before.value.published.digest !== tokenState.state.baselineDigests.published) return fail("STALE_ROUTE_PROPOSAL");
      tokenState.used = true;
      const replaced = transaction.replaceRouteClaim({ ...tokenState.state.claim });
      if (!replaced.ok) return fail("SITE_DEFINITION_STORAGE_FAILURE");
      const after = snapshots(transaction);
      if (!after.ok || after.value.current.digest !== tokenState.state.resultingDigests.current || after.value.published.digest !== tokenState.state.resultingDigests.published) return fail("SITE_DEFINITION_STORAGE_FAILURE");
      if (operation === "replacement") {
        const impact = createImpact(targetGraph, tokenState.state.previousClaim!, tokenState.state.claim, after.value.current.claims, after.value.published.claims);
        if (!sameImpact(impact, tokenState.state.impact!)) return fail("SITE_DEFINITION_STORAGE_FAILURE");
        return { ok: true, value: { claim: { ...replaced.value }, impact, baselineDigests: { ...tokenState.state.baselineDigests }, resultingDigests: { ...tokenState.state.resultingDigests } } };
      }
      return { ok: true, value: replaced.value };
    } catch { return fail("SITE_DEFINITION_STORAGE_FAILURE"); }
  };
  const commitClaim = <P, T extends object, R>(proposal: P, validate: (value: P, transaction: SiteDefinitionTransaction) => SiteDefinitionResult<T>, apply: (token: T, transaction: SiteDefinitionTransaction) => SiteDefinitionResult<R>): SiteDefinitionResult<R> => {
    try {
      const committed = persistence.runTransaction<R, unknown>((transaction) => {
        const token = validate(proposal, transaction);
        return token.ok ? apply(token.value, transaction) : token;
      });
      if (committed.ok) return committed;
      return isSiteDefinitionFailure(committed.error) ? { ok: false, error: committed.error } : fail("SITE_DEFINITION_STORAGE_FAILURE");
    } catch { return fail("SITE_DEFINITION_STORAGE_FAILURE"); }
  };
  return {
    snapshot(graph) { return graph === "current" || graph === "published" ? graphSnapshot(graph) : fail("INVALID_SITE_DEFINITION_INPUT"); },
    prepareCurrentClaim(input) {
      const state = prepareClaim("current", input, "create");
      if (!state.ok) return state;
      const proposal: CurrentRouteClaimProposal = { contract: "current-route-claim-proposal/v1", baselineDigests: { ...state.value.baselineDigests }, claim: { ...state.value.claim }, resultingDigests: { ...state.value.resultingDigests }, nextCurrentBytes: copyBytes(state.value.nextBytes) };
      prepared.set(proposal, state.value);
      return { ok: true, value: proposal };
    },
    validateCurrentClaimInTransaction(proposal, transaction) {
      const validated = validateClaim(proposal, transaction, "current", "create");
      return validated.ok ? { ok: true, value: validated.value as ValidatedCurrentRouteClaim } : validated;
    },
    applyValidatedCurrentClaimInTransaction(token, transaction) { return applyClaim(token, transaction, "current", "create") as SiteDefinitionResult<RouteClaim>; },
    createCurrentClaim(input) {
      const proposal = this.prepareCurrentClaim(input);
      return proposal.ok ? commitClaim(proposal.value, (value, transaction) => this.validateCurrentClaimInTransaction(value, transaction), (token, transaction) => this.applyValidatedCurrentClaimInTransaction(token, transaction)) : proposal;
    },
    preparePublishedClaim(input) {
      const state = prepareClaim("published", input, "create");
      if (!state.ok) return state;
      const proposal: PublishedRouteClaimProposal = { contract: "published-route-claim-proposal/v1", baselineDigests: { ...state.value.baselineDigests }, claim: { ...state.value.claim, graph: "published" }, resultingDigests: { ...state.value.resultingDigests }, nextPublishedBytes: copyBytes(state.value.nextBytes) };
      prepared.set(proposal, state.value);
      return { ok: true, value: proposal };
    },
    validatePublishedClaimInTransaction(proposal, transaction) {
      const validated = validateClaim(proposal, transaction, "published", "create");
      return validated.ok ? { ok: true, value: validated.value as ValidatedPublishedRouteClaim } : validated;
    },
    applyValidatedPublishedClaimInTransaction(token, transaction) { return applyClaim(token, transaction, "published", "create") as SiteDefinitionResult<RouteClaim>; },
    createPublishedClaim(input) {
      const proposal = this.preparePublishedClaim(input);
      return proposal.ok ? commitClaim(proposal.value, (value, transaction) => this.validatePublishedClaimInTransaction(value, transaction), (token, transaction) => this.applyValidatedPublishedClaimInTransaction(token, transaction)) : proposal;
    },
    prepareRouteClaimReplacement(input) {
      if (!isObject(input) || !isRouteGraph(input.graph)) return fail("INVALID_SITE_DEFINITION_INPUT");
      const state = prepareClaim(input.graph, input, "replacement");
      if (!state.ok) return state;
      const proposal: RouteClaimReplacementProposal = { contract: "route-claim-replacement-proposal/v1", baselineDigests: { ...state.value.baselineDigests }, claim: { ...state.value.claim }, impact: state.value.impact!.map((item) => ({ ...item })), resultingDigests: { ...state.value.resultingDigests }, nextTargetBytes: copyBytes(state.value.nextBytes) };
      prepared.set(proposal, state.value);
      return { ok: true, value: proposal };
    },
    validateRouteClaimReplacementInTransaction(proposal, transaction) {
      if (!isObject(proposal)) return fail("STALE_ROUTE_PROPOSAL");
      const graph = isObject(proposal.claim) && isRouteGraph(proposal.claim.graph) ? proposal.claim.graph : undefined;
      if (graph === undefined) return fail("STALE_ROUTE_PROPOSAL");
      const validated = validateClaim(proposal, transaction, graph, "replacement");
      return validated.ok ? { ok: true, value: validated.value as ValidatedRouteClaimReplacement } : validated;
    },
    applyValidatedRouteClaimReplacementInTransaction(token, transaction) {
      const state = tokens.get(token);
      const targetGraph = state?.state.targetGraph;
      if (targetGraph === undefined) return fail("STALE_ROUTE_PROPOSAL");
      return applyClaim(token, transaction, targetGraph, "replacement") as SiteDefinitionResult<RouteClaimReplacementResult>;
    },
    replaceRouteClaim(input) {
      const proposal = this.prepareRouteClaimReplacement(input);
      return proposal.ok ? commitClaim(proposal.value, (value, transaction) => this.validateRouteClaimReplacementInTransaction(value, transaction), (token, transaction) => this.applyValidatedRouteClaimReplacementInTransaction(token, transaction)) : proposal;
    },
  };
}

function encodeSnapshot(graph: RouteGraph, claims: readonly RouteClaim[]) {
  return canonicalJsonBytes({ contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph, claims: [...claims].sort(compareClaims).map(({ normalizedRoute, owner, sourceRevisionId }) => ({ normalizedRoute, owner, sourceRevisionId })) });
}
// canonical snapshot bytes 與 digest 必須與 host locale／ICU 版本無關，因此排序一律使用 code-unit 順序而非 `localeCompare`。
function compareCodeUnits(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function compareClaims(a: RouteClaim, b: RouteClaim) { return compareCodeUnits(a.normalizedRoute, b.normalizedRoute) || compareCodeUnits(a.owner, b.owner); }
function createImpact(targetGraph: RouteGraph, previousClaim: RouteClaim, claim: RouteClaim, currentClaims: readonly RouteClaim[], publishedClaims: readonly RouteClaim[]): readonly RouteClaimImpact[] {
  const impact = (graph: RouteGraph, claims: readonly RouteClaim[]) => claims.map((item): RouteClaimImpact => ({
    change: graph === targetGraph && item.owner === claim.owner
      ? previousClaim.normalizedRoute === claim.normalizedRoute ? "attribution-only" : "route-move"
      : "retained",
    graph,
    owner: item.owner,
    from: graph === targetGraph && item.owner === claim.owner ? previousClaim.normalizedRoute : item.normalizedRoute,
    to: item.normalizedRoute,
    resultingSourceRevisionId: item.sourceRevisionId,
  }));
  return [...impact("current", currentClaims), ...impact("published", publishedClaims)].sort((left, right) => (left.graph === right.graph ? 0 : left.graph === "current" ? -1 : 1) || compareCodeUnits(left.to, right.to) || compareCodeUnits(left.owner, right.owner));
}
function matchesProposal(proposal: Record<PropertyKey, unknown>, state: PreparedState) {
  const bytesField = state.operation === "create" ? state.targetGraph === "current" ? "nextCurrentBytes" : "nextPublishedBytes" : "nextTargetBytes";
  const contract = state.operation === "create" ? state.targetGraph === "current" ? "current-route-claim-proposal/v1" : "published-route-claim-proposal/v1" : "route-claim-replacement-proposal/v1";
  const nextBytes = proposal[bytesField];
  return proposal.contract === contract && sameDigests(proposal.baselineDigests, state.baselineDigests) && sameClaim(proposal.claim, state.claim) && sameDigests(proposal.resultingDigests, state.resultingDigests) && (state.operation === "create" || sameImpact(proposal.impact, state.impact!)) && nextBytes instanceof Uint8Array && sha256Digest(nextBytes) === state.resultingDigests[state.targetGraph] && sameBytes(nextBytes, state.nextBytes);
}
function sameImpact(value: unknown, expected: readonly RouteClaimImpact[]) {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => isObject(item) && item.change === expected[index]?.change && item.graph === expected[index]?.graph && item.owner === expected[index]?.owner && item.from === expected[index]?.from && item.to === expected[index]?.to && item.resultingSourceRevisionId === expected[index]?.resultingSourceRevisionId);
}
function sameClaim(value: unknown, expected: RouteClaim) { return isObject(value) && value.graph === expected.graph && value.normalizedRoute === expected.normalizedRoute && value.owner === expected.owner && value.sourceRevisionId === expected.sourceRevisionId; }
function sameDigests(value: unknown, expected: Digests) { return isObject(value) && value.current === expected.current && value.published === expected.published; }
function sameBytes(a: Uint8Array, b: Uint8Array) { if (a.byteLength !== b.byteLength) return false; for (let index = 0; index < a.byteLength; index += 1) if (a[index] !== b[index]) return false; return true; }
function isSiteDefinitionFailure(value: unknown): value is SiteDefinitionFailure { return isObject(value) && value.owner === "SiteDefinition" && typeof value.code === "string" && Object.hasOwn(messages, value.code); }
function isObject(value: unknown): value is Record<PropertyKey, unknown> { return typeof value === "object" && value !== null; }
function isRouteGraph(value: unknown): value is RouteGraph { return value === "current" || value === "published"; }
function valid(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
