---
id: WI-067
status: done
title: Media transport contract
work_group: WG-035
depends_on: []
---

# Media transport contract

## Outcome

核准 #286、#287、#317 共同使用的 Application-only Media transport contract；不建立 runtime、schema、route stub 或 CMS UI。

## Acceptance

`contracts/README.md` 固定 Application-only facade、finite Media API/CMS document scope、safe versioned DTO、import/restore body bound、HTTP admission/error mapping，以及 immutable version/current-published pointer/fail-closed invariant；reviewer、security-reviewer 與指定非 owner cross-review 結論均已納入。

## Notes

PR 1 contract/tracking 已完成；runtime 仍須待 Owner 核准並合併 PR 至 `site-reset` 後才可認領 WI-046。
