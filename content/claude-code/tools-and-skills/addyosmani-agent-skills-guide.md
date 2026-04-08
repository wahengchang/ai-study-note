---
title: "addyosmani/agent-skills 可複用模式研究"
description: "Reusable patterns from addyosmani/agent-skills — skill design, packaging, and comparison with agentskills spec"
tags:
  - research
  - claude-code
  - agent-architecture
---

## TL;DR

- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) 是 Addy Osmani 開源的 **19 個生產級工程技能包**，對應完整軟體開發生命週期（Define → Plan → Build → Verify → Review → Ship）
- 每個 Skill 是一份結構化的 `SKILL.md`，包含流程步驟、Anti-Rationalization 表、Red Flags、以及可驗證的退出條件
- 透過 Claude Code Plugin 系統（`.claude-plugin/`）或直接作為 Markdown 指令集給任何 AI Agent 使用
- 與 awesome-agent-skills 的差異：這不是一份精選「清單」，而是一套 **有嚴格結構規範的自成體系工作流**

---

## 核心價值主張

這個 repo 要解決的問題很明確：

- AI Agent 預設走最短路徑 — 跳過 spec、跳過測試、跳過安全審查
- 一般 prompt template 只告訴 Agent「做什麼」，但沒有 **強制執行品質關卡**
- addyosmani/agent-skills 把資深工程師的工作紀律打包成 Agent 可遵循的結構化流程

關鍵設計原則：

- **Process, not prose** — 每個 Skill 是 workflow，不是參考文件
- **Anti-Rationalization** — 內建「Agent 常用藉口 vs. 反駁」對照表，防止 Agent 自行合理化跳步
- **Verification is non-negotiable** — 每個 Skill 結尾都有證據需求清單（測試通過、build 輸出等）
- **Progressive disclosure** — `SKILL.md` 是進入點，參考資料按需載入，控制 token 用量

---

## Skill 組織架構

### 目錄結構

```
agent-skills/
├── skills/                    # 19 個核心 Skill（每個一個資料夾）
│   └── <skill-name>/
│       ├── SKILL.md           # 必要：Skill 定義
│       └── *.md               # 選用：參考資料（超過 100 行才拆出）
├── agents/                    # 3 個專家人設（code-reviewer, test-engineer, security-auditor）
├── references/                # 4 份補充 checklist
├── hooks/                     # Session lifecycle hooks
├── .claude/commands/          # 7 個 slash commands
├── .claude-plugin/            # Claude Code Plugin 打包設定
│   ├── plugin.json
│   └── marketplace.json
└── docs/                      # 各工具的安裝指南
```

### Skill 的標準結構（Skill Anatomy）

每個 `SKILL.md` 遵循固定格式：

```yaml
---
name: lowercase-hyphen-name
description: "What it does. Use when [trigger conditions]."
---
```

必要章節：

| 章節 | 用途 |
|:---|:---|
| Overview | 電梯簡報：這個 Skill 做什麼、為什麼重要 |
| When to Use | 觸發條件清單，含正面觸發和排除情境 |
| Core Process | 分步驟的工作流程，必須可執行（不是模糊建議） |
| Common Rationalizations | Agent 跳步的常用藉口 + 事實反駁 |
| Red Flags | 違反此 Skill 的可觀察跡象 |
| Verification | 退出條件 checklist，每項都要有可驗證的證據 |

### 7 個 Slash Commands 對應開發生命週期

```
/spec    → Define（規格先於程式碼）
/plan    → Plan（小而原子的任務拆解）
/build   → Build（一次一個垂直切片）
/test    → Verify（測試是證明）
/review  → Review（改善程式碼健康度）
/code-simplify → Review（清晰勝過聰明）
/ship    → Ship（越快越安全）
```

Skill 也會根據 Agent 正在做的事情**自動觸發** — 例如設計 API 時自動載入 `api-and-interface-design`，做 UI 時觸發 `frontend-ui-engineering`。

### Plugin 打包方式

透過 `.claude-plugin/plugin.json` 打包：

```json
{
  "name": "agent-skills",
  "description": "Production-grade engineering skills for AI coding agents",
  "version": "1.0.0",
  "commands": "./.claude/commands"
}
```

安裝方式：

```bash
# Marketplace 安裝
/plugin marketplace add addyosmani/agent-skills
/plugin install agent-skills@addy-agent-skills

# 本地開發
claude --plugin-dir /path/to/agent-skills
```

