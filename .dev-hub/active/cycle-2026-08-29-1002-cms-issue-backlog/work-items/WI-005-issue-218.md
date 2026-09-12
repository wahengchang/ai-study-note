---
id: WI-005
status: done
title: CMS-BASIC-CONTRACTS-V1｜Plugin host core
work_group: WG-052
depends_on: ["WI-007"]
---

# CMS-BASIC-CONTRACTS-V1｜Plugin host core

## Outcome
完成 [GitHub Issue #218](https://github.com/wahengchang/ai-study-note/issues/218) 的核准結果。

## Acceptance
- [x] repository-external trusted-root discovery 不執行 callback，activation 對 exact manifest identity／hook contract／capabilities 做顯式 fail-closed 驗證：已由合併 [PR #268](https://github.com/wahengchang/ai-study-note/pull/268)、完成 WI-007 與現行 `plugin-host.test.ts` 證明。
- [x] callback 僅由 manifest-declared minimal facade 執行，validator input immutable、priority/Plugin ID deterministic，fault diagnostics 去敏且 command 保持 transaction boundary：已由合併 PR #268 與現行 `plugin-host.test.ts`／`save-revision-plugin-composition.test.ts` 證明。
- [x] inactive／missing／identity-changed editor block 保留 revision source、零 callback execution，只有 exact reactivation 恢復行為：已由合併 [PR #268](https://github.com/wahengchang/ai-study-note/pull/268)／[PR #334](https://github.com/wahengchang/ai-study-note/pull/334) 與現行 `plugin-host.test.ts` 證明。
- [x] public renderer 只接受 sealed published snapshot、token stale/foreign state 拒絕，SEO-only omission 與 generic callback hard failure 分流：已由合併 [PR #324](https://github.com/wahengchang/ai-study-note/pull/324) 與現行 `public-build-snapshot.test.ts` 證明。

## Notes
2026-09-13 closeout traceability：上述四組證據覆蓋 #218 的十七項 user stories、implementation decisions 與 testing decisions；未發現 runtime 或 acceptance 缺口，WG-052 僅記錄既有交付的驗證與 Issue closeout。
