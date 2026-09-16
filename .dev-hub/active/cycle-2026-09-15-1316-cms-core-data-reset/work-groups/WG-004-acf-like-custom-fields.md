---
id: WG-004
status: completed
title: WI-003｜交付 ACF-like 自訂欄位閉環
work_items: [WI-003]
owner: domain_application_engineer
branch: wg-003-acf-like-custom-fields
worktree: .dev-hub/worktrees/acf-like-custom-fields
pr: null
---

> WG ID 為 `WG-004`：本 Work Group 原本以 `WG-003` 建立，但同時進行的另一個 Work Group（WI-005）先合併進 `site-reset` 並佔用 `WG-003`，同一 Cycle 不得有兩個 `WG-003`。Branch 名稱維持建立時的 `wg-003-acf-like-custom-fields`，以保留 PR 與審查紀錄的連續性。

## Delivery

- Application／契約：`cpt-content/v1` 新增 `customValues`（`{fieldId,value}` 依 fieldId code-unit 排序、唯一）；readback 為 definition-independent 正規化並容忍 WI-002 期間缺少該欄位的 persisted payload；Save 追加 definition 依賴檢查與 published 完整驗證，失敗碼為 `INVALID_ENTRY_CUSTOM_VALUES`（422，`subjectIds` = 失敗 fieldId）。Defaults 只在 create materialize；`required` default 與 media default 的一致性在 definition normalization fail closed。
- Media identity：`core/media` 匯出唯一 predicate `isMediaAssetId`（可被 `/v1/media/:assetId` 定址的 stable identity），由 definition default 與 entry value 共用；existence／MIME／usage 依 WI-003 邊界留待 WI-005／WI-006。
- Persisted definition reader：把原先私有的 definition 解碼提升為 Application 唯一的 typed reader，供 definition 讀取、entry Save 與 replace 的 entry-usage gate 共用，不再有第二個 shape reader。
- Authoring API：`cptContentSchema` 加 `customValues`（item strict）；`entryAdministrationStatuses` 與 `CurrentEntryAdministrationFailureCode` 同步新增 422 映射。
- CMS：`ContentTypeFieldGroupsEditor`（create／detail 共用）支援 group／field／option 的新增、刪除、上移下移、11 種 kind、constraints、select 選項與 default、`showInGenericTemplate`、required；draft 由 `definition.stateDigest` 導出並由 save response 重建，單一 fieldGroups 轉換路徑（刪除舊 passthrough helper）；entry editor 依 kind 呈現控制項、`noValidate`、focus／`aria-invalid`／`aria-describedby` 與單一 `role="alert"`。
- 文件：`contracts/README.md` 新增 `WI-003 Custom field contract`，並補齊 custom field validation 與 persisted field shape 的既有敘述；`docs/INDEX.md` 更新 Current Content Type／Current Entry 兩列。

## Verification

- `npm run check`：336/336 通過（typecheck、`check:architecture`、`cms:build`、全測試套件），exit 0（輸出 `/tmp/wi003-check4.log`）。
- 新增／擴充測試：`tests/core/application/entry-administration.test.ts`（+8：defaults 只初始化一次、fieldId／multi 排序與重複拒絕、published 六類 constraint 各自 422 且零寫入、未知 fieldId／型別錯誤、definition 變更後 stable ID 語意、WI-002 形狀 persisted payload 仍可讀／存／刪與 `publishedAt` 一次性前進、draft 只做 string-list 形狀檢查、legacy multi-media default 的忠實讀取與正規化 materialization）；`tests/core/application/content-type-administration.test.ts`（+2：default 的 canonical／addressable／required 一致性，以及 persisted definition 讀取與 `stateDigest` 的 bytes 忠實性）；`tests/apps/authoring-api/http-contract.test.ts`（+1 exact DTO 與 422／`subjectIds`）；`tests/apps/cms/runtime-browser-gate.test.ts`（+1 真實 Chromium journey：Builder 建立 5 種 kind 的欄位→上移排序（焦點留在同一控制項＋live region 播報）→Save→reload 後順序不變；entry 建立（defaults 初始化）→draft→published 驗證失敗時聚焦可修正欄位且只有一個 alert→published Save→reload 精確讀回，並證明 presence-sensitive 控制項可回到「未設定」）。
- 可觀察行為證據：Application 測試固定 draft 可缺 required／可存不符 constraints／空字串 multi 元素仍可存，published 逐項失敗且 `canonicalState` digest 不變、`subjectIds` 為失敗 fieldId；HTTP 測試固定未知 property／缺少 `customValues` 為 400、unknown fieldId 與 constraint 失敗為 422 `INVALID_ENTRY_CUSTOM_VALUES`；browser journey 固定 readback 的 text／number／boolean／datetime／single-select 值、`showInGenericTemplate` round-trip 與清空後的值移除。
- 邊界：media custom value 本輪只驗可定址 ID 與 `maxItems`，asset existence／MIME allowlist／usage 阻擋由 WI-005／WI-006 在 entry Save 補上；WI-003 之前寫入的 published entry 第一次 Save 會前進 `publishedAt` 一次（文件與測試已固定）；持有舊 client 的分頁第一次 Save 會得到 400 而非 409，需重新載入（文件已更正）。
- 審查（`.rulesync/subagents/`，兩個非 owner 角色）：`data_media_engineer`（persistence／資料完整性）與 `cms_workspace_engineer`（CMS／transport／a11y）完成計畫交叉審查；v1、v2 皆 `NEEDS_REVISION`，逐項修正後 v3 兩者均 `ACCEPT`。
- `/ai-x` 跨模型共識審查（Primary 為 DeepSeek，候選順序 ChatGPT → Claude CLI，selected：ChatGPT `openai-codex/gpt-5.6-sol`，mechanism：host 原生 reviewer role）：第一輪 `NEEDS_REVISION`，findings 全數查證並修正。
  - F-001（HIGH，datetime 接受非 RFC 3339 與 rollover 日期）：已修，`isCanonicalDatetime` 改為完整 RFC 3339 形狀＋offset 一致性的嚴格判定，並新增定義端與 entry 端拒絕測試（`2026-09-16Z`、`2026-09-16 12:00:00Z`、`2026-02-30T12:00:00Z`、`2026-09-16T12:00`）。
  - F-002（MEDIUM，legacy multi-media default 讀取排序導致 definition 與 `stateDigest` 不一致）：已修，persisted default 解碼改為忠實保留 stored bytes（不排序、不做 canonical 轉換），canonical 化移到 entry create materialization；新增以自訂 digest 寫入的 legacy definition 測試。
  - F-003（MEDIUM，舊分頁取得 400 而非文件宣稱的 409）：以更正契約文字處置（400 → 重新載入後取得新 client；不新增只為兼容舊 client 的 transport 分支）。
  - F-004（MEDIUM，presence-sensitive 控制項無法表示「未設定」）：已修，number／url／date／datetime／single-select／single-media 與空 multi 值改以移除 key 表達，boolean 改三態 select；browser journey 新增清空後值不復活的斷言。
  - F-005（MEDIUM，draft 的 string-list 形狀被過早拒絕）：已修，結構解碼只要求元素是 well-formed string，option／media identity 留在 published 驗證；新增 draft 可存 `[""]`、published 回 field-addressable 失敗的測試。
