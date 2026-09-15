# CMS Core/Data Reset

## Problem Statement

目前 CMS 的 Content Type、entry、Taxonomy 與 Media 使用 append-only schema／Revision／asset version 模型。管理者必須在 Save、Publish、Restore、current/published preview 與 migration 之間切換；Content Type 仍以 raw JSON Schema 管理，Media 以 Base64 JSON 與 version lifecycle 操作。這些能力增加了日常內容管理的狀態與失敗模式，卻不符合 Owner 已核准的「只保留目前值」方向。

CMS 需要一套一致的 current-only data model：Content Type 定義、entry、taxonomy、term 與 media asset 都直接 Save 目前值；所有 mutation 以同一種 CAS 保護，並由 CMS、Application、Persistence 與 Authoring API 共同維持原子資料 invariant。公開站 pipeline 的路由、archive、canonical 與 release 問題另案處理，不應阻塞本輪 authoring 核心重設。

## Solution

以 current-only mutable records 取代 authoring-side Revision、雙 snapshot、schema migration 與 media version lifecycle。每種可命名 entity 使用 server-generated stable ID、可變 slug 與共用 global slug namespace；每次 Save／Delete 都以 `expectedStateDigest` 做 fail-closed CAS。Content Type Builder 管理固定 system fields、ACF-like 平面 custom fields 與 Taxonomy attachment；entry Save 同時寫入完整內容及 `draft|published` status，並只在實質 published content 改變時更新 `publishedAt`。

Media 改為單一 current asset，透過 400 MiB 單次 streaming multipart 匯入／Replace。Taxonomy 改為 current registry，支援 Categories 階層、Tags 平面以及可重用 custom taxonomy。CMS 使用依 Content Type stable ID 分區的動態 route 與 server-side entry search。既有資料先經 preflight；有 current/published 分歧的 entry 必須逐筆決策，全部決策齊備後才原子 cutover。完成所有垂直切片後，clean cutover 移除舊 contract、caller、route、test 與文件，不保留相容層。

## User Stories

