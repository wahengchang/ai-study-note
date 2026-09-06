import { startPublicUi } from "./index.js";

function argumentsOf(values: readonly string[]): Readonly<{ artifactsRoot: string; artifactDigest: `sha256:${string}`; basePath: string; port?: number }> | undefined {
  const options = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (key === undefined || value === undefined || !["--artifacts-root", "--artifact-digest", "--base-path", "--port"].includes(key) || options.has(key)) return undefined;
    options.set(key, value);
  }
  const artifactsRoot = options.get("--artifacts-root");
  const artifactDigest = options.get("--artifact-digest");
  const basePath = options.get("--base-path");
  const portText = options.get("--port");
  const port = portText === undefined ? undefined : Number(portText);
  if (artifactsRoot === undefined || artifactDigest === undefined || basePath === undefined || (port !== undefined && (!Number.isSafeInteger(port) || port < 1 || port > 65_535))) return undefined;
  return port === undefined ? { artifactsRoot, artifactDigest: artifactDigest as `sha256:${string}`, basePath } : { artifactsRoot, artifactDigest: artifactDigest as `sha256:${string}`, basePath, port };
}

const input = argumentsOf(process.argv.slice(2));
if (input === undefined) {
  console.error("用法：npm run site:serve -- --artifacts-root <絕對路徑> --artifact-digest <sha256:...> --base-path /repository/");
  process.exitCode = 1;
} else {
  const started = await startPublicUi(input);
  if (!started.ok) {
    console.error(`${started.error.code}: ${started.error.remediation.message}`);
    process.exitCode = 1;
  } else {
    console.log(`${started.value.origin}${started.value.basePath}`);
    process.once("SIGINT", () => { void started.value.close(); });
    process.once("SIGTERM", () => { void started.value.close(); });
  }
}
