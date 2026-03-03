---
title: OpenClaw 系統資產盤點指引
---

# 📋 OpenClaw 系統資產盤點指引

> 架構語彙更新（核心精簡版）：在 `openclaw.json` 中，元件關聯以**階層宣告（Hierarchy）**與**路由配置（Routing）**為主；不再使用「Binding」作為核心概念。

隨著 OpenClaw 專案擴展，定期盤點系統資產是確保系統安全、效能與架構清晰的關鍵。建立或審查系統時，請務必確認以下核心元件狀態。

## 📂 核心關聯檔案與路徑 (Core Files & Directories)

盤點前請確認可存取以下核心設定與目錄：

- `~/.openclaw/openclaw.json`：系統大腦，定義 Channels、Agents、Skills 掛載、Routing 規則與 Gateway 高危權限黑名單。
- `~/.openclaw/sessions/`：動態狀態，存放活躍對話上下文檔（以 `context_id` 命名）與 Pairing 狀態。
- `[workspace_path]/`：工作區沙盒，Agent 真正活動與讀寫範圍，含長期記憶 (`AGENTS.md`) 與專屬技能 (`skills/`)。
- `[agentDir]/`：代理人提示與鑑權檔案位置（如 `SOUL.md`、`USER.md`、`auth-profiles.json`）。
- `~/.openclaw/shared-skills/`：全局共用技能庫。
- `cron/jobs.json`（或對應排程檔）：定時任務定義。

## 1. 列出所有會話 (Sessions)

🎯 盤點目標：掌握目前有哪些活躍對話與外部存取點。

- Session ID (`context_id`)：系統內部追蹤唯一碼。
- 來源頻道與對象 (`channel` & `peer.id`)：群組或私訊來源。
- 路由目標代理人 (`agentId`)：該 Session 由哪個 Agent 接待。
- 授權狀態 (Auth/Pairing)：私訊是否完成配對授權。
- 對話記憶 (Memory State)：是否已累積長期上下文（影響 Token 消耗）。

## 2. 列出所有工作區 (Workspaces)

🎯 盤點目標：確認檔案系統隔離狀態與資料安全。

- 物理路徑 (Absolute Path)：例如 `/home/user/.openclaw/workspace-dev`。
- 掛載 Agent 數量：哪些 Agent 使用該目錄。
- ⚠️ 專家檢查點：若兩個以上 Agent 共用同一 Workspace，需標註「資料交叉污染風險」。
- 日誌與資料佔用：Log 或生成檔案是否過大。
- 專屬技能庫 (Local Skills)：該資料夾中的 `SKILL.md` 清單。

## 3. 列出所有代理人 (Agents)

🎯 盤點目標：掌握系統大腦分佈與路由狀態。

- 代理人 ID (`agentId`)：設定檔唯一名稱。
- 人格設定路徑 (`agentDir`)：提示詞與鑑權檔存放位置。
- 驅動模型 (`model`)：如 Gemini 3 Flash、Claude Opus（影響成本與效能）。
- 入站路由 (`routing`)：外部事件如何由 Gateway 路由到該 Agent。
- 技能掛載 (`skills[]`)：該 Agent Runtime 具備哪些可執行技能（例如 `skills: ["weather", "youtube"]`）。

## 3.1 元件關聯架構（核心精簡版）

以下為 OpenClaw 官方語彙下的最小必要關聯：

- **Channel ➔ Agent**：**Routing / Trigger**  
  Channel 是外部事件的 Ingress；Gateway 依 Routing 規則將特定 Payload 路由給指定 Agent。
- **Agent ➔ Skill**：**Mounting / Configuration**  
  Agent 透過屬性陣列宣告可用技能，形成能力依賴注入（Dependency Injection）。
- **Cron ➔ Agent**：**Job / Assignment**  
  背景非同步任務在排程表定義時間規則後，指派給特定 Agent 執行。
- **Session**：**Session Context**  
  Agent 由 Channel 或 Cron 喚醒時，Gateway 動態 Create/Load 對應狀態空間，以隔離該次任務的對話紀錄與變數。

## 4. 列出所有技能 (Skills)

🎯 盤點目標：審計能力範圍與潛在安全漏洞。

