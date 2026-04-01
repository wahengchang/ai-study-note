# Workspace 修改指南（OpenClaw）

## 1. 目的

這份文件是團隊安全修改 OpenClaw repository 檔案的可重複使用指南，涵蓋範圍：

1. `workspace*` 內容（Agent 行為 / context 檔案與 workspace 層級的 Skill）
2. `agents/*/agent` 執行階段 Agent 設定
3. 平台設定檔（`openclaw.json`）
4. 排程自動化（`cron/jobs.json`）

請將此文件作為團隊編輯作業的預設操作流程。

---

## 2. 高層架構

### 2.1 元件對照表

| 層級 | 主要路徑 | 角色 | 異動頻率 |
| --- | --- | --- | --- |
| Control Plane | `openclaw.json` | 全域系統設定（Agents、Bindings、Channels、Gateway、Plugins） | 中 |
| Agent Runtime Profiles | `agents/*/agent/auth-profiles.json` | 各 Agent 的 auth profile 對應與使用狀態 | 低 |
| Workspace Persona/Context | `workspace*/AGENTS.md`, `SOUL.md`, `USER.md`, `TOOLS.md` 等 | Agent 行為 / 人格設定慣例 | 高 |
| Workspace Skills | `workspace*/skills/*/SKILL.md` | Agent 能力與執行指令 | 中 |
| Scheduler | `cron/jobs.json` | 定時背景任務與 delivery 策略 | 中 |

### 2.2 執行階段關係

| 問題 | 資料來源 |
| --- | --- |
| 哪些 Agent 存在、在哪裡執行 | `openclaw.json > agents.list[]` |
| Agent 使用哪個 Workspace | `openclaw.json > agents.list[].workspace` |
| 哪些 Channel / 訊息路由到哪個 Agent | `openclaw.json > bindings[]` 及 `channels.*` |
| Agent 專屬的 auth profile 可用性 | `agents/<agent-id>/agent/auth-profiles.json` |
| Agent 在該 Workspace 中應做什麼 | `workspace*/AGENTS.md`, `SOUL.md`, `HEARTBEAT.md`, `USER.md` |
| Agent 可使用的額外 Tools / Skills | `workspace*/skills/*/SKILL.md`（加上 shared/global Skills，如有） |
| 週期性任務 | `cron/jobs.json` |

---

## 3. Workspace / Agents / Skills 運作方式

### 3.1 Workspaces

每個頂層 Workspace（`workspace/`、`workspace-dev/`、`workspace-gg-helper/`）都是一個行為 context 套件。

| 檔案 | 職責 | 備註 |
| --- | --- | --- |
| `AGENTS.md` | Session 啟動規則、安全性、Heartbeat 策略 | 核心運作契約 |
| `SOUL.md` | 行為哲學與邊界 | 人格設定基本法 |
| `USER.md` | 人類使用者的 profile 與偏好 | 修改需謹慎 |
| `TOOLS.md` | 環境專屬備註 | 將基礎設施相關資料放這裡 |
| `HEARTBEAT.md` | 輕量級週期性檢查清單 | 盡量精簡以減少 token 消耗 |
| `.openclaw/workspace-state.json` | Workspace bootstrap 狀態 metadata | 系統狀態，非敘述性內容 |

### 3.2 Agents

Agent 的全域註冊在 `openclaw.json` 中管理。Agent 執行階段的 auth profile 檔案位於 `agents/<id>/agent/`。

| 項目 | 行為 |
| --- | --- |
| `agents.list[].id` | Agent 身分識別 key，供 Bindings、Cron、路由使用 |
| `agents.list[].workspace` | 決定使用哪個 Workspace 的檔案與 Skills |
| `agents.list[].agentDir` | Agent 執行階段目錄（auth / session 相關） |
| `subagents.allowAgents` | 明確的 allowlist，控制可委派 / 使用的 Sub-agent |
| `groupChat` | 群組 Channel 中的 mention 模式 / 歷史訊息行為 |

### 3.3 Skills

Skills 是以 `SKILL.md` 定義的指令套件。

| 原則 | 實務影響 |
| --- | --- |
| Skill 身分由 `SKILL.md` 的 metadata / frontmatter 定義 | 資料夾名稱本身不決定有效的 Skill 身分 |
| Workspace Skills 是 per-workspace 的覆寫 | `workspace*/skills/` 下的 Skill 僅適用於使用該 Workspace 的 Agents |
| Scope 優先順序很重要 | Workspace 層級的 Skill 可覆寫同名的較低優先序 shared / bundled 版本 |
| 可被發現不等於可被使用 | 缺少 binary / env / config 依賴項會讓已發現的 Skill 無法執行 |

---

## 4. 各檔案類型的異動策略

### 4.1 安全編輯矩陣

| 檔案類型 | 通常負責人 | 風險 | 需要的驗證 |
| --- | --- | --- | --- |
| `workspace*/**/*.md` | Prompt / Agent 設計者 | 低 - 中 | Markdown 格式檢查 + 段落意圖審查 |
| `workspace*/skills/*/SKILL.md` | 工具 / 自動化開發者 | 中 | Metadata + 依賴項檢查 |
| `cron/jobs.json` | 自動化負責人 | 中 - 高 | JSON 有效性 + 排程正確性 + 目標 Agent / Channel |
| `openclaw.json` | Tech Lead / 平台負責人 | 高 | JSON 有效性 + 路由 / auth / Channel 影響評估 |
| `agents/*/agent/auth-profiles.json` | 平台 / auth 負責人 | 高 | JSON 有效性 + profile key 一致性 |

