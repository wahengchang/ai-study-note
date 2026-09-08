# CMS Article Workspace

- **完成時間**：2026-09-08T16:32:25+08:00
- **Cycle／Work Group**：`cycle-2026-08-29-1002-cms-issue-backlog`／`WG-023`
- **Branch**：`feature/cms-article-workspace`
- **PR**：https://github.com/wahengchang/ai-study-note/pull/325

## 交付

- Authoring read/admin、Ajv schema validation、required Authoring API composition 與 strict `cms:serve` runtime。
- Content Type guided routes、Article-first editor、dirty/save/publish dialog、sandboxed current/published preview 與 responsive a11y surface。
- CMS runtime 只經 owner/public-seam composition，於 listener 前以 `ThemeHost.resolveExact()` 預檢 CLI pin 的 exact Theme，關閉 listener 失敗時仍關閉 Persistence。

## 關鍵決策

- Ajv definition compile 每次使用 fresh instance；runtime validators 只以 immutable schema digest cache，避免 `$id` registry collision 與 async validator promise。
- CMS runtime 只接受 repository `dist/cms`，並驗 bundle、DB 與 parent directory 的 owner／symlink／write-bit boundary；避免 credential-bearing origin 執行不受信任 bundle。
- Theme 不使用 runtime-private activation state；`cms:serve` 的 canonical id、exact SemVer 與 manifest digest 組成 `ThemeIdentity`，再傳至 `ProjectionPreview` 與 `/v1/preview`。

## 實際驗證

- `npm run typecheck`、`npm run check:architecture`、`npm run cms:build` 通過。
- `node --test --import tsx tests/apps/authoring-api/http-contract.test.ts`：15 passed；actual listener 覆蓋 pinned Theme 的 current/published preview、missing/unpublished subject、strict request、security header 與 zero mutation。
- `node --test --import tsx tests/apps/authoring-api/cms-serve.test.ts`：2 passed；覆蓋缺少／duplicate／malformed Theme flags 與 isolated exact-Theme startup/shutdown。
- `node --test --import tsx tests/apps/authoring-api/cms-browser-bootstrap.test.ts`：1 passed。
- `npm run check`：221 passed。

## 已知限制／後續

- 已執行 browser bootstrap 的 Chromium test；真實 `cms:serve` runtime 的完整 browser authoring journey 尚未驗收，因此 WG 維持 `in_progress`。
- 2026-09-08：以 `refs/backup/pr-325-pre-rebase-79fbdba` 保留 rebase 前 head，將兩個 commit 重放至 `origin/docs/theme-plugin-lifecycle-compatibility`；PR push／遠端 mergeability/checks 仍待本工作群組驗證完成後確認。
