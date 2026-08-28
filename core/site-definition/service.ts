import { canonicalJsonBytes, copyBytes, sha256Digest, type Digest } from "../foundation/index.js";

import type {
  CurrentRouteClaimProposal, PublishedRouteClaimProposal, RouteClaim, RouteGraph, RouteGraphSnapshot, SiteDefinition,
  SiteDefinitionPersistence, SiteDefinitionResult, SiteDefinitionTransaction, ValidatedCurrentRouteClaim, ValidatedPublishedRouteClaim,
} from "./contracts.js";
import { normalizeRoute } from "./normalization.js";

const messages = { INVALID_SITE_DEFINITION_INPUT: "請提供有效的 route owner 與 source Revision。", INVALID_ROUTE: "請修正不符合 route-normalization/v1 的 route。", ROUTE_CONFLICT: "請選擇未被其他內容占用的 route。", ROUTE_CHANGE_REQUIRED: "請改用 ChangeRoute 變更既有 route。", STALE_ROUTE_PROPOSAL: "Route graph 已變更，請重新取得 proposal。", SITE_DEFINITION_STORAGE_FAILURE: "SiteDefinition 操作未完成。" } as const;
type ClaimInput = Readonly<{ owner: string; route: string; sourceRevisionId: string }>;
type Digests = Readonly<{ current: Digest; published: Digest }>;
type PreparedState = { targetGraph: RouteGraph; claim: RouteClaim; baselineDigests: Digests; resultingDigests: Digests; nextBytes: Uint8Array };
type TokenState = { transaction: SiteDefinitionTransaction; targetGraph: RouteGraph; claim: RouteClaim; used: boolean };

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
  const prepareClaim = (targetGraph: RouteGraph, input: ClaimInput): SiteDefinitionResult<PreparedState> => {
    if (!valid(input.owner) || !valid(input.sourceRevisionId)) return fail("INVALID_SITE_DEFINITION_INPUT");
    const normalized = normalizeRoute(input.route);
    if (normalized === null) return fail("INVALID_ROUTE", [input.owner]);
    const current = graphSnapshot("current"); const published = graphSnapshot("published");
    if (!current.ok || !published.ok) return fail("SITE_DEFINITION_STORAGE_FAILURE");
    const target = targetGraph === "current" ? current.value : published.value;
    const previousOwner = target.claims.find((claim) => claim.owner === input.owner);
    const conflict = target.claims.find((claim) => claim.normalizedRoute === normalized.normalizedRoute && claim.owner !== input.owner);
    if (conflict !== undefined) return fail("ROUTE_CONFLICT", [input.owner, normalized.diagnostic]);
    if (previousOwner !== undefined && previousOwner.normalizedRoute !== normalized.normalizedRoute) return fail("ROUTE_CHANGE_REQUIRED", [input.owner]);
    const claim: RouteClaim = { graph: targetGraph, normalizedRoute: normalized.normalizedRoute, owner: input.owner, sourceRevisionId: input.sourceRevisionId };
    const encoded = encodeSnapshot(targetGraph, [...target.claims.filter((item) => item.owner !== input.owner), claim]);
    if (!encoded.ok) return fail("SITE_DEFINITION_STORAGE_FAILURE");
    const baselineDigests = { current: current.value.digest, published: published.value.digest };
    return {
      ok: true,
      value: {
        targetGraph,
        claim: { ...claim },
        baselineDigests,
        resultingDigests: targetGraph === "current" ? { current: sha256Digest(encoded.value), published: baselineDigests.published } : { current: baselineDigests.current, published: sha256Digest(encoded.value) },
        nextBytes: copyBytes(encoded.value),
      },
    };
  };
  const validateClaim = (proposal: unknown, transaction: SiteDefinitionTransaction, targetGraph: RouteGraph, contract: "current-route-claim-proposal/v1" | "published-route-claim-proposal/v1", bytesField: "nextCurrentBytes" | "nextPublishedBytes"): SiteDefinitionResult<object> => {
    try {
      if (!isObject(proposal)) return fail("STALE_ROUTE_PROPOSAL");
      const state = prepared.get(proposal);
      if (state === undefined || state.targetGraph !== targetGraph || !matchesProposal(proposal, state, contract, bytesField)) return fail("STALE_ROUTE_PROPOSAL");
      const current = graphSnapshot("current", transaction); const published = graphSnapshot("published", transaction);
      if (!current.ok || !published.ok || current.value.digest !== state.baselineDigests.current || published.value.digest !== state.baselineDigests.published) return fail("STALE_ROUTE_PROPOSAL");
      const token = {};
      tokens.set(token, { transaction, targetGraph, claim: { ...state.claim }, used: false });
      return { ok: true, value: token };
    } catch { return fail("STALE_ROUTE_PROPOSAL"); }
  };
  const applyClaim = (token: object, transaction: SiteDefinitionTransaction, targetGraph: RouteGraph): SiteDefinitionResult<RouteClaim> => {
    try {
      const state = tokens.get(token);
      if (state === undefined || state.used) return fail("STALE_ROUTE_PROPOSAL");
      state.used = true;
      if (state.transaction !== transaction || state.targetGraph !== targetGraph) return fail("STALE_ROUTE_PROPOSAL");
      const replaced = transaction.replaceRouteClaim({ ...state.claim });
      return replaced.ok ? replaced : fail("SITE_DEFINITION_STORAGE_FAILURE");
    } catch { return fail("SITE_DEFINITION_STORAGE_FAILURE"); }
  };
  const commitClaim = <P, T extends object>(proposal: P, validate: (value: P, transaction: SiteDefinitionTransaction) => SiteDefinitionResult<T>, apply: (token: T, transaction: SiteDefinitionTransaction) => SiteDefinitionResult<RouteClaim>): SiteDefinitionResult<RouteClaim> => {
    try {
      const committed = persistence.runTransaction<RouteClaim, unknown>((transaction) => {
        const token = validate(proposal, transaction);
        return token.ok ? apply(token.value, transaction) : token;
      });
      return committed.ok ? committed : fail("SITE_DEFINITION_STORAGE_FAILURE");
    } catch { return fail("SITE_DEFINITION_STORAGE_FAILURE"); }
  };
  return {
    snapshot(graph) { return graph === "current" || graph === "published" ? graphSnapshot(graph) : fail("INVALID_SITE_DEFINITION_INPUT"); },
    prepareCurrentClaim(input) {
      const state = prepareClaim("current", input);
      if (!state.ok) return state;
      const proposal: CurrentRouteClaimProposal = { contract: "current-route-claim-proposal/v1", baselineDigests: { ...state.value.baselineDigests }, claim: { ...state.value.claim }, resultingDigests: { ...state.value.resultingDigests }, nextCurrentBytes: copyBytes(state.value.nextBytes) };
      prepared.set(proposal, state.value);
      return { ok: true, value: proposal };
    },
    validateCurrentClaimInTransaction(proposal, transaction) {
      const validated = validateClaim(proposal, transaction, "current", "current-route-claim-proposal/v1", "nextCurrentBytes");
      return validated.ok ? { ok: true, value: validated.value as ValidatedCurrentRouteClaim } : validated;
    },
    applyValidatedCurrentClaimInTransaction(token, transaction) { return applyClaim(token, transaction, "current"); },
    createCurrentClaim(input) {
      const proposal = this.prepareCurrentClaim(input);
      return proposal.ok ? commitClaim(proposal.value, (value, transaction) => this.validateCurrentClaimInTransaction(value, transaction), (token, transaction) => this.applyValidatedCurrentClaimInTransaction(token, transaction)) : proposal;
    },
    preparePublishedClaim(input) {
      const state = prepareClaim("published", input);
      if (!state.ok) return state;
      const proposal: PublishedRouteClaimProposal = { contract: "published-route-claim-proposal/v1", baselineDigests: { ...state.value.baselineDigests }, claim: { graph: "published", normalizedRoute: state.value.claim.normalizedRoute, owner: state.value.claim.owner, sourceRevisionId: state.value.claim.sourceRevisionId }, resultingDigests: { ...state.value.resultingDigests }, nextPublishedBytes: copyBytes(state.value.nextBytes) };
      prepared.set(proposal, state.value);
      return { ok: true, value: proposal };
    },
    validatePublishedClaimInTransaction(proposal, transaction) {
      const validated = validateClaim(proposal, transaction, "published", "published-route-claim-proposal/v1", "nextPublishedBytes");
      return validated.ok ? { ok: true, value: validated.value as ValidatedPublishedRouteClaim } : validated;
    },
    applyValidatedPublishedClaimInTransaction(token, transaction) { return applyClaim(token, transaction, "published"); },
    createPublishedClaim(input) {
      const proposal = this.preparePublishedClaim(input);
      return proposal.ok ? commitClaim(proposal.value, (value, transaction) => this.validatePublishedClaimInTransaction(value, transaction), (token, transaction) => this.applyValidatedPublishedClaimInTransaction(token, transaction)) : proposal;
    },
  };
}

