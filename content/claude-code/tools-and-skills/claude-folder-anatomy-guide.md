---
title: ".claude/ 資料夾完全解析"
description: "Anatomy of the .claude folder — project-level vs global config, CLAUDE.md, settings, permissions, and memory"
tags:
  - reference
  - claude-code
  - devops
---

> 來源：[@akshay_pachaar](https://x.com/akshay_pachaar/status/2035341800739877091) — "Anatomy of the .claude/ folder"
>
> 大多數開發者把 `.claude/` 資料夾當成黑盒子，從未打開過。但它其實是 Claude Code 的**控制中心**，決定了 Claude 在你專案中的行為方式。

---

## 一句話重點

**`.claude/` 資料夾 = Claude 的大腦設定檔。** 你放什麼規則進去，Claude 就照著做。

---

## 核心架構：兩個 .claude 資料夾

| 資料夾 | 位置 | 用途 | 是否 commit |
|--------|------|------|-------------|
| **專案級** | `你的專案/.claude/` | 團隊共用的規則、指令、權限 | 是 |
| **全域級** | `~/.claude/` | 個人偏好、session 紀錄、記憶 | 否 |

---

## 各元件簡單說明

### 1. CLAUDE.md — 最重要的檔案

Claude 啟動時**第一個讀取**的檔案，直接載入 system prompt。

- 專案根目錄的 `CLAUDE.md` → 最常見
- `~/.claude/CLAUDE.md` → 全域偏好（跨專案適用）
- 子目錄的 `CLAUDE.md` → 資料夾級規則

**建議：控制在 200 行以內**，超過會降低指令遵從度。

```markdown
# CLAUDE.md 範例
- 使用 TypeScript strict mode
- 測試覆蓋率須達 80% 以上
- commit message 用繁體中文
- API 回傳格式統一用 { data, error, meta }
```

### 2. rules/ — 拆分規則

當 `CLAUDE.md` 太長時，用 `rules/` 資料夾拆分：

```
.claude/rules/
├── code-style.md      # 程式碼風格
├── testing.md         # 測試規範
├── api-conventions.md # API 慣例
└── security.md        # 安全規則
```

每個 `.md` 檔會**自動載入**，和 `CLAUDE.md` 合併。

### 3. commands/ — 自訂指令

檔案名 = 指令名。例如 `fix-issue.md` → 可用 `/project:fix-issue` 呼叫。

| 位置 | 觸發方式 | 共享範圍 |
|------|----------|----------|
| `.claude/commands/` | `/project:指令名` | 團隊共用（commit 到 git） |
| `~/.claude/commands/` | `/user:指令名` | 個人專用 |

### 4. skills/ — 技能包

和 commands 的差別：**Skills 可以包含多個支援檔案**，是一個「套件」而非單一檔案。

重點：Skills 會**根據任務描述自動觸發**，不需要手動呼叫。

### 5. agents/ — 子代理

在 `.claude/agents/` 定義專屬的子代理，每個代理有：
- 獨立的 system prompt
- 獨立的工具存取權限
- 獨立的 context window（不會污染主對話）

適合：複雜任務需要「專家分工」時使用。

### 6. settings.json — 權限控制

控制 Claude 在 OS 層級能做什麼（不只是對話層級）。

- `settings.json` → 團隊共用的權限政策
- `settings.local.json` → 個人覆寫（自動 gitignore）

### 優先順序

```
Managed Policy > Global > Project > Local
（管理政策 > 全域 > 專案 > 本地）
```

---

## 整體資料夾結構一覽

```
你的專案/
├── .claude/
│   ├── CLAUDE.md          # 主要指令
│   ├── rules/             # 拆分的規則
│   ├── commands/          # 自訂指令
│   ├── skills/            # 技能包
│   ├── agents/            # 子代理
│   ├── settings.json      # 權限（團隊）
│   └── settings.local.json # 權限（個人）
│
~/.claude/
├── CLAUDE.md              # 全域偏好
├── commands/              # 個人指令
└── （session 紀錄、記憶等）
```

---

## 實戰情境

### 情境 1：新專案快速建立團隊規範

**場景**：你帶領一個 3-5 人的開發團隊，剛開始一個新的 Node.js 專案。每個人都用 Claude Code，但風格不統一。

**做法**：

```bash
mkdir -p .claude/rules .claude/commands
```

1. 建立 `CLAUDE.md`，寫入核心規範（語言、框架、測試要求）
2. 在 `rules/` 拆分詳細規則：
   - `code-style.md`：ESLint 規則、命名慣例
   - `git-conventions.md`：commit message 格式、branch 命名
3. 在 `commands/` 建立常用指令：
   - `review-pr.md`：標準化 code review 流程
   - `create-api.md`：建立新 API endpoint 的模板
4. Commit `.claude/` 到 git，團隊成員 pull 後即可統一

**效果**：每個人的 Claude Code 都遵循相同規範，減少 code review 來回。

### 情境 2：跨專案維護個人開發習慣

**場景**：你同時維護 3 個不同的專案（前端 React、後端 Python、資料分析 Jupyter），但有一些共通偏好。

**做法**：

1. 在 `~/.claude/CLAUDE.md` 設定全域偏好：
   ```markdown
   - 回應使用繁體中文
   - 優先考慮效能與可讀性
   - 不要加不必要的註解
   - 錯誤處理要簡潔
   ```
2. 在 `~/.claude/commands/` 放入個人常用指令：
   - `daily-standup.md`：總結昨天改了什麼
   - `quick-test.md`：快速跑相關測試

**效果**：不管切換到哪個專案，Claude 都保持你的偏好風格。

### 情境 3：敏感專案的權限鎖定

**場景**：你的專案涉及客戶資料處理，需要限制 Claude 能執行的操作（例如不能隨意刪檔、不能 push 到 main）。

**做法**：

1. 在 `settings.json` 設定嚴格權限：
   - 禁止 `rm -rf`、`git push --force`
   - 限制只能讀寫特定目錄
   - 禁止存取 `.env` 和 credentials 相關檔案
2. 在 `rules/security.md` 寫入安全規則：
   ```markdown
   - 永遠不要在程式碼中硬寫密鑰
   - 所有 API 呼叫必須經過認證 middleware
   - 資料庫操作必須使用 parameterized queries
   ```
3. 用 `settings.local.json` 讓個別開發者微調（例如本地測試時放寬限制）

**效果**：即使 Claude 有強大能力，也被限制在安全範圍內操作。

---

## 參考來源

- [Akshay Pachaar (@akshay_pachaar) — 原始推文](https://x.com/akshay_pachaar/status/2035341800739877091)
- [Daily Dose of Data Science — 完整文章](https://blog.dailydoseofds.com/p/anatomy-of-the-claude-folder)

