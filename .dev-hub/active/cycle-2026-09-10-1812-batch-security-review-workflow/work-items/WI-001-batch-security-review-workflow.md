---
id: WI-001-batch-security-review-workflow
status: done
title: 建立 bounded Cycle 集中安全審查流程
work_group: WG-001-batch-security-review-workflow
depends_on: []
---

## Outcome

以 `docs/dev-hub-workflow.md` 作為唯一正本，建立 bounded Cycle closeout 的單一批次安全審查 gate，並同步日常 agent 路由與生成輸出。

## Acceptance

- 新 bounded Cycle 只在 final Work Group closeout 判定七類明確安全邊界；命中時只對精確 PR heads 建立一份 packet 並執行一次審查。
- 未命中時記錄 `not-required`；命中審查完成才可 closeout，head 變動只由同一 reviewer 重查 delta。
- 一般小型工作、非安全邊界 correctness、core 雙角色預審與一般 review 保持既有規則。
- `.rulesync` canonical 來源與生成輸出經 `npm run sync:ai`、`npm run check:ai-sync` 同步。

## Notes

本 Work Item 是此 bounded Cycle 的唯一交付；不修改既有 umbrella Cycle 的 provenance。
