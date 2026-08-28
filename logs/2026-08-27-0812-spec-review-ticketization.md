# 規格複審與票券化

- **完成時間**：2026-08-27 08:12（本地時間）
- **狀態**：已交付

## 交付

- 針對 `CMS-DB-01`、`CMS-CORE-02`、`CMS-CORE-03`、`CMS-CORE-04`、`CMS-CORE-05` 各自完成架構、安全、工作流程與交付性複審，並以第二輪裁決收斂。
- 保留既有母議題 #214–#218，不修改、不重建。
- 建立並套用 `ready-for-agent` 的 20 張垂直子議題：#219–#238；每張均含 Parent、What to build、Acceptance criteria、Blocked by。
- 將 Owner 核准的 v1 content command、route identity/digest、media replace/restore、Plugin hook/activation 決策寫入 `contracts/README.md`，維持該檔的 SSOT 地位。

## 關鍵決策

- `PublishRevision` 使用 `expectedCurrentRevisionId`；`RestoreRevision` 僅移動 current；`ChangeRoute` 採 SiteDefinition prepare 加 DomainApplication commit；v1 不釋出 lifecycle mutation Plugin hook。
- route claim 的同圖 occupancy key 為 `{graph, normalizedRoute}`；current/published 同 key 不互撞；採定版 normalization 與公開 snapshot digest。
- 媒體 replace 經 `SaveRevision` 建立新 current revision；archive 作用於 asset version 且不得使 active published reference 失效；missing bytes 只接受可完整驗證的本機 recovery bytes。
- Plugin 採 explicit additive hook catalog、fixed identity activation、explicit deactivation 與 exact-identity re-enable。

## 實際驗證

- GitHub API 驗證 #219–#238 全數存在、均有 `ready-for-agent` label，且 issue body 都含 Parent、What to build、Acceptance criteria 與 Blocked by。

## 已知限制／後續

- #219 與 #220 沒有 blocker，是目前可立即開始的 frontier。
- UI、ProjectionPreview、Static Rendering、Public UI、HTTP/auth、runtime sandbox、remote storage/marketplace 仍不在本批 issue 範圍。
