---
title: "Harry Dry 三問：寫一句說服人的話之前先檢查"
description: "Harry Dry 用三題判斷一句廣告文案值不值得留下：能視覺化、能證偽、別人說不出口。多數 tagline 與 headline 三題都過不了。"
pubDate: 2026-05-03
category: prompt-notes
tags:
  - template
  - prompt-engineering
people:
  - harry-dry
---

Harry Dry 用三題判斷一句廣告文案值不值得留下，多數人寫的 tagline、headline、第一段第一句三題都過不了——而且通常是同樣那三題崩盤。

## 三問檢查 prompt

把下面這段貼成 system prompt（或直接丟進 Claude / ChatGPT 對話），後面接你想檢查的那一句短文：tagline、headline、landing page 開頭、廣告文案、email subject。讀著也通順——可以當作人類用的 checklist。

```
你是 Harry Dry 三問檢查員。讀使用者貼上的一句短文，逐題打分：

1. Can I visualize it?        讀者腦中有畫面嗎？      → Pass / Fail
2. Can I falsify it?          這句宣稱可以驗證嗎？    → Pass / Fail
3. Can nobody else say this?  同行抄不抄得走？        → Pass / Fail

每題附一句理由（指出具體哪個字過或不過）。任何一題 Fail
→ 給一個重寫版本，把空詞換成具體的事實或一個拒絕做的事。

只測短的、要說服人讀下去的句子。長篇文件、教程內文、規範
條款不適用，請直接回「不適用」。
```

## Harry Dry 三問逐題拆解

**第一題：Can I visualize it?** 讀者腦中有沒有畫面？New Balance 的招牌文案 *"Worn by supermodels in London and dads in Ohio."* 一句話兩個畫面就出來。換成 *"Worn by stylish people"* 什麼都看不到。

**第二題：Can I falsify it?** 這個宣稱可不可以查證？Domino's 的 *"Pizza delivered in 30 minutes or it's free."* 三十分鐘是計時的事實，不準你不收錢——把頭放上砧板。換成 *"fast delivery"* 誰也驗證不了。

**第三題：Can nobody else say this?** 同行抄不抄得走？De Beers 的 *"Can you make two months' salary last forever?"* 只有賣鑽戒的能講；換成 *"a gift for your loved one"* 是任何禮品商都能套上的話。

## 用三問改一句招聘廣告

Harry Dry 在 podcast 裡舉過一個反面範例——某 recruitment 公司的招牌文案：

Before：`Don't just get a job, change an entire industry.`

| 題目 | 結果 |
|---|---|
| Can I visualize it? | ❌「change an entire industry」沒有畫面 |
| Can I falsify it? | ❌ 沒承諾任何可驗證的事 |
| Can nobody else say this? | ❌ 任何 recruitment、bootcamp、HR SaaS 都能照搬 |

三題全敗。改成這種就不一樣：

After：`Last year we placed 47 engineers at YC startups. Average offer beat their previous salary by $35k.`

| 題目 | 結果 |
|---|---|
| Can I visualize it? | ✅ 看得到 47 個工程師走進 YC 公司 |
| Can I falsify it? | ✅ 47 與 $35k 都是可以查證的數字 |
| Can nobody else say this? | ✅ 只有真的做出這個成績的 recruiter 能講 |

差別不在文案漂不漂亮，差別在第二句敢把具體數字放上桌——也就是 Harry Dry 講的「把頭放上砧板」。

## 它什麼時候不適用

長篇技術文件、教程內文、規範條款——這些東西需要詳盡、需要鋪陳、需要重複強調。Harry Dry 三問是針對**短的、要說服人讀下去的句子**：標題、tagline、廣告 hook、第一段第一句、email subject。把它套到一份 RFC 上你會把整份文件刪光。

## 今天就用

1. 找一句你最近寫過的 tagline、headline、或者任何要說服人讀下去的短文
2. 對著三題逐題打勾
3. 任何一題答 No 就重寫——不要改字，要換到具體的事實或一個拒絕做的事

如果你正在寫 LLM 的 prompt 開頭、agent description、SKILL.md 描述，三問同樣適用——這些本質上也是要「說服讀者繼續往下走」的短文，只是讀者換成 LLM。但先把三問用在原本的場合練熟，再帶到 prompt copy 上。

---

下次寫一句要說服人的話之前，先過 Harry Dry 三問；寫完之後，再過一次。

## 參考

- 來源：[Learn Copywriting in 76 Minutes – Harry Dry](https://www.youtube.com/watch?v=TUMjnmfsPeM)（David Perell 的 *How I Write* podcast）
- 三題整理：[Harry Dry's 3 Rules — Upgrow](https://www.upgrow.io/blog/harry-dry-copywriting-3-rules)
- 完整 takeaways：[Lessons from Copywriting with Harry Dry — Story Rules](https://www.storyrules.com/lessons-from-copywriting-with-harry-dry/)
- Harry Dry 自己的網站：[marketingexamples.com](https://marketingexamples.com/)
