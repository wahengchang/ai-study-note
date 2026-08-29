---
id: WI-001
status: done
title: Plugin exact re-enable lifecycle
work_group: WG-001-plugin-lifecycle-integration
depends_on: []
---

# Outcome

提供 v2 activation state、exact identity activation／deactivation、drift latch、byte-bound callback runtime，並以 generic CMS editor-block envelope 回報 active、inactive、missing、identity-changed。

# Acceptance

- active identity missing 或 mismatch 時移入 durable `reactivationRequired`，且只接受 exact explicit re-enable。
- inactive、missing、identity-changed 零 module、callback、facade 執行，且保留 canonical source evidence。
- 受信任 root、entry 與 resource evidence 均 fail closed；runtime 僅使用已驗證 entry bytes。

# Notes

對應 GitHub #229。
完成 durable exact-identity reactivation latch、trusted-root evidence gate 與 CMS editor-block 四態 resolution；已通過 `node --import tsx --test tests/core/plugin-host/plugin-host.test.ts tests/core/plugin-host/locale-determinism.test.ts`。
