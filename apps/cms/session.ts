export type AuthoringSession = Readonly<{
  authorizedFetch(path: `/v1/${string}`, init?: RequestInit): Promise<Response>;
}>;

/** localhost CMS 僅接受 same-origin `/v1` 請求，不建立 browser ticket 或儲存 credential。 */
export function openAuthoringSession(): AuthoringSession {
  return {
    async authorizedFetch(path, init = {}) {
      const target = new URL(path, location.origin);
      const exactRouteGraph = target.pathname === "/v1/site/routes" && (target.search === "?selection=current" || target.search === "?selection=published");
      if (target.origin !== location.origin || !target.pathname.startsWith("/v1/") || (!exactRouteGraph && target.search !== "") || target.hash !== "") throw new Error("CMS_INVALID_API_PATH");
      const headers = new Headers(init.headers);
      headers.delete("Authorization");
      return fetch(target, { ...init, headers, credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
    },
  };
}
