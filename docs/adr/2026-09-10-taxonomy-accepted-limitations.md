# ADR：接受 Taxonomy restore 與 rename migration 限制

- **日期：** 2026-09-10
- **狀態：** 已接受
- **相關：** [Taxonomy contract](../../contracts/README.md#8-291-contract--taxonomy)、[PR #348](https://github.com/wahengchang/ai-study-note/pull/348)

## 決策背景

Taxonomy administration 交付後發現兩個 fail-closed 行為會限制既有操作。Owner 決定不為此延後交付；本 ADR 記錄可見限制與禁止的錯誤修復方向。

## 已接受限制

1. 若歷史 Revision 的 term 已 retire，restore 該 Revision 會失敗；系統不得自動重新啟用 term、以目前 catalog 補寫歷史 evidence，或隱藏失敗。
2. 若 Revision 含已 rename 的 binding，後續 migration 沒有對該 binding 提供 replacement mapping 時，migration 會拒絕；系統不得從 label、slug、order 或目前 catalog 推導 mapping。

## 後果

- 操作者必須在 retire 前保留可 restore 的 operational path；不能假設所有歷史 Revision 都可 restore。
- migration 必須提供所有被 runtime 視為不可沿用的 binding 的明確 replacement mapping；rename 可能提高所需 mapping 範圍。
- 這不是授權 current catalog 回寫既有 immutable binding，也不是 projection fallback。published projection 仍只驗證 Revision 內的 immutable evidence，任何無法解析情況維持 fail-closed。
- 未來若要移除此限制，必須先更新 Taxonomy contract，並以實際 restore／rename migration 流程測試證明不會改寫歷史 evidence。
