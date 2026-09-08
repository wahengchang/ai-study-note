import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";

const origin = "http://127.0.0.1:43127";

type Seo = Readonly<{ title?: string; description?: string; canonicalPath?: string }>;
type Analysis =
  | Readonly<{ status: "idle" | "loading" }>
  | Readonly<{ status: "available"; title: string; description?: string; canonicalUrl: string; suggestions: readonly Readonly<{ code: string; field: string }>[] }>
  | Readonly<{ status: "unavailable"; diagnostics: readonly Readonly<{ code: string }>[] }>;
type Api = Readonly<{ get(path: string): Promise<unknown>; post(path: string, body: unknown): Promise<unknown>; clear(): void }>;

function trimOmit(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isRecord(value)) throw new Error("INVALID_CANONICAL_JSON");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
function digest(input: unknown): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(input))).then((bytes) => `sha256:${[...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`);
}
function analysisFrom(value: unknown): Analysis {
  if (!isRecord(value) || !isRecord(value.result) || typeof value.result.status !== "string") return { status: "unavailable", diagnostics: [] };
  if (value.result.status === "available" && isRecord(value.result.preview) && typeof value.result.preview.title === "string" && typeof value.result.preview.canonicalUrl === "string") {
    const suggestions = Array.isArray(value.result.suggestions) ? value.result.suggestions.flatMap((item) => isRecord(item) && typeof item.code === "string" && typeof item.field === "string" ? [Object.freeze({ code: item.code, field: item.field })] : []) : [];
    return { status: "available", title: value.result.preview.title, ...(typeof value.result.preview.description === "string" ? { description: value.result.preview.description } : {}), canonicalUrl: value.result.preview.canonicalUrl, suggestions };
  }
  const diagnostics = Array.isArray(value.result.diagnostics) ? value.result.diagnostics.flatMap((item) => isRecord(item) && typeof item.code === "string" ? [Object.freeze({ code: item.code })] : []) : [];
  return { status: "unavailable", diagnostics };
}
function browserApi(apiKey: string): Api {
  let key: string | undefined = apiKey;
  const request = async (method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> => {
    if (key === undefined) throw new Error("SESSION_LOCKED");
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 401) key = undefined;
    const value = await response.json() as unknown;
    if (!response.ok) throw value;
    return value;
  };
  return Object.freeze({ get: (path) => request("GET", path), post: (path, body) => request("POST", path, body), clear: () => { key = undefined; } });
}
function App({ api }: Readonly<{ api: Api }>) {
  const [entryId, setEntryId] = useState("new-entry");
  const revisionId: string | null = null;
  const [route, setRoute] = useState("/");
  const [title, setTitle] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [description, setDescription] = useState("");
  const [canonicalPath, setCanonicalPath] = useState("");
  const [analysis, setAnalysis] = useState<Analysis>({ status: "idle" });
  const seo = useMemo(() => {
    const seoTitleValue = trimOmit(seoTitle); const descriptionValue = trimOmit(description); const canonicalPathValue = trimOmit(canonicalPath);
    return Object.freeze({ ...(seoTitleValue === undefined ? {} : { title: seoTitleValue }), ...(descriptionValue === undefined ? {} : { description: descriptionValue }), ...(canonicalPathValue === undefined ? {} : { canonicalPath: canonicalPathValue }) } satisfies Seo);
  }, [seoTitle, description, canonicalPath]);
  const content = useMemo(() => Object.freeze({ contract: "site-content/v1" as const, title: trimOmit(title) ?? "Untitled", blocks: Object.freeze([]), seo }), [title, seo]);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setAnalysis({ status: "loading" });
      void digest({ entryId, expectedCurrentRevisionId: revisionId, schemaIdentity: { schemaId: "site-content", version: 1 }, content, route })
        .then((documentDigest) => api.post(`/v1/entries/${encodeURIComponent(entryId)}/seo-analysis`, { contract: "cms-seo-analysis-request/v1", entryId, expectedCurrentRevisionId: revisionId, schemaIdentity: { schemaId: "site-content", version: 1 }, content, route, documentDigest }))
        .then((value) => { if (!cancelled) setAnalysis(analysisFrom(value)); })
        .catch(() => { if (!cancelled) setAnalysis({ status: "unavailable", diagnostics: [] }); });
    }, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [api, entryId, revisionId, route, content]);
  return <main><h1>AI Study Note CMS</h1><label>Entry ID<input value={entryId} onChange={(event) => setEntryId(event.target.value)} /></label><label>Route<input value={route} onChange={(event) => setRoute(event.target.value)} /></label><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><fieldset><legend>SEO</legend><label>SEO title<input value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label><label>Canonical path<input value={canonicalPath} onChange={(event) => setCanonicalPath(event.target.value)} /></label></fieldset><section aria-live="polite" aria-busy={analysis.status === "loading"}>{analysis.status === "available" ? <><h2>{analysis.title}</h2><p>{analysis.description}</p><p>{analysis.canonicalUrl}</p><ul>{analysis.suggestions.map((item) => <li key={`${item.code}-${item.field}`}>{item.code}</li>)}</ul></> : analysis.status === "unavailable" ? <p>SEO analysis unavailable.</p> : <p>SEO analysis idle.</p>}</section></main>;
}

export async function mountCms(root: Element): Promise<void> {
  const hash = new URL(window.location.href).hash;
  const ticket = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("ticket");
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  if (ticket === null) throw new Error("MISSING_BROWSER_TICKET");
  const response = await fetch(`${origin}/_local/browser-session`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract: "browser-session-exchange/v1", ticket }) });
  if (!response.ok) throw new Error("BROWSER_SESSION_EXCHANGE_FAILED");
  const session: unknown = await response.json();
  if (!isRecord(session) || session.contract !== "browser-session/v1" || typeof session.apiKey !== "string") throw new Error("INVALID_BROWSER_SESSION");
  const api = browserApi(session.apiKey);
  window.addEventListener("pagehide", () => api.clear(), { once: true });
  createRoot(root).render(<App api={api} />);
}

const root = document.querySelector("#cms-root");
if (root !== null) void mountCms(root);
