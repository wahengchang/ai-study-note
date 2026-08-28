# CMS Spike 研究歸檔

- **完成時間**：2026-08-26 21:03（本地時間）
- **狀態**：已歸檔；本檔是暫存研究、執行證據與討論文件的單一入口，不是 canonical contract。

## 交付

將原本位於 repository root 的暫存 `project-*`、`spikes/` 與 `docs/` 移入 `logs/2026-08-26-2103-cms-spike-research/`：

| 原始位置 | 正式歸檔位置 | 保留方式 |
|---|---|---|
| `project-2026-08-26-1425/project.md` | `project-records/owner-decisions-and-spike-execution.md` | 保留原始一手決策、Spike 實測與五角色審查內容。 |
| `project-2026-08-26-1254/project.md` | `project-records/module-inventory-and-open-questions.md` | 保留原始模組盤點與 Owner 問題。 |
| `spikes/` | `spike-evidence/` | 保留 SP-001–SP-005、SP-A06 及 consensus replay runner、fixture 與 JSON evidence。 |
| `docs/` | `working-documents/` | 保留 V1 架構候選、V2 handoff、V3 討論與原始文件索引。 |
| `draft/` | `source-drafts/` | 全部為歷史來源、非 contract 的 byte-preserved input；下列逐一列出原始檔案。 |
| `draft/github-pages-web-architecture.md` | `source-drafts/github-pages-web-architecture.md` | 歷史來源、非 contract；原始 bytes 保留。 |
| `draft/github-pages-local-first-blog-engineer-handoff-v0.1.docx` | `source-drafts/github-pages-local-first-blog-engineer-handoff-v0.1.docx` | 歷史來源、非 contract；原始 bytes 保留。 |
| `draft/owlchi-site-rebuild-engineering-handoff.zip` | `source-drafts/owlchi-site-rebuild-engineering-handoff.zip` | 歷史來源、非 contract；原始 bytes 保留。 |

已移除 Python 的可再生 `__pycache__/` 與 Finder sidecar；它們不屬於 evidence。

## 可執行驗證

```sh
python3 logs/2026-08-26-2103-cms-spike-research/spike-evidence/consensus/verify_contracts.py
python3 -m json.tool logs/2026-08-26-2103-cms-spike-research/spike-evidence/consensus/evidence.json >/dev/null
```

預期輸出：`CONSENSUS CONTRACT PASS`。

## 契約與限制

唯一可供後續正式 CMS／renderer implementation 依循的現行 SSOT 是 [`contracts/README.md`](../contracts/README.md)（`CMS-BASIC-CONTRACTS-V1`）。本 archive 的 project、working documents、isolated runners、`source-drafts/` 與 evidence 都是決策來源、歷史輸入、實測紀錄或重跑證據，不能自行升格為 implementation contract。

SP-A01–SP-A05 仍為未啟用的 Advanced scope gate；本次沒有建立正式 CMS application。
