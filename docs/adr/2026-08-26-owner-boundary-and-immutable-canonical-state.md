# ADR：Owner boundary 與 immutable canonical state

- **日期：** 2026-08-26
- **狀態：** 已接受
- **相關：** [implementation contract](../../contracts/README.md#scope-and-authority)、[Core platform 工作摘要](../../logs/2026-08-25-2026-09-03-core-platform.md)

## 決策背景

跨 domain command 若能直接存取各 owner 的 storage，會繞過 validation、lineage 與 transaction integrity，並讓 extension 依賴 private shape。

## 決策

每個 domain 僅經其 root public entry 暴露能力。Revision、schema version 與 revision evidence append-only；Application 只協調 public owner seam，所有 canonical write-set 由既有 transaction atomic commit。

## 後果

- Core/extensions 不可跨越 owner private module import；apps 不可直接呼叫 Persistence、Media、PluginHost 或 Projection internals。
- rejected preflight、constraint 與 fault 必須零 canonical mutation，並回傳 stable sanitized error。
- 新 feature 必須擴充既有 public contract 或明確提出新的 versioned boundary，不能以 bypass helper 實作。
