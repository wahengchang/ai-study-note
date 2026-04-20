---
title: 邏輯與流程標記法
description: >-
  Personal notation system for writing clear logic documents — step symbols,
  conditionals, loops, and error flows
pubDate: '2026-04-01'
category: claude-code
tags:
  - reference
  - claude-code
  - prompt-engineering
draft: false
---

# 我的邏輯與流程標記法
*一份用來撰寫清楚邏輯文件的個人指引*

---

## 1. 核心概念

用簡單的步驟寫下你的邏輯 — 簡短、清楚、不廢話。用符號標記每個步驟的類型，只在步驟複雜時才加上細節。

**每份文件都從 GOAL 開始，其他所有內容都從這裡展開。**

---

## 2. 符號速查表

| 符號 | 意思 | 範例 |
|------|------|------|
| `1.  2.  3.` | 一個步驟 | `1.  Get user from DB` |
| `→` | 輸出 / 產生 / 傳到 | `→ { email, plan }` |
| `IF` | 條件判斷 | `IF plan == "pro"` |
| `  YES / NO` | IF 的分支 | `YES → step 4 / NO → END` |
| `FOR EACH` | 對清單中的項目迴圈 | `FOR EACH order in orders[]` |
| `★` | 這裡有細節區塊 | `3. ★ Send email` |
| `⚠` | 邊界情況 / 注意 | `⚠ can be null` |
| `?` | 尚未確定 / 待決定 | `? maybe use AI here` |
| `//` | 註解 / 自己的備忘 | `// check with client first` |
| `END` | 流程結束 | `END` |

---

## 3. 基本模板

```
GOAL: one sentence — what this flow does

1.  [step description]  → [output]
2.  [step description]  → [output]  ⚠ [edge case if any]
3.  IF [condition]
      YES → step 4
      NO  → END
4.  [step]
    FOR EACH [item] in [list]
      4.1  [do something]
      4.2  [do something else]
    END LOOP
5.  END
```

---

## 4. 細節區塊 ★

只在步驟有複雜邏輯、不直覺的輸入/輸出，或需要特別處理的錯誤情境時，才加上細節區塊。用 ★ 標記該步驟，表示它有附加說明。

```
3. ★ Send email via SendGrid
   IN:  { email, orderId, plan }
   DO:  pick template by plan, send
   OUT: { status: "sent" | "failed" }
   ERR: → notify Slack, stop
```

盡量精簡。如果某一行需要更多說明，用 `//` 加上備註。

---

## 5. 完整範例

```
GOAL: send promo email to pro users after signup

1.  Trigger: new user signs up         → { userId, email }
2.  Get user plan from DB              → { plan }  ⚠ can be null
3.  IF plan == "pro"
      YES → step 4
      NO  → END
4. ★ Send promo email
   IN:  { email, plan }
   DO:  pick template #3, send         // SendGrid
   OUT: { status: "sent" | "failed" }
   ERR: → log error, END
5.  END
```

---

## 6. 規則

- 每份文件都以 `GOAL:` 開頭 — 只寫一句話。
- 每行一個步驟，保持簡短。
- 用 `→` 表示步驟的輸出。
- 每個判斷都用 `IF / YES / NO`，兩個分支都要寫。
- 迴圈用 `FOR EACH`，結尾一定要加 `END LOOP`。
- 只在步驟複雜時才加 `★`，簡單步驟不要過度描述。
- 邊界情況用 `⚠` 寫在行內 — 不要另開章節。
- 用 `?` 標記尚未決定的事項。
- `//` 是給自己看的備忘 — 不是指令。
- 每份文件以 `END` 結尾。

---

*個人使用。隨著你的風格演進，持續更新規則。*
