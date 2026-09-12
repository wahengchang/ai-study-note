---
id: WI-070
status: pending
title: Content Type migration transport contract hardening
work_group: null
depends_on: ["WI-042"]
---

# Content Type migration transport contract hardening

## Outcome

補齊 GitHub #282 尚未滿足的 `content-type-migration/v1` strict transport 與 failure mapping acceptance，之後才可關閉 #282。

## Required gap

PR #369 的 merge review 已明確記錄三個直接影響 #282 acceptance 的缺口：nested `z.unknown()` 未形成 transport-owned strict DTO、Application direct caller 未完整驗證 mapping/pointer policy 元素、schema-version collision 被收斂為 500 而非 conflict。必須同時補上 actual-listener regression，覆蓋 stale、partial/invalid mapping、blocked outcome、credential/admission rejection zero mutation 與 safe error envelope。

## Scope

只修正 Content Type migration 的 Application／Authoring API contract seam 與可觀察 regression；不擴張 CMS migration UI、schema lifecycle 或其他 API route。

## Notes

由 Backlog Closeout Batch 在 2026-09-12 依 PR #369 review evidence 開立。WI-042／WG-041 的既有 migration delivery 維持 done/completed；GitHub #282 保持 OPEN，直到本項完成。
