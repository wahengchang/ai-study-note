# 媒體封存復原與 RestoreRevision

- **完成時間**：2026-08-31T17:54:00+08:00
- **Work Group**：WG-010
- **Branch**：`cms/archive-restore-asset`

## 交付

- DataMedia 新增單一 asset version 的封存、復原與 availability inspection public seam。
- local object store 驗證 root identity、directory mode／owner，並以 no-follow file descriptor 驗證 final object。
- DomainApplication 新增 RestoreRevision；從 immutable source 建立帶 `restoredFromRevisionId` 的新 current revision，保留 published pointer。

## 關鍵決策

- Media 維持獨立 structural Persistence port，不跨 owner import Persistence public entrypoint。
- RestoreRevision 在 write 前完成 schema、media、current claim 與 transaction-bound route replacement preflight。

## 實際驗證

- `node --import tsx --test tests/core/media/archive-restore-asset.test.ts`：1/1 通過。
- `node --import tsx --test tests/core/application/restore-revision.test.ts`：1/1 通過。
- `node --import tsx --test "tests/core/media/*.test.ts" "tests/core/application/*.test.ts"`：22/22 通過。
- `npm run check`：120/120 通過，含 typecheck 與 architecture checker。

## 已知限制／後續

無。
