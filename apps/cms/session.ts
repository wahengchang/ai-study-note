export type AuthoringSession = Readonly<{
  authorizedFetch(path: `/v1/${string}`, init?: RequestInit): Promise<Response>;
  lock(): void;
}>;

/** API key 僅存在這個 closure；任何 authenticated 401 與 pagehide 都會取消 in-flight request。 */
export async function openAuthoringSession(ticket: string, onLock: () => void): Promise<AuthoringSession> {
  let key: string | undefined;
  let locked = false;
  const exchangeController = new AbortController();
  const inFlight = new Set<AbortController>();
  const lock = (): void => {
    if (locked) return;
    locked = true;
    key = undefined;
    exchangeController.abort();
    removeEventListener("pagehide", lock);
    for (const controller of inFlight) controller.abort();
    inFlight.clear();
    onLock();
  };
  addEventListener("pagehide", lock);
  let exchange: Response;
  try {
    exchange = await fetch("/_local/browser-session", {
      method: "POST", credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "browser-session-exchange/v1", ticket }), signal: exchangeController.signal,
    });
  } catch {
    if (!locked) removeEventListener("pagehide", lock);
    throw new Error(locked ? "CMS_LOCKED" : "BROWSER_SESSION_EXCHANGE_FAILED");
  }
  const reply: unknown = await exchange.json().catch(() => undefined);
  if (locked || !exchange.ok || typeof reply !== "object" || reply === null || Object.getPrototypeOf(reply) !== Object.prototype || Object.keys(reply).length !== 3 || (reply as Record<string, unknown>).contract !== "browser-session/v1" || !Number.isSafeInteger((reply as Record<string, unknown>).generation) || typeof (reply as Record<string, unknown>).apiKey !== "string" || !/^asn_v1_[A-Za-z0-9_-]{43}$/u.test((reply as Record<string, unknown>).apiKey as string)) {
    if (!locked) removeEventListener("pagehide", lock);
    throw new Error(locked ? "CMS_LOCKED" : "BROWSER_SESSION_INVALID");
  }
  key = (reply as Readonly<{ apiKey: string }>).apiKey;
  return {
    async authorizedFetch(path, init = {}) {
      if (key === undefined) throw new Error("CMS_LOCKED");
      const target = new URL(path, location.origin);
      if (target.origin !== location.origin || !target.pathname.startsWith("/v1/") || target.search !== "" || target.hash !== "") throw new Error("CMS_INVALID_API_PATH");
      const controller = new AbortController();
      const externalSignal = init.signal;
      const abort = (): void => controller.abort();
      if (externalSignal?.aborted === true) controller.abort(externalSignal.reason);
      else externalSignal?.addEventListener("abort", abort, { once: true });
      inFlight.add(controller);
      try {
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${key}`);
        const response = await fetch(target, { ...init, headers, signal: controller.signal, credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
        if (response.status === 401) lock();
        return response;
      } finally {
        externalSignal?.removeEventListener("abort", abort);
        inFlight.delete(controller);
      }
    },
    lock,
  };
}
