---
title: "gstack：YC 總裁 Garry Tan 把整個工程團隊塞進 23 個 slash command"
description: "Garry Tan 一邊管 YC 一邊 60 天出 60 萬行 code 的祕密：把 CEO / Designer / Eng Manager / QA / Security / Release 全部變成 Claude Code 的 slash command。本文拆解設計哲學、七階段循環、與我自己挑的最小可用組合。"
pubDate: 2026-05-26
category: claude-code
tags:
  - research
  - claude-code
---

「我大概從去年 12 月開始就沒敲過一行 code 了。」這句話出自 Andrej Karpathy。YC 總裁 Garry Tan 聽到後問了一個問題:**一個人要怎麼出貨得像 20 個人?** 他自己花了幾個月實驗，把答案開源成 [gstack](https://github.com/garrytan/gstack)——一個 MIT license 的工具包，把「整個工程團隊」塞進 23 個 Claude Code slash command。

我這幾週每天在用，越用越覺得：gstack 最厲害的不是那 23 個 prompt，而是它把「**Feed-Forward Pipeline**(向前餵養管線)」這個概念落地了。每一步的產物自動成為下一步的輸入，不用人類在中間搬資料。這篇拆解它的歷史、作者、設計哲學，最後給出我自己挑的最小可用組合。

## 一、可直接套用的最小組合

23 個 command 對新手是 overkill。我用了幾週後沉澱出的「最低有效劑量」是這 5 個，覆蓋日常 80% 的場景:

```
/office-hours       → 任何新 feature 開工前先被靈魂拷問
/plan-eng-review    → 寫完計畫文件後鎖住架構與 edge cases
/review             → 提交前讓 staff engineer 角色掃一次 production bug
/qa                 → 改完後叫 QA Lead 在真實瀏覽器裡點一遍
/ship               → 同步、跑測試、審覆蓋率、開 PR 一條龍
```

加上一個「思考框架」:**Think → Plan → Build → Review → Test → Ship → Reflect**。每次開新任務心裡先過一遍這七步，缺哪一步就呼叫對應 command。

裝起來只要一行(會花約 30 秒):

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git \
  ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

裝完後 23 個 command 就掛在 Claude Code 裡，從上面那 5 個開始用，其他遇到再學。

## 二、Garry Tan 是誰、為什麼是他做這個

Garry Tan 是 Y Combinator 現任總裁兼 CEO。在接 YC 之前他做過幾件相關的事:

- **Palantir 早期工程師**——產品、設計、工程身分都做過
- **Posterous 共同創辦人**——後來被 Twitter 收購
- 在 YC 內部**親手寫了 Bookface**(YC 創辦人的內部社群)
- 創投生涯接觸過 Coinbase、Instacart、Rippling 的車庫期

換句話說，他是少數「同時當過工程師、設計師、產品經理、創辦人、投資人」的人。**這個背景直接決定了 gstack 的形狀**——它不是給純後端工程師的 lint 工具，而是給「一個人要扛起整間產品公司」的 solo builder 設計的。

他在 2026 年公開的[生產力數字](https://github.com/garrytan/gstack)有點誇張:

- 截至 4 月 18 日，今年的 code 變更量是「2013 全年的 240 倍」
- 「邏輯性 code 」(扣掉 AI 灌水的部分)是他 2013 年水準的**約 810 倍**(每天 11,417 行 vs 14 行)
- 60 天內出貨 3 個 production 服務、40+ feature
- 同時還在**全職**經營 YC

當然「行數」一向是有爭議的指標。他自己在 README 裡也承認:「LOC 批評者沒錯，raw line counts 在 AI 時代會膨脹。」他的反駁是用 normalized 後的邏輯變更量計算，倍數仍然驚人。

## 三、設計哲學:Karpathy 的四種失敗模式

gstack 的根源來自 Karpathy 對 AI-assisted 開發的觀察:大部分人用 LLM 寫 code 會掉進四個坑。

1. **未經驗證的假設**——沒先問清楚需求就寫
2. **過度複雜化**——AI 容易為了「展示能力」做超出需求的方案
3. **正交修改**——順手改了不該改的地方
4. **跳過測試**——沒有可驗證的完成標準

gstack 的 23 個 specialist 是針對這四個失敗模式設計的反制:

- `/office-hours`(CEO 角色)用 6 個 forcing question 把假設挖出來 → 防失敗 1
- `/plan-ceo-review` / `/plan-eng-review` 在動工前鎖住範圍與架構 → 防失敗 2、3
- `/review`(Staff Engineer)專門掃 production bug 與正交修改 → 防失敗 3
- `/ship` 強迫測試先行、有可驗證目標 → 防失敗 4

這不是 23 個獨立工具，是**一條防錯流水線**。

## 四、Feed-Forward Pipeline:這才是 gstack 真正的創新

很多人看到 gstack 第一反應是「不就是 23 個 prompt template 嗎?我自己也能寫」。錯。差別在**產物會自動往下游餵**。

舉例:你跑 `/plan-eng-review`，它會在你的專案裡留下一份 architecture lock 文件。當你之後跑 `/review`，這個 reviewer 會自動讀那份文件，知道「原本說好的架構是什麼」，才能判斷你後來寫的 code 有沒有偏離。

更明顯的是 `/document-generate`——它用 [Diataxis 四象限框架](/ai-study-note/blog/diataxis-documentation-framework/)(tutorial / how-to / reference / explanation)生文件，會自動讀 `/ship` 留下的 PR 摘要與 `/qa` 的測試結果，產出真的反映 shipped code 的文件，而不是憑空猜。

這就是「**Everything Feeds Forward**」(README 原話)——每個 skill 寫下後續 skill 會讀的 artifact，**人類完全不用在中間搬資料**。這是 gstack 跟「我自己存的一坨 prompt template」最大的差別，也是它能真正當作 pipeline 用、而不只是查表的關鍵。

我自己第一週用的時候完全不懂這點，把 23 個 command 當成獨立 prompt 隨機呼叫，結果體驗很普通——因為我繞過了 feed-forward。第二週開始按 `/office-hours → plan → build → /review → /qa → /ship` 順序走，產出品質明顯不一樣。**順序就是產品的一部分**。

## 五、被低估的細節:Persistent Browser Daemon

`/qa` 跟 `/browse` 背後有個少有人講但很關鍵的設計:**長駐 Chromium daemon**。

傳統 AI agent 操作瀏覽器是這樣:每呼叫一次 tool，就 spawn 一個新 browser process，等它 boot 完(5-10 秒)，做完事，關掉。10 個操作就 50-100 秒在等 boot。

gstack 改成跑一個常駐的 headless Chromium 進程，agent 透過 localhost HTTP 跟它講話。冷啟動還是要 3-5 秒，但**之後每次呼叫只要 100-200 毫秒**。連續 50 個瀏覽器操作從幾分鐘壓到幾秒。

這個架構讓 `/qa` 真的能像人一樣「點開頁面 → 看到 bug → 截圖 → 改 code → reload → 確認」——速度夠快才會被當作回饋迴路用，而不是當作偶爾跑一次的整合測試。

## 六、使用情境

gstack 不是萬用工具。它的甜蜜點與不甜蜜點都很清楚。

**最適合的情境**

- **一人或極小團隊做產品**——CEO / Designer / Eng / QA 角色由同一個人扮演的場景，正是 Garry Tan 自己的工作型態
- **快速 prototype 到 production 的迭代**——七階段循環設計來支援「每天 ship 一個 feature」的節奏
- **Front-end 重的產品**——`/browse`、`/qa`、`/design-shotgun`、`/design-review` 都圍繞視覺與互動，對 UI 產品威力最大
- **多 agent 並行**——gstack 號稱可開 10-15 個 Claude Code session 同時跑(透過 Conductor 整合)，每個跑不同 sprint，共用 artifact

**比較不適合的情境**

- **純後端 / data pipeline 專案**——`/design-*` 系列幾乎沒用，剩下的價值大概砍半
- **強流程的企業團隊**——gstack 假設你能直接 merge & deploy，跟需要走 RFC、change advisory board 的組織格格不入
- **已有完整 CI/CD 與 review process 的成熟團隊**——gstack 的 `/review`、`/ship`、`/canary` 會跟既有流程打架
- **完全沒寫過 production 系統的新手**——23 個 command 假設你能看懂 staff engineer 的 review comment，新手會被淹沒

## 七、坦白講的壞處與批評

我用了幾週後幾個真實感受:

**1. 學習曲線比官方說的陡。**
README 寫「30 秒安裝」是真的，但「30 天才能真正用順」也是真的。23 個 command 加上 power tools 加上 host flag 加上 prefix 模式，配置面比想像中複雜。

**2. 強烈的個人風味。**
這是「Garry Tan 的 setup」不是「最佳實踐」。`/office-hours` 的 6 個 forcing question 是他個人的產品思考框架，不是放諸四海皆準。直接套用可能跟你團隊的決策語言不合。

**3. Slash command 太多會搶 attention。**
Claude Code 的 slash command 列表如果塞 50 個，自動完成體驗會變差，你也記不住。建議用 `--prefix` 模式讓它變成 `/gstack-qa` 而非 `/qa`，避免跟其他 skill 撞名。

**4. Feed-forward artifact 會囤積。**
每個 skill 都會在專案裡留檔案。跑幾週後專案會多出十幾個 `.gstack/` 下的中間產物，要建立定期清理習慣。

**5. 對 AI hallucination 沒有特別保護。**
gstack 是 prompt + orchestration，背後 LLM 該幻覺還是會幻覺。`/review` 跟 `/qa` 可以接得住一部分，但不要以為加了 gstack 就能盲信輸出。

**6. 跟 Claude Code 強耦合(雖然官方支援 10 個 host)。**
雖然 README 列 OpenCode、Cursor、Codex 等 10 個 agent host，實際上設計與 prompt 都是針對 Claude 4.x 的能力寫的。換到其他模型品質會掉。

## 八、給每個讀者的「下一步」

你可以從哪一層開始撿便宜:

- **只想偷一個概念**——把「Think → Plan → Build → Review → Test → Ship → Reflect」這七步背起來，每次開新任務心裡跑一遍。不用裝任何東西，思考方式就改了。
- **想試水溫**——按 §一 裝完之後，只用那 5 個 command。連續用 5 個任務就會體會到 feed-forward 的價值。
- **想全套導入**——讀完 [gstack 的 skills.md](https://github.com/garrytan/gstack/blob/main/docs/skills.md)，然後看 Garry Tan 的[影片導覽](https://www.youtube.com/watch?v=wkv2ifxPpF8)。重點是看他**操作節奏**而不是 command 細節——23 個 command 隨時可查，節奏感才是學不到的部分。
- **想做自己的版本**——fork gstack 然後改 prompt。它是 MIT license，每個 skill 就是一份 markdown。把 `/office-hours` 的 6 個問題改成你團隊的真實問題，就是你的 gstack 了。

## 九、延伸閱讀與資料來源

- 官方 repo:[garrytan/gstack](https://github.com/garrytan/gstack)
- 影片導覽:[How to Make Claude Code Your AI Engineering Team](https://www.youtube.com/watch?v=wkv2ifxPpF8)(Garry Tan 親自示範)
- 完整 skill 清單:[gstack/docs/skills.md](https://github.com/garrytan/gstack/blob/main/docs/skills.md)
- 第三方深度評測:[Augment Code — Garry Tan open-sources gstack](https://www.augmentcode.com/learn/garry-tan-gstack-claude-code)
- 媒體報導:[MarkTechPost 釋出新聞](https://www.marktechpost.com/2026/03/14/garry-tan-releases-gstack-an-open-source-claude-code-system-for-planning-code-review-qa-and-shipping/)、[MindStudio 介紹](https://www.mindstudio.ai/blog/what-is-gstack-gary-tan-claude-code-framework)
- 配套閱讀:本站 [Diataxis 框架解析](/ai-study-note/blog/diataxis-documentation-framework/)——gstack 的 `/document-generate` 內建這套四象限分類

---

gstack 最有啟發的不是「23 個 prompt」，是它證明了**組織結構可以被當成軟體寫**。CEO、Eng Manager、QA Lead 從前是組織圖上的方框，現在變成你工作流裡的可呼叫物件。當你開始這樣思考，下一個問題不是「我還缺哪個 command」，而是「**我的工作流裡，還有哪些角色沒被命名?**」
