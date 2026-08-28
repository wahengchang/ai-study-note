# Save Revision Foundation

- **Cycle**：`cycle-2026-08-28-1045-save-revision-foundation`
- **完成時間**：2026-08-28T11:14:49+08:00
- **狀態**：completed

## 交付

完成 #221、#222、#223、#227、#228：Persistence typed transaction、entry pointers／lineage、route claim registry、local media import、immutable revision references，以及 `DomainApplication.saveRevision`。

## 關鍵決策

- route normalization 使用精確鎖定的 `unicode-case-folding@1.1.1`。
- `SaveRevision` 只移動 current pointer 與 current claim；published selection 維持隔離。

## 實際驗證

- `node --import tsx --test "tests/core/persistence/*.test.ts"`
- `node --import tsx --test "tests/core/site-definition/*.test.ts"`
- `node --import tsx --test "tests/core/media/*.test.ts"`
- `node --import tsx --test tests/core/application/save-revision.test.ts`
- `npm run check`
- `npm run check:ai-sync`

以上均通過。

## 已知限制／後續

Plugin integration、PublishRevision、ChangeRoute 與後續 validators 仍由 #229、#234、#246 處理。

## 相關 Branch／PR

- Branch：`cms/save-revision-foundation`
- PR：https://github.com/wahengchang/ai-study-note/pull/248
