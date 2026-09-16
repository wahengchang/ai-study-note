---
id: WI-001
status: done
title: 建立 current-only CPT 與全域 slug
work_group: WG-001
depends_on: []
---

## Outcome

內容設計者可在永遠可見的 Content Type Builder 建立與更新 current-only CPT；server 配置 stable ID／global slug，CMS navigation 依 `showInMenu` 即時反映可管理的內容類型，且既有 entry 的 definition 只能做 non-breaking 更新。

## Acceptance

- [x] 從 CMS 建立 CPT 後，readback 回傳 `content-type-definition/v1` stable ID、實際配置 slug、固定 system fields、Categories／Tags attachments 與 state digest；catalog 回傳 `content-type-catalog/v1` 的新項目。
- [x] 跨 entity kind 的相同 Unicode/case-fold slug 競爭會原子配置最小可用 `-2`、`-3` 後綴；rename 釋放舊 claim，後續建立可重用該 slug，且沒有 redirect/tombstone。
- [x] 相同 `expectedStateDigest` 的完整 replacement 可更新 label、help、order、`showInMenu` 或其他核准的 non-breaking 欄位；stale digest 回 409 且 definition、catalog 與 slug claims 全部不變。
- [x] CPT 已有 entry 的 fixture 中，刪 field/option、改 stable ID/type、optional 改 required、縮緊 validation 或移除 taxonomy attachment都被拒絕且資料零變更；新增 optional field／option或放寬 validation 可成功讀回。
- [x] Content Type Builder 永遠出現在 navigation；`showInMenu=true` 顯示 CPT 動態內容選單，false 只隱藏該選單，catalog 與 direct content URL 仍可管理 definition。
- [x] Fresh install 與既有 runtime啟動後都恰有一個 active Article CPT（slug `articles`）及 Categories／Tags；重跑 seed不新增重複 identity或改變 state digest。
- [x] 以 Application contract、exact Authoring API request/response 與真實 CMS browser journey 證明上述成功、CAS、validation及 keyboard/focus/status feedback。

## Notes

- [規格](../../../../specs/cms-core-data-reset.md)
- [#315（body editor 與 browser/a11y precedent；two-step lifecycle 已被本規格 supersede）](https://github.com/wahengchang/ai-study-note/issues/315)
- 本 Work Item 必須縱切 Persistence→Core/Application→Authoring API→CMS→behavior tests；第一版不交付 CPT deactivate/delete。
- WI-001 不 admit `/cms/post`；`showInMenu=true` 僅顯示不可點擊「名稱（內容功能將於下一階段啟用）」項目。WI-002 交付 current entry catalog 後才啟用 canonical post route。
