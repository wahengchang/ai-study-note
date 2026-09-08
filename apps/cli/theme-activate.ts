import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { canonicalJsonBytes, sha256Digest } from "../../core/foundation/index.js";
import { openPersistence, type PersistenceStore } from "../../core/persistence/index.js";
import { createThemeHost, type ThemeActivationState, type ThemeActivationStatePort } from "../../core/theme-host/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function decode(bytes: Uint8Array, digest: string): ThemeActivationState {
  if (sha256Digest(bytes) !== digest) throw new Error("theme activation digest");
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const canonical = canonicalJsonBytes(value);
  if (!canonical.ok || !equalBytes(canonical.value, bytes)) throw new Error("theme activation state");
  return value as ThemeActivationState;
}

function statePort(persistence: PersistenceStore): ThemeActivationStatePort {
  return Object.freeze({
    async read(): Promise<ThemeActivationState> {
      const result = persistence.readThemeActivationState();
      if (!result.ok) throw new Error("theme activation read");
      return decode(result.value.bytes, result.value.digest);
    },
    async compareAndReplace({ expectedDigest, nextState }): Promise<boolean> {
      const bytes = canonicalJsonBytes(nextState);
      if (!bytes.ok) throw new Error("theme activation encode");
      const result = persistence.compareAndReplaceThemeActivationState({ expectedDigest, next: { bytes: bytes.value, digest: sha256Digest(bytes.value) } });
      if (!result.ok) throw new Error("theme activation replace");
      return result.value;
    },
  });
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  let database: string | undefined; let installedThemesRoot: string | undefined; let id: string | undefined;
  try { const parsed = parseArgs({ args: argv, options: { database: { type: "string" }, "installed-themes-root": { type: "string" }, id: { type: "string" } }, strict: true }); database = parsed.values.database; installedThemesRoot = parsed.values["installed-themes-root"]; id = parsed.values.id; } catch { process.stderr.write("THEME_ACTIVATE_FAILED code=INVALID_ARGUMENTS\n"); process.exitCode = 2; return; }
  if (database === undefined || database.trim() === "" || installedThemesRoot === undefined || installedThemesRoot.trim() === "" || id !== "study-notes") { process.stderr.write("THEME_ACTIVATE_FAILED code=INVALID_ARGUMENTS\n"); process.exitCode = 2; return; }
  const opened = openPersistence({ databasePath: database });
  if (!opened.ok) { process.stderr.write(`THEME_ACTIVATE_FAILED code=${opened.error.code}\n`); process.exitCode = 1; return; }
  const host = await createThemeHost({ repositoryRoot, installedThemesRoot, activationState: statePort(opened.value) });
  if (!host.ok) { process.stderr.write(`THEME_ACTIVATE_FAILED code=${host.error.code}\n`); process.exitCode = 1; return; }
  const candidates = await host.value.discover();
  if (!candidates.ok) { process.stderr.write(`THEME_ACTIVATE_FAILED code=${candidates.error.code}\n`); process.exitCode = 1; return; }
  const identity = candidates.value.candidates.find((candidate) => candidate.id === id);
  if (identity === undefined) { process.stderr.write("THEME_ACTIVATE_FAILED code=THEME_NOT_FOUND\n"); process.exitCode = 1; return; }
  const activated = await host.value.activate({ identity });
  if (!activated.ok) { process.stderr.write(`THEME_ACTIVATE_FAILED code=${activated.error.code}\n`); process.exitCode = 1; return; }
  process.stdout.write(`THEME_ACTIVATE_OK id=${identity.id} digest=${activated.value.digest}\n`);
}
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) void main();
