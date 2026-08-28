# 全部已定義 Spike 執行

- **完成時間**：2026-08-26 14:50（本地時間）
- **交付**：SP-001–SP-005 與 SP-A06 全部取得唯一 PASS 結論；`project-2026-08-26-1425/project.md` 每項均更新為 `✅`、包含 winner/rejected rationale、evidence 與更新後 handover。

## 已確認結論

| Spike | 結論 |
|---|---|
| SP-001 | immutable schema versions；revision pin schema version；不相容變更以顯式、transactional backfill 建立新 revision。 |
| SP-002 | immutable revisions + mutable current/published pointers + on-demand `renderer-input/v1` published projection。 |
| SP-003 | Site Definition 的 central global normalized route-claim registry；mutation 前 impact report、atomic update。 |
| SP-004 | checksum-addressed physical objects + logical assets + unique revision-reference registry。 |
| SP-005 | static builder 只讀 versioned published projection，產生 deterministic、repository-subpath-safe artifact。 |
| SP-A06 | trusted local Plugin 的 manual activation；固定 versioned Actions/Filters + manifest capabilities 的 hybrid host。 |

## 證據與實際驗證

每個 runner 與 JSON evidence 都在 `spikes/sp-001/` 至 `spikes/sp-005/` 與 `spikes/sp-a06/`。全部以 Python standard library 的 isolated fixture 實際執行；SP-001/SP-004 使用 SQLite 與 file fault injection，SP-005 實際生成/驗證 static artifact，SP-A06 實際跑完整 activation、fault、deactivation/re-enable lifecycle。

最終驗證命令：

```sh
for runner in spikes/sp-001/schema_evolution_spike.py spikes/sp-002/revision_projection_spike.py spikes/sp-003/global_route_spike.py spikes/sp-004/media_consistency_spike.py spikes/sp-005/renderer_input_spike.py spikes/sp-a06/interactive_demo_spike.py; do python3 "$runner"; done
```

## 已知限制／後續

SP-A06 僅是 isolated prototype，不是正式 Plugin System。SP-A01–SP-A05 沒有在最新版 `project.md` 定義成可執行 Spike，且仍受其 Advanced scope gate 限制；不得將其誤標為已完成。下一步是以已確認 contracts 規劃正式 CMS／renderer implementation。
