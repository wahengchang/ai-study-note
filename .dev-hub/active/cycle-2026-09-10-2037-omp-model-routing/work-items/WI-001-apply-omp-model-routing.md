---
id: WI-001
status: done
title: 套用 OMP 模型路由
work_group: WG-001
depends_on: []
---

# 套用 OMP 模型路由

## Outcome

模型 catalog 驗證後，套用核准的角色與 reviewer 路由，並同步 canonical AI 指令。

## Acceptance

- `slow` 為 Astra xhigh，原生 reviewer 為 Sol xhigh，security reviewer 為 Astra xhigh。
- DeepSeek reviewer 綁定 V4 Flash high，且自訂定義與內建 reviewer 一致但無 `model` frontmatter。
- core module 的實作計畫要求依 `.rulesync/subagents/` 安排兩個職責不同且均非 owner 的專案子代理交叉審查；platform reviewer 與 DeepSeek `/ai-x` 僅作一般或跨模型第二意見，不能替代此要求。
- 同步、設定與三 reviewer 的實際解析結果通過驗證。

## Notes

使用者核准方案位於 `local://omp-model-routing-plan.md`；catalog 已於 2026-09-10 刷新。