1. As a 內容管理者, I want Content Type Builder 永遠可從 CMS navigation 開啟, so that 我能找到並管理內容模型。
2. As a 內容管理者, I want 建立 Content Type 時由 server 配置 stable ID 與唯一 slug, so that identity 不依賴可修改的名稱。
3. As a 內容管理者, I want slug 衝突自動取得最小可用數字後綴, so that 我不必反覆猜測可用 slug。
4. As a 內容管理者, I want 修改 entity slug 後立即釋放舊值, so that 舊值能被其他 entity 重用。
5. As a 內容管理者, I want real Delete 後立即釋放 slug, so that 被刪除 entity 不留下隱性 tombstone。
6. As a 內容管理者, I want 每個 `showInMenu=true` 的 Content Type 出現在動態內容選單, so that 我能直接進入該類型的內容 catalog。
7. As a 內容管理者, I want 隱藏 Content Type 的動態選單但仍能從 catalog 或 direct URL 管理它, so that navigation visibility 不會停用資料模型。
8. As a 內容管理者, I want 新安裝與既有 runtime 都有 Article、Categories 與 Tags 預設資料, so that 基本 authoring workflow 不需手動 bootstrap。
9. As a 內容管理者, I want 每個 Content Type 都有 title、body、slug、excerpt、featured media、Categories、Tags、SEO、status 與 `publishedAt`, so that 不同內容類型共享一致核心欄位。
10. As a 內容管理者, I want 以 ordered groups 編排 custom fields, so that editor 能呈現穩定且可理解的欄位順序。
11. As a 內容模型設計者, I want 建立 text、textarea、number、boolean、URL、date、datetime、single-select、multi-select、single-media 與 multi-media fields, so that 常見結構化內容不需 raw JSON Schema。
12. As a 內容模型設計者, I want field 與 select option 使用 immutable stable ID 而 label 可改, so that 已儲存值不因文案調整失去語意。
13. As a 內容模型設計者, I want 設定 required、文字長度、數值範圍、media MIME 與最大數量, so that published entry 能符合模型限制。
14. As a 內容模型設計者, I want custom field defaults 只套用新 entry, so that definition 更新不會暗中改寫既有內容。
15. As a 內容模型設計者, I want 設定 `showInGenericTemplate` public intent, so that 未來 public renderer 能明確選擇欄位而本輪不耦合 rendering。
16. As a 平台維護者, I want 有既有 entry 的 Content Type 只接受可證明 non-breaking 的更新, so that current records 不會因模型變更變成無效資料。
17. As a 平台維護者, I want 刪 field／option、改 field type／stable ID、optional 改 required、縮緊 validation 或移除 taxonomy attachment 時整筆拒絕, so that definition 與 entry 不會部分漂移。
18. As a 內容管理者, I want 建立 entry 時沿用現有 body-block editor payload, so that editor 技術不需在 data reset 中重做。
19. As a 內容管理者, I want 一次 Save 完整內容與 `draft|published` status, so that 不需再操作獨立 Publish command。
20. As a 內容管理者, I want draft 可暫缺 custom required fields, so that 未完成內容仍可保存。
21. As a 內容管理者, I want published Save 驗證所有 system、custom、taxonomy 與 media constraints, so that 可發布資料完整一致。
22. As a 內容管理者, I want published content 實質改變時更新 UTC `publishedAt`, so that 時間代表最後一次真正發布的內容變更。
23. As a 內容管理者, I want 相同 published bytes 重複 Save 時保留 `publishedAt`, so that 無內容變更不會偽造發布時間。
24. As a 內容管理者, I want entry 改回 draft 後仍看得到最後 `publishedAt`, so that 歷史發布時間與目前 status 不混淆。
25. As a 內容管理者, I want real Delete 一次移除 entry 與其 active slug、taxonomy、media、route evidence, so that CMS 不留下孤兒關聯。
26. As a 內容管理者, I want published entry 可直接 Delete, so that 不必先執行不存在的 Unpublish command。
27. As a 內容管理者, I want 依 title 或 slug 搜尋特定 Content Type 的 entries, so that 大型 catalog 仍可操作。
28. As a 內容管理者, I want 依一個或多個 status 篩選 entries, so that draft 與 published 工作能分開處理。
29. As a 內容管理者, I want 依 taxonomy filters 篩選 entries, so that 能以分類組織 authoring catalog。
30. As a 內容管理者, I want entry catalog 每頁固定 20 筆並顯示總筆數與總頁數, so that pagination 結果可預期且由 server 決定。
31. As a 內容管理者, I want Categories 使用 parent/child hierarchy 而 Tags 保持 flat, so that 兩種預設 taxonomy 符合不同整理方式。
32. As a 內容模型設計者, I want 建立 reusable custom taxonomy 並固定其 hierarchical mode, so that 多個 Content Type 能共享穩定 term 語意。
33. As a 內容模型設計者, I want taxonomy attachment 設定 cardinality、required 與 `allowTermCreation`, so that 每個 Content Type 有明確選取政策。
34. As a 內容管理者, I want attachment 允許時從 entry editor inline 建立 term, so that authoring 不必離開當前內容。
35. As a 內容管理者, I want missing parent 或 parent cycle 被拒絕且零寫入, so that Category graph 永遠有效。
36. As a 內容管理者, I want retire term 保留既有 usage 但阻止新選取, so that 能停止使用 term 而不破壞 current entries。
37. As a 內容管理者, I want 只有零 entry usage 且零 children 的 term 可 real Delete, so that 關聯不會懸空。
38. As a 內容管理者, I want child term assignment 不自動加入 parent, so that entry binding 精確反映我的選擇。
39. As a 內容管理者, I want 以單次串流 request 匯入最高 400 MiB 的媒體, so that 大型檔案不必經 Base64 或整檔進入 JavaScript memory。
40. As a 內容管理者, I want 瀏覽器同時最多處理兩個 uploads 並逐檔顯示 progress、cancel、retry, so that 批次匯入可控且不宣稱不具備的 resume。
41. As a 平台維護者, I want server sniff MIME、限制 size、計算 checksum 並以 staging 後 atomic promote, so that 未驗證 bytes 不會成為可選 asset。
42. As a 平台維護者, I want 中斷或驗證失敗會清除 staging 且不建立 media record, so that retry 從零開始時沒有半成品。
43. As a 內容管理者, I want 匯入 raster image、PDF、audio、video 與 plain text, so that CMS 支援核准的常見內容格式。
44. As a 內容管理者, I want SVG、HTML、JavaScript 與 executable 被拒絕, so that 主動內容或執行檔不進媒體庫。
45. As a 內容管理者, I want raster image 有 content-addressed thumbnail 而其他類型顯示 metadata, so that catalog 預覽不需執行或嵌入不安全內容。
46. As a 內容管理者, I want 編輯 media title、slug、alt、caption 與 description 並查看唯讀檔案證據, so that 描述資料與實際 bytes 可同時確認。
47. As a 內容管理者, I want alt text 可留空, so that data model 不新增未核准的 publish blocker。
48. As a 內容管理者, I want 零 entry 引用時 Replace 或 real Delete media asset, so that 不需要 media version 或 archive lifecycle。
49. As a 內容管理者, I want 任一 draft/published entry 引用時 Replace/Delete 被拒絕並列出 usage, so that current references 永遠可解析。
50. As a 內容管理者, I want featured media 與 custom media fields 選取 exact current asset, so that editor readback 不會指向不存在的 version。
51. As a 多分頁操作者, I want stale Content Type、entry、taxonomy、term 或 media mutation 回 409 且零寫入, so that 舊分頁不會覆蓋較新的 Save。
52. As a 內容管理者, I want legacy entry 仍可檢視與 Delete 但不可 Save, so that 尚未 cutover 的內容不會繼續產生舊 Revision。
53. As a 遷移操作者, I want preflight 自動處理 unpublished current 與 current=published entries, so that 無分歧資料能得到確定 status。
54. As a 遷移操作者, I want 為每個 `published-with-draft` entry 選擇保留 published、current draft 或 current published, so that 單一狀態 cutover 不會猜測內容。
55. As a 遷移操作者, I want 所有分歧 entry 都決定後才原子 cutover, so that runtime 不會同時暴露新舊 lifecycle。
56. As a 平台維護者, I want clean cutover 移除 Revision、Restore、Publish、schema migration、media version 與舊 CMS route 的所有 caller, so that repository 最終只有一套 content lifecycle。

