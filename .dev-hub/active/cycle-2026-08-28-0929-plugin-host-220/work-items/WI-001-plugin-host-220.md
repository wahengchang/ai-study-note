---
id: WI-001
status: done
title: Plugin Host trusted activation boundary
work_group: WG-001
depends_on: []
---

## Outcome

交付 #220 PluginHost trusted discovery、manifest/evidence 驗證、exact activation/deactivation 與可持久原子 active snapshot，並建立後續 Application integration issue。

## Acceptance

- 只從 repository-external trusted installed root discover，discovery 不讀 executable/resource 或載入 module。
- activation 在 evidence 與 callback export 驗證後，才以一次 CAS 寫入 exact identity。
- 所有失敗維持 active-state digest，診斷不洩漏受信資料或本機路徑。
- public seam contract test、architecture gate、完整 repository gates 通過；唯一 PR 指向 `site-reset`。

## Notes

不納入 #229 inactive representation、#234 hook invocation、#228 Application transaction 或 Persistence adapter。
