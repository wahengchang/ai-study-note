---
id: WI-005
status: pending
title: 交付 400 MiB 單一媒體庫
work_group: null
depends_on: [WI-001]
---

## Outcome

內容管理者可用最多兩檔並行的browser queue，以單次streaming multipart匯入最高400 MiB檔案，管理單一current media asset的metadata、safe thumbnail、Replace與real Delete，不再操作asset versions或archive/restore。

## Acceptance

- [ ] Import以streaming multipart接收一個最高400 MiB raw file part與合計最高64 KiB metadata envelope；400 MiB邊界成功，超一byte或metadata超限在建立asset前失敗，且request bytes不以Base64 JSON或whole-file JavaScript buffer處理。
- [ ] Server完成staging→MIME sniff/size/checksum/image dimensions/thumbnail→atomic promote後才回`media-asset/v2`；client abort、invalid MIME、checksum/thumbnail/promote fault清除staging且catalog/detail沒有新record。
- [ ] Raster image、PDF、audio、video、plain text可匯入；SVG、HTML、JavaScript、executable與extension/MIME偽裝被拒絕。Raster image回content-addressed thumbnail evidence，其他類型只提供safe metadata。
- [ ] Browser queue同時最多兩個active uploads；第三個等待。每檔顯示progress、cancel與retry，cancel只終止該檔，retry從byte 0建立新request，UI不宣稱resume。
- [ ] Catalog/detail顯示title、slug、可空alt、caption、description，以及readonly original filename、sniffed MIME、byte length、checksum、dimensions、uploadedAt與thumbnail evidence；metadata Save受CAS保護並精確readback。
- [ ] 零draft/published reference的asset可streaming Replace或real Delete；Replace保留stable asset ID並更新current byte evidence，Delete後detail不存在且slug可重用。
- [ ] 有任何reference時Replace/Delete回完整deterministic usage並零寫入；stale state digest回409且metadata、bytes、thumbnail與slug claim皆不變。
- [ ] Response、diagnostic與log不含host/staging/object path、object key、media bytes或raw cause；Application/API streaming contract及真實CMS journey證明成功與所有failure cleanup。

## Notes

- [規格](../../../../specs/cms-core-data-reset.md)
- [#315（沿用 CMS browser/a11y precedent，不沿用media lifecycle）](https://github.com/wahengchang/ai-study-note/issues/315)
- 本 Work Item 必須縱切 Persistence→Core/Application→Authoring API→CMS→behavior tests；不交付resumable/chunked upload或entry media picker。
