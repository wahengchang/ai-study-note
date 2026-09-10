---
name: ai-x
description: 以不同 underlying model 的獨立 AI 提供第二意見，或執行直到證據收斂的跨模型共識審查；適用於 code、diff、研究、分析、計畫、設計與其他交付成果。
---

# ai-x — 雙模式跨模型審查

## 模式選擇

原始請求明確指定「快速／一次性／second opinion」時，直接使用 **Light — Second opinion**。
指定「deep／consensus／直到同意」時，直接使用 **Deep — Consensus review**。
未指定深度時，只詢問一題，提供：

- **Light — Second opinion**（推薦）：一次獨立檢查，成本低，不宣稱共識(use high effort/reasoning/thinking)。
- **Deep — Consensus review**：逐項查證並交回未解決 finding，直到可證明收斂。

若 host 沒有互動式問題工具，預設 Light，並在輸出首行標示模式。

## 共用規則

1. **Primary 先完成原始工作並自行驗證**，再建立 review packet；Reviewer 不替 Primary
   提案、實作或承擔最終決策。
2. **Reviewer 模型選擇**：確認 Primary 的 resolved underlying model，從 `ChatGPT`、`Claude CLI`、`DeepSeek` 排除同模型後隨機排列可用候選。每個候選先使用能明確運行該模型的 host 原生 reviewer；否則使用該模型 CLI 做 read-only review。rate limit、額度不足或不可用時改下一個候選且不重試；全部失敗輸出 `BLOCKED`，reason 為 `review_unavailable`。OMP 只可使用 `.omp/config.yml` 已綁定且已確認的 role，不得覆寫模型。輸出必須記錄 Primary、候選順序、selected model 與 mechanism。
3. 第一次審查使用 fresh session；後續追問一律 resume 同一 Reviewer，不重建無上下文 agent。
4. Reviewer 對 review target 一律 read-only；可讀 source、diff、文件並做非破壞性驗證，
   不得修改 tracked product files、部署、發布或執行不可逆操作。
5. Review packet 只含：原始要求、實際成果或 diff、必要 source/context、限制與 acceptance
   criteria、已完成驗證。資料須足以讓 Reviewer 直接查證，不以 Primary 摘要代替證據。

## Light — Second opinion

Reviewer 做一次 evidence-first review，不進行逐項裁決、修改—重審迴圈，也不宣稱
`CONSENSUS_ACCEPTED`。輸出第一行必為 `SECOND_OPINION_CLEAN` 或
`SECOND_OPINION_FINDINGS`，並列出 resolved reviewer model。

`SECOND_OPINION_CLEAN` 表示沒有需要立即處理的實質問題；可附 minor suggestions。
`SECOND_OPINION_FINDINGS` 的每項 finding 必須包含：位置、證據、影響、最小修正建議；
必要時補充 failure scenario 與 verification。Primary 只查證 feedback、決定是否採用，
再交付結果；不得把 Light 結果描述為雙模型共識。

## Deep — Consensus review

Reviewer 第一輪只回覆下列 verdict 之一，並在非 `ACCEPT` 時附 finding：
`ACCEPT`、`NEEDS_REVISION`、`USER_DECISION_REQUIRED`、`BLOCKED`。

每項非 ACCEPT finding 必須使用穩定 ID（`F-001`…）、severity（`BLOCKER`／`HIGH`／
`MEDIUM`／`LOW`）、claim、evidence、impact，以及 recommendation 或 verification。
`BLOCKER`／`HIGH` 阻擋共識；`MEDIUM`／`LOW` 不阻擋，但 Primary 必須記錄處置或
accepted-risk 理由。

Primary 自行查證每項 finding，套用成立的最小修改，或以 source、文件、測試、contract
或非破壞性驗證提出反駁。只把仍未解決的 findings 交回同一 Reviewer，附原 finding、
Primary 回覆、新 evidence 與修改方案；後續輪次不重做完整首輪 review。

Reviewer 對交回項目逐項回覆是否已關閉；已驗證修改或接受反駁即可關閉，否則必須
說明仍缺少的 evidence、需要修訂的 claim 或回覆不足之處。修訂後的 finding 沿用原 ID，
只有由新 evidence 或修改方案真正產生的新問題才使用新 ID。

所有 blocking findings 關閉，且 ownership、狀態轉移、介面、相容性、failure handling、
重要 sequencing／atomicity 與必要驗證均已明確後，Reviewer 與 Primary 才能輸出
`CONSENSUS_ACCEPTED`。`MEDIUM`／`LOW` 可在明確記錄 accepted-risk 後完成。

若剩餘分歧是 product／UX／成本／風險取捨，停止技術辯論並輸出
`USER_DECISION_REQUIRED`，列出選項、事實與 trade-off。若必要 evidence 或不同模型
無法取得，輸出 `BLOCKED`，reason 使用 `evidence_unavailable` 或
`review_unavailable`；不得自行製造共識。

## 失敗與輸出

Reviewer timeout、權限／工具失敗、session failure 或無效輸出時，先判斷是否能安全重試；
不得重送可能仍在執行的 request。可在不變更 scope 下要求修正格式，或改選另一個不同
underlying model。任何情況都不得以 Primary 內容冒充 Reviewer 結果。
