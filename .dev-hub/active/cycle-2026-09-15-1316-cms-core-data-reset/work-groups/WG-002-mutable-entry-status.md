---
id: WG-002
status: completed
title: WI-002｜交付 mutable entry 儲存與狀態
work_items: [WI-002]
owner: domain_application_engineer
branch: wg-002-mutable-entry-status
worktree: .dev-hub/worktrees/mutable-entry-status
pr: null
---

## Delivery

- Persistence：`0013` `current_entries`（FK 至 current Content Type、route 與 UTC timestamp CHECK）、create/replace/real delete、entry slug claim 與 authoring route evidence 同 transaction、`contentTypeHasCurrentEntries` 納入 current entry、canonical state 新增 `currentEntries`。
- Application：`core/application/entry-administration.ts` 交付 `cpt-entry/v1`、`cpt-entry-catalog/v1`、Create／Save（CAS）／Delete 與 `publishedAt` transition；`core/content` 公開 #315 body-block 的共用 strict parser。
- Authoring API：type-scoped `GET/POST /v1/content-types/:typeId/entries`、`GET/POST .../:entryId`、`POST .../:entryId/delete`；`/cms/post` document admission 與 canonical `?cpt=` query 規則。
- CMS：`/cms/post`（Article）與 `/cms/post?cpt=<typeId>` CPT workspace（catalog＋同文件 editor）、content menu 改為連結並輸出唯一 `aria-current`、鍵盤選取、conflict 復原與刪除確認。
- 文件：`contracts/README.md` 的 `#308 CMS document admission`、`docs/INDEX.md` 的 Current Entry 列。

## Verification

- `npm run check`：324/324 通過（typecheck、`check:architecture`、`cms:build`、全測試套件），exit 0。
- `npm run dev-hub:overview:check`：exit 0。
- 新增／擴充測試：`tests/core/persistence/current-entries.test.ts`（5）、`tests/core/application/entry-administration.test.ts`（9）、`tests/apps/authoring-api/http-contract.test.ts`（+2，共 39）、`tests/apps/cms/runtime-browser-gate.test.ts`（+1 真實 Chromium journey，共 7）；既有 migration expectations（`migration-runner`、`current-content-types`、`db-migrate`、`schema-migration-execution`）與 WI-001 的 nav 斷言已同步為新契約。
- 可觀察行為證據：Application 測試固定 `publishedAt` 只在 publishable content digest 改變時前進、stale CAS 409 零寫入、catalog digest 隨 entry generation 改變、Delete 後 404 且舊 slug 可重用；HTTP 測試固定 exact route／strict DTO／path-body identity 400、404、409、422、500 與 body limit，以及 `/cms/post` 的 canonical／非 canonical query（缺值、重複、額外參數、`%` 編碼、fragment、Article type ID → 403）；瀏覽器 journey 覆蓋建立 draft、published Save readback、stale conflict 後重新載入、鍵盤選取、real Delete 與 slug 重用、其他 CPT `?cpt=` 導覽、`showInMenu=false` 的 direct URL 管理、CPT 切換重新聚焦 `#page-title` 與 mobile 無水平溢出。
- 邊界：本輪 current entry 尚無 taxonomy／media relation storage（WI-004／WI-006 建立時必須擴充同一 Delete transaction）；entry 的 authoring route evidence 目前等於 `/{實際 slug}`，未接 Projection／SiteDefinition 或 public flat path；`GET .../entries` 是 WI-007 search 之前的過渡讀取面。
- 審查：依 `.rulesync/subagents/` 由 `data_media_engineer`（persistence／資料完整性）與 `cms_workspace_engineer`（CMS／transport／a11y）兩個非 owner 視角完成計畫交叉審查；第一輪皆 NEEDS_REVISION，修正後資料完整性視角第三輪 ACCEPT、CMS／transport 視角第二輪 ACCEPT。
- `/ai-x` 跨模型共識審查（ChatGPT role reviewer，primary 為 DeepSeek）finding F-001（HIGH）：CMS Save 會覆寫／丟棄未被編輯的額外 body block。已修：`EntryForm` 保留完整 block 序列、只就地替換第一個 article block、其餘原樣保留，且 article block 數量不是 1 時 fail closed 並顯示可行動訊息；`tests/apps/cms/runtime-browser-gate.test.ts` 新增兩個 regression（`[interactive-demo, article]` 保留、`[article, article]` 拒絕編輯），兩者皆證明修前紅、修後綠。
- 最終 `npm run check`：324/324，exit 0（輸出 `/tmp/check7.log`）。
