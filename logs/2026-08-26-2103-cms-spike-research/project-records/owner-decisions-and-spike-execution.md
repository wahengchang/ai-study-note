# Owner 決策與 Spike 執行規格

> **建立時間**：2026-08-26 14:25（本地時間）  
> **決策狀態**：Owner 已核准；本文件只定義後續 Spike 的可執行規格，不執行 Spike，亦不建立正式 CMS、renderer 或 Plugin code。  
> **歷史來源**：`project-2026-08-26-1254/project.md` 的 Q-001–Q-012 與既有 SP ID；該工件維持唯讀。V1/V2/V3 文件是證據或候選基線，不是本文件的實作結論。

> **歸檔注記**：本檔由原始 `project.md` 直接移轉，保留 Owner 一手決策、實測結果與多角色審查內容。正文的 `project-*`、`docs/`、`spikes/` 是歸檔前位置；現行映射與重跑方式見 [`../../2026-08-26-2103-cms-spike-research.md`](../../2026-08-26-2103-cms-spike-research.md)。

## 1. Owner 決策

| Question | Owner decision | Resulting boundary | Evidence |
|---|---|---|---|
| Q-001｜Basic module taxonomy | 核准七個 Basic 模組作為責任 taxonomy，不預先鎖定 package 或 code boundary。 | CMS Workspace、Content Core、Media Library、Site Definition、Projection & Preview、Static Rendering & Public UI、Build, Validation & Release 是後續責任分工；實體切分由 Spike 證據決定。 | `project-2026-08-26-1254/project.md:16-22,207`；`docs/v3/user-stories-and-core-modules-discussion.md`。 |
| Q-002｜Schema Core 是否拆分 | Content Type/schema 先留在 Content Core。WordPress 將 Custom Post Type 與 post metadata 視為內容模型的一部分，沒有可直接照搬的獨立 Schema Core。 | 是否拆出 code boundary 仍由 SP-001 證據決定；本輪不設 Schema Core。 | [Custom Post Types](https://developer.wordpress.org/plugins/post-types/)；[Managing Post Metadata](https://developer.wordpress.org/plugins/metadata/managing-post-metadata/)；`project-2026-08-26-1254/project.md:208`。 |
| Q-003｜Site Definition 與 Basic 站點範圍 | 保留獨立 Site Definition。Basic 只含站名、簡短介紹、導覽項目與順序、公開 route/slug/內容階層。 | 視覺外觀屬 Theme；Site Definition 是 route、hierarchy 與 navigation owner。 | `project-2026-08-26-1254/project.md:19,209`；`docs/v3/user-stories-and-core-modules-discussion.md`。 |
| Q-004｜Projection & Preview 獨立性 | 保留獨立責任分類。 | 實體 code boundary 等 SP-002 與 SP-005；不得先把 renderer contract 放回 Content Core。 | `project-2026-08-26-1254/project.md:20,210`。 |
| Q-005｜V1 技術基線 | Node 22、TypeScript、React+Vite、Hono、Zod、Drizzle、SQLite 僅作 Spike 比較 baseline。 | 不核准為 V3 stack；任何 Spike 必須能比較候選，而非把 V1 技術選型升格。 | `project-2026-08-26-1254/project.md:211`；`docs/architecture-v1/2026-08-25-1758-sql-cms/README.md`。 |
| Q-006｜本文 authoring format/editor | 採 WordPress 式結構化區塊編輯：段落、H2–H4、粗體/斜體/連結、編號與項目清單、引用、程式碼、圖片、檔案連結、表格、分隔線與原始 HTML/CSS/JS。 | 每個可執行區塊必填靜態 fallback；CMS 即時 preview 必須 sandbox。公開 raw code 預設取得整頁權限且不另做 opt-in；頁面因此明確放棄完整靜態閱讀保證。source 可呼叫外部 API，但不得含 secret，且不建立本專案 production API/DB/auth。 | [Block Editor Key Concepts](https://developer.wordpress.org/block-editor/explanations/architecture/key-concepts/)；本決策取代 `docs/architecture-v1/2026-08-25-1758-sql-cms/cms.md:64-66` 的 GFM-only／拒絕 raw HTML 候選。 |
| Q-007｜Advanced scope gate | Theme System 與 Plugin System 納入長期範圍。 | CMS 先只共用 application services；Controlled Command API 延後，不提供 CLI/scripts command surface。 | `project-2026-08-26-1254/project.md:213`。 |
| Q-008｜Theme projection input | Theme 只能消費既有 versioned renderer input。 | 新資料由 Content Core/Projection owner 或日後核准的 Plugin capability 增加；Theme 不得暗自建立 canonical fields。 | `project-2026-08-26-1254/project.md:214`。 |
| Q-009｜Plugin schema ownership | 首個 Plugin 只註冊 block、固定 hooks 與明確 capabilities。 | 不宣告 Content Type、field 或 taxonomy ownership；更廣 schema capability 留給 SP-A01 後續判斷。 | `project-2026-08-26-1254/project.md:215`。 |
| Q-010｜Controlled Command caller | Controlled Command 的 caller、scope、idempotency 全部 deferred。 | Plugin 原型不得偷渡 public/local command API；CMS 僅共用 application services。 | `project-2026-08-26-1254/project.md:216`。 |
| Q-011｜Plugin isolation 目標 | Plugin 採本機 folder discovery、CMS 手動啟用；允許任何相容 folder，但只支援 Owner 信任來源的 local package。 | 不承諾惡意第三方 sandbox 或市集。擴充模型為版本化固定 Actions/Filters 加明確 editor/validator/renderer/assets capabilities；直接 SQL/media 存取不是相容 API。 | [Plugin Basics](https://developer.wordpress.org/plugins/plugin-basics/)；[Activation / Deactivation Hooks](https://developer.wordpress.org/plugins/plugin-basics/activation-deactivation-hooks/)；`project-2026-08-26-1254/project.md:217`。 |
| Q-012｜Theme/Plugin 發布位置 | 內建一個無品牌視覺風格、但語意 HTML、導覽與 a11y 完整可用的 default Theme。Theme 作者在檔案系統複製 folder，改 manifest/templates/CSS/JS；CMS 只做偵測、驗證、候選預覽與切換。 | Active Theme/Plugin version 是下一次 build input，不重發 Entry。artifact manifest 必須記錄版本；舊 artifact 可原樣重交。 | `project-2026-08-26-1254/project.md:218`；`docs/v3/advanced-user-stories-and-core-modules-discussion.md`。 |

## 2. 決策後系統邊界

- **Plugin lifecycle**：停用後 hooks/capabilities 不再執行，revision data 保留。下一次 build 移除其 public output 並列 diagnostics；既有 artifact 不變。此規則取代非 canonical Advanced story `docs/v3/advanced-user-stories-and-core-modules-discussion.md:46` 的「有引用即阻止停用」規則，兩者不得同時適用。
- **Plugin errors**：Active Plugin 的 validation 或 render error 使整次 operation/build 失敗，diagnostic 必須指出 Plugin、hook/capability 與 Entry。
- **Interactive Demo Plugin**：HTML/CSS/JS source 跟隨 Entry revision 保存；CMS 即時 preview 與公開輸出都在 sandbox。Plugin 提供功能性樣式；Theme 只能經文件化 class/CSS variables 覆寫外觀。
- **Raw article code 例外**：原始 HTML/CSS/JS block 的 CMS preview 必須 sandbox，公開輸出則預設有 full-page privilege。其 fallback 必須靜態建入；即使可第三方 API call，source 仍不得含 secret，且不得依賴本專案 production API/DB/auth。此 Owner 例外表示該 raw-code 頁不保證完整靜態閱讀。
- **版本與權限邊界**：Theme 只讀既有 versioned renderer input；Plugin 只經 host application services 進入既定 capabilities。無正式 schema、renderer、Theme/Plugin manifest 或 Controlled Command API 在本輪產生。

## 3. Basic P0 Spike 執行規格

### SP-001｜Content schema evolution
**Status**：✅ 假設成立，可行（2026-08-26）。


**Core question**：哪一種 Content Type schema evolution model 能保留歷史 revision、明示 transition 並安全 rollback？

**Prerequisites**：Q-001、Q-002、Q-006；固定 Content Type `note`、兩筆 Entry 與至少三個 immutable revisions。V1 `post_type_schema_versions`、`field_definition_versions` 與 revision pinning 僅為 candidate baseline/reference。

**Candidates**：
1. 完整 immutable schema versions；Entry revision pin schema version，不相容變更以新 revision backfill。
2. additive-only schema；首版只允許新增 optional field，其餘變更拒絕。
3. mutable current schema + runtime coercion；historical revision 不 pin 完整 schema。

**Fixture**：schema v1 為 required `title:text`、optional `difficulty:integer`、structured `body`；建立一筆已發布與一筆未發布 Entry，至少建立 `note-1@rev-001`、`note-1@rev-002`、`note-2@rev-001`。依序測新增 optional field、帶/不帶 default 的新增 required field、`difficulty` integer→select、field key rename、移除仍被 current/published/historical revision 使用的 field，以及失敗 rollback。所有 fixture ID、輸入 bytes 與時間 `2026-08-26T00:00:00Z` immutable；每 candidate 使用獨立可變 state。

**Procedure**：每步先保存 schema/revision byte digest；套用 candidate 變更，重新驗證舊 revision，建立新 revision，嘗試 restore 舊 revision；在失敗案例後執行 candidate 的 rollback/reconciliation。

**Evidence to capture**：SQL rows/constraints、migration report、validation errors、transaction rollback、schema/revision 前後 digest、restore 結果與 allowed/blocked transition 清單。

**Decision rule**：winner 必須保留舊 revision byte-for-byte、明確列 allowed/blocked transitions、使不相容 migration 全有全無、可還原舊 revision，且未處理資料不得默默 coercion/drop。多者通過時，表達規則最少且資料複製最少者勝；無一通過回報 `BLOCKED_SCHEMA_MODEL`，不得拼接混合方案。

**Stop condition**：三個 candidates 都完成同一 fixture 後立即套用 decision rule；選出唯一 winner 即停止。

**Rejected when**：改寫 historical bytes、默默丟值、partial commit，或無法 restore 的 candidate 一律淘汰。

**Execution deliverables**：transition matrix、fixture/runner、原始 evidence、winner/rejected rationale，以及供 SP-002 使用的最小 schema-version contract；不得產出正式 migration。

#### 執行結果（2026-08-26）

**Winner：Candidate 1 — immutable schema versions + revision pinning。**每個 Entry revision 保存 immutable `data_bytes` 與 `schema_version`；schema 也保存 immutable `spec_bytes`。不相容 type/key change 必須提供顯式 mapping/backfill，並於同一 transaction 只產生新的 revision；既有 bytes 不可改寫。restore 舊 revision 必須產生新的可追溯 revision，沿用來源 schema pin 與相同 bytes。

**Allowed**：新增 optional field；新增有 default 的 required field（只影響新 revision）；有顯式 backfill 的 type/key change；建立新 revision 的 restore。  
**Blocked**：沒有 backfill 的 required field；沒有 migration 的 type/key change；仍被 historical/current/published revision 使用的 field removal；任何 partial schema/revision commit。

**Rejected**：

1. Candidate 2 additive-only schema：只能新增 optional field，無法支援 required/type/key 的顯式 migration。
2. Candidate 3 mutable current schema + runtime coercion：`note-1@rev-001` 的 `difficulty: 1` 在 current schema 變為 select 後被改解讀成 `beginner`；historical bytes 雖不變，revision 語意漂移。

**Evidence**：`spikes/sp-001/schema_evolution_spike.py`、`spikes/sp-001/evidence.json`、`logs/2026-08-26-1436-sp-001-schema-evolution.md`。runner 以固定 fixture `note-1@rev-001`、`note-1@rev-002`、`note-2@rev-001` 與 `2026-08-26T00:00:00Z` 驗證 winner；SQLite immutable triggers、foreign key、digest preservation 與 failed-transaction rollback 均通過。

### SP-002｜Revision / current / published / projection model
**Status**：✅ 假設成立，可行（2026-08-26）。


**Core question**：哪一種 revision/pointer/projection model 能隔離草稿並產生 deterministic、versioned public renderer input？

**Prerequisites**：SP-001 winner，沿用其 schema-version contract。所有 Basic Spikes 共用 SP-001 的 immutable fixture IDs 與固定時間；不得共享可變測試 state。

**Candidates**：
1. immutable Entry revisions + mutable current/published pointers + on-demand versioned projection。
2. immutable Entry revisions + mutable current/published pointers + materialized immutable projection snapshots。
3. mutable draft owner + separate immutable published snapshots。

**Fixture**：`note-1` 建 `rev-001` 並發布，再建含唯一 draft-only marker 的 `rev-002` 草稿；指定 `rev-001` 再發布；restore `rev-001` 必須新增可追溯 current revision、不可刪歷史。加入引用 archived media 的 revision，restore 必須被阻止；同時保留一個 taxonomy revision reference。

**Procedure**：每次 save/publish/restore 前後擷取 owner pointers、revision/projection hashes、preview input 與 public renderer input；逐 byte 搜尋全部 public inputs 中的 draft-only marker；對相同 published state 連續產生兩次 renderer input 並比較 hash。

**Evidence to capture**：state-transition trace、pointer/projection diagrams、revision/projection/input hashes、public-input leak scan、archived-media restore diagnostic 與 repeat-hash 結果。

**Decision rule**：winner 必須證明 draft marker 永不進 public input、指定 revision 可發布、restore 可追溯、archived-media rule fail closed、renderer input 有明確 version，且相同 state 產生相同 bytes。materialized 與 on-demand 同時通過時，以不需第二份 canonical content、仍可版本化者勝；無一通過回報 `BLOCKED_REVISION_PROJECTION_MODEL`。

**Stop condition**：完成所有 state transitions、leak scan 與 repeat-hash 後選出唯一 winner 即停止。

**Rejected when**：draft marker 外洩、restore 覆寫歷史、public input 無 version，或同 state input hash 不同，即淘汰。

**Execution deliverables**：state-transition trace、pointer/projection diagrams、fixture/runner、public-input leak check、winner contract 與 rejected rationale；供 SP-003 與 SP-005 使用。

#### 執行結果（2026-08-26）

**Winner：Candidate 1 — immutable revisions + mutable current/published pointers + on-demand versioned projection。**公開 renderer input 固定為 `renderer-input/v1`，只從 `published_revision_id` 投影；`current_revision_id` 的草稿永不進 public input。restore 只複製目標為新的 immutable revision，絕不覆寫歷史；引用封存 media 的 restore fail closed。

Candidate 2 通過安全不變量但需保存第二份 immutable projection snapshot；在 Candidate 1 同樣 deterministic 時資料複製較多，依 tie-break 淘汰。Candidate 3 的 mutable draft 無 immutable current revision identity，不能保證 restore trace，淘汰。

**Evidence**：`spikes/sp-002/revision_projection_spike.py`、`spikes/sp-002/evidence.json`。固定 fixture 證明 draft marker 無外洩、指定 published revision 可重複投影相同 bytes、restore 產生 `rev-003`，且 archived media restore 被阻擋。

### SP-003｜Global route ownership and conflict
**Status**：✅ 假設成立，可行（2026-08-26）。


**Core question**：哪一種全域 route ownership model 能在 mutation 前為 Entry、archive 與 reserved path 唯一歸屬並列完整 impact？

**Prerequisites**：Q-003、SP-002 winner；Site Definition 是 route/hierarchy/navigation owner。沿用 shared immutable fixture IDs/fixed time，但 candidate state 獨立。

**Candidates**：
1. central global route-claim registry with owner/source records（V1 baseline/reference）。
2. route uniqueness 分散在 Entry/taxonomy/site owners，另做跨 owner conflict check。
3. renderer/build-time route generation and collision detection。

**Fixture**：root Entry `/notes/`、child `/notes/intro/`、taxonomy archive `/topics/`、term `/topics/ai/`、reserved `/assets/`。依序嘗試 Entry 搶 `/topics/`、taxonomy base 搶 `/notes/`、parent `/notes/` 改為 `/learn/`、published parent 與 modified child 分岔、Unicode/case-equivalent slug，以及失敗 transaction rollback。

**Procedure**：每 candidate 先列全域 claim owner matrix，再執行 route/hierarchy change；保存前產生衝突 owner 與完整 impact list，再捕捉 affected descendants、current/published impact、變更前後 claims 與 public route list。

**Evidence to capture**：claim taxonomy、collision/impact matrix、mutation 前 impact report、atomicity evidence、rollback 後 claims/public route list。

**Decision rule**：winner 對 Entry、archives、reserved paths 提供單一 owner，所有衝突 fail closed，hierarchy change 先完整列 impact 且 current/published graph 不互相覆蓋。只有 build-time 才能發現跨 owner collision 視為失敗；無一通過回報 `BLOCKED_GLOBAL_ROUTE_MODEL`。

**Stop condition**：所有 collision/hierarchy cases 跑完、每次 mutation 前能產出完整 impact list 後套用 rule；選出唯一 winner 即停止。

**Rejected when**：只在 build 才發現衝突、允許重複 path，或失敗 migration 留下 partial claims，即淘汰。

**Execution deliverables**：claim taxonomy、collision/impact matrix、fixture/runner、atomicity evidence、winner contract 與 rejected rationale；不得把 V1 baseline/reference 的 `route_claims` table 名寫成 final schema。

#### 執行結果（2026-08-26）

**Winner：Candidate 1 — central global route-claim registry。**Site Definition 擁有唯一的 normalized claim registry；每筆 claim 記錄 owner/source。Entry、taxonomy/archive 與 reserved paths 都先在同一 registry 檢查，衝突一律在 mutation 前 fail closed。parent route move 先輸出完整 descendant impact，再用單一 atomic operation 更新 claims。

NFC + casefold + canonical slash 使 `/LEARN/INTRO/` 與既有 `/learn/intro/` 視為同一 claim。Candidate 2 的 ownership 分散，無法提供單一 mutation 前 ownership source；Candidate 3 在 build 才發現 collision，均淘汰。

**Evidence**：`spikes/sp-003/global_route_spike.py`、`spikes/sp-003/evidence.json`；包含 Entry/taxonomy/reserved collision、parent/child impact、case-equivalent collision 與 rollback hash。

### SP-004｜Media bytes/reference consistency
**Status**：✅ 假設成立，可行（2026-08-26）。


**Core question**：哪一種 media storage/reference model 能在 bytes、metadata 與 revision references 間維持可解釋的一致性？

**Prerequisites**：SP-001 與 SP-002 winners；沿用 revision 與 archived-media restore 規則。沿用 shared immutable fixture IDs/fixed time，但 candidate state 獨立。

**Candidates**：
1. checksum-addressed physical objects + logical assets + unique revision-reference registry（V1 baseline/reference）。
2. 每個 logical asset 擁有獨立 bytes copy，references 只指 asset。
3. revision 直接保存 local file path，沒有 central reference registry。

**Fixture**：兩次匯入同一 bytes，建立兩個 logical assets；Entry `note-1@rev-001` 引用 asset A、`rev-002` 換成 B；archive/restore A、嘗試 restore `rev-001`、建立 published selection。另模擬 temp write 後 DB failure、DB intent 後 file promote failure、以及 shared bytes 仍有 owner 時 archive。

**Procedure**：每步擷取 DB/reference graph、file tree、SHA-256、availability、current/published/historical usage 與 artifact selection；每個 fault injection 重啟 reconciliation 或 rollback 後再擷取。不得手動刪檔修復 fixture。

**Evidence to capture**：state/ownership matrix、fault-injection runner output、hash/reference evidence、reconciliation/rollback trace、archive/restore 與 published selection 結果。

**Decision rule**：winner 必須在 import/replace/archive/restore/revision restore/published selection 全程維持 metadata、registry、bytes 一致；duplicate bytes 不產生不可辨識副本；任何 historical/current/published reference 都不可失效；unsafe restore 必須被阻止。無一通過回報 `BLOCKED_MEDIA_CONSISTENCY_MODEL`。

**Stop condition**：normal flow 與所有 fault-injection cases 完成，且重啟後 state 可解釋時套用 rule；選出唯一 winner 即停止。

**Rejected when**：orphan bytes、dangling reference、duplicate outcome、archive 刪除 shared bytes，或 unsafe restore 成功，即淘汰。

**Execution deliverables**：state/ownership matrix、fault-injection runner、hash/reference evidence、winner contract 與 rejected rationale；供 SP-005 的 published media fixture 使用。

#### 執行結果（2026-08-26）

**Winner：Candidate 1 — checksum-addressed physical objects + logical assets + unique revision-reference registry。**相同 SHA-256 bytes 只保存一份 physical object；logical asset 分別保存 authoring identity 與 availability；revision reference 只指向 asset。temp-write/DB failure 與 DB-intent/file-promote failure 都經 reconciliation 清除 orphan/dangling state；shared bytes 在 archive 時保留，archived asset 會阻擋不安全 revision restore。

Candidate 2 對同一 bytes 建立兩份 physical copies；Candidate 3 只保存 local path，archive 後會留下無法預先辨識的 dangling reference，均淘汰。

**Evidence**：`spikes/sp-004/media_consistency_spike.py`、`spikes/sp-004/evidence.json`；實際 SQLite/file fixture 包含 duplicate import、archive/restore、published selection 與兩個 fault-injection reconciliation。

### SP-005｜Renderer input and deterministic static output
**Status**：✅ 假設成立，可行（2026-08-26）。


**Core question**：哪種 renderer input 能在不讀 authoring state 的前提下，產生 deterministic、repository-subpath-safe 的完整 static artifact？

**Prerequisites**：SP-001–SP-004 winners；Q-004、Q-005、Q-006、Q-008、Q-012；使用內建無品牌視覺風格 default Theme。沿用 shared immutable fixture IDs/fixed time，但 candidate state 與 build output directory 獨立。

**Candidates**：
1. builder 直接讀 SQLite。
2. builder 只讀 versioned projection。
3. builder 只讀 Markdown/export bundle。

三者都必須以同一 published fixture 產出相同 route/content set；V1 baseline/reference 不得預選 direct SQLite。

**Fixture**：一篇含技術筆記標準 blocks、media、taxonomy/tag、parent/child route 的 published Entry；其 current draft 含唯一 marker。另一篇含 raw HTML/CSS/JS 與 required fallback。repository subpath 固定 `/ai-study-note-reset/`；locale、timezone、time、排序、Theme version、input timestamps 固定。

**Procedure**：每 candidate 連續 build 兩次至隔離目錄，計算逐檔與總 manifest hash；解析完整 HTML，驗證 single/archive/taxonomy/tag/hierarchy routes、相對 repository subpath 的 links/media、fallback/raw-code bytes。搜尋 draft marker、local filesystem paths，以及 renderer 對 authoring SQL、project-owned production API/auth 的 runtime references。raw code 可有 Owner 允許的第三方 API call，但另驗證其中無 secret。斷開 authoring DB 後實際開啟 artifact：非 raw-code 頁必須完整可讀；raw-code 頁只驗證 fallback 已建入，並明列其 runtime 可破壞閱讀的 Owner 例外。

**Evidence to capture**：三個 candidate adapters/fixtures、artifact hash manifest、HTML/link/media verifier、draft-leak 與 runtime-reference scans、secret scan、斷開 DB smoke 結果、winner/rejected rationale。

**Decision rule**：winner 必須 byte-deterministic、只含 published state、repository-subpath-safe、輸出完整 HTML/routes/media，並可用 versioned renderer input 解釋 provenance。多者通過時，以 build 與 canonical SQL 解耦、input surface 最小者勝；Markdown candidate 無法無損承載 structured blocks/references/raw source 即淘汰。無一通過回報 `BLOCKED_RENDERER_INPUT_MODEL`。

**Stop condition**：三個 candidates 各完成兩次 build、runtime smoke 與所有 verifier 後套用 rule；選出唯一 winner 即停止。

**Rejected when**：讀 draft、需要 authoring SQL/project-owned production API/auth、產生 broken subpath URL、漏 route/media，或相同 input hashes 不同，即淘汰；raw block 的第三方 API call 不適用此淘汰條件。

**Execution deliverables**：三個 candidate adapters/fixtures、artifact hash manifest、HTML/link/media verifier、draft-leak evidence、winner renderer-input contract 與 rejected rationale；仍不得建立正式 Theme/Plugin manifest。

#### 執行結果（2026-08-26）

**Winner：Candidate 2 — builder 只讀 versioned projection。**正式 build input 固定為 `renderer-input/v1` published projection；builder 不得連 authoring SQLite。以固定 Theme/base path/timestamps 連續 build 產生相同 manifest；HTML routes、taxonomy、media、`/ai-study-note-reset/` links、sandbox raw block 與 static fallback 都通過 verifier，且沒有 draft marker、local path、secret 或 project-owned API/auth runtime dependency。

Candidate 1 在 authoring DB 斷開後不能重建 artifact；Candidate 3 的 Markdown bundle 無法無損保留 structured raw block、fallback 與 logical media reference，淘汰。

**Evidence**：`spikes/sp-005/renderer_input_spike.py`、`spikes/sp-005/evidence.json`；包含實際 artifact repeat-build manifest、DB-disconnect smoke 與 HTML/link/media/leak verifier。

## 4. Advanced Plugin 原型 Spike 執行規格

### SP-A06｜Interactive Demo Plugin prototype
**Status**：✅ 假設成立，可行（2026-08-26）。


**Core question**：版本化固定 Actions/Filters 加明確 capabilities，能否讓 trusted local Plugin 以 folder discovery/manual activation 完成 CMS UI、revision data、validation、preview、public render/assets、deactivation 與 build provenance 的完整垂直切片，而不直接寫 SQL/media 或建立 Controlled Command API？

**Prerequisites**：SP-001–SP-005 都有 winner；任一 Basic Spike blocked，SP-A06 維持 pending。使用其實際選出的 schema/revision/route/media/renderer contracts，不另造第二套 host state。

**Candidates**：
1. Owner 指定 hybrid：固定、版本化 Actions/Filters + manifest editor/validator/renderer/assets capabilities。
2. hooks-only negative control：所有 UI/data/render integration 都用 Actions/Filters。
3. capabilities-only negative control：不提供 lifecycle Actions/Filters。

Hybrid 是受驗證目標，不因 Owner 偏好免除 failure gate；兩個 negative controls 只證明缺失/tradeoff，不得在本 Spike 改選為正式方向。

**Fixture**：一個 minimal host、default Theme、兩筆 Entry revisions，及單一 `Interactive Demo Plugin` folder。Plugin manifest 宣告 editor block、validator、public renderer、public assets 與 hook contract version；Entry block 含 HTML/CSS/JS source、required fallback 與 stable block identity。

**Procedure**：
1. folder 出現時，CMS 只列出、不載入；manual activate 前驗證 manifest/version/capabilities，顯示 trusted-code warning。
2. 啟用後顯示 HTML/CSS/JS panels 與 live sandbox preview；save/publish 後證明 source/fallback 跟 Entry revision 保存。
3. 經固定 Actions/Filters 產生 ordered hook trace：Actions 無 return value，Filters 接 immutable input 並回 replacement；按 explicit priority、再按 Plugin ID 穩定排序。大型 integration 只走 manifest capability。
4. 建置 public sandboxed Demo 與 Plugin 功能性 CSS；Theme 只經文件化 class/CSS variables 覆寫。
5. 注入 validator 與 renderer exception；active error 必須使 operation/build fail，diagnostic 指出 Plugin、hook/capability、Entry。
6. manual deactivate 後保留 revision data，editor 顯示 inactive block；新 build 移除 Demo output 並列 diagnostics，舊 artifact 不變。re-enable 後同一 revision 恢復。folder missing 視同 inactive，不執行 migration。
7. 不重發 Entry，只切 active state 各 build 一次；比較 artifacts。manifest 記錄 Theme/Plugin id/version/hashes；舊 artifact re-delivery bytes 不變。

**Evidence to capture**：manifest validation、activation/deactivation state、revision hashes、hook order trace、capability calls、CMS preview capture、public HTML/assets、active-error diagnostics、inactive-omission diagnostics、artifact manifests/hashes、host application-service access trace；trusted package 雖有 process 權限，直接 SQL/media 是 unsupported contract violation。

**Decision rule**：Hybrid 原型必須使 UI/data/public/lifecycle/error attribution 全部可觀察，停用/re-enable 不遺失 revision source，inactive omission 與 active failure 不得混淆，hook order deterministic。達成則 SP-A06 `PASS` 並列出仍需 SP-A01–SP-A05 回答的部分；若需 arbitrary hook names、直接 SQL/media 或 public runtime API 才能完成，回報 `BLOCKED_PLUGIN_HOST_MODEL`。

**Stop condition**：完整 lifecycle、fault injection、active/inactive build 與 re-delivery 完成即停止；prototype 不進 production。

**Rejected when**：host candidate 無法歸因錯誤、hook order 不穩、停用丟 revision data、inactive output 未移除、active error 被吞掉，或引入 Controlled Command API，即淘汰。

**Execution deliverables**：可運行 isolated prototype fixture、host/Plugin contract draft、hook trace、CMS/public screenshots 或 captured HTML、activation/deactivation/build trace、artifact provenance comparison，以及 SP-A01–SP-A05 各自已證實/仍未回答清單。Prototype 不是 production Plugin System，不得直接搬進正式 source。

#### 執行結果（2026-08-26）

**PASS：hybrid fixed versioned Actions/Filters + manifest capabilities。**trusted local folder 只被 discovery 列出，manual activation 驗證 `plugin-hooks/v1`、editor-block/validator/renderer/assets capability 後才載入。Actions 依 priority、Plugin ID 穩定排序且無 return；Filters 接 immutable input、回傳 replacement。大型 CMS/public integration 只經 manifest capability 與 host application services，沒有 direct SQL/media 或 Controlled Command API。

同一 Entry revision 保存 HTML/CSS/JS source 與 required fallback；CMS/public preview 都是 sandbox。active validator/renderer exception 會使 save/build 失敗，diagnostic 指向 Plugin、capability、Entry；deactivate 保留 revision data、讓新 artifact 移除 Demo 並記錄 inactive diagnostic，re-enable 後同 revision 恢復，舊 artifact bytes 不變。hooks-only 與 capabilities-only 均只保留為 negative control。

**Evidence**：`spikes/sp-a06/interactive_demo_spike.py`、`spikes/sp-a06/interactive-demo-plugin/manifest.json`、`spikes/sp-a06/evidence.json`。本 fixture 是 isolated prototype，非 production Plugin System；SP-A01–SP-A05 的 schema ownership、migration/isolation、Theme contract、Controlled Command、完整 provenance 仍待各自 Spike。

## 5. 執行順序與交接

1. 執行 SP-001，取得唯一 winner 或 `BLOCKED_SCHEMA_MODEL`。
2. 僅在 SP-001 有 winner 時執行 SP-002。
3. 僅在 SP-002 有 winner 時，SP-003 與 SP-004 可平行，且各自維持獨立可變測試 state。
4. 僅在 SP-001–SP-004 都有 winner 時執行 SP-005。
5. 僅在 SP-001–SP-005 都有 winner 時執行 SP-A06。

各 Spike 只交付其 runner、fixture、原始 evidence、transition/impact matrix 與 winner/rejected rationale；任何 `BLOCKED_*` 結果停止其下游，不能用未測試的混合 model 補洞。

## Handover

- **Current state:** consensus-accepted
- **Completed:** Q-001–Q-012 Owner 決策；SP-001–SP-005 Basic P0 winners 與 contracts；SP-A06 Interactive Demo Plugin prototype PASS；五角色審查全部 `ACCEPT`。
- **Blockers:** 無；未執行的 SP-A01–SP-A05 不是本檔定義的 executable Spike，保留其各自 scope gate。
- **Next:** 以 `CMS-BASIC-CONTRACTS-V1` 規劃正式 CMS／renderer implementation；只有 Owner 啟用對應 Advanced scope 時才規劃 SP-A01–SP-A05。
- **Target:** 本檔的 Q-001–Q-012、SP-001–SP-005、SP-A06 IDs。

## 6. 五角色審查後的契約收斂

首輪五角色審查指出原始 isolated candidate runner 的跨 Spike 接線、防呆與部分 fault evidence 不足；其歷史 evidence 保留，不再單獨作為 implementation contract。唯一 canonical source 改為 [`../../../contracts/README.md`](../../../contracts/README.md)（`CMS-BASIC-CONTRACTS-V1`），並由 [`../spike-evidence/consensus/verify_contracts.py`](../spike-evidence/consensus/verify_contracts.py)／`evidence.json` 以跨契約 fixture 驗證。

此 revision 明確補上：schema/revision append-only constraint、composite pointer FK、complete migration cutover、restore lineage、current/published route graphs、published media selection 與 restart reconciliation、唯一 `renderer-input/v1` contract、preview isolation、raw article/plugin sandbox 的不同公開邊界、artifact manifest/provenance，以及 Plugin callback/active-state boundary。

五個角色最終 verdict 均為 `ACCEPT / CONSENSUS_ACCEPTED`：Domain & Application、Data & Media、CMS Workspace、Projection & Preview、Public Delivery。[`../spike-evidence/consensus/verify_contracts.py`](../spike-evidence/consensus/verify_contracts.py) 最終重跑通過；沒有 remaining HIGH 或 MEDIUM substantive finding。
