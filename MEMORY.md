# CMS 專案長期原則

本專案自建 JavaScript／TypeScript local-first CMS：authoring canonical state 與 media 留在本機，公開端只服務 published projection 的 immutable static artifact。它借鏡 WordPress 的穩定核心與受控擴充哲學，但不採用其程式碼或 runtime。

## 架構邊界

- Core 是最小可信任內核；共通且長期必要的 domain logic 可進 core，特定產品能力經 Plugin／Theme 與 versioned Hook API 擴充。
- 已公開的 API、Hook、資料結構與 wire contract 不可無版本破壞；需要新能力時先定義明確 contract。
- Plugin／Theme 不得繞過 owner boundary、Persistence、Media 或 transaction；失敗保留結構化、可行動且去敏的結果。
- 優先使用無聊、可預期的設計，不為假設中的需求預建抽象；安全、可觀測與可修復是功能本身。

## 工作方式

- 先由 `contracts/README.md` 定義核准 scope，再交付最小垂直切片：API/contract、migration、測試與文件一起完成。
- 測試真實 consumer 可觀察的正常、拒絕、衝突與復原行為，不測 private plumbing。
- 長期 Owner 決策記入 [ADR](docs/adr/README.md)；已核准 migration boundary 見 [contracts/README.md](contracts/README.md) 與 ADR，不在本檔重述 wire 細節。
