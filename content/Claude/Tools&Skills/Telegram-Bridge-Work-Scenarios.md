# Telegram 橋接 Claude Code 實戰應用場景

> 三個真實工作場景，展示如何用 Telegram 遠端操控 Claude Code 提升開發效率。

---

## 場景一：通勤時用手機 Code Review

**情境：** 你在捷運上，同事剛發了 PR 要你 review。筆電在背包裡不方便拿出來，但家裡的電腦開著 Claude Code。

**操作流程：**

```
你 (Telegram)                        Claude Code (家裡電腦)
    │                                       │
    │── "幫我 review PR #42，             │
    │    重點看安全問題"  ────────────────►│
    │                                       │── git fetch
    │                                       │── checkout PR branch
    │                                       │── 逐一檢視檔案
    │                                       │
    │◄── "發現 3 個問題：                  │
    │     1. SQL injection 在 user.js:34   │
    │     2. 缺少 input validation         │
    │     3. API key 寫死在程式碼裡"       │
    │                                       │
    │── "幫我在 PR 上留 comment"  ────────►│
    │                                       │── gh pr review --comment
    │◄── "已留下 review comments"          │
```

**價值：** 不用帶筆電，通勤 10 分鐘完成 code review，同事不用等你到辦公室。

---

## 場景二：半夜收到告警，手機快速排查

**情境：** 凌晨 2 點收到 PagerDuty 告警，API response time 飆到 5 秒。你不想爬起來開電腦，但家裡的開發機開著。

**操作流程：**

```
你 (Telegram)                        Claude Code (開發機)
    │                                       │
    │── "檢查 production log              │
    │    最近 30 分鐘的 error"  ─────────►│
    │                                       │── tail logs
    │                                       │── 分析 error pattern
    │◄── "發現 DB connection pool          │
    │     耗盡，大量 timeout"              │
    │                                       │
    │── "看一下 db config，                │
    │    pool size 設多少？"  ────────────►│
    │                                       │── cat config/database.yml
    │◄── "max_pool: 5，建議調到 20"        │
    │                                       │
    │── "改成 20，commit 到                │
    │    hotfix branch"  ────────────────►│
    │                                       │── 修改檔案
    │                                       │── git commit & push
    │◄── "已推送 hotfix/db-pool-size"      │
    │                                       │
    │── "建 PR"  ───────────────────────►│
    │                                       │── gh pr create
    │◄── "PR #87 已建立"                   │
```

**價值：** 躺在床上 5 分鐘定位問題 + 推修復，不用開電腦。隔天到公司只要 merge PR 就好。

---

## 場景三：開會時同步產出技術文件

**情境：** 你在跟 PM 開需求討論會議，邊聽邊想到需要更新 API 文件。不想在會議中開筆電打字（太不禮貌），但想趁記憶還新鮮。

**操作流程：**

```
你 (Telegram)                        Claude Code (筆電/桌機)
    │                                       │
    │── "在 docs/api/ 底下新增             │
    │    一個 user-export.md，              │
    │    描述 GET /api/v2/users/export     │
    │    支援 csv 和 json 格式，            │
    │    需要 admin 權限"  ──────────────►│
    │                                       │── 讀取現有文件格式
    │                                       │── 建立新文件
    │                                       │── 遵循既有 style
    │◄── "已建立 docs/api/user-export.md   │
    │     包含 endpoint、參數、             │
    │     權限要求、回應範例"              │
    │                                       │
    │── "加上 rate limit 說明，            │
    │    每分鐘 10 次"  ─────────────────►│
    │                                       │── 更新文件
    │◄── "已更新，加在 Notes 區塊"         │
    │                                       │
    │── "commit 並推上去"  ──────────────►│
    │                                       │── git add, commit, push
    │◄── "Done. pushed to docs/api-export" │
```

**價值：** 會議結束時文件已經寫好推上去了。不用會後再花 30 分鐘補文件。

---

## 三個場景的共同重點

| 特性 | 說明 |
|------|------|
| **不需要筆電** | 手機 Telegram 就是你的終端機 |
| **保持上下文** | Claude Code Session 持續存活，記得之前的對話 |
| **操作真實檔案** | 不是聊天機器人，是真的在你電腦上讀寫檔案、執行指令 |
| **即時回饋** | 每個動作都有明確的回覆，知道做了什麼 |

---

## 使用建議

1. **家裡電腦保持開啟** — Claude Code 需要持續執行才能收到訊息
2. **善用自然語言** — 不需要打精確的指令，描述你要什麼就好
3. **敏感操作要確認** — 涉及 git push、刪除檔案等，養成讓 Claude 先說明再執行的習慣
