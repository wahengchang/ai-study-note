---
title: "gstack 兩週實戰：用「階段配方」解決技能選擇困難"
description: "35 個 slash command 記不住、選不對？第二週我才發現問題不在記憶，而在工作階段。本文用四個階段配方，把 gstack 從「指令清單」變成「肌肉記憶」。"
pubDate: 2026-05-27
category: claude-code
tags:
  - playbook
  - claude-code
---

35 個 slash command，我第一週都在背 cheatsheet。第二週才意識到：問題不在「記哪個 command」，而在「現在我處於哪個工作階段」。

[gstack](https://github.com/garrytan/gstack) 的每個 skill 都是高密度的 prompt 工程產物 —— 一個 `/office-hours` 背後是 YC 六個 forcing question，一個 `/plan-eng-review` 鎖死了架構、資料流、邊界、測試五個維度。資訊密度太高，反而是選擇困難的根源：你站在 35 個高品質工具前面，不知道下一步該抓哪一個。

兩週用下來，我得到的解法是把工作切成四個階段，每個階段綁一條固定路徑。我把它叫做 **「階段配方 (Phase Recipe)」**。

（如果還不知道 gstack 是什麼，可以先看 [gstack 概覽](/ai-study-note/blog/garry-tan-gstack-claude-code-engineering-team/)。）

## 一、四個階段配方

| 階段 | 觸發訊號 | 配方 |
|---|---|---|
| **建立** (新功能、新專案) | 「該不該做」、「從零開始」 | `/office-hours` → `/autoplan` → 實作 → `/review` → `/qa` → `/ship` → `/land-and-deploy` → `/document-release` |
| **加功能** (在既有系統上加東西) | 「系統已存在，加一個 endpoint / 元件」 | `/plan-eng-review` → 實作 → `/review` → `/qa` → `/ship` |
| **優化** (效能、體驗) | 「慢」、「不順手」、有可量化的目標 | `/benchmark` → `/investigate` → 改 → `/review` → `/qa` → `/canary` |
| **刪除 / 重構** (動既有結構) | 「這段該不該留」、「能不能拆」 | `/investigate` → `/freeze` → 改 → `/review` → `/qa` → `/ship` |

把這四行貼到 `~/.claude/CLAUDE.md` 或自己的工作 README，每次開工先問一句：**「我現在在哪一格？」** 答案出來，配方自動接上。

## 二、為什麼配方比單一指令重要

每個 gstack skill 都不是萬用工具，它預設你正處在某個階段。`/office-hours` 預設你「還在質疑要不要做」，`/canary` 預設你「剛部署完盯著看」。把 skill 丟到錯的階段，輸出就會錯位。

第一週我看到別人寫 code 前都先跑 `/review`，覺得這應該是「checkin 必做」，於是每寫完一段都 `/review` 一次。結果它每次都告訴我「沒看到架構文件，無法判斷這段是否合理」。後來才懂 —— `/review` 預設前面有 `/plan-eng-review` 鋪好的脈絡 (context)，沒鋪就直接跑，等於問一個不熟你 codebase 的 staff engineer「這段對嗎」。換成「加功能」配方先 `/plan-eng-review` 再 `/review`，輸出立刻變得可操作。

配方的真正價值在於：它把 skill 之間的脈絡傳遞變成默契。`/autoplan` 跑完留下的計畫文件，`/review` 會自動讀；`/qa` 找到 bug 後，`/canary` 接著盯生產環境 console error；`/document-release` 看 diff 寫文件。Garry Tan 自己把這叫做 **Feed-Forward Pipeline** —— 上一步的產物就是下一步的輸入，人不用在中間搬資料。

## 三、配方會在哪裡破功

四個格子不是公式，會破在兩個地方。

**把「加功能」當「建立」**。在既有系統上多開一個 API endpoint，你以為要從 `/office-hours` 重新思考整個產品方向，但其實系統的「為什麼」已經定了，`/office-hours` 會給你一堆無關的替代方案，耗 20 分鐘把思路打亂。直接 `/plan-eng-review` 鎖住新 endpoint 的邊界就好。判準：如果這次改動不會動到使用者價值主張，就是加功能，不是建立。

**「優化」與「重構」混在一起**。優化盯效能數字 (`/benchmark`)，重構動程式碼結構 (`/freeze` + `/investigate`)。混在一起做，`/qa` 會抓不到回歸點 —— 改動範圍太大，測試對照組失效。先做完一邊，commit，再做另一邊。

## 四、怎麼用

開工前先問自己一句話：**「我現在在哪一格？」**

不確定就預設「加功能」—— 它配方最短，`/plan-eng-review` 鎖邊界從來不會浪費時間。確定是「建立」再走長路，那時候 `/office-hours` 的六個 forcing question 才會打在點上。

兩週前我以為熟悉 gstack 是把 35 個指令背起來。現在我覺得是會在第一秒就把任務歸格 —— 配方上身了，指令自然就到位。