function encodeSnapshot(graph: RouteGraph, claims: readonly RouteClaim[]) {
  return canonicalJsonBytes({ contract: "route-graph-snapshot/v1", normalization: "route-normalization/v1", graph, claims: [...claims].sort(compareClaims).map(({ normalizedRoute, owner, sourceRevisionId }) => ({ normalizedRoute, owner, sourceRevisionId })) });
}
function compareClaims(a: RouteClaim, b: RouteClaim) { return a.normalizedRoute.localeCompare(b.normalizedRoute, "en") || a.owner.localeCompare(b.owner, "en"); }
function matchesProposal(proposal: Record<PropertyKey, unknown>, state: PreparedState, contract: "current-route-claim-proposal/v1" | "published-route-claim-proposal/v1", bytesField: "nextCurrentBytes" | "nextPublishedBytes") {
  const nextBytes = proposal[bytesField];
  return proposal.contract === contract && sameDigests(proposal.baselineDigests, state.baselineDigests) && sameClaim(proposal.claim, state.claim) && sameDigests(proposal.resultingDigests, state.resultingDigests) && nextBytes instanceof Uint8Array && sha256Digest(nextBytes) === state.resultingDigests[state.targetGraph] && sameBytes(nextBytes, state.nextBytes);
}
function sameClaim(value: unknown, expected: RouteClaim) { return isObject(value) && value.graph === expected.graph && value.normalizedRoute === expected.normalizedRoute && value.owner === expected.owner && value.sourceRevisionId === expected.sourceRevisionId; }
function sameDigests(value: unknown, expected: Digests) { return isObject(value) && value.current === expected.current && value.published === expected.published; }
function sameBytes(a: Uint8Array, b: Uint8Array) { if (a.byteLength !== b.byteLength) return false; for (let index = 0; index < a.byteLength; index += 1) if (a[index] !== b[index]) return false; return true; }
function isObject(value: unknown): value is Record<PropertyKey, unknown> { return typeof value === "object" && value !== null; }
function valid(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
