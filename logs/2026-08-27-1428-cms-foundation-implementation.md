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
