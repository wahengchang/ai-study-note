---
id: WI-004
status: done
title: Revision media references
work_group: WG-001
depends_on:
  - WI-003
---

## Outcome

讓 immutable Revision 以 composite foreign keys 參照完整 ready asset-version identity。

## Acceptance

reference creation 與 revision creation 在同一 typed transaction，任一 fault 都完整 rollback。

## Notes

對應 #227。
