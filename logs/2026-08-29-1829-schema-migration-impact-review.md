# Schema migration impact preflight 審查修正

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **完成時間**：2026-08-29T18:29:51+08:00
- **狀態**：completed
- **Branch**：`cms/schema-migration-impact`
- **PR**：https://github.com/wahengchang/ai-study-note/pull/271

## 交付

針對 PR #271 既有實作的審查與修正，未擴張 #224 範圍：

- `SchemaMigrationMapper`／`SchemaMigrationValidator` 改以「具備該 callable 成員」判定，class instance 與帶其他成員的物件都被接受；原本的 exact-plain-record 檢查讓通過 typecheck 的 interface 實作在 runtime 被拒。
- `preflight` 與 `validateSchemaMigrationImpactEvidence` 的重讀失敗照實回傳原始 failure code，不再一律折成 `STALE_SCHEMA_MIGRATION_REPORT`。
- issuer-bound evidence 只保留 `validateEvidence` 真的會讀的 baseline（source／target schema identity 與 scoped digest）；移除只寫不讀的 mapping identity、pointer policies、status 與 mapped content bytes。
- staleness 重讀與 evidence 驗證改用 metadata-only query，source schema revision 的 `content_bytes` 不再被讀取與複製。
- 新增兩則 public seam 迴歸測試，涵蓋 interface 實作接受度與 storage fault 的 failure code。

## 關鍵決策

- callback 是 caller 提供的 interface 實作，形狀不該被 persistence 限制；輸入輸出的 fail-closed 保障改由既有的 output 驗證（同步結果、plain data record、canonical bytes、digest 一致）承擔。
- evidence 只承諾「baseline 是否仍有效」，因此只存驗證得到的欄位；mapping output 的交接留給 WI-016／#230 的 execution，避免在沒有 caller 前先建結構並長期持有 content bytes。

## 實際驗證

- `node --import tsx --test tests/core/persistence/schema-migration-impact.test.ts`：5 pass。
- 兩則新測試在修正前的實作上分別以 `INVALID_SCHEMA_MIGRATION_REQUEST` 與 `STALE_SCHEMA_MIGRATION_REPORT` 失敗，修正後通過。
- `npm run check`：typecheck、architecture checker 與 111 tests 通過（Node 24.20.0）。

## 已知限制／後續

- evidence 仍是 in-process opaque token，無法跨 process 或序列化傳遞；跨 process 的 execution handoff 待 WI-016／#230 決定。
- `preflight` 的 mapper／validator fault 仍會中止整份報告而非產生 blocked row；此為既有設計，未在本次變更。
