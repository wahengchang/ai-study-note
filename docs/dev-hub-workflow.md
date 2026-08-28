# Dev Hub 大型工作流程

本檔是 Dev Hub 操作規則的單一入口。根目錄代理指令與 `MEMORY.md` 只保留觸發條件和本檔連結；需要執行大型工作時才讀取下列細節。

## 30 秒判斷

只有符合專案既有定義的「大型工作」才建立 Cycle：跨多個檔案或元件、改變使用者可見行為／專案架構，或需要非直觀交接資訊。純問答、小型修正與唯讀查詢不建立。

| 路徑 | 用途 | Git |
| --- | --- | --- |
| `.dev-hub/active/` | 進行中的 Cycle 協作狀態 | 提交 |
| `.dev-hub/worktrees/` | 實體 worktree | 忽略 |
| `.dev-hub/runtime/` | 工具暫存 | 忽略 |
| `logs/` | 已完成 Cycle 的永久摘要 | 提交 |
| `dev-hub-*/` | 舊 handoff artifact | 唯讀歷史，不作現行狀態 |

Dev Hub 只管理工作狀態與交付，不得覆蓋 `contracts/README.md` 的已核准範圍與設計約束，也不得覆蓋程式碼與對應測試所證明的已實作行為。

## 最短執行路徑

1. 在 `.dev-hub/active/cycle-YYYY-MM-DD-HHmm-<english-kebab-slug>/` 建立 `hub.md`、所需 Work Item 與 Work Group。
2. Work Item 記錄「要做什麼」；每個進入執行的 Work Item 恰好由一個 Work Group 認領。Work Group 記錄單一 Branch、Worktree、PR 與交付責任，可承接多個 Work Item。
3. 執行期間同步更新狀態、阻塞原因、解除條件與實際驗證。
4. 每個 Work Group 的第一個 commit 包含完整交付、實際驗證，以及可審閱的 Cycle／Item／Group 最終狀態；PR 尚未建立時 `pr` 可為 `null`。
5. 建立或更新該 Work Group 唯一的 PR。
6. 第二個也是最後一個 commit 只做追蹤收尾：
   - 非最後 Work Group：寫入真實 PR URL，保留 active Cycle。
   - 最後 Work Group：建立完成 log，刪除整個 active Cycle。

每個 Work Group 的 PR 固定恰好兩個 commit，不得新增第三個。推送後若必須修正，amend 對應的第一或第二個 commit，再以 `--force-with-lease` 更新同一 PR。

## 完成閘門

最後一個 Work Group 只有在下列條件全數成立後才能 closeout：

- 所有 Work Item 都是 `done | cancelled`。
- 所有 Work Group 都是 `completed | cancelled`。
- `Verification` 已記錄實際結果。
- 必要 frontmatter 完整，沒有 Work Item 被重複認領。
- 每個執行中的 Work Item 都有 Work Group；每個 Work Group 都有 Branch 與 Worktree。

`completed` 表示合併前已完成並通過驗證，不表示 PR 已 merged。`blocked` 必須在 Work Item 的 `Notes` 或 Work Group 的 `Verification` 寫明原因與解除條件；`cancelled` 必須寫明取消理由。

<details>
<summary>命名、狀態與固定 schema</summary>

### Cycle

- 目錄：`cycle-YYYY-MM-DD-HHmm-<english-kebab-slug>/`
- `hub.md` frontmatter：`id`、`status`、`created_at`、`updated_at`
- 正文：`Goal`、`Scope`、`Context`
- 狀態：`active | blocked | completed | cancelled`
- 時間：含 UTC offset 的 ISO 8601

### Work Item

- 檔名：`work-items/WI-NNN-<english-kebab-slug>.md`
- frontmatter：`id`、`status`、`title`、`work_group`、`depends_on`
- 正文：`Outcome`、`Acceptance`、`Notes`
- 狀態：`pending | in_progress | blocked | done | cancelled`

### Work Group

- 檔名：`work-groups/WG-NNN-<english-kebab-slug>.md`
- frontmatter：`id`、`status`、`title`、`work_items`、`owner`、`branch`、`worktree`、`pr`
- 正文：`Delivery`、`Verification`
- 狀態：`planned | in_progress | blocked | completed | cancelled`

`WI-NNN` 與 `WG-NNN` 各自在 Cycle 內從 `001` 遞增；ID 建立後不得更改。同一 Work Item 不得同時被多個 Work Group 認領。一個大型 Cycle 可有多個 Work Group／PR，但每個 Work Group 只綁定一個 Branch、Worktree 與 PR。

</details>

<details>
<summary>最後一個 Work Group 的完成 log</summary>

完成 log 命名為 `logs/YYYY-MM-DD-HHmm-<cycle-slug>.md`，必須記錄：

- Cycle ID、完成時間、狀態
- 交付
- 關鍵決策
- 實際驗證
- 已知限制／後續
- 相關 Branch／PR

沒有內容的決策或限制明寫「無」，不得留下未決欄位。完成 log 是永久摘要；不得保留 completed Cycle，也不得把整包 Cycle 搬入 `logs/`。

</details>
