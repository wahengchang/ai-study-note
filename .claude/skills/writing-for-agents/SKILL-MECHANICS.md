# Skill mechanics

[`writing-for-agents`](SKILL.md) 中只有在「這份文件是 skill」時才需要的分支：frontmatter、invocation 選擇、router skill，以及本專案的同步機制。其餘寫法回到 `SKILL.md`。

## 本專案的 skill 檔案佈局

- 一個 skill 是 `.rulesync/skills/<name>/SKILL.md`，`name` 使用 kebab-case 且與目錄同名。
- 同目錄下的其他檔案（例如本檔）會一併複製到生成輸出，可用來做 progressive disclosure；在 `SKILL.md` 以相對連結指向它們。
- `npm run sync:ai` 會把每個 skill 產生到 `.claude/skills/`（Claude Code）、`.agents/skills/`（Codex CLI 等相容 runtime）與 `.opencode/skills/`；生成輸出隨變更一起提交。
- 生成器帶 `delete: true`：只存在於生成輸出、在 `.rulesync/skills/` 沒有對應來源的 skill，會在下一次同步被刪除。
- frontmatter 只有 `name`、`description` 與 `disable-model-invocation` 會被處理，其餘欄位（例如 `argument-hint`）在所有生成輸出都會被丟棄——需要的話寫進本文，不要寫成 frontmatter。
- `disable-model-invocation: true` 只會出現在 `.claude/skills/` 的輸出；`.agents/skills/` 與 `.opencode/skills/` 沒有這個欄位，同一個 skill 在那些 runtime 仍可能被模型自行觸發。因此 user-invoked skill 的 `description` 也要寫得像觸發條件一樣準確，而且本文必須自己擋住不該自動執行的動作（例如開啟可見瀏覽器、刪除 worktree）。

## Invocation

兩種選擇，各自付一種負載：

- **Model-invoked**：保留 `description`，agent 可自行觸發，其他 skill 也構得到；使用者當然仍可直接指名。代價是 description 永遠常駐 context。做法：不要寫 `disable-model-invocation`，並在 `description` 寫出觸發條件（`SKILL.md` 的指標措辭規則全部適用）。
- **User-invoked**：`disable-model-invocation: true`。description 退成給人看的一行摘要，agent 與其他 skill 都構不到它，context load 為零，代價是你必須記得它存在。

只有在 agent 必須自行觸發、或另一個 skill 必須觸發它時才選 model-invoked；只會由人手動叫的，就設成 user-invoked。

由此推出一條實務規則：**user-invoked skill 不能被別的 skill 呼叫**。若某個 workflow skill 的步驟寫著「呼叫 `/foo`」，而 `foo` 是 user-invoked，那一步永遠不會發生——改成由使用者呼叫，或改變 `foo` 的 invocation。

兩個 user-invoked skill 都需要的共用參考，不能放在其中任何一個裡（彼此構不到）。把它推到 skill 之外的一般檔案，讓兩者都用相對路徑指過去。

## 依 invocation 拆分

拆出一個獨立的 model-invoked skill，條件是它有自己明確的觸發詞（你真的會在 prompt 裡用的詞），或另一個 skill 必須構得到它。你為此付出一段永遠常駐的 description，這個獨立觸發權必須值得。

## Router skill

當 user-invoked skill 多到記不住時，那份累積的 cognitive load 用 router skill 化解：一個 user-invoked skill 列出其他 skill 與各自的使用時機，讓人只需要記得一個。它只能提示，不能代為觸發——user-invoked skill 沒有 description，除了人以外沒有東西構得到它們。