### 4.2 不可違反的規則

1. 永遠不要在文件或 PR 討論中提交或洩漏 secrets / tokens。
2. 不要隨意重新命名 `agents.list[].id`；Bindings / Cron 可能會壞掉。
3. 修改 `openclaw.json` 中的 Workspace 路徑前，先確認目錄確實存在。
4. 保持 `HEARTBEAT.md` 精簡；避免在 Heartbeat context 中放大量 prompt。
5. `cron/jobs.json` 的 payload prompt 需具確定性，且明確指定 Tools / 輸出格式。
6. 將 auth profile 檔案視為敏感的執行階段設定，而非一般文件。

---

## 5. 團隊編輯標準流程

### 5.1 變更前檢查清單

| 步驟 | 動作 | 指令範例 |
| --- | --- | --- |
| 1 | 確認目標檔案與負責人 | `rg --files workspace* agents cron` |
| 2 | 檢視受影響的設定 | `rg -n "<agentId|workspace|skill-name>" openclaw.json cron/jobs.json` |
| 3 | 擬定小範圍的變更計畫 | 一次只改一個元件 |

### 5.2 編輯檢查清單

| 元件 | 編輯時必要的檢查 |
| --- | --- |
| Workspace markdown 檔案 | 段落結構需與 `setup-new-agent.md` 的結構對照保持一致 |
| Skills（`SKILL.md`） | 驗證 name / description / dependencies 及觸發條件的清晰度 |
| `openclaw.json` | 驗證 Agent ID、Bindings、Channel 設定、Gateway 限制 |
| `cron/jobs.json` | 驗證 `agentId`、排程（`expr`、`tz`）、payload 目標 Channel |
| Auth profile JSON | 保留 key 結構（`version`、`lastGood`、`profiles`、`usageStats`） |

### 5.3 變更後驗證

| 檢查項目 | 指令 |
| --- | --- |
| JSON 語法 | `jq . openclaw.json >/dev/null` |
| Cron 設定檔語法 | `jq . cron/jobs.json >/dev/null` |
| Agent auth profile 語法 | `for f in agents/*/agent/auth-profiles.json; do jq . "$f" >/dev/null; done` |
| 快速 diff 檢視 | `git diff -- <paths>` |

---

## 6. 變更模式（可重複使用）

### Pattern A：更新單一 Workspace 中的 Agent 行為

1. 依需求編輯 `workspace-<target>/AGENTS.md`、`SOUL.md`、`HEARTBEAT.md`。
2. 確保 persona（`IDENTITY.md`）和使用者 profile（`USER.md`）保持一致。
3. 驗證 Markdown 可讀性與段落一致性。

### Pattern B：新增 / 修改 Workspace Skill

1. 建立或更新 `workspace-<target>/skills/<skill-name>/SKILL.md`。
2. 確保 metadata 中的 name / description 清楚表達觸發條件。
3. 記錄依賴需求（binary / env / config）。
4. 若 Skill 名稱與 shared / bundled Skill 衝突，確認覆寫是刻意的。

### Pattern C：在平台設定中新增 / 修改 Agent

1. 更新 `openclaw.json > agents.list[]`。
2. 正確設定 `workspace` 和 `agentDir` 路徑。
3. 如需路由，新增或更新 `bindings[]`。
4. 重新驗證 JSON 及引用 `agentId` 的 Cron 任務。

### Pattern D：修改排程任務

1. 編輯 `cron/jobs.json` 中的目標任務項目。
2. 確認 `agentId` 存在於 `openclaw.json` 中。
3. 確認排程的時區與 cron expression 符合業務預期。
4. 確認 payload prompt 引用的 Skill 路徑 / 指令有效。

---

## 7. 協作規則（Tech Lead 基線）

| 規則 | 原因 |
| --- | --- |
| 以元件為單位發小型 atomic PR | 容易 rollback，影響範圍小 |
| PR 描述中包含「影響範圍」 | 讓跨 Agent 的副作用一目了然 |
| 盡可能將設定與內容的變更分開 | 簡化 review 及事故排查 |
| `openclaw.json`、`cron/jobs.json` 至少需一位熟悉平台的 reviewer | 降低正式環境路由 / 排程出錯風險 |
| 將非顯而易見的決策記錄在 Workspace 文件中 | 為日後編輯保留團隊 context |

建議的 PR 段落結構：

1. Intent
2. Files changed
3. Runtime impact
4. Validation performed
5. Rollback plan

---

## 8. 常見失敗模式

| 失敗現象 | 根本原因 | 預防方式 |
| --- | --- | --- |
| Agent 不再收到預期訊息 | `bindings` 不匹配或 `agentId` 打錯 | 跨檔案驗證 `agentId` 引用 |
| 排程任務跑在錯誤的 Agent 上 | `cron/jobs.json` 的 `agentId` 不匹配 | 與 `openclaw.json` 交叉比對 |
| Skill 出現但無法執行 | 缺少依賴項（binary / env / config） | 在 `SKILL.md` 中宣告先決條件 |
| 敏感資料外洩 | 在設定 / 文件中編輯或暴露 token | 遮蔽 secrets 並在 review 時限制檔案可見性 |