## Implementation Decisions

- **Scope status**：本規格細化已核准但尚未實作的 CMS/Core current-only target。現行 Revision／schema／media version 行為仍由程式碼與測試定義，直到最後 clean cutover 完成。
- **Owner boundaries**：Persistence 擁有 current records、transaction 與 durable CAS；Application 是 CMS authoring 唯一 façade；Authoring API 是唯一 HTTP composition root；CMS 只呼叫 Authoring API。Taxonomy、Media 或 Persistence 不得直接暴露給 browser code。
- **Current Content Type DTO**：`content-type-definition/v1` 以 stable type ID、label/menu metadata、mutable slug、`showInMenu`、ordered field groups、custom field definitions、taxonomy attachments 與 definition state digest 表示完整目前值。`content-type-catalog/v1` 提供按 deterministic code-unit order 排列的 current summaries 與 catalog state digest。Definition Save 是 complete replacement 加 `expectedStateDigest`，回傳含實際配置 slug 的新 definition 與新 digest。
- **Content Type lifecycle**：第一版不提供 deactivate 或 delete。建立後 definition 永遠可由 catalog/direct URL 管理；`showInMenu` 只控制動態 navigation。已有 entries 後由 Application 對新舊完整 definition 做 non-breaking comparison，任何未核准收緊或刪除都在 transaction 前拒絕。
- **Custom field model**：Group、field 與 select option 都使用 server-generated immutable stable ID；顯示 label、help 與 order 可變。Custom values 以 field ID 唯一識別並按 code-unit field ID 排序；single/multi-select 持久化 stable option IDs，不持久化 label。Default 只在 new-entry initialization materialize。
- **Current entry DTO**：`cpt-entry/v1` 提供 stable entry ID、type stable ID、mutable slug、完整 `cpt-content/v1`、status、optional `publishedAt`、last-published digest 與 state digest。`legacy-entry/v1` 另帶 read-only evidence與可用 migration choice，不接受 Save。
- **Content payload**：`cpt-content/v1` 包含 type stable ID、title、沿用 #315 的現有 body-block payload、excerpt、featured media stable ID、SEO、field-ID-sorted custom values。Taxonomy bindings與 media references 是同一 entry state 的 validated relation evidence，不帶 Revision ID。
- **Entry commands**：Save request 是完整 replacement、`status:"draft"|"published"` 與 `expectedStateDigest`；Delete request 是 entry stable ID 與 `expectedStateDigest`。Save／Delete 在同一 transaction 處理 entry、global slug claim、taxonomy/media relations 與 authoring route evidence。沒有 Publish、Restore、history 或第二份 snapshot command。
- **Published time**：Application 對 canonical publishable content 計算 digest。只有 status=`published` 且該 digest不同於 last-published digest 時，才以同一 transaction 寫入 UTC `publishedAt` 與新 digest；status 改為 draft 不清除兩者。
- **Global slug**：所有 entity kind 的 slug claim 存在同一 atomic namespace。Server 由 Content Type／taxonomy／term label、entry title 或 original filename 產生保留 Unicode 的建議值；canonical comparison key 是 NFC → full case-fold → NFC。Create/Rename 在 transaction 中配置 exact requested slug 或最小可用 `-N` 後綴，並於 response 回傳結果。Rename/Delete 同 transaction 釋放舊 claim；不寫 redirect/tombstone。
- **Entry search**：`entry-search-request/v1` 是 read-only exact body，欄位為 typeId、title/slug search、statuses、taxonomy filters、page。`POST /v1/content-types/:typeId/entries/search` 要求 path type ID 與 body typeId 相同。Response 固定 `pageSize:20`，包含 page、totalItems、totalPages、items、stateDigest；invalid page/filter 或 path/body mismatch fail closed，不回 partial result。
- **Taxonomy DTO and commands**：`taxonomy/v2` 表示 stable taxonomy ID、mutable slug、label、immutable hierarchical mode、current terms 與 state digest。Create taxonomy、create/update/retire/delete term 都是 exact command；每個 mutation帶受影響 registry/record 的 `expectedStateDigest`。Category parent 只接受同 taxonomy 的 stable term ID；missing parent、self/indirect cycle、retired parent、used delete或有 children delete都回 stable failure且零寫入。
- **Taxonomy binding**：每個 Content Type 自動附加 Categories `0..1` 與 Tags `0..many`。Custom attachment 固定 taxonomy stable ID、cardinality、required、`allowTermCreation`。Entry Save驗證 live selectable term與 cardinality；既有 retired binding可繼續讀取／保存，但不得新增選取。Inline create 只在 attachment 明確允許時開放。
- **Media DTO**：`media-asset/v2` 提供 stable asset ID、mutable slug、title、可空 alt、caption、description、唯讀 original filename、sniffed MIME、byteLength、checksum、optional image dimensions、uploadedAt、optional content-addressed thumbnail evidence 與 state digest。不存在 asset version、archive status、restore descriptor或 current/latest pointer。
- **Media commands**：Import/Replace 接受 streaming multipart；raw file part最高 400 MiB，所有 metadata parts 合計最高 64 KiB。Metadata Save/Delete 使用 exact JSON command與 `expectedStateDigest`。Replace 同時帶 asset stable ID/state digest；任一 draft/published entry usage 使 Replace/Delete 失敗並回完整 deterministic usage。
- **Media pipeline**：Request body不得完整 buffer或轉 Base64。Server 串流至 staging，同步累計 raw bytes與 checksum，完成後 sniff MIME、驗證 allowlist、取 image dimensions並為 raster image產生 content-addressed thumbnail，再 atomic promote並建立／替換 record。Abort、oversize、invalid MIME、thumbnail或 promote fault在可安全清理邊界移除 staging，且不產生 current record。Retry 是新 request、從 byte 0 開始。
- **Media browser queue**：Queue最多兩個 active uploads。每個 item獨立顯示 sent/total progress、cancel與retry；cancel只中止該 request。UI 不顯示 resume語意。非 raster media只顯示 metadata，不嵌入主動內容。
- **Media binding**：Featured media與 single/multi-media custom value持久化 asset stable ID。Entry Save在同一 snapshot驗證 asset存在、MIME allowlist與max count；media usage同時涵蓋所有 draft/published entry references。
- **Legacy cutover**：Preflight 將無 published selection 的 current映成 draft，current=published映成 published，並列出每個 divergent entry。Divergent choice exact literals為 `keep-published-as-published`、`keep-current-as-draft`、`keep-current-as-published`。缺少、重複、foreign或stale choice使 cutover零寫入；全量 choice與 baseline digest相符時才在單一 atomic boundary產生 current records並停止舊 lifecycle mutation。Revision history不遷移。
- **CMS routes**：Entry documents exact clean cutover為 `/cms/content/:typeId`、`/cms/content/:typeId/new`、`/cms/content/:typeId/:entryId`。Article不使用特例 route。`/cms/entries*` 從 document allowlist、navigation與logger route union移除，不 redirect。
- **Authoring transport**：JSON mutations使用 exact POST command DTO；media bytes route是唯一 streaming multipart例外。既有 finite exact route、loopback-only、same-origin、Cookie/query/Host/Fetch Metadata admission、no-cache/no-store/nosniff/no-referrer，以及 sanitized response/error/log contract不變。所有 mutation只經Application，並以 state digest CAS及single transaction提交。
- **Clean cutover**：最後 contract ticket只有在所有 consumer vertical slices已遷移且驗證後，才移除 raw JSON Schema administration、Revision/history/Restore/Publish、dual preview、schema migration、media version/archive/restore與`/cms/entries*`。不得保留平行 parser、alias、shim或deprecated export。

