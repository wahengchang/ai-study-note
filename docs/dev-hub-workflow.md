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

## 本地專案總覽 projection

`.dev-hub/overview/issues.json` 與 `links.json` 是 repository-local、可重建的手動 projection；`index.html` 只能由這兩份已提交 snapshot 衍生，renderer 絕不讀網路、GitHub Issue 或 GitHub Project。GitHub Issue 仍保存 requirement／acceptance，active Cycle／Work Item／Work Group 仍保存執行現況；overview 檔案不取得 SSOT 地位。

- coverage 固定為 `active_dev_hub_with_dependencies`：linked Issues 是 active Dev Hub 主清單，沒有 link 的 Issue 只能作為 linked Issues 的遞迴前置 dependency closure，不得解讀為全部 open GitHub Issues。恢復工作時先開 `.dev-hub/overview/index.html`，再進對應 Cycle。
- 新增或移除 active Work Item，或 Issue 的 number、title、URL、state、parent、dependency 改變時，手動更新 `issues.json`；每次 `depends_on` 改變都必須同步補齊完整遞迴 closure。loader 會拒絕遺漏 prerequisite snapshot、無法由 linked Issue 抵達的 dependency-only row，以及不存在的 Issue／Work Item link target。
- Cycle／Work Item／Work Group 的 local path、status、dependency、owner、branch、worktree、PR 或 Issue 關聯改變時，手動更新 `links.json`；active Cycle、Work Item、Work Group 與 Issue→WI links 仍是一對一，dependency-only row 不增加 link 或 role。
- 兩份 JSON 必須使用相同 schema version，以及相同且含 UTC offset 的 `updated_at`。
- 變更 overview 時，在對應 Work Group worktree 依序執行 `npm run dev-hub:overview` 與 `npm run dev-hub:overview:check`，並以 `node --import tsx --test tests/scripts/render-dev-hub-overview.test.ts` 驗證；handoff、PR ready 與 Cycle closeout 前 check 必須通過。root 缺少此 script 時，不得在 root 產生 projection。
- `index.html` 的 localStorage 僅保存個人的 View、filter、欄位與 named filter preference；不得回寫 JSON、Dev Hub state、GitHub Issue 或 GitHub Project，也不得引入 GitHub Project、Project API、auto-add 或全量 Issue sync。擴大 coverage 必須另行決定。

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
