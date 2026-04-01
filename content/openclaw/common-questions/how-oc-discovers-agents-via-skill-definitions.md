---
title: OC 如何透過 Skill 定義來發現 Agent
tags:
  - openclaw
  - routing
  - skill-definition
  - reference
description: "SKILL.md defines skills not agents — how OpenClaw scans skill folders and builds the available skill set"
---

## 重點先讀

- `SKILL.md` 定義的是 **Skill**，不是 Agent。
- OpenClaw 會掃描 Skill 資料夾，建立可用的 Skill 集合。
- Agent 之所以相關，是因為每個 Agent 有自己的 Workspace，而 Workspace 內的 Skill 是各自獨立的。

一句話模型：
- Skill 發現 = 載入 `SKILL.md` 檔案。
- Agent 路由 = 從 Binding / 設定中挑選 `agentId`。

## 總覽

```mermaid
flowchart LR
  A["Gateway start or refresh"] --> B["Scan skill roots"]
  B --> C["Parse YAML frontmatter"]
  C --> D["Apply precedence and load gates"]
  D --> E["Eligible skills for each agent run"]

  classDef main fill:#1f2329,stroke:#d1d5db,stroke-width:1.5px,color:#f9fafb,font-size:16px;
  class A,B,C,D,E main;
```

## 1) Skill 載入位置與優先順序

| 順序 | 來源 | 用途 |
| --- | --- | --- |
| 1（最高） | `<workspace>/skills` | 單一 Agent 的覆寫 / 自訂 Skill |
| 2 | `~/.openclaw/skills` | 本機共用 / 託管 Skill |
| 3 | Bundled skills | OpenClaw 內建的基礎 Skill |
| 4（最低） | `~/.openclaw/openclaw.json` 中的 `skills.load.extraDirs` | 選擇性的共用外部資料夾 |

實務上的意義：

- 同名 Skill 衝突時，以上述優先順序解決（Workspace 優先）。

## 2) 為什麼這跟 Agent 有關

| 概念 | 控制什麼 |
| --- | --- |
| Skill discovery | 哪些 Skill 被載入 / 符合資格 |
| Agent routing | 哪個 `agentId` 接收進來的訊息 |
| Agent workspace | 哪個 `<workspace>/skills` 資料夾對該 Agent 可見 |

實用原則：

- 一個 Skill 可以被多個 Agent 共用（放在 `~/.openclaw/skills`），同時每個 Agent 也能在自己的 Workspace 中覆寫它。

## 3) CLI 指令（Skills）

先查說明，再確認狀態：

```bash
openclaw --help
openclaw skills --help
openclaw skills list
openclaw skills check --eligible -v
openclaw skills info <skill-name>
```

交叉比對相關 Agent：

```bash
openclaw agents --help
openclaw agents list --bindings
```

## 驗證清單

1. 確認 Skill 存在於上述載入位置之一。
2. 確認 `SKILL.md` frontmatter 有效（`name`、`description`）。
3. 執行 `openclaw skills list`，確認 Skill 有出現。
4. 如果沒出現，跑 `openclaw skills check -v` 檢查缺少的需求。
5. 如果有多個副本，確認優先順序（Workspace > 共用 > 內建）。

## 快速除錯

| 症狀 | 可能原因 | 第一步檢查 |
| --- | --- | --- |
| Skill 沒出現在清單中 | 資料夾路徑錯誤或 `SKILL.md` 無效 | 確認路徑 + frontmatter |
| Skill 出現但不符合資格 | 缺少環境 / 執行檔 / 設定需求 | `openclaw skills check -v` |
| 行為跟預期不同 | 名稱衝突導致優先順序問題 | 檢查各載入根目錄是否有重複的 Skill 名稱 |
| 共用 Skill 在某個 Agent 看不到 | 查找了錯誤的 Workspace / Profile | 確認該 `agentId` 的 active Workspace |

## 備註

- 這份筆記談的是 Skill 的發現與載入。
- Agent 路由與執行閘門的說明在 `how-oc-routes-and-triggers-agents.md`。

## Related

- [[how-oc-routes-and-triggers-agents|How OC Routes and Triggers Agents]]
- [[ch1-architecture-four-pillars|Ch1: 架構四大支柱]]
