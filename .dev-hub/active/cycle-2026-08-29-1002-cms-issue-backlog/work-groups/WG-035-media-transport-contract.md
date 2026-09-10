---
id: WG-035
status: completed
title: Media transport contract
work_items: ["WI-067"]
owner: Main
branch: feature/media-transport-contract
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset/.dev-hub/worktrees/media-transport-contract
pr: null
---

# Media transport contract

## Delivery

只更新 `contracts/README.md` 與 Dev Hub tracking，核准 Application-only Media facade、finite API/CMS scope、safe versioned DTO 與 transport fail-closed boundary；不建立 table、route stub 或 UI。

## Verification

`npm run check:architecture` 與 `git diff --check` 通過。reviewer 審 immutable version/current-published pointer/reference；security-reviewer 審 admission、body bound、fail-closed、base64url canonicalization 與 secret redaction；DataMedia/CMS workspace non-owner cross-review及獨立 reviewer arbitration 皆 ACCEPT。pending importId contract correction 改為既有 staged→pending 流程可證明的 409 admission：先行 pending check 與 O_EXCL staging collision 都不得產生 canonical mutation 或外洩 import ID／儲存原因；DataMedia integrity 與 security reviewer 均 ACCEPT。只改 `contracts/README.md` 與 Dev Hub tracking，未建立 runtime、table、route stub 或 UI。
