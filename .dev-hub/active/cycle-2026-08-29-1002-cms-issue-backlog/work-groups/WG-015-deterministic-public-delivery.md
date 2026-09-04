---
id: WG-015
status: in_progress
title: Deterministic Public Delivery
work_items: ["WI-027", "WI-028", "WI-030", "WI-029"]
owner: Main
branch: feature/deterministic-public-delivery
worktree: .dev-hub/worktrees/deterministic-public-delivery
pr: https://github.com/wahengchang/ai-study-note/pull/309
---

# Deterministic Public Delivery

## Delivery
完成 Theme Host exact identity、published-only `renderer-input/v1` producer、Plugin public renderer/assets callback、僅消費 immutable bytes 的 Static Renderer，以及 immutable artifact manifest/re-delivery。

## Verification

`npm run check:architecture`、`npm run typecheck` 與 Theme Host／Plugin Host／Projection／Renderer／Delivery／architecture targeted tests 共 46 項皆通過。Renderer 只以 verified entry bytes 載入 Theme／Plugin，拒絕 executable dependency graph 或 promise callback；Plugin callback 接收 frozen `renderer-input/v1` 與 capability/resource facade，輸出僅能成為 staged artifact file。Preview、Public UI、release 與 GitHub Pages 不在本次已完成的 static renderer/delivery slice。

## Review 收斂（2026-09-04）

複審發現並修正：Renderer 與 Delivery 的 artifact path profile 分歧（`public/assets/emit` 端到端不可用）、Renderer 未驗證 extension contract、Theme Host `UNSUPPORTED_RENDERER_CONTRACT` 無 emitting branch、Projection 在無 public renderer Plugin 時 staleness 重驗退化為恆真式、Delivery 固定 staging 目錄的並行破壞、re-delivery 未驗證 artifact 位址與額外 bytes。`npm run check` 全綠（184 tests）。細節見 `logs/2026-09-04-2039-deterministic-delivery-review-fixes.md`。
