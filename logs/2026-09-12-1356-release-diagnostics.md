# CMS release diagnostics

## 交付

- `/cms/release` 提供 release diagnose/build/release/redeliver 的 loading、safe-error、success workspace；不經 PublishRevision。
- 文件路由與 logger 只新增 exact `/cms/release`。

## 驗證

- `npm run cms:build`
- `node --import tsx --test --test-concurrency=1 --test-name-pattern='release diagnostics' tests/apps/cms/runtime-browser-gate.test.ts`：1/1
- `npm run typecheck`

## 已知限制

- 無。
