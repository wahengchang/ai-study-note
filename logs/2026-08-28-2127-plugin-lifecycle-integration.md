# Plugin lifecycle integration

- **Cycle**：`cycle-2026-08-28-1655-plugin-lifecycle-integration`
- **完成時間**：2026-08-28T21:27:18+08:00
- **狀態**：completed

## 交付

- Durable `plugin_activation_state` v2 migration 與 Store-only CAS。
- Persistence-backed Plugin activation-state adapter。
- exact identity activation、trusted-root revalidation、verified-byte `data:` module runtime、CMS block resolution 與 validator operation snapshot。
- async `DomainApplication.saveRevision` validator composition；只有 current lifecycle state 可寫入。

## 關鍵決策

- activation state digest 與 Persistence lifecycle canonical digest 保持分離。
- Plugin runtime 僅執行已驗證 entry bytes；trusted Plugin ambient Node authority 仍不屬本批 sandbox 範圍。

## 實際驗證

- `node --import tsx --test "tests/core/persistence/*.test.ts"`：10/10 通過。
- `node --import tsx --test "tests/core/plugin-host/*.test.ts"`：8/8 通過。
- `node --import tsx --test "tests/core/application/*.test.ts"`：6/6 通過。
- `npm run check`：62/62 通過。
- `npm run check:ai-sync`：通過。

## 已知限制／後續

無。

## 相關 Branch／PR

- Branch：`cms/plugin-lifecycle-integration`
- PR：https://github.com/wahengchang/ai-study-note/pull/259
