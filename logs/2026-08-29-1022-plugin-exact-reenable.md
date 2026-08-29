# Plugin exact re-enable 交付紀錄

- **完成時間**：2026-08-29T10:22:33+08:00
- **Cycle**：`cycle-2026-08-28-1655-plugin-lifecycle-integration`
- **Work Item**：`WI-001`
- **狀態**：done

## 交付

- 將 Plugin activation state 的 evidence drift 以一次 CAS durable latch 到 `reactivationRequired`；只有同一 exact identity 的明確 `activate()` 能恢復 active。
- trusted root、manifest、entry 與 resource evidence 依 missing／mismatch／invalid-root 分類；root identity 失效固定 fail closed 且不寫 activation state。
- 完成 CMS editor-block resolution：active、inactive、missing、identity-changed 四態保留 canonical source evidence；只有 exact active state 會以 verified entry bytes 載入並呼叫 callback。
- callback input 與 facade 為最小 frozen DTO；callback exception、thenable 與無效 output 回傳 sanitized stable failure。
- SaveRevision validator preparation 先完成完整 active evidence preflight，drift 或 stale state 不會進入 module execution。
- 同步 Plugin Host 實作文件、WI-001 與 Dev Hub overview projection。

## 關鍵決策

- missing／mismatch 僅在可信 root 內已確認後才 latch；runtime trusted-root replacement 或 mode drift 不足以安全歸類單一 Plugin，故保持 state 不變並回 `INVALID_TRUSTED_ROOT`。
- revision 想要的 identity 與健康 active installed identity 不同時，只回 `identity-changed`，不誤 latch 健康 active identity。

## 實際驗證

- `node --import tsx --test tests/core/plugin-host/plugin-host.test.ts tests/core/plugin-host/locale-determinism.test.ts`：13 個測試通過。
- `npm run dev-hub:overview && npm run dev-hub:overview:check && node --import tsx --test tests/scripts/render-dev-hub-overview.test.ts`：12 個測試通過。
- `npm run check`：typecheck、architecture checker 與 86 個測試全部通過。
- `npm run check:ai-sync`：通過；清除 worktree 內 macOS `._*` metadata 副作用，未改變產品行為。

## 已知限制／後續

- WI-002、WI-003 仍 pending，WG-001 與 Cycle 維持進行中。
- `MEMORY.md` 不需更新：本次僅履行既有 Plugin Host contract，未新增跨工作階段架構決策。

## 相關 Branch／PR

- Branch：`cms/plugin-lifecycle-integration`
- PR：尚未建立
