# 根目錄指令文件更新

- **完成時間**：2026-08-27 09:29（本地時間）
- **狀態**：已交付

## 交付

- 同步更新 `CLAUDE.md` 與 `AGENTS.md`，兩檔維持逐字一致。
- 將專案摘要改為從零打造 JavaScript／TypeScript CMS 平台，並由 published projection 產生公開靜態網站。
- 新增 `source-drafts/` 的唯讀、不可發布與不可未經 Owner 決策抽取需求規則。
- 明定任何 CMS／renderer 規劃、issue 或實作須先讀取 `contracts/README.md`；它是唯一現行 implementation contract，衝突時優先，SSOT 變更只修改該檔。

## 關鍵決策

- 不複製 v1 command、route、media 或 Plugin 的逐條契約，也不複製 issue 狀態；這些資訊分別維持於 `contracts/README.md`、GitHub issues 與既有工作紀錄，避免形成第二個 SSOT。

## 實際驗證

- 檢查兩份根目錄 instruction 文件：摘要、歷史資料保護與 contracts SSOT 規則均逐字一致。
- `.omp/config.yml` 的 agent routing 仍與兩檔 OMP 任務路由規則一致。

## 已知限制／後續

- 無。後續 CMS 實作依 `contracts/README.md` 與 issue blocker 順序進行。
