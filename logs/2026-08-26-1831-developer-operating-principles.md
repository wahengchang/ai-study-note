# 開發團隊準則改寫

## 交付

- 依 Owner 校正，將 `MEMORY.md` 改寫為面向架構師與開發同事的開發宣言。
- 移除以讀者、內容創作與公開投影為主的敘事；改以平台核心、擴充、契約、相容性、state ownership、安全與交付方法為主。

## 關鍵決策

- 採用類 WordPress 的「stable core, extensible edge」取向：核心簡單可靠，選擇性能力透過版本化且受控的擴充點提供。
- 相容性、持久化 state、公開 contract、migration 與 deprecation 視為開發承諾，不作為後續補強項目。
- 保留 `CMS-BASIC-CONTRACTS-V1` 指標，避免開發準則取代已核准的精確 implementation boundary。

## 驗證

- `MEMORY.md` 已成功完整覆寫：3,672 bytes。

## 已知限制／後續

- 本文件是長期開發方法，不取代個別 contract、API specification 或 release plan；具體實作以已核准 contract 為準。
