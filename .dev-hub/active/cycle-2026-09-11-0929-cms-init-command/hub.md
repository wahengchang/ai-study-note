---
id: cycle-2026-09-11-0929-cms-init-command
status: completed
created_at: 2026-09-11T09:29:22+08:00
updated_at: 2026-09-11T09:39:12+08:00
---

# CMS 本機初始化命令

## Goal

提供一組可重複執行的 npm 命令，在 repository 外的安全本機目錄建立 CMS demo runtime，並以無參數命令啟動。

## Scope

新增 `cms:init` 與 `cms:start` CLI、其可觀察契約測試，以及與命令矩陣相符的文件。

## Context

`plugin:package` 與 `theme:package` 拒絕 repository 內 installed root；credential store 需要可信任的本機目錄。因此 demo runtime 固定在使用者 HOME 下，不能使用 repository 的 `.local/`。
