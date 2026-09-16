---
id: WG-003
status: completed
title: WI-005｜交付 400 MiB 單一媒體庫
work_items: [WI-005]
owner: data_media_engineer
branch: wg-002-streaming-current-media-library
worktree: .dev-hub/worktrees/streaming-current-media-library
pr: null
---

## Delivery

> WG ID 為 `WG-003`：本 Work Group 原以 `WG-002` 建立，但另一個 Work Group（WG-002｜mutable entry status）在本次 PR 建立後先合併進 `site-reset`，同一 Cycle 不得有兩個 `WG-002`。Branch 名稱維持建立時的 `wg-002-streaming-current-media-library`，以保留 PR 與審查紀錄的連續性。


- current-only media library 垂直切片：Persistence `0014` current media record 與 reference ledger、streaming staging 與 content-addressed object store、MIME sniff 與 in-repo raster thumbnail、`media-asset/v2` 的 import／replace／metadata save／real delete、Authoring API streaming multipart transport、CMS 媒體庫與兩檔並行上傳 queue。
- 同批移除 v1 media authoring surface：`/v1/media/:assetId/versions|archive|restore` route、`DomainApplication` 的 v1 media commands、`saveRevision` 的 media-reference-replacement variant、CMS MediaReplacement／MediaRecovery 與其測試。v1 `DataMedia` port 保留為仍存續之 entry／revision lifecycle 的內部依賴。
- 實作前計畫交叉審查：`domain_application_engineer` 觀點（reviewer，ChatGPT）與 `data_media_engineer` 審查者觀點（reviewer-deepseek）各一輪；實作後再次由同兩個角色交叉審查，全部 blocking finding 關閉後取得 ACCEPT。專案角色定義在 `.rulesync/subagents/`（generated view 為 `.codex/agents/`）不是本 harness 可 spawn 的 agent，因此以兩個不同平台 agent（不同 underlying model）承載該兩個角色的責任邊界，並在審查 prompt 明列角色範圍。

## Verification

- `npm run check`（node 24.20.0）：typecheck、`check:architecture`、`cms:build`、全套測試 **333 pass / 0 fail**（baseline 307 pass；新增 raster 13、media library 10、persistence current media 7、multipart parser 2，改寫 media HTTP／CMS journey 段落，刪除已移除 lifecycle 的測試）。
- `node --import tsx --test tests/core/media/raster.test.ts`：13 pass（PNG 非交錯／Adam7／palette／tRNS、JPEG baseline＋progressive、GIF interlace、確定性、逐列解碼記憶體上限）。
- `node --import tsx --test tests/core/application/current-media-library.test.ts`：10 pass（含 400 MiB 邊界成功與 +1 byte 失敗、64 MiB import 記憶體平坦度、abort／checksum／thumbnail／promote fault 的 staging 清理、referenced Replace／Delete 零寫入、CAS 409、slug 釋放與重用）。
- `node --import tsx --test tests/apps/authoring-api/http-contract.test.ts`：真實 listener 的 multipart import／replace／metadata／delete／thumbnail、framing／envelope／type 拒絕、上傳中斷清理、hostile transport 矩陣。
- `node --import tsx --test tests/apps/cms/runtime-browser-gate.test.ts`：6 pass，含真實 `cms:start` runtime + Chromium 的媒體 journey（3 檔 queue 第三項等待、取消、重試無 Range、thumbnail 由瀏覽器實際解碼、CAS 409 與 aria-invalid、Replace 保留 assetId／slug、Delete 與 usage 阻擋）。
- `/ai-x` Light — Second opinion（Primary underlying model：opencode-go/deepseek-v4-flash；候選順序 ChatGPT → Claude CLI，排除同模型 DeepSeek；selected model：`openai-codex/gpt-5.6-sol`，mechanism：`.omp/config.yml` 綁定的 `reviewer` role）→ `SECOND_OPINION_FINDINGS`，4 項處置：
  1. 副檔名只驗到 family → 已改為以偵測到的 MIME 為鍵的 allowlist，並補 MP3-as-WAV／MP4-as-WebM／EBML-as-OGG 的拒絕案例。
  2. stage release 失敗仍 commit → `releaseStage`／`removeStage`／`sweepStages` 改回傳結果，release 非 ENOENT 失敗即讓該次操作失敗且不建立 record；啟動 sweep 失敗時 library 建立失敗（fail closed），並補兩個 regression。
  3. 「JavaScript 被拒絕」宣稱過寬 → 補上 BOM／空白後 `#!` 的內容拒絕，並在 contract 與 WI 明確界定判定邊界（副檔名＋主動標記；`text/plain` 不構成已排除 script 的證明；媒體庫不提供原始 bytes）。
  4. digest 在 response redaction 之前計算 → 所有會進 response 的 media metadata 含有 `asn_(v1|bt_v1)_…` canary 形狀時一律在 Application 邊界拒絕，確保 wire asset 與 `stateDigest` 的 JCS 輸入一致，並補 regression。
