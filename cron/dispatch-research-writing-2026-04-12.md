---
title: Dispatch Brief — Research & Writing Queue (2026-04-12)
---

## 用途

依據 `./cron/git-auto.md` 的工作流啟動研究/寫作類 issue 的執行調度。本文件僅為派工清單，不替代實際 note 產出。

## 審查範圍

- 範圍：`wahengchang/ai-study-note` 全部 **open** issues（7 筆）
- 篩選條件：labels 含 `documentation`/`enhancement`，且 issue 正文描述為「研究（research）」或「撰寫 study note / learn note（writing）」
- 排除：已存在 open PR 的 issue（避免重工）、bug fix、基礎建設遷移提案

## Issue 分類結果

| # | Issue | Open PR | 類別 | 狀態 |
|---|-------|---------|------|------|
| 77 | Research terminal multiplexing (cmux) + Claude Code | — | research | **queued** |
| 76 | Research AI YouTube automation (n8n workflow) | — | research | **queued** |
| 75 | Research LLM-based knowledge management (raw/wiki) | — | research | **queued** |
| 74 | Write study note: Astron Agent / Serper / Jina / Python node / LLM | #103 | writing | in-flight, skip |
| 67 | Fix duplicate H1 titles | #68 | bug fix | out of scope |
| 63 | Adopt Mintlify as new framework | — | infra/planning | out of scope |
| 61 | Research 小紅書 prompt optimization tool | #73 | research | in-flight, skip |

排除已有 PR 的 #61、#74 後，本批派工目標為 **#75、#76、#77** 三個 issue。

## 操作需求分析（Operational Requirements）

### Issue #75 — LLM-based 知識管理（raw / wiki）

- **交付物**：一篇 learn note，說明 raw / wiki 雙層分離的設計、AI 整理流程、查詢回寫循環。
- **研究深度**：中。使用者已提供中文說明稿與 Karpathy / 林穎俊老師參考來源，多為二次整理。
- **工具需求**：文本整理、可選架構示意圖。
- **風險**：與 PR #69（Karpathy LLM-maintained wiki）主題相近，需在文中明確區隔「個人 KM 實作視角」vs「Karpathy 引用視角」，避免重複收錄。

### Issue #76 — n8n AI YouTube 自動化 workflow

- **交付物**：一篇 research note + 工具分類清單 + 最小 PoC 架構草圖。
- **研究深度**：高。牽涉 7 類工具（orchestration / LLM / visual / audio / render / publish / storage）與版權、平台政策風險。
- **工具需求**：Mermaid workflow 圖（LR）、工具對照表、成本與風險矩陣。
- **風險**：工具清單易變動；需標註「截至撰稿日資訊」；不得建議規避 YouTube 政策的做法。

### Issue #77 — 終端多工 + Claude Code workflow

- **交付物**：一篇研究筆記 + 3 項以上工具比較表 + 1 套可落地實務 workflow。
- **研究深度**：中高。首要任務是釐清原小紅書貼文所指的 `cmux` 實體（疑似 stravu/cmux，非傳統 tmux 衍生品）。
- **工具需求**：工具特性比較表、pane / session 佈局建議、可選示意圖。
- **風險**：原始連結為短連結且內容不完整，需標註來源不確定性；不可臆測。

## 派工決策（Agent Assignment）

所有派工依 `claude/config.yaml` 的 agent 定義與 prompts 組合。

| Issue | Primary Agent | Secondary | 理由 |
|-------|--------------|-----------|------|
| #75 | `@writer` | `@reviewer` | 標準 learn note 結構、需要 formatting + quartz 規範；最後交給 reviewer 檢查與 PR #69 的內容不重疊 |
| #76 | `@writer` | `@diagram` → `@reviewer` | workflow note 需要 Mermaid LR 圖呈現 7 段 pipeline，先 writer 起稿、diagram 補圖、reviewer 驗收 |
| #77 | `@writer` | `@reviewer` | 研究型 note + 工具比較表；若最終決定加入 session 佈局示意圖再呼叫 `@diagram` |

### 共用執行規則

- 檔名：`kebab-case`，落於 `content/research-notes/` 或對應子資料夾。
- Frontmatter 必含 `title`；不得在正文重複 `# H1`（參 Issue #67 規範）。
- Mermaid 一律 `direction LR`；無助益則不放。
- Code block 必備語言識別字。
- 每 issue 一個 branch、一個 PR，分支命名 `auto/issue-<n>`，從 `origin/main` 新建。
- 提交前跑 `npm run check` 與 `npm run quartz -- build`，兩者皆需 exit 0。

## 執行順序（git-auto.md 每回合挑一件）

依 `cron/git-auto.md` §4「lowest number first」：

1. **#75** — 第一輪執行
2. **#76** — 第二輪執行
3. **#77** — 第三輪執行

## 驗收條件（Dispatch 本身）

- [x] 審查全部 open issues 並分類
- [x] 排除已有 open PR 的 issue（#61、#74、#67）
- [x] 每個 queued issue 皆有 operational requirements 與 agent 指派
- [x] 指派皆對應 `claude/config.yaml` 中登錄的 agent
- [x] 明列共用品質規則與執行順序

## 來源

- `claude/config.yaml`
- `claude/agents/{writer,reviewer,diagram,content-ops}.md`
- `cron/git-auto.md`
- GitHub open issues（快照於 2026-04-12）
