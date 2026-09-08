# Theme Host PR #304 複審與最佳化

- **完成時間**：2026-09-04T12:10:00+08:00
- **Work Item**：WI-027／GitHub #253
- **Work Group**：WG-015
- **狀態**：completed（複審後補強）

## 交付

- `core/theme-host/host.ts`：collect 改為兩階段。階段一只驗證 slot identity 與讀取 `theme.json` 取得 ThemeIdentity（conflict／drift 判定只需要這一階段），階段二只對 `select` 命中的 slot 讀取並雜湊完整 evidence 與掃描 runtime。`resolveExact`／`readVerifiedFile` 因此不再為了單一 Theme 重新讀取並雜湊 installed root 內其他所有 package。
- `core/theme-host/host.ts`：新增 `retainBytes`，只有 `readVerifiedFile` 需要保留 package bytes；`discover` 驗證完即丟棄。並以 `mapBounded` 將同時處理的 slot 數限制為 8，讓 peak memory 與 file descriptor 不隨 slot 數線性膨脹。
- `core/theme-host/host.ts`：`validIdentity` 改用 `isCanonicalThemeId`，移除與 `failures.ts` 重複的 kebab-case regex；移除 `sha256Digest(evidence.ok ? … : new Uint8Array())` 這段短路後不可能執行的運算式。
- `core/theme-host/failures.ts`：移除未被任何呼叫者使用的 `themeHostError`。
- `core/theme-host/trusted-root.ts`：`validateThemeSlot` 直接命名原本的 `packageSlot`，移除只做 pass-through 的包裝；`isSafeOwnedMetadata` 收回為 module-private。
- `tests/core/theme-host/theme-host.test.ts`：補上原本沒有 fixture 的四個 failure code（`INVALID_THEME_HOST_INPUT`、`THEME_NOT_FOUND`、`INVALID_THEME_MANIFEST`、`THEME_DISCOVERY_FAILED`），以及「不健康的其他 package 不影響健康 Theme 解析」的行為鎖定。

## 關鍵決策

- 只縮小 evidence 讀取範圍，不縮小驗證強度：被交付的 package 仍然完整驗證 manifest、每個 runtime/resource digest、self-contained runtime import graph 與前後 slot identity。未被選中的 slot 仍會驗證 slot identity 並解析 manifest，identity conflict 與 evidence drift 的公開結果完全不變。
- 不修改 `contracts/README.md`：contract 沒有要求 `resolveExact`／`readVerifiedFile` 讀取不相關 package 的 evidence，本次是實作層最佳化，核准範圍不變。
- 新測試先在複審前的 `host.ts` 上跑過並全數通過，確認它們是覆蓋補強而不是為新實作量身訂做。

## 實際驗證

- Node `v24.20.0`／npm `11.19.0`（contract engines 指定值；以 nvm 安裝後 `npm ci`）。前一份紀錄因 runtime 為 Node v22 而未宣稱此項，本次已在指定 runtime 上驗證。
- `npm run check`：typecheck、check:architecture 與 180/180 測試通過（複審前基準為 175/175）。
- 行為等價驗證：新增的 5 個測試在複審前的 `host.ts` 上同樣 9/9 通過。
- 效能量測（20 個 Theme、每個含 2 MiB resource，各 5 次取平均）：`resolveExact` 194.9 → 24.4 ms/op、`readVerifiedFile` 185.8 → 27.1 ms/op、`discover` 205.5 → 199.7 ms/op；process RSS 由 215–250 MiB 降至 145–146 MiB。

## 已知限制／後續

- `discover` 依契約必須驗證每個 candidate 的完整 evidence，成本仍與 installed root 總位元組數成正比；本次只移除 `resolveExact`／`readVerifiedFile` 的相同成本。
- 巢狀 resource path（例如 `assets/site.css`）的中繼目錄不做 ownership／mode 驗證，只逐段 `lstat` 擋 symlink；final component 以 `O_NOFOLLOW` 開啟，中繼段仍有理論上的 TOCTOU 面。實際影響受限於「檔案必須 current-UID 擁有且 digest 相符」，尚未找到可利用路徑，未在本次變更，留待 Owner 決定是否納入契約。
- `discover` 的 rejections 以 `(code, subjectId)` 去重，同一 Theme id 的不同 version conflict 會收斂為單一 rejection；這是契約層取捨（subjectIds 只帶 id），未變更。
