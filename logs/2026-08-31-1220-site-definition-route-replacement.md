# SiteDefinition route claim replacement

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **完成時間**：2026-08-31T12:20:48+08:00
- **狀態**：completed（本 Work Group；Cycle 仍有其他 Work Item）

## 交付

完成 GitHub #231／WI-017：`SiteDefinition` 新增 `route-claim-replacement-proposal/v1`、route/source revision 原子替換與完整 retained impact；同時為所有 SiteDefinition proposal 加入 configured persistence store 的 active transaction authority。

## 關鍵決策

- replacement impact 固定列出 after-state 兩圖全部 active claims，按 current/published、canonical `to`、owner 的 code-unit 順序；target 以 `route-move` 或 `attribution-only` 標示，其餘為 `retained`。
- validate 與 apply 都驗證 store-private active transaction；apply 在寫入前重讀 baseline、寫入後重驗兩圖 digest 和 impact，避免 cross-store 與 TOCTOU 寫入。

## 實際驗證

- `node --import tsx --test tests/core/site-definition/route-claim-replacement.test.ts`：4 pass。
- `node --import tsx --test "tests/core/site-definition/*.test.ts"`：12 pass。
- `npm run check`：TypeScript、architecture checker 與全套測試共 101 pass。

## 已知限制／後續

#238 的 Application command orchestration 不在本 Work Group 範圍。

## 相關 Branch／PR

- Branch：`cms/site-definition-route-replacement`
- PR：尚未建立