- 技能名稱與描述 (`name` & `description`)：用途與觸發關鍵字。
- 作用域 (Scope)：`shared-skills`（全局）或 Workspace（私有）。
- 系統依賴 (`requires`)：需要的軟體與環境變數。
- 高危權限標記 (`require_confirmation`)：是否涉及修改檔案、外發資料、刪除資源，且是否強制人工確認。

## 5. 列出所有定時任務 (Cron Tasks)

🎯 盤點目標：管理後台自動化流程，防止資源耗盡或暴走。

- 任務 ID (`jobId`)：任務唯一識別碼。
- 執行頻率與時區 (`schedule` & `tz`)：何時執行、時區是否正確。
- 代為執行 Agent (`agentId`)：喚醒哪個 Agent。
- 會話隔離度 (`sessionTarget`)：獨立 `isolated` 或混入日常群組會話。
- 投遞與失敗策略 (`delivery` & `state`)：結果發給誰、失敗是否重試或告警。

> ✅ 檢查原則：若文件或設定仍出現 `bindings` 作為主關聯欄位，應改寫為 `routing`（Channel ➔ Agent）與 `skills[]`（Agent ➔ Skill）兩條主軸。

## 📝 步驟三：產出盤點分析報告（填寫矩陣）

完成資料收集後，請將原始資料轉為可審查的「視角矩陣」。

請複製以下模板，建立新報告檔（例如 `Inventory_Report_2026.md`）並填寫：

---

## 🛡️ OpenClaw 權限與資源存取審查報告

盤點日期： YYYY-MM-DD  
盤點人員： [你的名字]

### 視角一：以 Agent 為核心的「履歷表」視角 (Agent-Centric View)

（指引：請為系統中的每一個 Agent 複製並填寫以下區塊。）

#### 🤖 Agent: [填寫 Agent ID]

- 👤 誰能使喚它（入站來源）：[例如 Telegram 特定群組、僅限 CLI 等]
- 📁 它的辦公桌（Workspace）：[填寫路徑]（請標註是否與其他 Agent 共用）
- 🛠️ 它的專屬工具（Local Skills）：[列出該 workspace 下的技能名稱，無則填無]
- 🌍 它的共用工具（Shared Skills）：[列出可存取的全局技能]
- ⏱️ 負責的例行公事（Cron）：[列出該 Agent 負責任務，無則填無]

### 視角二：資源存取交叉矩陣 (Resource Access Matrix)

（指引：Agent 置頂、資源置左；可用/可讀寫填 ✅，無權限填 ❌。）

#### 1) 📂 工作區沙盒 (Workspace Sandbox) 隔離矩陣

（審查重點：同一行有兩個以上 ✅ 代表資料污染風險。）

| 資源名稱 (Workspaces) | [Agent 1] | [Agent 2] | [Agent 3] | [Agent 4] |
| --- | --- | --- | --- | --- |
| [填寫 Workspace A 路徑] | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ |
| [填寫 Workspace B 路徑] | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ |
| [填寫 Workspace C 路徑] | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ |

#### 2) 🛠️ 技能工具箱 (Skills) 授權矩陣

（審查重點：高權限/破壞性技能是否被不該使用的 Agent 存取。）

| 技能名稱 (Skills) | 所屬層級 (Local/Shared) | [Agent 1] | [Agent 2] | [Agent 3] | [Agent 4] |
| --- | --- | --- | --- | --- | --- |
| [填寫技能 A 名稱] | [填寫] | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ |
| [填寫技能 B 名稱] | [填寫] | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ |
| [填寫技能 C 名稱] | [填寫] | ✅/❌ | ✅/❌ | ✅/❌ | ✅/❌ |

#### 3) 👤 外部連線 (Inbound Channels) 路由矩陣

（審查重點：辨識對外服務 Agent 與內部隔離 Agent。）

| 外部來源 (Channels/Triggers) | 路由指向的 Agent | 備註與安全限制 |
| --- | --- | --- |
| [填寫：例 Telegram 群組 xxx] | ➔ [Agent ID] | [填寫：例 需 @機器人] |
| [填寫：例 私訊 DM] | ➔ [Agent ID 或 無] | [填寫：例 需 Pairing] |
| [填寫：例 Cron 每日報表] | ➔ [Agent ID] | [填寫：例 isolated session] |
