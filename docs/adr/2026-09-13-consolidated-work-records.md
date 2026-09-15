# ADR：以少量主題摘要取代逐工作 log

- **日期：** 2026-09-13
- **狀態：** 已接受
- **相關：** [工作紀錄](../../logs/README.md)、[文件維護規則](../INDEX.md#維護規則)

## 決策背景

逐一大型工作建立 log 造成根目錄累積大量近似紀錄；重要決策分散，讀者需掃描多個日期檔才能理解現況。

## 決策

`logs/` 根目錄只保留 README 與三份時間/主題摘要。長期 Owner 決策使用 ADR；已核准範圍使用 contract；逐次交付、review 與完整測試輸出以 Git history、PR、Dev Hub completed summary 與程式測試追溯。

## 後果

- 不再為每個大型工作新增獨立 root log。
- 新摘要只能記錄跨階段交接需要的 stable facts，不能複製 contract 或測試細節。
- 需要追查某次變更時，從摘要定位領域後使用 Git/PR，而非重建逐次 log。