## Testing Decisions

- Application contract tests是 current data invariant 的主要 seam。測試完整 command／read DTO所觀察到的原子結果：成功 current replacement、stale CAS 409 零寫入、global slug配置／釋放、non-breaking definition gate、publish validation、`publishedAt` transition、real Delete、taxonomy graph與media usage。
- Authoring API contract tests驗證 exact JSON／multipart boundary、finite route admission、path/body identity、status mapping、400 MiB raw file ceiling、64 KiB metadata ceiling、中斷清理及 sanitized output。測試須透過真實 request stream，不能以預先 materialized byte array冒充 streaming proof。
- 真實 `cms:start` Chromium journey 是 CMS最高可觀察 seam。至少驗證 Content Type建立後navigation出現、建立 draft、填入custom/taxonomy/media、Save published、search/filter讀回、stale conflict recovery與Delete消失；沿用#315既有keyboard、focus、status live region與a11y precedent。
- Legacy migration以含 unpublished、equal current/published與三種divergent choice的production-like fixture驗證preflight、全量choice gate、stale baseline、atomic cutover、legacy read-only與Delete。
- Media failure測試涵蓋oversize、MIME偽裝、SVG/HTML/JavaScript/executable、client abort、checksum/thumbnail/promote fault、第三個queue item等待、retry從零，以及referenced Replace/Delete拒絕。每個失敗都驗證沒有可讀asset record或殘留可選staging state。
- 測試只固定consumer可觀察contract、boundary、state transition、precedence與real error。不得assert component props、field forwarding、private storage rows、source text、純DOM存在或mock echo。
- 既有測試若只鎖定將被移除的文案、wire forwarding或舊implementation detail，clean cutover時刪除；真正固定舊public lifecycle的測試則必須改寫為新contract的consumer behavior，不保留雙軌。

