import { canonicalJsonBytes, sha256Digest } from "../foundation/index.js";
import type { PersistenceStore } from "../persistence/index.js";
import type { PluginSettingsState, PluginSettingsStatePort } from "../plugin-host/index.js";

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function decode(bytes: Uint8Array, digest: string): PluginSettingsState {
  if (sha256Digest(bytes) !== digest) throw new Error("plugin settings state digest");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("plugin settings state bytes");
  }
  const canonical = canonicalJsonBytes(value);
  if (!canonical.ok || !equalBytes(canonical.value, bytes)) throw new Error("plugin settings state canonical");
  return value as PluginSettingsState;
}

export function createPersistencePluginSettingsStatePort(
  { persistence }: Readonly<{ persistence: Pick<PersistenceStore, "readPluginSettingsState" | "compareAndReplacePluginSettingsState"> }>,
): PluginSettingsStatePort {
  return Object.freeze({
    async read(): Promise<PluginSettingsState> {
      const state = persistence.readPluginSettingsState();
      if (!state.ok) throw new Error("plugin settings state read");
      return decode(state.value.bytes, state.value.digest);
    },
    async compareAndReplace({ expectedDigest, nextState }): Promise<boolean> {
      const canonical = canonicalJsonBytes(nextState);
      if (!canonical.ok) throw new Error("plugin settings state encode");
      const replaced = persistence.compareAndReplacePluginSettingsState({ expectedDigest, next: { bytes: canonical.value, digest: sha256Digest(canonical.value) } });
      if (!replaced.ok) throw new Error("plugin settings state replace");
      return replaced.value;
    },
  });
}
