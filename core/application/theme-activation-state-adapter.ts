import { canonicalJsonBytes, sha256Digest } from "../foundation/index.js";
import type { PersistenceStore } from "../persistence/index.js";
import type { ThemeActivationState, ThemeActivationStatePort } from "../theme-host/index.js";

function equalBytes(left: Uint8Array, right: Uint8Array): boolean { return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]); }

function decode(bytes: Uint8Array, digest: string): ThemeActivationState {
  if (sha256Digest(bytes) !== digest) throw new Error("theme activation state digest");
  const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const canonical = canonicalJsonBytes(value);
  if (!canonical.ok || !equalBytes(canonical.value, bytes)) throw new Error("theme activation state bytes");
  return value as ThemeActivationState;
}

export function createPersistenceThemeActivationStatePort(
  { persistence }: Readonly<{ persistence: Pick<PersistenceStore, "readThemeActivationState" | "compareAndReplaceThemeActivationState"> }>,
): ThemeActivationStatePort {
  return Object.freeze({
    async read(): Promise<ThemeActivationState> {
      const state = persistence.readThemeActivationState();
      if (!state.ok) throw new Error("theme activation state read");
      return decode(state.value.bytes, state.value.digest);
    },
    async compareAndReplace({ expectedDigest, nextState }): Promise<boolean> {
      const canonical = canonicalJsonBytes(nextState);
      if (!canonical.ok) throw new Error("theme activation state encode");
      const replaced = persistence.compareAndReplaceThemeActivationState({ expectedDigest, next: { bytes: canonical.value, digest: sha256Digest(canonical.value) } });
      if (!replaced.ok) throw new Error("theme activation state replace");
      return replaced.value;
    },
  });
}
