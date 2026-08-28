# CMS Foundation implementation

## 交付

- 建立 Node 24.20.0/npm 11.19.0 strict TypeScript ESM runtime tooling、精確 lockfile 與 Foundation scripts。
- 建立 `core/foundation` 的安全結果、digest 與 strict JCS public contract。
- 建立 architecture checker、Foundation contract tests，並於 SSOT 新增 repository architecture baseline。

## 關鍵決策

- `core/foundation/index.ts` 是唯一跨 owner public entrypoint；invalid canonical JSON 僅回傳固定去敏 failure。
- Repository extension source 不等於 runtime installed/trusted/active root；runtime roots 由 operator 注入。
- Node `node:sqlite` 維持 Stability 1.2 accepted risk，僅允許 Persistence private adapter；#219 承擔 compatibility gate。

## 驗證

使用官方 Node `v24.20.0`（SHA-256 `40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8`）與 npm `11.19.0` 執行：`npm ci && npm run check && npm run check:ai-sync && git diff --check`，全部成功。

## 後續交接

#219 與 #220 只能消費 Foundation public entrypoint，不得修改 Foundation surface 或建立第二套 scaffold。Foundation issue 保持 open 且不重新加入 `ready-for-agent`。

## PR #240 審查後修正（2026-08-27）

### 已修正缺陷

- **`.rulesync` 回歸**：`rulesync generate` 由未同步的 `.rulesync/rules/CLAUDE.md` 產生，導致 `CLAUDE.md`／`AGENTS.md` 被回退，抹除「規劃／實作前必讀 `contracts/README.md`」的 SSOT 規則與專案描述。已把該規則寫回 rulesync source 並重新產生，兩檔現與 `site-reset` 一致。
- **Architecture checker 為半空轉**：`PUBLIC_ENTRYPOINT`、`DEEP_IMPORT`、`APP_COMPOSITION`、`HOST_EXTENSION_ISOLATION`、`RENDERER_THEME_ISOLATION`、`RUNTIME_SELF_CONTAINED`、`NAMING`、`SYMLINK_ESCAPE` 僅宣告於 type union，沒有任何 branch 產生；`ROOT_TREE`／`LEGACY_FLAT_ROOT`／`CATCH_ALL_ROOT` 有 branch，但 include glob 只掃 semantic root，實際永遠掃不到違規檔案。全部補上真實實作，掃描範圍改為整個 repository。
- **Owner 矩陣過寬且過嚴**：原本一律禁止 core owner 之間非 Foundation 的匯入，與 §6 的 Application composition、Projection／Renderer／Delivery 依賴不符。改以 `ownerDependencies` 明列矩陣。
- **Extension package 內部 import 誤判**：package-local relative import 被判 `EXTENSION_TYPE_ONLY`。改為 package-local 一律允許，跨 package value import 判 `RUNTIME_SELF_CONTAINED`，type-only 但指向錯誤 contract entry 判 `EXTENSION_TYPE_ONLY`。
- **`toJSON` 誤拒**：`canonicalJsonBytes({ toJSON: 1 })` 回 `INVALID_CANONICAL_JSON`。序列化全程自行處理 object／array，不會把 object 交給 library，該 guard 無作用且會誤拒合法 I-JSON。已移除。
- **`main` 吞掉所有錯誤**：改為輸出實際錯誤訊息，並區分 argument 解析失敗與執行失敗。

### 其他調整

- `tsconfig.json` 加上 `noUnusedLocals`／`noUnusedParameters`（原 checker 有未使用的 `target` 區域變數）。
- checker 由單行密集寫法改為可讀排版，並加上 zh-TW 註解。
- 測試由 11 條增至 32 條：補 RFC 8785 structure／number vectors、ordinary/null-prototype/frozen byte-identical、`toJSON` data key，以及每一條 architecture rule 的失敗 fixture 與一組完全合規樹的零違規 fixture。

### 驗證

Node `v24.20.0`／npm `11.19.0`：`npm ci && npm run check && npm run check:ai-sync && git diff --check` 全數通過（32 tests pass，checker 對本 repository 回報 0 violations）。

### 已知限制

- `PUBLIC_ENTRYPOINT` 只在 unit 已有 `.ts` 檔時檢查，不會要求尚未建立的 reserved unit。
- `SYMLINK_ESCAPE` 檢查 semantic root 下的 symlink 與 resolved import target；repository 外由 operator 注入的 installed root 不在本 checker 範圍，留給 #220 的 Host discovery。