- 整合：PR 建立後 `site-reset` 先合併了 WG-002（mutable entry lifecycle）與兩份 docs/rulesync PR，因此本分支 rebase 到最新 `site-reset`，並把 media migration 由 `0013` 改為 `0014`（`0013` 已由 current entries 使用）；所有 migration/canonical counts 斷言與兩邊共用檔案（`server.ts`、`transport-contracts.ts`、`persistence/*`、`cms-runtime.ts`、`workspace.tsx`、`docs/INDEX.md`、`contracts/README.md`）已逐檔合併，合併後全套 353/353 通過。
- 同一 Cycle 的 `WG-002` 已由先合併的 entry lifecycle 佔用，本 Work Group 因此更名為 `WG-003`；branch 名稱維持建立時的 `wg-002-streaming-current-media-library`，以保留 PR 與審查紀錄的連續性。
- 計畫與實作兩輪交叉審查的最終 verdict：ACCEPT（所有 blocker 已關閉：CAS／usage 在 promote 前預檢且於 record transaction 內重驗、multipart 必須讀到真正 EOF、`MEDIA_SIZE_LIMIT_EXCEEDED` 保留原 code、storage fault 不再冒充 404、CAS digest 格式在 Application 邊界驗證）。

## Known limitations

- usage ledger 目前沒有 entry-side writer：寫入者是 WI-006（entry Save／Delete）與 WI-008（legacy cutover）。WI-005 只交付讀取與破壞性操作阻擋，因此 HTTP 與 browser journey 的 usage 由測試端 `Persistence.replaceEntryMediaReferences` 建立（與 WI-006 將使用的同一面）。
- raster 縮圖只支援 PNG（含 Adam7）／JPEG（baseline／progressive）／GIF（第一格）；WebP／AVIF／TIFF／HEIC 與其他變體 fail closed（`MEDIA_UNSUPPORTED_TYPE` 或 `MEDIA_THUMBNAIL_FAILURE`）。
- JavaScript 只能以副檔名拒絕；副檔名不符者回 `MEDIA_TYPE_MISMATCH`。改名為 `.txt` 的 JS 會以 text/plain 收下，但媒體庫不對外提供任何原始 bytes（只有重新編碼的 PNG 縮圖），故不構成主動內容執行路徑。
- 傳入 `sniff` 的檔頭上限為 1 MiB：SOFn 落在 1 MiB 之後的合法 JPEG（巨大 APP／ICC）會被 fail closed 拒絕。
- 400 MiB raw file 上限由 Application 執行（boundary 由 library 測試實證）；HTTP 層只實證 metadata envelope 64 KiB 與 framing，未在 transport 以真實 400 MiB body 重跑一次。
- 未 commit 的 promoted object（例如 CAS 在 promote 後才失敗）不在請求路徑刪除，由啟動 sweep 收斂；契約已明訂且程式註解說明理由（併發匯入相同 bytes 時刪除會造成懸空 record）。
- 同一 media root 只支援單一 runtime process（loopback 單實例），啟動 sweep 會清掉其他 process 的 in-flight staging。
