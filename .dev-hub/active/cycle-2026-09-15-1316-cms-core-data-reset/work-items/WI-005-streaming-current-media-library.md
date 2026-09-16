---
id: WI-005
status: done
title: 交付 400 MiB 單一媒體庫
work_group: WG-003
depends_on: [WI-001]
---

## Outcome

內容管理者可用最多兩檔並行的browser queue，以單次streaming multipart匯入最高400 MiB檔案，管理單一current media asset的metadata、safe thumbnail、Replace與real Delete，不再操作asset versions或archive/restore。

## Acceptance

- [x] Import以streaming multipart接收一個最高400 MiB raw file part與合計最高64 KiB metadata envelope；400 MiB邊界成功，超一byte或metadata超限在建立asset前失敗，且request bytes不以Base64 JSON或whole-file JavaScript buffer處理。
- [x] Server完成staging→MIME sniff/size/checksum/image dimensions/thumbnail→atomic promote後才回`media-asset/v2`；client abort、invalid MIME、checksum/thumbnail/promote fault清除staging且catalog/detail沒有新record。
- [x] Raster image、PDF、audio、video、plain text可匯入；SVG、HTML、JavaScript、executable與extension/MIME偽裝被拒絕。Raster image回content-addressed thumbnail evidence，其他類型只提供safe metadata。（判定邊界見 `contracts/README.md` 的 WI-005 media public contract：JS 以副檔名與 BOM／空白後的 `#!` shebang 拒絕，純文字中的 script 片段無法與一般文字區分，但媒體庫不提供任何原始 bytes。）
- [x] Browser queue同時最多兩個active uploads；第三個等待。每檔顯示progress、cancel與retry，cancel只終止該檔，retry從byte 0建立新request，UI不宣稱resume。
- [x] Catalog/detail顯示title、slug、可空alt、caption、description，以及readonly original filename、sniffed MIME、byte length、checksum、dimensions、uploadedAt與thumbnail evidence；metadata Save受CAS保護並精確readback。
- [x] 零draft/published reference的asset可streaming Replace或real Delete；Replace保留stable asset ID並更新current byte evidence，Delete後detail不存在且slug可重用。
- [x] 有任何reference時Replace/Delete回完整deterministic usage並零寫入；stale state digest回409且metadata、bytes、thumbnail與slug claim皆不變。
- [x] Response、diagnostic與log不含host/staging/object path、object key、media bytes或raw cause；Application/API streaming contract及真實CMS journey證明成功與所有failure cleanup。

## Notes

- [規格](../../../../specs/cms-core-data-reset.md)
- [#315（沿用 CMS browser/a11y precedent，不沿用media lifecycle）](https://github.com/wahengchang/ai-study-note/issues/315)
- 本 Work Item 必須縱切 Persistence→Core/Application→Authoring API→CMS→behavior tests；不交付resumable/chunked upload或entry media picker。
- v2 media usage ledger 的 entry-side writer 屬 WI-006（entry Save／Delete）與 WI-008（legacy cutover）；本輪只交付讀取與破壞性操作阻擋，因此 HTTP／browser 測試以 `Persistence.replaceEntryMediaReferences` 建立 usage。
