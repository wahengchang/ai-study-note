import assert from "node:assert/strict";
import test from "node:test";

import { openAuthoringSession } from "../../../apps/authoring-api/cms/authoring-session.js";

test("pagehide 在 browser-session exchange 期間中止 request 並鎖定 session", async () => {
  const originalFetch = globalThis.fetch;
  const originalAdd = globalThis.addEventListener;
  const originalRemove = globalThis.removeEventListener;
  const listeners = new Set<EventListener>();
  let signal: AbortSignal | undefined;
  let locks = 0;
  try {
    globalThis.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => { if (type === "pagehide" && typeof listener === "function") listeners.add(listener); }) as typeof addEventListener;
    globalThis.removeEventListener = ((type: string, listener: EventListenerOrEventListenerObject) => { if (type === "pagehide" && typeof listener === "function") listeners.delete(listener); }) as typeof removeEventListener;
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })) as typeof fetch;
    const opening = openAuthoringSession("ticket", () => { locks += 1; });
    for (const listener of listeners) listener(new Event("pagehide"));
    await assert.rejects(opening, { message: "CMS_LOCKED" });
    assert.equal(signal?.aborted, true);
    assert.equal(locks, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.addEventListener = originalAdd;
    globalThis.removeEventListener = originalRemove;
  }
});
