# CMS entry preview diagnostics

## 交付

- `/cms/entries/:entryId` 已以 keyboard-selectable current/published tabs 提供 sandboxed iframe preview；未發布時明確顯示狀態，不新增 `/cms/preview`。
- preview API safe failure 顯示 alert，仍保留既有 editor state、儲存與發布流程。

## 驗證

- `npm run cms:build`
- `node --import tsx --test tests/apps/cms/article-workspace.test.ts`：1/1；實際 Chromium 驗 current/published/未發布/safe-error、iframe sandbox、tab keyboard 與窄 viewport。
- `npm run typecheck`

## 已知限制

- 無。
