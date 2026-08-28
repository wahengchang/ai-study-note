const activationProbeLoads = Reflect.get(globalThis, "__activationProbeLoads");
Reflect.set(globalThis, "__activationProbeLoads", typeof activationProbeLoads === "number" ? activationProbeLoads + 1 : 1);

export function validateSaveRevision() {
  throw new Error("activation-probe hook must not execute");
}

export function resolveEditorBlock() {
  throw new Error("activation-probe hook must not execute");
}
