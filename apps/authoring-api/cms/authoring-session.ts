type Lock = () => void;
type SessionReply = Readonly<{ contract: "browser-session/v1"; generation: number; apiKey: string }>;

export interface AuthoringSession {
  authorizedFetch(path: `/v1/${string}`, init?: RequestInit): Promise<Response>;
  lock(): void;
}

function isSessionReply(value: unknown): value is SessionReply {
  if (typeof value !== "object" || value === null || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 3 && record.contract === "browser-session/v1" && Number.isSafeInteger(record.generation) && (record.generation as number) > 0 && typeof record.apiKey === "string" && /^asn_v1_[A-Za-z0-9_-]{43}$/u.test(record.apiKey);
}

/** API key 永遠留在此 closure；任何 authenticated 401 都中止所有 request 並清除 session。 */
export async function openAuthoringSession(ticket: string, onLock: Lock): Promise<AuthoringSession> {
  const exchange = await fetch("/_local/browser-session", {
    method: "POST",
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract: "browser-session-exchange/v1", ticket }),
  });
  if (!exchange.ok) throw new Error("BROWSER_SESSION_EXCHANGE_FAILED");
  const parsed: unknown = await exchange.json().catch(() => undefined);
  if (!isSessionReply(parsed)) throw new Error("BROWSER_SESSION_INVALID");

  let key: string | undefined = parsed.apiKey;
  const inFlight = new Set<AbortController>();
  const lock = (): void => {
    if (key === undefined) return;
    key = undefined;
    for (const controller of inFlight) controller.abort();
    inFlight.clear();
    onLock();
  };
  return {
    async authorizedFetch(path, init = {}) {
      if (key === undefined) throw new Error("CMS_LOCKED");
      const target = new URL(path, location.origin);
      if (target.origin !== location.origin || !target.pathname.startsWith("/v1/") || target.search.length !== 0 || target.hash.length !== 0) throw new Error("CMS_INVALID_API_PATH");
      const controller = new AbortController();
      const externalSignal = init.signal;
      const abortExternal = (): void => controller.abort();
      externalSignal?.addEventListener("abort", abortExternal, { once: true });
      inFlight.add(controller);
      try {
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${key}`);
        const response = await fetch(target, { ...init, headers, signal: controller.signal, credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
        if (response.status === 401) lock();
        return response;
      } finally {
        externalSignal?.removeEventListener("abort", abortExternal);
        inFlight.delete(controller);
      }
    },
    lock,
  };
}
