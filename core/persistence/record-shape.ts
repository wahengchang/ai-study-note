// 輸入形狀守衛：呼叫端可傳入 frozen／null-prototype 的 immutable record，
// 因此只檢查 own data property 的鍵集合，不要求 property 仍可寫或可設定。
export function plainRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const actual = Reflect.ownKeys(descriptors);
    if (actual.some((key) => typeof key !== "string")) return false;
    const orderedActual = (actual as string[]).sort(compareCodeUnits);
    const wanted = [...keys].sort(compareCodeUnits);
    if (orderedActual.length !== wanted.length || orderedActual.some((key, index) => key !== wanted[index])) return false;
    return wanted.every((key) => { const descriptor = descriptors[key]; return descriptor !== undefined && "value" in descriptor; });
  } catch { return false; }
}
function compareCodeUnits(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
