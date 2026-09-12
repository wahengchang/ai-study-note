# Issues 215–218 acceptance closeout

- **Cycle**：`cycle-2026-08-29-1002-cms-issue-backlog`
- **Work Items**：`WI-002`、`WI-003`、`WI-004`、`WI-005`
- **Work Group**：`WG-052`
- **完成時間**：2026-09-13T00:56:35+08:00
- **狀態**：completed

## 交付

- 為 GitHub #215、#216、#217、#218 建立逐條 acceptance traceability，對應已合併 PR、完成 Work Item、現行 public seam 與 current-state contract tests。
- #215：Save／Publish／RestoreRevision 與 ChangeRoute；#216：雙 route graph、replacement 與 transaction-bound command；#217：import／reconciliation／replacement／published selection／archive-restore；#218：trusted discovery／exact activation／capability-limited callback／inactive recovery／sealed public snapshot。
- 未發現 runtime 或 acceptance 缺口，未建立新 Work Item；本次僅記錄既有交付的 closure evidence。

## 關鍵決策

- 母 Issues 的完成證明使用 GitHub API 已確認的 merged PR、其完成 Work Item／Work Group、以及本次在 `site-reset` current state 執行的 domain tests；不以 Issue 的 OPEN／REOPENED 狀態推翻實作證據。
- #218 的 public renderer acceptance 同時採 #268 的 host lifecycle、#324 的 sealed public snapshot 與 #334 的 CMS source-preserving editor integration，避免將後續已合併的實作誤列為缺口。

## 實際驗證

- `node --import tsx --test --test-concurrency=1 tests/core/application/save-revision.test.ts tests/core/application/save-revision-failures.test.ts tests/core/application/save-revision-media-replacement.test.ts tests/core/application/save-revision-plugin-composition.test.ts tests/core/application/publish-revision.test.ts tests/core/application/restore-revision.test.ts tests/core/application/change-route.test.ts tests/core/site-definition/current-route-claim.test.ts tests/core/site-definition/published-route-claim.test.ts tests/core/site-definition/route-claim-replacement.test.ts tests/core/media/local-import.test.ts tests/core/media/published-selection.test.ts tests/core/media/archive-restore-asset.test.ts tests/core/media/startup-reconciliation.test.ts tests/core/plugin-host/plugin-host.test.ts`：81 pass。
- `node --import tsx --test --test-concurrency=1 tests/core/plugin-host/plugin-host.test.ts tests/core/plugin-host/locale-determinism.test.ts tests/core/plugin-host/public-build-snapshot.test.ts tests/core/plugin-host/seo-analysis.test.ts`：24 pass。
- `npm run check`：typecheck、architecture checker、CMS build 與 288 tests 通過。
- `npm run dev-hub:overview:check`：通過。
- GitHub API：PR #248、#263、#268、#273、#274、#295、#296、#297、#298、#303、#324、#334 均為 MERGED。

## 已知限制／後續

無。

## 相關 Branch／PR

- Branch：`chore/backlog-closeout-215-218`
- PR：待建立；建立後以本 Work Group 的第二個且最後一個 tracking commit 回填。
