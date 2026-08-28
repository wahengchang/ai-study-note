---
id: cycle-2026-08-28-1045-save-revision-foundation
status: active
created_at: 2026-08-28T10:45:00+08:00
updated_at: 2026-08-28T11:15:00+08:00
---

# Save Revision Foundation

## Goal

完成可信的 `SaveRevision` 草稿儲存基礎，讓有效草稿在單一 transaction 中建立 immutable revision、媒體 references、current pointer、current route claim 與 lineage。

## Scope

處理 #221、#222、#223、#227、#228；包含 Persistence pointers／lineage／references、SiteDefinition current route claim、DataMedia local import，以及 DomainApplication `saveRevision`。

## Context

`contracts/README.md` 是唯一 implementation contract。published pointers 與 published route graph 必須保持隔離；所有 preflight、constraint 與 participant failure 都不得改變 canonical state。
