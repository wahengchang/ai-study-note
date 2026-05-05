---
title: "Dan Koe 的 Two-Layer Reading：別用 AI 摘要、用它當閱讀夥伴"
description: "Dan Koe 用 AI 讀書的兩層配方：Layer 1 邊讀邊問、Layer 2 寫成自己的，把摘要式 LLM 用法反過來——讀完還記得的關鍵不在 AI、在「自己寫一遍」這層。"
pubDate: 2026-05-04
category: prompt-notes
tags:
  - research
  - prompt-engineering
people:
  - dan-koe
draft: false
---

把書丟給 AI、按下「summarize」、看完摘要、闔上 tab——一週後問你那本書在講什麼，你只記得「好像很有道理」。Dan Koe 在 [How To Remember Everything You Read With AI](https://thedankoe.com/letters/how-to-remember-everything-you-read-with-ai/) 把這個預設用法拆掉，提出 **Two-Layer Reading**：Layer 1 把 AI 當閱讀夥伴（邊讀邊問）、Layer 2 把書消化成自己寫的東西。摘要這步從來沒在配方裡。

## 兩層工作流（tool-agnostic 版）

```
Two-Layer Reading 工作流（Dan Koe）

Layer 1：閱讀夥伴（Consumption）
[ ] 把書（PDF / EPUB / Markdown）丟進有長 context 的 AI
    - Claude Projects、ChatGPT、NotebookLM、Gemini 都可以
[ ] 第一句訊息：
    "Help me understand this book as I read it.
     當我貼段落給你時，不要摘要——要問我問題、
     確認我有沒有真的看懂。"
[ ] 邊讀邊把困惑段貼回去問 → 不打斷 reading flow
[ ] 自己 paraphrase 重要段落 → 丟回 AI 問
    "這個 paraphrase 有抓到原意嗎？我漏了什麼？"

Layer 2：消化（Digestion）—— 三選一或全做
[ ] 主題探索：對核心概念追問
    "這個概念跟我目前的目標有什麼關係？
     實作上會踩到什麼障礙？"
[ ] 行動翻譯：把書的結論轉成本週／本月的具體行動
    "把這本書的論點換成 3 個我這個月做得到的步驟"
[ ] Synthesis through writing：
    1. 自己先寫 outline（不要 AI 起草）
    2. 寫 draft 卡住時問：
       "我這段論述卡在哪？我想說 X，但寫出來像 Y。"
       "我下一段該接什麼？這裡讀者會有什麼疑問？"
```

兩層分工很清楚：Layer 1 處理「看懂」、Layer 2 處理「留下來」。多數人把 AI 用在 Layer 0（摘要），所以兩層都跳過。

## 為什麼摘要式用法會壞掉

預設操作是：把書丟給 AI、要一份 5 點摘要、讀完。問題是這個動作沒有產生任何 retrieval cue——你的腦從沒被迫把書的概念叫出來、組合、檢驗。記憶要長期黏住，至少要被叫出來一次。

Two-Layer Reading 的兩個機制就是強迫 retrieval：

- **Layer 1 的 paraphrase 問句** 是把「我以為自己懂的」轉成自己的話。這是 Feynman Technique 的低門檻版——不用講給朋友聽，講給 AI 聽。AI 比朋友更有耐心、更會 spot 你 paraphrase 漏掉的細節。
- **Layer 2 的 synthesis through writing** 是把書接到自己已知的脈絡。寫 outline 那步**禁止 AI 起草**，因為一旦讓 AI 起頭，整篇 draft 的論述肌肉就萎縮了。AI 只在你卡住時介入回答 surgical 問題（「這段卡在哪」），不接管整段論述。

兩層的共同點是：**AI 永遠在『回答你』，不在『代替你』**。這個邊界一破，retrieval 就死了。

## Dan Koe 的核心句子

> Reading deepens understanding and changes identity in ways AI cannot replicate.

第二句翻譯不出來中文的力道，但功能性版本是：**摘要可以代寫、retrieval 不能代做**。AI 處理不了 retrieval 那一段，所以那一段必須是你自己的工作。Two-Layer 的設計就是把「AI 能做的」和「你必須自己做的」分開，而不是把所有「閱讀理解」交給 AI。

對工程師翻譯：把書當成 codebase。Layer 1 是 `Read` 模式——你跟 AI 一起 grep、追 reference、問「這個 function 為什麼這樣寫」。Layer 2 是寫一份 internal RFC 介紹這個 codebase 給你的同事——自己先寫 outline，AI 只 review、不代寫。寫完那份 RFC，你才真的「跑過」這個 codebase。摘要是裝跑過。

## 哪裡會壞掉

兩個 failure mode：

**第一是 AI 太順，paraphrase 從沒被打槍。** 大多數通用模型對 paraphrase 都會說「對的，你掌握了核心」——禮貌、無用。Layer 1 的 prompt 要明確指示 AI「不要客氣、找出我漏掉的 nuance」。如果 AI 連續 3 次都說 paraphrase 完美，換模型或加 system prompt 強度。

**第二是 Layer 2 略過。** Layer 1 做完很爽——感覺懂了一本書。如果不寫 Layer 2，一週後你會發現自己只記得「Dan Koe 那本書還不錯」，內容全忘。Layer 2 的 synthesis through writing 是不可選的。

## 今天就能做的版本

選一本你正在讀的書（或一篇長文）。第一段話設定好 AI prompt：「不要摘要、要問我問題」。讀 30 分鐘，期間至少貼 2 個段落回去 paraphrase。讀完當天寫 200 字 outline——隨便哪個寫作 app、純自己寫——主題是「這本書（章）在 argue 什麼，我同意哪、不同意哪」。寫完才能讓 AI review。

下次再翻這本書，看你的 200 字 outline 比看書還快。Two-Layer Reading 留下的就是這份 outline，不是 AI 的摘要。

## 想接著讀什麼

[Dan Koe 的 Project-First Learning](/ai-study-note/blog/dan-koe-project-first-learning/) 是 Two-Layer Reading 的姐妹配方：那篇處理「動手做東西時怎麼學」、這篇處理「讀東西時怎麼留下來」。兩個的共通點都是把 AI 從「代替你」拉回到「回答你」。
