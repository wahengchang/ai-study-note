---
name: writing-for-agents
description: >-
  撰寫給 agent 讀的文件時使用；建立或修改 skill、`.rulesync/rules/` 規則，或任何 agent 會讀的規格、README 與
  prompt 時適用。
---
# Writing for Agents

本技能是撰寫「agent 會讀的文件」時的參考：skill、`.rulesync/rules/` 下的專案規則、規格、runtime prompt、README。包裝形式不同，寫法相同——同一組槓桿讓 agent 每次執行都走同樣的**流程**，而不是產出同樣的文字。

預設動作是刪除，不是解釋。要求 agent 替另一個 agent 寫指令時，它多半把字數花在解釋模型早就知道的事；那些句子是 **no-op**：佔用 context、不改變行為。本參考就是找出它們的透鏡，因此用在既有文件上的收穫通常不亞於用在空白檔案上。

## 本專案的檔案位置（先確認再動手）

- 規則的 canonical source 是 `.rulesync/rules/CLAUDE.md`；技能的 canonical source 是 `.rulesync/skills/<name>/SKILL.md`。
- 根目錄 `AGENTS.md`、`CLAUDE.md` 與 `.agents/`、`.claude/`、`.opencode/` 下的 skills 是 `npm run sync:ai` 的生成輸出。直接編輯它們會在下一次同步被覆蓋或刪除。
- 改完 canonical source 後執行 `npm run sync:ai` 並提交生成輸出；`npm run check:ai-sync` 用來確認輸出已同步。
- 文件的維護規則（每項事實只保留一個 canonical source、兩個連結內可達、行為變更同步更新文件）見 `docs/INDEX.md`。

## 兩種負載

所有取捨都回到這兩個預算：

- **Context load**：常駐材料佔用 agent context 的成本——一行 `.rulesync/rules/` 規則、一段 skill description，不論是否觸發都在。
- **Cognitive load**：落在你身上的成本——有哪些文件、什麼時候該叫哪一個。你就是索引。這不是要最小化的成本，而是人保有主導權的代價。

用這兩種負載思考後，「要不要拆」「內聯還是外移」「用指標還是直接寫入規則」其實是同一個取捨換地方做。

## 五個槓桿

- **Context pointer**：常駐在 context 中、指向 context 外材料並說明何時去讀的那一行。skill 的 `description` 與規則中「某某情況先讀某檔」是同一種東西；決定 agent 會不會真的跟過去的是**措辭**，不是被指向的內容。
- **Information hierarchy**：從「檔內步驟」到「檔內參考」再到「指標後方的外部參考」的階梯。**Progressive disclosure** 就是沿這個階梯下移，讓上層維持可讀。
- **Completion criteria**：每個步驟的完成條件寫得多明確、要求多硬，決定 agent 願意做多少查證工作，也是**過早宣告完成**的唯一防線。寫「執行 X 並記錄實際輸出」，不寫「確保品質」。
- **Leading word**：模型 pretraining 裡已有的緊緻概念（tight、tracer bullet、frontier、blast radius）。它同時錨定兩處：本文中的執行方式，以及指標中的觸發時機。
- **Pruning**：逐句套用單一來源、相關性與 no-op 測試，對付**重複**、**沉積**與**膨脹**。

## 修改既有文件的流程

1. 先確認要改的是 canonical source，不是生成輸出。
2. 逐句做 no-op 測試：刪掉這句，agent 的行為會不同嗎？不會就整句刪掉，而不是把它改短。
3. 找重複：同一事實在兩個檔案各寫一次，遲早互相矛盾。留一份，其餘改成指標。
4. 找沉積：為了某次失敗補上的句子，事後看只是在複述模型已知的常識。
5. 爭議用執行解決：把文件實際跑一次，不要靠辯論。

## 做對了會看到

- 文件越改越短，而且短得出乎意料。
- 同一個 leading word 在不只一個地方做事。
- 沒有任何事實被說第二次。重複是文件從未被實際執行過最可靠的徵兆。
- 只有單一分支需要的參考，放在指標後方而不是主文件裡。

## 只有寫 skill 時才讀

frontmatter、model-invoked 與 user-invoked 的選擇、router skill，以及本專案的 skill 同步機制，見 [`SKILL-MECHANICS.md`](SKILL-MECHANICS.md)。其餘寫法一律回到本檔。
