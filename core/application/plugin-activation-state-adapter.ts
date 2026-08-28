import { canonicalJsonBytes, sha256Digest } from "../foundation/index.js";
import type { PersistenceStore } from "../persistence/index.js";
import type { PluginActivationState, PluginActivationStatePort } from "../plugin-host/index.js";

function decode(bytes: Uint8Array, digest: string): PluginActivationState {
  if (sha256Digest(bytes) !== digest) throw new Error("activation state digest");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("activation state bytes");
  }
  const canonical = canonicalJsonBytes(value);
  if (!canonical.ok || !equalBytes(canonical.value, bytes)) throw new Error("activation state canonical");
  // PluginHost 是 activation-state/v2 的唯一 parser；adapter 不複製其 public contract。
  return value as PluginActivationState;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

export function createPersistencePluginActivationStatePort(
  { persistence }: Readonly<{ persistence: Pick<PersistenceStore, "readPluginActivationState" | "compareAndReplacePluginActivationState"> }>,
): PluginActivationStatePort {
  return Object.freeze({
    async read(): Promise<PluginActivationState> {
      const state = persistence.readPluginActivationState();
      if (!state.ok) throw new Error("activation state read");
      return decode(state.value.bytes, state.value.digest);
    },
    async compareAndReplace({ expectedDigest, nextState }): Promise<boolean> {
      const canonical = canonicalJsonBytes(nextState);
      if (!canonical.ok) throw new Error("activation state encode");
      const replaced = persistence.compareAndReplacePluginActivationState({
        expectedDigest,
        next: { bytes: canonical.value, digest: sha256Digest(canonical.value) },
      });
      if (!replaced.ok) throw new Error("activation state replace");
      return replaced.value;
    },
  });
}
