# CMS Origin gate 與 optional-key 解析加固

- **完成時間**：2026-09-08T21:40:00+08:00
- **Cycle／Work Group**：`cycle-2026-08-29-1002-cms-issue-backlog`／`WG-024`（PR #328 複審後續）

## 交付

- `/v1/*` authenticated route 的 `Origin` 省略收斂為只有 `GET`／`HEAD` 適用。PR #328 為了讓 same-origin browser `GET` 通過而放寬省略，但未綁定 method，等同讓 `POST`（SaveRevision、PublishRevision、Preview）也能只靠 Fetch Metadata 通過同源證明；現改為 state-changing method 一律要求 exact `Origin`，CLI shape（absent Origin 且無 `sec-fetch-*`）不受影響。
- `contracts/README.md` 同步為 method-aware 敘述，並補上 `/cms/assets/*` 允許 exact same-origin `Origin` 的事實（PR #328 已改行為但未寫入 contract）。
- `core/projection/canonical.ts` 與 `core/content/read-model.ts` 的 `exact()` 改為接受 `optional` key 清單，`site-content/v1` 的 `seo` 直接用它表達。原本 `hasSeo ? [4 keys] : [3 keys]` 的分支解析在 projection 側會繞過 `exact()` 既有的 prototype／data-property 檢查，等於新欄位不享有既有 parser 的加固；現在 required 與 optional 走同一個 primitive。
- CMS Editor 的 `articleSeo` 對「`seo` 欄位缺席」回傳空 metadata 而非 `undefined`。原實作會讓任何不含 `seo` 的 `site-content/v1` article revision 直接落到終止畫面「目前 revision 無法作為 Article 編輯」，與 Content read model 保留 legacy 相容的決策矛盾；無效 `seo` 仍維持 fail closed。
- `http-contract.test.ts` 把塞進 CMS asset 測試的 `/v1/*` 斷言拆成具名測試並補齊反例（originless `POST` 403、foreign Origin `GET` 403、CLI POST 通過），同時還原被壓平的縮排。

## 關鍵決策

Origin 省略只在 safe method 成立：Fetch 規格只對 non-GET/HEAD 或 CORS-tainted request 附加 `Origin`，因此「省略」在 `POST` 上不是瀏覽器的合法形狀，接受它只會擴大非瀏覽器 client 的可達面而換不到任何真實相容性。`cms-asset` 不套用 method 限制，因為該 route 已在 originOk 之外拒絕 Bearer／cookie 並固定 405 非 GET，加上 method 條件只會把 405 變成 403。

## 實際驗證

- `npm run check` 全綠：typecheck、architecture checker、`cms:build`、226/226 測試通過（連續三次執行皆同）。
- `cms-browser-bootstrap.test.ts` 以真實 Chromium 通過，確認 bundle 內 `articleSeo` 變更未影響 browser session 流程。
- 新增測試涵蓋 originless `GET` 200、exact Origin `GET` 200、cross-site `GET` 403、foreign Origin `GET` 403、originless `POST` 403、exact Origin `POST` 與 CLI `POST` 通過，並確認接受與拒絕皆不改變 canonical state digest。

## 已知限制／後續

- WG-024 log 記載 `npm run check` 會因多個固定 `127.0.0.1:43127` listener 平行執行而出現 `CMS_LISTENER_UNAVAILABLE`；在本次 4-core runner 上連續三次執行皆未重現。該並行策略仍未改變，高併發機器上仍可能發生，需要時應改為序列化固定 port suite 而非放寬測試。
- CMS Editor 仍沒有編輯 `seo.title`／`description`／`canonicalPath` 的欄位；目前只保證既有值在 reload／Save 往返中不被靜默清除。Renderer 也尚未消費該 metadata。

## 相關 Branch／PR

- Branch：`fix/cms-browser-authoring-journey`
- PR：https://github.com/wahengchang/ai-study-note/pull/328
