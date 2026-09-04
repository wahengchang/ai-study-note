# Deterministic Public Delivery

## 交付

- Theme Host 從 repository 外部 trusted root 解析 canonical manifest，對 active exact identity 封存 verified entry/resource bytes。
- Projection 是唯一 published-only `renderer-input/v1` producer；封存 Theme 與 active public Plugin 的 bytes、callback 宣告與 exact identity。
- Renderer 只消費 canonical immutable bytes，拒絕 executable dependency graph 與 promise callback；Theme／Plugin callback 僅能輸出 staged artifact files。
- Delivery 以 immutable `artifact-manifest.json` 記錄 input digest、published selection、route/media digest、Theme/Plugin identity、每檔 hash 與 total digest；re-delivery 先驗證來源 bytes。

## 關鍵決策

- Theme／Plugin runtime source 為 trusted-local code，不提供 process sandbox；Renderer 只允許沒有 import dependency graph 的封存 entry bytes，避免重新開啟 installed pathname。
- Public Plugin callback 接收 frozen 完整 `renderer-input/v1`，依 priority、Plugin ID 排序；inactive Plugin 不進入 snapshot。

## 驗證

- `npm run check:architecture`
- `npm run typecheck`
- `node --import tsx --test tests/core/foundation/check-architecture.test.ts tests/core/theme-host/theme-host.test.ts tests/core/plugin-host/plugin-host.test.ts tests/core/projection/producer.test.ts tests/core/renderer/renderer.test.ts tests/core/delivery/delivery.test.ts tests/core/delivery/renderer-delivery.test.ts`
- 46 tests passed。

## 已知限制／後續

- #254 的 Preview transport／零 canonical mutation 尚未實作。
- #255 的 repository-subpath-safe Public UI、release 與 GitHub Pages 尚未實作。
