# 資料庫與核心規格拆分

- **完成時間**：2026-08-26 23:44（本地時間）
- **狀態**：已交付；五份規格均已通過架構與安全複審。

## 交付

以 `CMS-BASIC-CONTRACTS-V1` 為唯一 SSOT，建立 `specs/cms-basic-contracts-v1/` 的依序交付工作包：

1. `CMS-DB-01`：資料持久化與 schema migration。
2. `CMS-CORE-02`：內容生命週期 application core。
3. `CMS-CORE-03`：路由圖 application core。
4. `CMS-CORE-04`：媒體生命週期 application core。
5. `CMS-CORE-05`：Plugin host core。

所有規格均已發佈為 GitHub issue，並加上新建的 `ready-for-agent` triage label：#214、#215、#216、#217、#218。

## 關鍵決策

- 將持久化、內容 command、路由圖、媒體生命週期、Plugin host 切為五個可獨立實作的 domain owner，避免 UI／renderer 需求進入本批工作。
- 每份規格只指定一個最高層的行為測試 seam：persistence contract、`DomainApplication`、`SiteDefinition`、`DataMedia`、`PluginHost`。
- 四個 `DomainApplication` command 都必須先通過 schema、media availability、route conflict/impact preflight；任何失敗維持 canonical digest 不變。
- 媒體 replace 必須以 transaction 新建 checksum object、asset version、immutable revision 與 revision reference；舊 published selection 不可被隱式改寫。
- Plugin host 僅對 host-mediated capability 提供最小權限 facade；trusted local Plugin 不被錯誤宣稱為 process sandbox。

## 實際驗證

- 架構審查 agent 最終裁定五份規格 `ACCEPT`。
- 安全審查 agent 最終裁定五份規格 `ACCEPT`；最後的 `RestoreRevision`／`RestoreAsset` response ownership 修正已獨立複核。
- GitHub issue 建立成功：#214–#218；建立前確認沒有同主題既有 issue。

## 已知限制／後續

- `ProjectionPreview`、Static Rendering、Public UI 和 CMS UI 依 Owner 要求延後，不在本批規格或 issue 內。
- `contracts/README.md` 仍是唯一現行 SSOT；本目錄與 issue 是其可執行的工作拆分，不能覆蓋或擴張契約。
- `MEMORY.md` 不更新：現有 SSOT 指標與長期架構原則仍正確，無新的長期決策需要重複記錄。