## Out of Scope

- Projection、Renderer、Delivery、Public UI與Release transport的實作或重設。
- Public entry flat paths、Content Type／term archives、descendant aggregation、`?page=2` pagination、generic generated pages與route conflict策略。
- Canonical public URL、SEO canonical override、Site Definition `publicSiteUrl` ownership與Release provenance。
- 視覺設計、layout、色彩、typography或CMS重新設計；只沿用現有可操作與accessibility precedent。
- Body-block/editor技術重新選型、relationship field、repeater、nested group、conditional logic。
- Content Type deactivate/delete、scheduled publishing、trash/archive、soft delete、redirect/tombstone、secure erasure舊artifact。
- Resumable/chunked upload、超過兩個browser並行upload、SVG或其他active document preview。
- 新增多使用者、角色、認證、remote authoring或非loopback server能力。

## Further Notes

- Basic Spike Contracts v1 的 current-only CMS/Core章節是本規格的scope authority；本文件不得擴張該章節。
- 現行程式碼與測試仍是implemented behavior的SSOT。文件使用「target」「將」「必須」描述尚未落地內容，直到clean cutover完成後才可更新implemented baseline。
- `publishedAt` 是最後一次實質published Save時間，不是目前publication state；CMS任何判斷都必須讀status。
- Content-hashed artifact仍可維持技術上的immutable bytes，但不屬本輪CMS/Core實作或驗收。
- #315只提供body payload、可操作editor與browser/a11y precedent；其two-step lifecycle由本規格取代。
