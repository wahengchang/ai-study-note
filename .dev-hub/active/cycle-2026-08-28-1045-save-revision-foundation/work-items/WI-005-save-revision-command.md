---
id: WI-005
status: done
title: DomainApplication SaveRevision
work_group: WG-001
depends_on:
  - WI-001
  - WI-002
  - WI-003
  - WI-004
---

## Outcome

組成唯一 `DomainApplication.saveRevision` command，以完整 preflight 及一個 transaction 寫入 draft state。

## Acceptance

成功只改 current selection；所有 rejection 與 participant fault 維持 canonical state 完全不變。

## Notes

對應 #228。
