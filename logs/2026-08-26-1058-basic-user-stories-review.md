# Basic 用戶故事與核心模組審查

## 交付

- 更新 `docs/v3/user-stories-and-core-modules-discussion.md` 為 Basic 討論基線。
- 文件現有 30 條啟用中的用戶故事，涵蓋內容類型與分類、內容工作流、站點結構、媒體、靜態發行與公開閱讀。
- 將「內容管理者：資料安全與恢復」標記為 Basic 不納入；不再把它當成啟用用戶故事。
- OMP reviewer 與 OpenCode `opencode-go/deepseek-v4-pro` 的修訂後複核均為 `CONSENSUS_ACCEPTED`。

## 已確認決策

- Basic 只有一位內容管理者；同一人負責內容管理與靜態發行，不引入登入、多人角色或權限模型。
- 內容類型能力相當於傳統 CMS 的 Custom Post Type 搭配 ACF，但由本系統內建預設能力提供。
- 內容變更使用 Git commit 管理版本歷史；此事實不代表 Git 已提供本機 SQL canonical state 與 local media 的完整 backup／restore 契約。
- Basic 不納入獨立 backup／restore 與還原後一致性驗證用戶故事；Publish 仍只改本機 current／published state，不執行 Git、build 或 deploy。

## 審查修訂

獨立 reviewer 首輪提出五項必要缺口或矛盾，均已修訂並複核通過：

1. 新增儲存、發布、封存與 revision 還原的明確成功／失敗回饋故事。
2. 釐清 Git commit 的版本歷史角色，不把它描述為 SQL／媒體恢復契約。
3. 新增內容對分類詞彙的指派、變更與移除故事。
4. 新增公開讀者讀取已發布媒體的端到端故事，並分別指定媒體選取、projection reference、公開 URL 與 artifact 的模組責任。
5. 固定單一內容管理者執行靜態發行，刪除獨立發行角色的待決問題。

## 驗證

- 完整讀取並人工核對修訂後文件：`docs/v3/user-stories-and-core-modules-discussion.md`。
- 獨立 reviewer `BasicStoriesReviewer` 首輪 verdict：`NEEDS_REVISION`；修訂複核逐項 `FIX_VERIFIED`，最終：`CONSENSUS_ACCEPTED`。
- OpenCode `opencode-go/deepseek-v4-pro` 首輪 verdict：`NEEDS_REVISION`；二次複核的 F-001 至 F-007 全數 `FIX_VERIFIED`，最終：`CONSENSUS_ACCEPTED`。

## DeepSeek 二次審查

OpenCode 的 `opencode-go/deepseek-v4-pro` 首輪以唯讀方式提出七項 finding，修訂後全數複核通過：Content Type 有已發布內容時禁止封存；Media Library 擁有唯一媒體引用登錄與可用性規則；Projection & Preview 擁有站點預覽與 versioned renderer input contract；artifact 回退只重新交付 artifact；revision 引用封存媒體時阻止還原；CMS Workspace 提供內容與媒體列出／定位。

## 限制與後續

- 七個候選核心模組仍是待 Owner 確認的提案，尚未成為架構決策。
- Post Type schema 可變程度、migration 契約、revision／published projection、預覽、renderer input 與 automation 仍未核定。
