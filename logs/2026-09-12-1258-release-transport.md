# Release transport

## 交付

- 四個 strict `release-*/v1` Authoring API POST endpoints；固定 repository-external local release root。
- diagnose/build 只走 published Projection→Renderer；release/redeliver 只接受 verified artifact，絕不 Publish 或 rebuild。
- receipt 僅含 artifactDigest、targetDigest；target 以 sibling staging 原子交付且 idempotent。

## 驗證

- `npm run typecheck`
- `node --import tsx --test tests/core/delivery/delivery.test.ts tests/apps/authoring-api/http-contract.test.ts tests/apps/authoring-api/cms-runtime.test.ts`：32/32。

## 已知限制

- 無。