---

## 與 awesome-agent-skills 的比較

| 維度 | addyosmani/agent-skills | awesome-agent-skills (VoltAgent) |
|:---|:---|:---|
| **定位** | 自成體系的工程工作流套件 | 社群精選清單（1000+ 技能索引） |
| **Skill 數量** | 19 個（精簡、深度） | 1,030+（廣度、多來源） |
| **結構規範** | 嚴格的 Skill Anatomy 格式 | 無統一格式，各來源自訂 |
| **品質控制** | Anti-Rationalization + Verification 內建 | 依各技能提供者自行決定 |
| **使用方式** | 整包安裝為 Plugin，Slash Command 觸發 | 單獨安裝個別 Skill |
| **跨工具支援** | Claude Code / Cursor / Gemini CLI / Windsurf / Copilot | 主要標註相容工具，各自安裝 |
| **生命週期覆蓋** | 完整 SDLC（Define → Ship） | 按領域分類，無生命週期概念 |
| **適合場景** | 團隊要建立統一的 Agent 工作紀律 | 探索特定領域有什麼現成 Skill 可用 |

簡單來說：awesome-agent-skills 是「菜市場」，addyosmani/agent-skills 是「完整套餐」。

---

## Top 5 可複用模式

### 1. Anti-Rationalization Table

每個 Skill 內建「藉口 vs. 事實」對照表，這是最有差異化的設計。

```markdown
## Common Rationalizations
| Rationalization | Reality |
|---|---|
| "I'll add tests later" | Tests written after are weaker. Write them first. |
| "This is too simple to spec" | Simple things grow. Spec catches scope creep early. |
```

**可複用方式**：在我們的 `claude/agents/` 或 `CLAUDE.md` 中加入類似的 rationalization guard。

### 2. Verification-as-Exit-Criteria

不只是「完成了嗎？」而是「有什麼證據證明完成了？」

```markdown
## Verification
After completing, confirm:
- [ ] All tests pass (`npm test` output attached)
- [ ] Build succeeds (`npm run build` output attached)
- [ ] No new lint warnings
- [ ] Changes reviewed against spec
```

### 3. Progressive Context Loading

Skill 本身只載入 `SKILL.md`（精簡），參考資料按需載入。這控制了 token 用量，避免 context window 溢出。

```
SKILL.md (必載，~200 行)
  └── references/*.md (按需載入，只在觸發條件符合時)
```

### 4. Intent-to-Skill Mapping

在 `AGENTS.md` 中定義意圖到 Skill 的映射，讓 Agent 自動選擇正確的 Skill：

```markdown
- Feature / new functionality → spec-driven-development, then incremental-implementation
- Bug / failure → debugging-and-error-recovery
- Code review → code-review-and-quality
- Refactoring → code-simplification
```

### 5. Lifecycle-as-Command 架構

把完整 SDLC 對應成 7 個 Slash Command，每個 command 自動組合底層 Skill。使用者不需要知道有哪些 Skill — 只要說 `/spec`、`/build`、`/ship`。

---

## 對我們工作流的下一步

- **導入 Anti-Rationalization**：在 `claude/agents/writer.md` 和 `reviewer.md` 中加入常見跳步藉口的防禦表
- **強化 Verification**：現有的 `@reviewer` agent 可參考 addyosmani 的退出條件 checklist 模式，要求具體證據
- **Progressive Loading**：確認我們的 prompt fragments（`claude/prompts/*.md`）已經做到按需載入，避免每次都全量注入
- **評估 Plugin 打包**：如果未來要把我們的 prompt system 分享給其他 repo，可參考 `.claude-plugin/` 的結構
- **Skill Anatomy 作為範本**：新增 Agent 或 Prompt 時，考慮採用「Overview → When to Use → Process → Rationalizations → Verification」的標準結構

---

## 延伸閱讀

- [addyosmani/agent-skills GitHub](https://github.com/addyosmani/agent-skills)
- [Skill Anatomy 格式規範](https://github.com/addyosmani/agent-skills/blob/main/docs/skill-anatomy.md)
- [Software Engineering at Google](https://abseil.io/resources/swe-book)（此 repo 大量引用的理念來源）

## Related

- [[awesome-agent-skills-guide|Awesome Agent Skills 精選清單]]
- [[claude-folder-anatomy-guide|Claude 資料夾結構解析]]
- [[hooks-guide|Claude Code Hooks 入門]]
