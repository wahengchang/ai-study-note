# SP-001 Content schema evolution Spike

- **完成時間**：2026-08-26 14:36（本地時間）
- **狀態**：✅ 假設成立，可行。
- **交付**：`spikes/sp-001/schema_evolution_spike.py` 為可重跑的 isolated runner；`spikes/sp-001/evidence.json` 保存固定 fixture、SQLite row/constraint、transition 結果與 SHA-256 evidence。

## 就這樣做

採用 **immutable schema versions，且每個 Entry revision 明確 pin `schema_version`**。schema 不相容演進只能以顯式 mapping/backfill 在單一 transaction 產生新的 revision；既有 schema/revision bytes 永不改寫。restore 舊 revision 必須新增可追溯 revision，沿用來源 schema pin 與完全相同的 content bytes。

## 依據

固定時間 `2026-08-26T00:00:00Z`，以 `note-1@rev-001`、`note-1@rev-002`、`note-2@rev-001` 完成三個 candidate 的相同 fixture。

- **Winner — Candidate 1**：新增 optional field、帶 default 的 required field、integer→select、field key rename、舊 revision restore 均完成；型別與 key 變更都有顯式 backfill，初始 revision 與 schema v1 的 SHA-256 均維持不變；failure injection 回復後不存在 partial schema row。
- **Rejected — Candidate 2 additive-only**：僅能新增 optional field，不能提供 required/type/key 的明示 migration，因此不能滿足內容模型實際演進需求。
- **Rejected — Candidate 3 mutable current schema + runtime coercion**：`note-1@rev-001` 的 `difficulty: 1` 在 current schema 改為 select 後被 runtime 改解讀為 `beginner`；historical bytes 雖未改，語意已漂移，無法驗證歷史 revision。

## 最小 schema-version contract

- `schema_versions` 保存 immutable `spec_bytes`、digest、版本與時間。
- `revisions` 保存 immutable `data_bytes`、digest、`schema_version` foreign key、Entry/revision identity 與時間；revision update/delete 由 SQLite trigger 拒絕。
- 允許：新增 optional；新增帶 default 的 required（只影響新 revision）；有顯式 mapping/backfill 的型別變更／field key rename；建立新 revision 的 restore。
- 阻擋：無 backfill 的 required field；無 migration 的型別或 key 變更；仍被 historical/current/published 使用的 field removal；任何 partial migration commit。

## 實際驗證

執行：`python3 spikes/sp-001/schema_evolution_spike.py && python3 -m json.tool spikes/sp-001/evidence.json >/dev/null`

結果：`SP-001 PASS: immutable-schema-versions-with-revision-pinning`；evidence JSON 解析成功。

## 專案工作表

Owner 已明確覆寫 handoff artifact 的唯讀限制；SP-001 結論與 `✅` 狀態已同步寫入 `project-2026-08-26-1425/project.md`。SP-002 現在可使用本紀錄的最小 schema-version contract 作為前置條件。
