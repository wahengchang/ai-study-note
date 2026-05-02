---
title: "Grill Me Skill 真正關鍵的那一行"
description: "拆解 Pocock 爆紅的 grill-me skill：五行裡載重的只有「先給答案再提問」那一行，把 LLM 對話的成本不對稱翻過來。"
pubDate: 2026-05-03
category: claude-code
tags:
  - research
  - claude-code
  - prompt-engineering
---

Pocock 的 grill-me skill 在 GitHub 衝到 45k 星，但被轉發的截圖裡幾乎沒人指出來——這個五行的 skill 其實只有一行在做事。

## 那五行 skill

整個 SKILL.md 長這樣，可以直接貼到 `.claude/skills/grill-me/SKILL.md`：

```md
---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time.

If a question can be answered by exploring the codebase, explore the codebase instead.
```

啟動方式：對 Claude 說 `grill me on this plan`，後面接你想被質問的東西。一次 session 平均跑 30~50 題，大概半小時左右。

## 載重的那一行

關鍵是這一句：**`For each question, provide your recommended answer.`**

把它拿掉，skill 就退化成偵訊。AI 會問「你打算用 Postgres 還是 SQLite？」「retry policy 是什麼？」「快取放哪一層？」——你必須一題一題從零想答案，三題之後就不想玩了。

加上這句之後，每個問題後面 AI 會自己附推薦答案：「你打算用 Postgres 還是 SQLite？我建議 SQLite，因為這個 service 沒有並發寫入，且你前面提到要支援 single-binary 部署。」你只要回「對」、「不對，原因是 X」、或「我沒想過這個面向」。

這就是「**先給答案再提問**」的本質：把「想答案」這件耗能的事情交給 AI，把「判斷答案對不對」這件低耗能的事情留給你。對話的非對稱性整個翻過來。

## 為什麼這招有效

人類想答案很貴，判斷答案對不對很便宜。這是認知科學裡 generation vs recognition 的不對稱——從零想出一個 retry policy 的設計需要把整個系統 model 一遍，但看到「建議用 exponential backoff，因為下游是第三方 API」之後，你大概兩秒鐘就知道對不對。

LLM 的成本結構剛好相反：產生一個候選答案幾乎免費，但要它在你的脈絡 (context) 裡判斷一個答案對不對，反而需要更多資訊才做得準。

「先給答案再提問」就是把這個不對稱做對：**LLM 負責生成，你負責審判**。Pocock 那一行不是在優化問題本身的品質，是在重新分配腦力預算。

## Pocock 自己也是後來才加的

最值得學的不是 skill 本身，是 Pocock 在文章裡的自白：*"I recently added the 'provide your recommended answer' line."* 這行不是設計時就有的——是用了一陣子才意識到「沒有這行的 grill-me 是個爛產品」。

第二個迭代藏在版本差異裡。文章貼的版本沒有 `Ask the questions one at a time.`，repo 上的 canonical 版本有。為什麼補這句？因為一次丟五題出來，「先給答案再提問」就破功——你沒辦法同時判斷五個推薦答案，最後還是退回到偵訊模式。

兩個迭代都在告訴你同一件事：**這個模式很脆，每多一個破壞節奏的指令，效果就打折**。

## 別人怎麼用

`mattpocock/skills` 這個 repo 在 2026 年 2 月初創立，三月底 grill-me 那篇文章發出後 repo 衝到 45k+ 星，社群開始幫 skill 補強——例如 [PR #39](https://github.com/mattpocock/skills/pull/39) 就是有人在 refine grill-me 的措辭。

Pocock 自己提到他在非寫程式的場景也用同樣的 pattern——把 skill 裡的 `this plan` 換成 `this`，就能拿來規劃旅行、討論職涯決策、或拆解一份合約。「先給答案再提問」一旦抽出來就不依附 Claude Code，可以塞進任何 system prompt。

## 它什麼時候沒用

當你還沒想清楚自己想做什麼的時候，grill-me 會放大你的不確定性而不是收斂它。你會發現自己在每個推薦答案後面都回「我不知道」——這時候應該關掉 skill，先去寫一頁 README，或先 spike 一個 prototype。

另一個失效情境：codebase 太大、context 不夠。AI 推薦的答案會基於它幻想的程式碼，而不是你的程式碼。Pocock 在 skill 裡留了一個逃生口——`If a question can be answered by exploring the codebase, explore the codebase instead.`——但前提是 AI 真的願意去找。實務上要在前面額外提示：「先讀 `src/`，再開始 grill。」

## 今天就能用

1. 建立 `.claude/skills/grill-me/SKILL.md`，貼上面那五行
2. 下次寫 design doc、PR 描述、migration plan 時，對 Claude 說 `grill me on this`
3. 對推薦答案保持挑剔——不認同就明確說為什麼，AI 會把這個理由帶進後續問題

如果你已經在用 grill-me 但覺得效果普通，先檢查那一行還在不在。

---

把「先給答案再提問」這個模式抽出來之後，你會發現它不只屬於 grill-me skill。任何你寫過的「請 AI 問我問題」prompt 都該補上這句。下次寫 skill 之前，先想清楚：哪一行是載重的？

## 參考

- Pocock 原文：[My 'Grill Me' Skill Has Gone Viral](https://www.aihero.dev/my-grill-me-skill-has-gone-viral) (2026-03-23)
- Canonical SKILL.md：[mattpocock/skills/skills/productivity/grill-me/SKILL.md](https://github.com/mattpocock/skills/blob/main/skills/productivity/grill-me/SKILL.md)
- Repo 達到 45k 星的報導：[Matt Pocock Skills Repo Passes 45K Stars](https://www.implicator.ai/matt-pocock-skills-repo-jumps-past-45k-stars-with-reusable-ai-instructions/)
- 安裝：`npx skills@latest add mattpocock/skills`
