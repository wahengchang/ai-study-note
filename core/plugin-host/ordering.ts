// Plugin ID、hook 與 resource file 都是 canonical ASCII；identity 與 manifest hash 必須與
// host 執行環境的 locale 無關，因此排序一律使用 code-unit 順序而非 `localeCompare`。
export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
