---
title: "HTML 作為 Agent 輸出格式：Thariq × Karpathy 觀點與四個可複用 prompt"
description: "Thariq《Unreasonable Effectiveness of HTML》加上 Karpathy 進化階梯的二次演化整理——四個彼此不重疊、可直接套用的 prompt 骨架"
pubDate: 2026-05-12
category: claude-code
tags:
  - research
  - claude-code
  - prompt-engineering
draft: false
---

> 來源
> - Thariq [@trq212](https://x.com/trq212/status/2052809885763747935) — *Using Claude Code: The Unreasonable Effectiveness of HTML*（2026-05-09，11.2M views）
> - Andrej Karpathy [@karpathy](https://x.com/karpathy/status/2053872850101285137) — Quote tweet 與「raw text → markdown → HTML → interactive neural simulations」進化階梯論述（2026-05-12，1.5M views）
> - Companion site：[thariqs.github.io/html-effectiveness](https://thariqs.github.io/html-effectiveness/) — 20 個 self-contained HTML 範例，9 類用例
> - Simon Willison link blog（2026-05-08）

## TL;DR

- 當 Claude 是 agent 跟你溝通、而不是當文件編輯器時，markdown 輸出在 100+ 行後就讀不下去；HTML 的資訊密度（table / SVG / CSS / interactivity）更貼近大腦的平行視覺處理。
- Karpathy 把這放進更大的 progression：raw text → markdown（current default）→ HTML（forming new default）→ … → interactive neural simulations。視覺是人類接收 AI 輸出的 10-lane superhighway。
- **不要急著寫 `/html` skill**：Thariq 自己警告。直接在 prompt 末尾要 HTML 就夠了，靠 prompt 表達意圖比包裝重要。
- 代價：tokens 多、生成 2-4× 慢、git diff 變雜。1M context (Opus 4.7) 讓 token 已不痛。
- 本文做的事：從原 thread 與 reply / quote / 外部引用萃取四個彼此不重疊的方法骨架，每個含**情境 / Prompt 模板 / 為什麼有效 / 正例 / 反例**。

## 二次演化的追蹤

兩則推文發出後 72 小時內，可觀察到的 reply / quote / 外部引用方向（去重後彙整）：

| 方向 | 代表來源 | 對原文的增量 |
|---|---|---|
| HTML 工件當 agent 輸出層的「視覺演化階梯」 | Karpathy quote (5/12) | 從「實作技巧」升格為「人機介面演進論」 |
| 把 PR 解釋從 GitHub diff view 搬到 HTML 註解版 | Thariq 自述 + Simon Willison link blog | 證實 PR explainer 已獨立成熟為子用例 |
| 拋棄式 HTML editor + 「copy as X」回流 prompt | Thariq 〈Custom Editing Interfaces〉段 | 雙向迴路：人在 UI 操作 → 編譯回 prompt |
| 並排比較畫布（grid 排 6 個變體） | Thariq onboarding 範例 + companion site | N-way 選項視覺化成可決策表面 |
| Claire Vo 等 reviewer 採用、教學擴散 | [@clairevo/status/2052897737654583334](https://x.com/clairevo/status/2052897737654583334) | 業界傳遞鏈：作者 → 同行 → 觀眾 |

被刻意濾除的方向：
- **「`/html` 應該變成 skill / plugin」**：Thariq 在 *How to Get Started* 段明確反對。
- **「markdown 完全死了」**：誇張化。FAQ 自承「我已停用 markdown 但我是 maximalist」。
- **與 Karpathy *LLM Wiki* / `CLAUDE.md` 主題混淆**：那是另一條線（持久性知識庫），與本次 HTML 輸出無交集。

## 四個彼此不重疊的方法

每個方法用同一骨架。Prompt 已改寫成中性可貼上版本，不是抄原句。

### 方法 1：並排比較畫布（Comparison Canvas）

**情境** — 探索階段你不知道往哪走，需要把 N 個變體擺在同一張紙上並排比較，逼自己對 tradeoff 表態。

**Prompt 模板**

```
我不確定 <要決定的東西> 的方向。產生 6 個明顯不同的方案，
從 <維度 A>、<維度 B>、<維度 C> 上做變化。把它們以 grid
排在一份單一 HTML 檔案並排呈現。每個方案旁邊用一行文字
標出它正在做的 tradeoff。
```

**為什麼有效** — Karpathy 的論點：約 1/3 大腦是平行視覺處理。並排排列讓你「同時看到」六個版本，markdown 的 sequential 列表做不到。強迫每個變體 articulate tradeoff，又把模型內部考量逼到表面。

**正例** — Onboarding screen 的 6 種視覺版本（Thariq 原例）：layout / tone / density 三軸變化，每個下面寫「優先 X，犧牲 Y」。決策時間從一兩天壓到一次 review。

**反例** — 你已經有明確 spec、只缺實作。這時做 HTML grid 是浪費；一頁 markdown spec 直接傳給下個 session 即可。

### 方法 2：PR 注釋說明書（Annotated PR Explainer）

**情境** — 你或 reviewer 要看懂一個邏輯纏繞的 PR（streaming / backpressure / state machine）。GitHub 預設 diff view 對複雜流程幫助有限。

**Prompt 模板**

```
幫我用一份 HTML artifact 描述這個 PR。我對 <某個子系統>
不熟，重點放這裡。把實際 diff 渲染出來，旁邊 inline
margin 放註解，依嚴重度色碼標示發現。必要的話加流程圖
把 control flow 畫清楚。
```

**為什麼有效** — Inline annotation + 流程圖在 markdown 只能用 ASCII / unicode 模擬（Thariq 文章貼了一張 Claude 用 unicode 字元估算顏色的截圖，正是 markdown 力不從心的例子）。HTML 把「diff + 註解 + 流程圖」三層資訊壓進同一視野。

**正例** — Thariq 自承「現在我發的每個 PR 都附一份 HTML code explainer」。對熟悉度低的 reviewer 而言，閱讀率比預設 diff view 高。

**反例** — 一行 typo fix、純樣式微調。生 HTML 比看 diff 慢 2-4×，得不償失。

### 方法 3：拋棄式編輯器（Throwaway Editor with Export）

**情境** — 你要改一筆有結構的東西（30 張 ticket 排序、feature flag config、prompt 變數），純文字 textbox 表達不出來，但又不值得做成正式工具。

**Prompt 模板**

```
建一個單一 HTML 檔案，purpose-built 給「這一筆資料」，
不是要重用的產品。先用你最好的猜測預排序 / 預填。介面：
<拖拉 / 表單 / 滑桿，視資料而定>。最後加一個「copy as
<JSON / markdown / prompt>」按鈕，把我在 UI 改完的結果
輸出回我可以貼回 Claude Code 的格式。
```

**為什麼有效** — 結構化編輯有「人腦適合 GUI、機器適合 text」的鴻溝。HTML editor 把 GUI 操作編譯回 text payload，分工乾淨。"purpose-built, throwaway" 這個 frame 把製造門檻壓到零——不投資產品化、不背技術債。

**正例** — 30 個 Linear ticket 拖拉到 Now / Next / Later / Cut 四欄；feature flag 切換時警告「你開了 X 但前置 Y 還沒開」。按下「copy as markdown」把結果貼回下個 Claude session。

**反例** — 你真的要做給多人長期用的 admin tool。HTML throwaway 沒 auth、沒 version control，越用越多人會把它當 prod。要正規做就用正規 stack。

### 方法 4：單次閱讀解釋器（Single-Read Explainer）

**情境** — 你想搞懂自家 codebase 某塊（rate limiter / auth flow / queue），或要寫 incident report、週報、技術 onboarding 給 leadership，目標是「對方只會讀一次就懂」。

**Prompt 模板**

```
讀相關程式碼，產出一份單一 HTML explainer。包含：
- 一張 <核心流程> 的 SVG flowchart（不要 ASCII）
- 3-4 段關鍵 code snippet，帶 inline 註解
- 底部一段「gotchas」列出已知地雷
為「只會讀一次」的讀者最佳化。
```

**為什麼有效** — Claude Code 能從 git history、MCP、codebase、browser 撈 context，這些攤平到 markdown 會立刻超過 100 行、沒人讀完。HTML 用 tab、SVG、可折疊區塊把同樣資訊壓進可瀏覽結構。Karpathy 提到的 slideshow 變體（要 LLM 把輸出做成投影片）也屬此類。

**正例** — Token-bucket rate limiter 的解釋頁（Thariq 自承為 prompt caching 寫過 in-depth research file 給自己讀）。對 leadership 寫 incident report 也是同模板。

**反例** — 5 行 utility function。一段 README + 函式 docstring 已經足夠。

## 為什麼挑這四個（去重邏輯）

|  | 並排比較 | PR 說明書 | 拋棄式編輯器 | 單次閱讀解釋器 |
|---|---|---|---|---|
| 互動性 | 無 | 無 | **雙向（UI → prompt）** | 無 |
| 主要素材 | 6 個變體 | diff + 註解 | 結構化資料 | 程式碼 + 圖 |
| 讀者 | 自己（決策） | 自己 / reviewer | 自己 | 多人 / leadership |
| 何時用 | 探索期 | 提交 PR | 編輯結構化資料 | 解釋既有事物 |

四個方法分別覆蓋「**決策 / 評審 / 編輯 / 教學**」四個情境，互不重疊。Thariq 文章列的 5 大類（Specs / Code Review / Design / Reports / Custom Editing）我把 Specs + Reports 合併為單一「壓進單頁」骨架，因為兩者本質相同；Design 拆進「並排比較」與「拋棄式編輯器」兩個用途，比 Thariq 原分類更接近實際操作。

## 三個容易犯的錯

1. **把 prompt 包成 `/html` skill** — Thariq 自己警告。直接在自然 prompt 末尾要 HTML 就好；包成 skill 反而失去每次調整意圖的彈性。
2. **想用 HTML 取代所有 markdown** — FAQ 明白：token 多、生成慢、git diff 雜。Agent 內部流程（多 agent 之間傳遞、不給人讀的中間 spec）markdown 仍贏。Thariq 自承這是他剩下還用 markdown 的場景。
3. **以為要學前端** — 不需要。Claude 寫的 HTML 你只負責「在瀏覽器打開」與「按 copy button」。HTML 在這裡是輸出介面、不是 codebase；不需要 build pipeline、不需要 framework。

## 與 ai-study-note 的關係

本 repo 的 note 仍是 markdown，原因：
- Astro static build 直接把 markdown 編成 HTML
- 跨筆記 backlink / category / tag 系統依賴 frontmatter
- 公開發布需要 git diff 可審

本文方法適用的不是 note 本身，而是**寫 note 之前的工作**：
- 探索筆記主題時用「並排比較畫布」生 6 個草稿大綱
- 解 build issue 時用「PR 注釋說明書」對自己解釋變更
- 整理 frontmatter / taxonomy 結構時用「拋棄式編輯器」
- 整理跨 prompt 比較（如 `system-prompt-patterns-research`）時用「單次閱讀解釋器」

## Quick Reference

- **核心句**：*audio is the human-preferred input to AIs, but vision is the preferred output from them*（Karpathy）
- **四個 prompt 骨架**：並排比較 / PR 註解 / 拋棄式編輯器 / 單次閱讀解釋器
- **不適用場景**：agent 內部 loop、5 行小改、要長期共用的工具
- **代價**：2-4× 生成時間、git diff 變雜、token 多（1M context 下已不痛）
- **不要做的事**：包成 `/html` skill、用 HTML 取代所有 markdown、以為要學前端
