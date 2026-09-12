# Dev Hub overview

## 交付

- `.dev-hub/overview/` 提供 v2 config、Issue／Dev Hub snapshot、唯一 links join、README 與 generated HTML。
- renderer 僅讀本機 JSON；驗證 exact schema、repository identity、Issue/PR URL、Cycle path、timestamp、one-to-one join、dependency closure／cycle，失敗時不寫 output。
- active linked Issue card 顯示 dependency closure、Cycle、Work Item、Work Group、owner 與 PR；URL 由 config repository identity 驗證。

## 驗證

- `npm run typecheck`
- `node --import tsx --test tests/scripts/dev-hub-overview.test.ts`：3/3
- `npm run dev-hub:overview:check`
- `npm run dev-hub:overview`

## 已知限制

- 無；renderer 依 contract 不讀網路，也不提供 generic CLI。
