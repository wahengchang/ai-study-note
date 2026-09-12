# Backlog Closeout Batch

## 交付

- 為 #214–#218 建立 acceptance traceability：每項連到已合併 PR、完成 Work Item、現行測試與工作紀錄；WI-001–005 均為 done，並補上實際直接依賴。
- 已關閉 #214–#218、#262、#285、#288、#317–#320。#282 保持 OPEN：PR #369 review 所記 strict nested DTO、Application direct-input validation 與 schema-version collision status mapping 缺口已建立最小 WI-070。
- 將原本三份 `WI-067` 分為 Media transport `WI-067`、taxonomy table gate `WI-068`、taxonomy a11y `WI-069`，並同步修正其 Work Group ID 與依賴，消除依賴歧義。
- 將 Dev Hub overview snapshot 更新為 #262/WI-034/WG-042 的 closed/done/completed 與 PR #370，重新產生 HTML。

## 關鍵決策

#282 的基本 migration delivery 維持 WI-042 done/WG-041 completed；但不能把 review 中可觀察的 contract failure 誤標為完整 acceptance。新 WI-070 只涵蓋該最小 hardening seam，不擴張 CMS migration UI 或 schema lifecycle。

## 實際驗證

- `node --import tsx --test tests/core/application/*.test.ts tests/core/site-definition/*.test.ts tests/core/media/*.test.ts tests/core/plugin-host/*.test.ts`：97/97。
- `node --import tsx --test --test-concurrency=1 tests/apps/authoring-api/http-contract.test.ts`：31/31。
- `npm run cms:build` 後 `node --import tsx --test --test-concurrency=1 tests/apps/cms/runtime-browser-gate.test.ts tests/apps/cms/article-workspace.test.ts`：8/8 真實 Chromium browser/a11y journeys。
- `npm run dev-hub:overview:check`、`npm run dev-hub:overview`、再次 `npm run dev-hub:overview:check`、`node --import tsx --test tests/scripts/dev-hub-overview.test.ts`：通過，overview renderer contract 3/3。

## 已知限制／後續

- Git repository 的 object pack 有 AppleDouble `._pack-*.idx`，每個 Git command 報 `non-monotonic index`，但本批 Git 操作仍成功；未刪除未管理的 repository metadata。
- WI-070 完成前，#282 不可關閉。
