# 專案長期記憶

這份檔案保存跨工作階段仍應成立、且會影響後續決策的專案脈絡。它是精選索引，不是工作日誌、待辦清單或聊天紀錄。

## 使用規則

- 開始涉及既有決策、架構或工作方式的工作前，先閱讀本檔。
- 只在資訊具有長期價值時更新：已確認的產品或技術決策、不可違反的約束、穩定的架構事實，以及反覆出現且已驗證的教訓。
- 單次工作的過程、驗證輸出與未定案討論，記在 `logs/YYYY-MM-DD-HHmm-{slug}.md`，不要放在本檔。
- 大型工作完成、準備結束前，檢視是否有長期資訊應更新至本檔，或有交付、驗證、限制、風險應新增一份工作紀錄；兩者皆無時，不建立空白紀錄。

## 已確認的專案脈絡

- **2026-08-25｜專案定位**：此 repository 用於翻新既有的 AI 學習筆記網站，包含 CMS 前端，供重新整理內容呈現與管理流程。
- **2026-08-25｜CMS 架構**：新的 authoring canonical source 採關聯式 SQL database，建立完整 CMS；Post Type 是一級模型，用來定義各內容類型的欄位、關係、驗證與公開版型，保留後續客製化空間。先前的 Keystatic、Git-tracked Markdoc/YAML canonical source 結論不再是實作方向。
- **2026-08-25｜長期工作位置**：後續數週至一個月持續在 `site-reset` 分支與 `ai-study-note-reset` worktree 開發；目前不得合併至 `main`，也不得因 housekeeping 切換或移除此 worktree。

## SQL CMS 長期原則

- **完整架構契約**：系統細節、schema、API 與驗證規則的唯一入口是 [`docs/architecture/2026-08-25-1758-sql-cms/README.md`](docs/architecture/2026-08-25-1758-sql-cms/README.md)；本檔不重複這些細節。
- **canonical source**：authoring state 是本機關聯式 SQL CMS 與 local media，不是 Keystatic、Git-tracked Markdown/YAML 或 remote database；沒有舊 corpus migration。
- **內容完整性**：schema、Entry、Term 歷史不可變；V1 沒有 hard delete 或 history purge。所有內容路徑位於單一 global route domain。
- **發布邊界**：Publish 只改本機 canonical current/published state；不做 Git、build 或 deploy。公開 static output、Theme 與 release artifact 只能消費 published projection，另立規劃。
- **安全與儲存邊界**：V1 是 OS-trusted loopback single owner；repository 確認 private 前，不得提交 canonical DB 或 original media。

## Codex 子代理

- **2026-08-26｜Basic 五角色協作設定**：`.rulesync/subagents/` 是唯一 Rulesync source SSOT；`.codex/agents/` 僅是由 `npm run sync:ai` 產生的 Codex runtime view，禁止反向維護。固定 Basic implementation/accountability role 為 `domain_application_engineer`（Content Core、Site Definition、application service、local transport/API 與跨 repository transaction）、`data_media_engineer`（relational persistence、constraint 與 Media Library bytes/metadata/reference/published selection）、`cms_workspace_engineer`（CMS Workspace 與 accessibility）、`projection_preview_engineer`（versioned projection/producer、current/published selection、reference resolution 與無副作用 Preview），以及 `public_delivery_engineer`（static rendering/public UI、build validation、artifact provenance、release 與 GitHub Pages delivery）。Owner 與主 session Technical Lead 是治理層，不建立 `technical_lead` custom role；五個 role identity 不表示五個同時 worker，`.codex/config.toml` 的並行上限維持 4。
- **2026-08-26｜Basic 責任流與未決 gate**：責任流固定為 CMS Workspace → Domain & Application → Data & Media；Domain/Data 的已核准 snapshots → Projection & Preview；versioned renderer input → Public Delivery → GitHub Pages。Q-003 未決時，Domain 只提供 route/hierarchy 與 gated site command，CMS 不實作 navigation/settings；Q-004 未決不改變 Projection & Preview owner；Q-005／Q-006 未決時角色保持 stack/editor-format neutral；Q-007 未核准前不得建立 Theme、Plugin 或 Controlled Command API role。i18n 納入時由 Domain 擁有 locale/content contract，CMS 與 Public Delivery 各自擁有 authoring/public surface，待 Owner 定義 locale、fallback 與 route 範圍前不啟動。
- **2026-08-26｜契約審核矩陣**：Domain/application/local API 由 `domain_application_engineer` 擁有，`cms_workspace_engineer`、`data_media_engineer` 必要審查，涉及 snapshot/projection input 時加 `projection_preview_engineer`；persistence/media integrity 由 `data_media_engineer` 擁有，`domain_application_engineer`、`projection_preview_engineer` 必要審查，涉及 user-visible operation 時加 `cms_workspace_engineer`；versioned projection/preview 由 `projection_preview_engineer` 擁有，`domain_application_engineer`、`public_delivery_engineer` 必要審查，涉及 media reference 時加 `data_media_engineer`；CMS interaction 由 `cms_workspace_engineer` 擁有、`domain_application_engineer` 必要審查並使用平台 `designer`；static artifact/public delivery 由 `public_delivery_engineer` 擁有，`projection_preview_engineer`、`data_media_engineer` 必要審查並使用平台 `reviewer`，涉及 trust boundary 時使用 `security-reviewer`。owner 不得自我核准；所有指定 reviewer 必須 `ACCEPT`，`NEEDS_REVISION` 修正後以同一 candidate 重審，任何 `DISAGREE` 阻止發行。
- **2026-08-26｜角色 context 與生成規則**：角色只先讀 `MEMORY.md` 中明列且 Owner 已核准的 canonical path／contract；再以派工提供的 `WK-*`／`SP-*`、contract ID 或 exact path 動態解析證據。零個或互相衝突的 candidate，或沒有 approved pointer 時一律 fail closed，不得將 `docs/`、`draft/`、`dev-hub-*`、`project-*`、`logs/` 或 generated output 升格。Owner 核准 contract/scope 後，Technical Lead 必須先在本檔記錄決策日期、exact canonical path 或 contract/work-item ID 與核准邊界，再派工。frontmatter `name` 是 snake_case identity；Rulesync source 與 generated filename 使用對應 kebab-case discovery slug，consumer/reviewer 必須讀取內容 `name`，不得用 basename identity 或手寫 manifest。`rulesync import --targets codexcli --features subagents` 只可由 Owner／Technical Lead 明確授權做一次性 bootstrap/recovery，平時禁止，以避免 import→generate 雙向循環。