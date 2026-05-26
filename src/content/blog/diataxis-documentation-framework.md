---
title: "Diataxis：把文件拆成四種，而不是寫一份大雜燴"
description: "為什麼 Django、Cloudflare、NumPy、以及 Garry Tan 的 G-Stack 都把 Diataxis 當北極星？一份框架背景、四象限解析、使用情境與批評的完整筆記。"
pubDate: 2026-05-26
category: claude-code
tags:
  - research
  - claude-code
---

「為什麼我們的文件每次寫完都沒人讀？」這不是文筆問題，是**分類**問題。Diataxis 給出的答案很簡單：你把四種完全不同的東西塞在同一份文件裡了。

第一次看到 Diataxis 這個字，是在 Garry Tan 開源的 [gstack](https://github.com/garrytan/gstack) 裡。他的 `/document-generate` 技能描述只有一句話：「Generate Diataxis docs (tutorial / how-to / reference / explanation) for a feature from code.」沒有解釋，沒有延伸，但這個詞出現得理所當然——好像現代任何認真寫文件的人都該知道它。事實上，它確實已經變成技術寫作的隱性標準。

## 一、可直接使用的決策表

下次要寫一份新文件、或開新檔案前，先問自己這四個問題。**只有一個答案會是「對」**：

| 文件型態 | 讀者當下的狀態 | 你應該交付的東西 | 不該做的事 |
|---|---|---|---|
| **Tutorial（教學）** | 我是新手，我想學 | 一條從 0 到「我做出來了」的路線 | 解釋為什麼這樣設計、列所有選項 |
| **How-to（指南）** | 我有目的，我要解決問題 | 達成特定目標的步驟 | 從基礎開始教、講原理 |
| **Reference（參考）** | 我在工作中，需要查資料 | 精確、完整、可搜尋的事實 | 教學語氣、舉長例子 |
| **Explanation（說明）** | 我已經會用了，我想懂 | 背景、設計選擇、權衡 | 列步驟、列參數表 |

寫之前先填這張表：

```
這份文件叫：___________________________
讀者打開它時的狀態：（學習 / 解問題 / 查資料 / 想懂）
我交付的主要產物：（路線 / 步驟 / 事實 / 觀點）
讀完後讀者會做什麼：___________________________
```

如果四欄答案打架——例如「他在解問題，但我要交付背景說明」——那就是兩份文件被你寫成一份了。**拆開**。這是 Diataxis 唯一強硬的主張。

## 二、背景：誰發明的、為什麼

Diataxis 的作者是 [Daniele Procida](https://diataxis.fr/)，他是 Django 社群的長期文件維護者，現在在 Canonical 領導文件團隊。這個詞源自希臘文 *διάταξις*，意思是「秩序、排列、分流」。

Procida 的觀察是：技術文件之所以難寫、難讀、難維護，是因為大家把它當成**一種**東西。實際上人類使用文件時處於四種完全不同的認知模式：

- **學習中**（學生）→ 需要被引導
- **工作中**（廚師）→ 需要被告知怎麼做
- **查找中**（駕駛看儀表板）→ 需要事實
- **思考中**（讀哲學書）→ 需要被啟發

把這四種需求混在同一份 README 裡，等於同時寫給四種人，結果是**沒有一種人讀得下去**。新手嫌囉嗦、老手嫌淺、想查的人找不到、想懂的人看不到設計思路。

Procida 把這四種需求畫成一張二維座標：

```
                        理論（Cognition）
                              ▲
              Explanation     │     Reference
              （理解導向）     │     （資訊導向）
                              │
   獲取知識 ────────────────┼──────────────── 應用知識
   (Acquisition)              │              (Application)
                              │
              Tutorial        │     How-to
              （學習導向）     │     （任務導向）
                              ▼
                        實作（Action）
```

橫軸是「讀者目前需要**獲取**還是**應用**知識」；縱軸是「讀者要的是**動作**還是**理解**」。四個象限對應到四種文件型態。這張圖是 Diataxis 的全部理論——剩下的都是衍生規則。

## 三、四象限細看

### Tutorial — 「跟著我做一次」

**目的不是教功能，是讓新手獲得信心**。讀完後讀者應該能說「我做出來過一次了」。

Tutorial 的標準寫法是 hand-holding：每一步都有結果可看、每個結果都導向下一步。經典案例是 Django 官方的 [Polls 教學](https://docs.djangoproject.com/en/stable/intro/tutorial01/)——它不是 Django 最有效率的用法，但它讓你從零跑出一個能投票的網站。

**最容易犯的錯**：把 tutorial 寫成 reference。「以下是 Django 的所有 model field：」——不對，新手不需要全部，他需要其中一個能讓他繼續往下走。

### How-to — 「假設你會了，怎麼做到 X？」

**目的是解決特定問題**。讀者已經知道基本概念，他要的是一條配方。

How-to 跟 tutorial 最大的差別：tutorial 設計給「不知道自己在做什麼」的人，how-to 設計給「知道自己要什麼但不知道怎麼做」的人。例如「How to deploy a Django app to Cloudflare Workers」——讀者已經有 app，已經會 Django，只是不知道部署流程。

**最容易犯的錯**：把 how-to 寫成 tutorial。前三段在介紹 Cloudflare Workers 是什麼——但讀者打開這份文件的當下，他已經選擇了 Cloudflare Workers，他要步驟，不要簡介。

### Reference — 「我要查那個參數叫什麼」

**目的是精確、完整、可預測**。讀者不是來閱讀的，是來**檢索**的。

Reference 應該長得像字典或地圖——結構嚴格、條目對稱、術語精準。API 文件、設定選項表、CLI flag 清單都屬於這類。Reference 的成功標準是：使用者用 Ctrl+F 能在 5 秒內找到答案。

**最容易犯的錯**：在 reference 裡夾長例子或設計討論。例子留給 tutorial，討論留給 explanation。

### Explanation — 「為什麼要這樣設計？」

**目的是擴展讀者的理解**。讀者已經會用了，他想知道脈絡、歷史、權衡、替代方案。

Explanation 可以——而且應該——有觀點。它是四種文件中唯一可以表達立場的。「我們為什麼選 PostgreSQL 而不是 MongoDB」「為什麼 React Server Components 改變了 data fetching 的思考方式」——這些都是 explanation。

**最容易犯的錯**：把 explanation 寫成 reference。讀者不是來找事實的，他是來找**敘事**的。

## 四、誰在用？

這不是一個小眾框架。Diataxis 已經是技術寫作的事實標準：

- **Django** — Procida 本人就是 Django 文件的長期貢獻者，Django 文件是 Diataxis 的原型。
- **Cloudflare** — 重新設計 developer docs 時，Diataxis 是他們的[「北極星」](https://diataxis.fr/)，新內容該放哪都會回頭參考這套框架。
- **NumPy** — Python 科學運算的旗艦專案，文件按 Diataxis 重組後可讀性大幅提升。
- **Gatsby** — 開源文件按 Diataxis 重組後，使用者更容易找到他們需要的資源。
- **Canonical**（Ubuntu）— Procida 在 Canonical 帶領的文件實踐影響了 MicroK8s、LXD 等專案。
- **Garry Tan 的 [gstack](https://github.com/garrytan/gstack)** — 把 Diataxis 寫進 Claude Code 的自動化技能，要求 AI 生成文件時自動覆蓋四個象限，PR 裡會自動列出 coverage gap。

當 YC 總裁的開源 dev workflow 內建這套框架，這已經不是「要不要學」的問題，而是「你的團隊還沒導入嗎」的問題。

## 五、使用情境

什麼時候你應該認真導入 Diataxis？以下幾種狀況非常經典：

**情境 1：README 越長越沒人讀。**
你的專案 README 已經 800 行了，包含安裝、教學、API、設計理念、FAQ。每次新人問問題你都回「README 有寫」，但他真的看不到。**因為四種文件被你壓在一份檔案裡**——拆成 `tutorial.md` / `how-to/*.md` / `reference.md` / `explanation/*.md`，每份各自簡短，但任何人打開任何一份都能立刻拿到他要的東西。

**情境 2：團隊新人 onboarding 永遠很痛。**
新人問問題你才發現——你以為的「教學」其實是 reference，他需要的「設定步驟」其實是 how-to。Diataxis 強迫你把這四種拆開後，onboarding 文件變成有路線的 tutorial，新人能自己走完。

**情境 3：客戶/使用者抱怨「文件很完整但找不到答案」。**
經典徵兆是：文件量很大但 conversion 很低。通常是因為**所有東西都被寫成 explanation**——讀者打開後看到一堆「設計理念」，但他要的是「怎麼用 API 上傳一張圖片」。

**情境 4：AI 生成文件**（這是 2026 年新興的核心情境）。
Claude Code、Cursor、Copilot 都能生文件，但生出來的東西常常四不像——一段教學夾兩段 reference 又附帶設計討論。**給 AI 一個 Diataxis 約束**（像 gstack 的 `/document-generate` 那樣），輸出品質會大幅提升。Diataxis 變成了 AI 文件生成的 prompt 結構。

**情境 5：開源專案要建立貢獻者社群。**
社群成員願意貢獻 how-to（自己解決過的問題）和 reference（補完表格），但很少有人能貢獻 tutorial 或 explanation。把四象限明確化後，貢獻邊界清楚，PR 也容易 review。

## 六、好處

- **降低認知負擔**——讀者打開檔案前就知道會拿到什麼類型的內容，不用懷著「希望這篇有講到我要的」期待邊讀邊翻。
- **可觀察的覆蓋率**——你可以一眼看出「我只寫了 reference，完全沒 tutorial 和 explanation」，這在 G-Stack 裡叫 *coverage map*。
- **強迫作者誠實**——寫 tutorial 就不能偷懶塞 reference table；寫 explanation 就得真的提出觀點而不是堆砌事實。框架排除了懶惰。
- **AI 友善**——四種型態都是結構化的 prompt 對象，LLM 生出來的品質明顯比「請幫我寫一份文件」好太多。
- **可漸進導入**——不需要一次重寫所有文件。新文件按四象限寫，舊文件留著，時間久了自然會自我整理。

## 七、壞處與批評

Diataxis 不是萬靈丹，幾個常被提出的批評：

**批評 1：四象限有時是假命題。**
有些內容天生就跨象限——例如「troubleshooting guide」既是 how-to 又是 reference 又夾帶 explanation。硬要塞進一格反而失真。Procida 自己也承認某些內容會「漂移」，需要持續判斷。

**批評 2：對小專案是 overkill。**
如果你的專案文件總共只有 200 行，分成四個檔案反而讓人找不到東西。Diataxis 的甜蜜點是**中大型專案**——文件量已經到了「需要被組織」的程度才划算。

**批評 3：分類本身要花心力。**
寫文件時除了寫內容，還要每次判斷「這段話屬於哪一象限」。對沒受過訓練的工程師來說是額外負擔，初期會很慢。

**批評 4：缺乏更新策略。**
Diataxis 教你**怎麼分類**，沒教你**多久該重寫**。文件腐化（doc rot）的問題它沒解。你還需要搭配 review cadence、code-doc 連動、自動化測試等其他實踐。

**批評 5：對非開發者讀者不一定適用。**
框架是從技術文件土壤長出來的。如果你的「文件」是給行銷、客服、產品經理看的內部知識庫，四象限的對應關係會變模糊。

## 八、怎麼開始

最低成本的導入步驟：

1. **找一份你目前最痛的文件**（通常是 README）。
2. **逐段標記**——這段是 tutorial / how-to / reference / explanation 中的哪一種？很多段你會發現「都不是」或「同時是兩種」——這就是改寫訊號。
3. **拆檔案**。建議的目錄結構：
   ```
   docs/
     tutorials/       # 入門路線
     how-to/          # 解問題配方
     reference/       # 事實表格
     explanation/     # 設計討論
   ```
4. **每份檔案開頭寫清楚「這份文件是給誰、用什麼狀態讀」**，逼自己不跨界。
5. **在 PR review 流程中加一條檢查**：「這個新檔案屬於哪一象限？」——讓分類變成 review 規範，而非個人判斷。

如果你用 Claude Code / Cursor 等 AI 工具，把 Diataxis 寫進你的 `CLAUDE.md` 或 system prompt，要求生文件時必須宣告象限。這是把 G-Stack 的做法搬到自己專案的最快路徑。

## 九、延伸閱讀

- **官方站**：[diataxis.fr](https://diataxis.fr/) — Daniele Procida 維護的標準文件。本身就是 Diataxis 的最佳示範。
- **Procida 的原始演講**：他在 PyCon 2017 的 talk「[What nobody tells you about documentation](https://www.youtube.com/results?search_query=daniele+procida+pycon+documentation)」是這套框架的起源。
- **Cloudflare 的導入心得**：[Enhancing Technical Documentation with the Diátaxis Framework](https://www.detectx.com.au/enhancing-technical-documentation-with-the-diataxis-framework/)。
- **Garry Tan 的 gstack 文件技能**：[gstack/docs/skills.md](https://github.com/garrytan/gstack/blob/main/docs/skills.md) — 看 Diataxis 怎麼變成 AI 自動化規則。
- **批評視角**：[I'd Rather Be Writing — What is Diátaxis and should you be using it？](https://idratherbewriting.com/blog/what-is-diataxis-documentation-framework) — 技術寫作圈最知名的部落格之一給的中立評論。

---

下次當你準備寫一份新文件時，先問自己一個問題：**讀者打開它的當下處於四種狀態的哪一種？** 答不出來，就先別動筆——真正的問題不在文字，在你還沒想清楚要寫給誰。
