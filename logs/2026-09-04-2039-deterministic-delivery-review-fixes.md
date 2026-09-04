# Deterministic Public Delivery 複審收斂

複審 PR #309 的 `renderer-input/v1` bytes boundary、Theme／Plugin callback fail-closed、artifact manifest 與 re-delivery 驗證後的收斂變更。

## 交付

- **Renderer 與 Delivery 的 artifact path profile 收斂為單一判斷。** 兩端原本各自宣告 staged output path：Renderer 接受任何副檔名，Delivery 只接受 `*.html`。任何 Plugin 以 `public/assets/emit` 產出 CSS／JS／字型都會通過 Renderer、卻讓整份 artifact 在 `deliver` 被 `INVALID_RENDERER_OUTPUT` 拒絕，使該 hook 端到端不可用。改由 `core/renderer/index.ts` 匯出 `isArtifactFilePath`，Delivery 直接消費同一判斷；新 profile 另外逐段拒絕 dot segment、隱藏檔與尾綴點，避免 manifest path 與落盤 path 因 `path.join` 正規化而分歧。
- **Renderer 驗證 extension contract。** 原本 `theme.identity.rendererContract` 與 `plugin.identity.hookContract` 只被寫入 provenance，未經檢查，宣告未來版本的封存輸入會被照常執行。新增 `UNSUPPORTED_EXTENSION_CONTRACT` 並在載入 module 前 fail closed。
- **Theme Host 讓 `UNSUPPORTED_RENDERER_CONTRACT` 具備實際分支。** 該 failure code 先前無任何 emitting branch，contract 不符一律收斂為 `INVALID_THEME_MANIFEST`。manifest parser 改為只驗證 `rendererContract` 型別，contract 判斷移至 `load`，讓 discovery rejection 可區分「manifest 壞掉」與「contract 不受支援」。
- **Projection 的 Plugin staleness 重驗不再退化為恆真式。** 原本以 `pluginsAfter.digest !== (plugins.value[0]?.activeStateDigest ?? pluginsAfter.value.digest)` 比對，當沒有任何 public renderer Plugin（未啟用，或已啟用者皆無 public callback）時 `plugins.value` 為空，整個檢查恆為 false，期間的 activation 變更無法偵測。改為在 resolve 前後各取一次 `getActiveSnapshot()`，並額外要求每個已解析 renderer 的 `activeStateDigest` 等於 resolve 前的 digest。
- **Delivery staging 目錄改為每次唯一。** 原本固定使用 `<digest>.tmp`：同 digest 的並行交付會寫入同一個 staging 目錄，且失敗端的 `rmSync` 會刪掉另一端仍在寫入的 bytes，可能讓對方 rename 出殘缺 artifact。改用 `mkdtempSync` 產生唯一 staging，並以 non-recursive `mkdirSync` 原子取得 digest 目錄，收斂 `existsSync` 與 `renameSync` 之間的並行覆蓋窗口。
- **Re-delivery 驗證 artifact 位址與完整檔案集合。** `redeliver` 先前未驗證 `artifactDigest` 形狀即以之組出檔案系統路徑，且 `verified` 只檢查 manifest 列舉的檔案、不檢查目錄是否被塞入額外 bytes——多出的檔案會被 `cpSync` 原封散佈。現在 `artifactDigest` 必須通過 `isDigest`、`destination` 必須是絕對路徑，且交付目錄的實際檔案集合必須恰好等於 manifest 列舉檔案加 `artifact-manifest.json`。
- **移除 `assetOutput` 的恆真 digest 檢查。** 原本以同一份 base64 現算 digest 再拿去比對自己，實際只驗證 base64 canonical round-trip；改為明確的 `canonicalBase64` 解碼。
- Delivery 另外拒絕 rendered file 佔用 `artifact-manifest.json` 這個保留檔名（先前只會在寫入階段以 `ARTIFACT_WRITE_FAILED` 間接失敗）。

## 驗證

- `npm run check`（`typecheck` + `check:architecture` + 全量 `npm test`）於 Node 24.20.0 通過，184 tests pass、0 fail。
- 新增回歸測試：Theme Host `UNSUPPORTED_RENDERER_CONTRACT` discovery rejection、Renderer 拒絕不受支援 extension contract、Renderer path profile 拒絕 dot segment／隱藏檔、Projection 在無 public renderer Plugin 時仍偵測 activation 變更、Re-delivery 拒絕額外 bytes 與未驗證位址、Plugin 非 HTML asset 端到端通過 Renderer 與 Delivery。
- 手動驗證同 digest 的重複 `deliver` 恰有一次成功、失敗端回 `ARTIFACT_IMMUTABILITY_CONFLICT`、既有 artifact 完好且 artifacts root 無 staging 殘留。

## 已知限制／後續

- `renderer-input/v1` 的 `media[].publicPath` 目前是 `/media/<sha256:...>`，含冒號且為絕對路徑，與 Renderer／Delivery 的 artifact path profile 不相容；目前尚無任何 media bytes 會進入 artifact，公開 media 的落盤路徑格式需在 media emission 一併決定。
- artifact manifest 的 `provenance.plugins` 只涵蓋具 public callback 的 active Plugin。contract §3 要求記錄「active Plugin id/version/manifest hash」，是否納入不影響公開 bytes 的 active Plugin，需由 contract 決策確認。
- Theme／Plugin runtime source 仍是同 process 的 trusted-local code；`module-loader` 的 import 拒絕是封存 bytes 邊界，不是 sandbox。
- `createPublicDelivery` 對無效輸入回傳 `ARTIFACT_WRITE_FAILED`，尚無獨立的輸入驗證 failure code。
