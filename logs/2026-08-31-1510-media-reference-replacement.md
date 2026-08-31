# Media reference replacement

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **Work Group**：`WG-009-media-reference-replacement`
- **完成時間**：2026-08-31T15:10:44+08:00
- **狀態**：completed

## 交付

- `SaveRevision` 新增 `media-reference-replacement` derived request variant；舊獨立 `replaceMediaReference` public command、request 與 failure code 已移除。
- replacement 從 immutable current source 驗證 canonical content bytes/digest，複製完整 references，僅替換一個 ready 的同 logical asset version；只移動 current pointer／claim，published selection 維持 pin。
- `PublishRevision` 將 selected current-route snapshot 綁定 proposal baseline，並以 published route-claim replacement token 支援跨 route 再發布；所有 SiteDefinition fault 依命令正確映射。
- 新增 replacement、Plugin snapshot 與 Publish route race 的 real SQLite regression coverage，並更新 Content／Media 文件入口。

## 關鍵決策

- baseline 的 #294 獨立 command 違反核准的 SaveRevision 契約，改為 clean cutover，不保留 alias 或相容路徑。
- #232 hardening 與 #233 共用同一工作群組，避免對已合併歷史重寫並確保 shared transaction 行為一起驗證。

## 實際驗證

- `node --import tsx --test tests/core/application/save-revision-media-replacement.test.ts tests/core/application/publish-revision.test.ts tests/core/application/save-revision-plugin-composition.test.ts`：12 pass。
- `node --import tsx --test "tests/core/application/*.test.ts"`：18 pass。
- `npm run check`：118 pass；typecheck 與 architecture check 均通過。

## 已知限制／後續

無。

## Branch／PR

- Branch：`cms/media-reference-replacement`
- PR：尚未建立。
