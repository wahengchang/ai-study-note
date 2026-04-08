---
title: 團隊檔案結構與邏輯指南
tags:
  - guide
  - openclaw
  - devops
description: "Four file structure types by project complexity — daily logs, indexed series, multi-source, and cross-team collaboration"
---

- **發佈者：** File Management Team
- **對象：** 全體團隊成員
- **最後更新：** 2026 年 3 月

## 概述

為了確保工作效率與知識留存，我們依據專案複雜度定義了四種檔案結構。請在建立、更新及閱讀檔案時遵循以下規範。

## Type 1-A：簡單每日紀錄

- **路徑：** `workspace/topic/[date].md`
- **適用情境：** 簡單的時間序列追蹤（例如每日會議筆記、單一進度流）。
- **邏輯：** 每天每個 topic 一個檔案，當天所有更新都寫在同一個檔案裡。

### 建立 / 更新

- 檔案不存在就建立（例如 `2026-03-06.md`）。
- 檔案已存在就直接追加內容，並附上時間戳。

### 閱讀

- 查看特定日期的檔案即可瞭解當天進度。

## Type 1-B：每日紀錄 + Master Overview

- **路徑：** `workspace/topic/[date].md` 及 `workspace/topic/overview.md`
- **適用情境：** 需要為管理層或跨部門團隊提供高層摘要的持續性專案。
- **邏輯：** 與 1-A 相同，另外在 topic 根目錄維護一份 `overview.md`。

### 建立 / 更新

- 照常更新 `[date].md`。
- **重要：** 完成當天紀錄後，在 `overview.md` 中加入 1-2 條摘要，並附上指向當天紀錄的連結。

### 閱讀

- 讀 `overview.md` 掌握全局；點連結可查看每日細節。

## Type 2-A：Sub-Topic 每日資料夾

- **路徑：** `workspace/topic/[date]/[sub-topic].md`
- **適用情境：** 當天有多條獨立工作流並行（例如 Frontend、Backend、Design 同時進行）。
- **邏輯：** 建立「每日資料夾」，裡面為每個 sub-topic（工作流）各開一個檔案。

### 建立 / 更新

- 建立日期資料夾。
- 建立或更新你負責的 `[sub-topic].md`（例如 `2026-03-06/backend.md`）。
- 不要覆寫別人的檔案。

### 閱讀

- 進入日期資料夾，查看特定 sub-topic 的獨立進度。

## Type 2-B：完整矩陣結構

- **路徑：** `workspace/topic/[date]/[sub-topic].md` 及 `workspace/topic/[date]/overview.md` 及 `workspace/topic/overview.md`
- **適用情境：** 跨多團隊的大型長期複雜專案。
- **邏輯：** 最嚴謹的結構，結合每日 sub-topic 檔案、每日 overview，以及專案層級的 master overview。

### 建立 / 更新

- **成員：** 在日期資料夾中更新你的 `[sub-topic].md`。
- **Lead：** 每天結束時，將所有 sub-topic 更新彙整到 `[date]/overview.md`。
- **Lead：** 將每日 overview 濃縮成一句話，更新至 master `workspace/topic/overview.md`。

### 閱讀

- **主管：** 讀 master `overview.md` 掌握專案健康狀態。
- **Lead：** 讀 `[date]/overview.md` 瞭解當日總產出。
- **成員：** 讀特定 `[sub-topic].md` 取得技術細節。

## 重要規則：標準命名格式

為確保檔案正確排序，所有日期變數（資料夾與檔案名稱）一律使用 `YYYY-MM-DD` 格式。

- 正確：`2026-03-06.md`
- 錯誤：`March-6.md`、`03-06-2026.md`、`today.md`
