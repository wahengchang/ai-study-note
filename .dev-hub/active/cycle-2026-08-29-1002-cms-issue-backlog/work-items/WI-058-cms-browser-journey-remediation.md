---
id: WI-058
status: done
title: CMS browser authoring journey remediation
work_group: WG-024
depends_on: ["WI-055", "WI-056"]
---

# CMS browser authoring journey remediation

## Outcome

修復實際 `cms:serve` browser journey 暴露的 asset、authenticated same-origin GET 與 Article v1 canonical SEO shape 不一致，讓已完成的 CMS workspace contract 可端到端操作。

## Acceptance

模組 asset 接受實際 same-origin module `Origin`；帶 same-origin Fetch Metadata 且省略 `Origin` 的 authenticated browser GET 可通過，跨站仍拒絕；Article v1 的 required `seo` 可經 Content／Projection strict parser、reload、Save 與 preview/publish 往返，且實際 browser journey 通過。

## Notes

實際驗收發現的前向修復；已由 WG-024 完成並待建立唯一 PR。
