# Authoring credential and SaveRevision

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **完成時間**：2026-09-02T10:12:24+08:00
- **狀態**：completed

## 交付

- `apps/authoring-api/` 提供本機 credential authority、唯一 `cms:credential` 操作命令、fixed-origin Hono/Node listener、server proof 與 authenticated `SaveRevision` transport。
- credential record 使用 active/revoked transition、每次 admission reload 與 safe failure result；HTTP success/error DTO 不洩漏 key 或 domain internals。
- 新增 credential lifecycle、CLI、actual TCP proof/SaveRevision tests，並更新 Authoring API 文件導覽。

## 關鍵決策

- API-02 僅負責 credential generation、admission reload、old/new-key boundary；browser ticket generation invalidation、mint/consume/expiry/session 保留給 #280。
- listener 固定 `127.0.0.1:43127`，不提供 long-running command 或 host/port override。

## 實際驗證

- `node --import tsx --test tests/apps/authoring-api/credential-lifecycle.test.ts tests/apps/authoring-api/credential-cli.test.ts`：3/3 通過。
- `npx tsc --noEmit --pretty false && node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`：actual listener 的 server proof 與 authenticated SaveRevision 通過。
- `npm run check`：142 tests 通過；typecheck 與 architecture checker 通過。

## 已知限制／後續

- browser ticket mint、one-use/expiry、session exchange 與 CMS browser bootstrap 由 #280 交付。

## 相關 Branch／PR

- Branch：`cms/authoring-credential-save-revision`
- PR：建立前為 `null`；建立後由 Work Group 第二個 commit 記錄真實 URL。
