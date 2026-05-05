---
title: "Dan Koe 的 Project-First Learning：先動手撞牆，再去搜尋"
description: "Dan Koe 反過來的學習配方：先選真實專案動手做、撞牆暴露缺口、需要時才向 AI 搜尋——「飢餓搜尋」比預讀更黏記憶。"
pubDate: 2026-05-04
category: prompt-notes
tags:
  - research
  - prompt-engineering
people:
  - dan-koe
draft: false
---

預讀完整個技術才動手，是浪費你大腦的記憶機制。Dan Koe 在 [How To Learn Anything With AI](https://thedankoe.com/letters/how-to-learn-anything-10x-faster-than-anyone-with-ai/) 提出反過來的配方：先選一個真實專案動手做、撞牆暴露知識缺口、缺口出現時才向 AI 搜尋與發問。我把它叫 **Project-First Learning**，核心機制是「飢餓搜尋」（hungry search）。

## 4 步檢查清單（複製貼上即用）

```
Project-First Learning 檢查清單（Dan Koe）

[ ] Step 1：寫人生過濾器
    - 10+ 條「我不要在生活中出現的」
    - 10+ 條「我想要的（具體可驗證）」

[ ] Step 2：選一個朝向目標的專案
    - Brain dump 所有想到的
    - 找 3–5 個靈感來源、拆解它們的結構
    - 列里程碑與需要的知識項目
    - 建一個簡單的想法捕捉系統

[ ] Step 3：用「現有知識」起步
    - 不看 tutorial、直接動手
    - 撞牆 → 記下「卡在哪」
    - 缺口出現時才搜尋、問 AI 或專家

[ ] Step 4：建立學習節奏
    - 每日 30–90 min 建專案
    - 每日 30–60 min 讀書／吸收
    - 每日 30 min 走路時聽相關內容

[ ] 補充：寫作反思
    - 週報整理本週學到什麼
    - 社群發文記錄觀點與進度
```

四步是骨架，「飢餓搜尋」才是引擎。Step 3 那句「直接動手」不是建議勇敢，是利用認知系統的記憶機制。

## 為什麼「飢餓搜尋」比預讀好

預讀的問題是：你還沒有 question，所以 answer 黏不住。讀完你只是把資訊存到短期記憶，下次遇到同樣情境時，腦會用模糊的「我好像看過」回應，而不是把確切的解法調出來。

Dan Koe 引用四個機制解釋為何 Project-First Learning 比較有效：

- **Feynman Technique** — 你必須教給別人才知道自己不懂。建專案＝持續對自己解釋。
- **Protégé Effect** — 角色從學生切到老師時記憶留存提升。「為了專案而學」就是切到老師角色。
- **Zeigarnik Effect** — 未完成的事更容易被腦袋記住。一個進行中的專案是 24/7 的開放迴路。
- **Default Mode Network** — 你不在主動工作時，大腦在背景處理未解問題。Step 4 那 30 分鐘走路時聽內容的 ritual 不是無聊，是讓 DMN 接手。

四個機制有共通點：**它們都依賴「未完成 + 有失敗紀錄」**。預讀沒有失敗、沒有未完成、沒有教學需求，所以一條都不啟動。

## Dan Koe 的核心轉換句

> The best way to learn is to build a real world project and only search for information when you need it.

關鍵詞是 `only`。多數人看到問題會立刻 Google，預防性地查所有相關概念。Project-First Learning 反過來：忍住不查、直接動手、卡到出血才查——因為這時你的腦正餓著，搜尋結果會被牢牢印上去。

對工程師翻譯：別看完整個 framework 文件再寫第一行 code。寫第一行、build 失敗、看 stack trace、搜這個 trace、修、再寫第二行。每一輪 build → fail → search → fix 就是一次完整的 hungry search 循環，stack trace 比 chapter 1 的概念圖容易記住一百倍。

## 哪裡會壞掉

兩個 failure mode：

**第一是專案選錯規模。** 如果第一個專案是「重寫 Linux kernel」，撞牆密度高到你連續被打到放棄。Project-First Learning 預設你選的是「1–4 週能看到第一個工作版本」的專案。Dan Koe 在 Step 2 強調 `outline` 與里程碑就是這個目的——讓撞牆有節奏，而不是連續被淹。

**第二是「飢餓」變成「焦慮」。** 連續撞牆而沒有任何修復節點，腦會停止學習進入恐慌模式。Step 4 的 90 min build + 60 min study + 30 min walk 不是 productivity 噱頭，是給腦袋切換到吸收模式的安全閥。少了 study block，hungry search 會退化成 frantic Google。

## 今天就能做的版本

選一個 1–2 週能完成的工作專案。寫一張紙（非數位，紙）：

1. 我要做什麼？
2. 第一個工作版本長怎樣？
3. 現在能做的第一個 30 分鐘步驟是什麼？

然後就動手——不開教學頁、不看其他人怎麼做。卡住的瞬間，把卡點寫下來再去搜尋。一週後回來看那張紙，標記「實際撞牆的點」與「預想的撞牆點」差多少。差距就是你 Project-First Learning 第一次跑下來真正學到的東西。

## 想接著讀什麼

對比 [Karpathy 的 LLM-Maintained Wiki Pattern](/ai-study-note/blog/karpathy-llm-wiki-pattern/)——飢餓搜尋的書面延伸：你建一個個人 wiki、讓 AI 持續維護、每次搜尋的問題比上次更精準。
