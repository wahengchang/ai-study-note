---
id: WI-003
status: done
title: Application Plugin composition
work_group: WG-001-plugin-lifecycle-integration
depends_on:
  - WI-001
  - WI-002
---

# Outcome

以真實 PluginHost snapshot 接入 async `DomainApplication.saveRevision`，在任何 canonical write 前完成 Plugin validation，且只更新 current lifecycle state。

# Acceptance

- `pluginHost` 是 required dependency，成功回傳 lifecycle `stateDigest` 與獨立 `activePluginStateDigest`。
- validator 或 transaction fault 保持 revision、references、lineage、pointer、claim 與 published state 不變。
- snapshot 後 activation state 改變不影響本次 operation，下一次 SaveRevision 才觀察新 state。

# Notes

對應 GitHub #246。