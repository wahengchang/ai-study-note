# Issue catalog sync

- **完成時間**：2026-08-29T10:33:39+08:00
- **Branch**：`chore/dev-hub-planned-backlog`
- **PR**：[ #265](https://github.com/wahengchang/ai-study-note/pull/265)

## 交付

- overview schema v3 支援未分派 `work_group`／`work_group_id: null`。
- 將 #214–#262 的 37 張 GitHub Issues onboarding 為兩個 active Dev Hub Cycles：34 項 planned backlog Work Items，並保留 #229、#234、#246 的 Plugin lifecycle Cycle 唯一認領。
- 重產 issues、links 與 overview HTML；summary 為 37 linked Issues、58 dependency edges、2 active Cycles。

## 關鍵決策

planned backlog 不預先建立假 Work Group。僅 `in_progress`／`blocked` Work Item 必須同步建立真實 Work Group、branch 與 worktree；已完成 Work Group 留在長期 active Cycle 保存 PR provenance。

## 實際驗證

- `npx --yes node@24.20.0 --import tsx --test tests/scripts/render-dev-hub-overview.test.ts`：19 項通過。
- `npm run dev-hub:overview`、`npm run dev-hub:overview:check`：通過。
- projection：schema v3、相同 timestamp、37 Issues、37 links、2 Cycles、34 backlog Work Items，僅 #261 backlog link 已分派。

## 已知限制／後續

`npm run typecheck`、`npm run check:architecture` 與 `npm test` 在隔離 worktree 因缺少 `unicode-case-folding`、`es-module-lexer` 失敗；renderer contract test 不受影響且通過。此為 worktree dependency 安裝限制，非本變更新增的 TypeScript diagnostic。
