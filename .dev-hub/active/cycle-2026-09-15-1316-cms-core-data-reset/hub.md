---
id: cycle-2026-09-15-1316-cms-core-data-reset
status: active
created_at: 2026-09-15T13:16:54+08:00
updated_at: 2026-09-16T11:26:41+08:00
---

## Goal

核准並拆解只保留目前值的 CMS／Core data reset，使後續 Work Group 能以可驗證的垂直切片取代既有 Revision、雙 snapshot、schema version 與 media version authoring lifecycle。

## Scope

- CMS：Content Type Builder、動態 content menu、entry editor／catalog、Taxonomy 與 Media 操作介面。
- Core／Application：current-only Content Type、entry、taxonomy、media contract，global slug、CAS、validation 與 legacy cutover。
- Persistence：current records、atomic mutation／delete、streaming media staging 與 migration evidence。
- Authoring API：finite same-origin JSON commands、entry search 與 streaming multipart media transport。
- 不包含 Projection、Renderer、archive page、canonical public URL、Release、Public UI 或視覺重設。

## Context

- [核准範圍與設計約束](../../../contracts/README.md)
- [CMS Core/Data reset 規格](../../../specs/cms-core-data-reset.md)
- 2026-09-14 CMS 功能稽核是受 `draft*/` ignore 規則管理的本地研究 artifact；可認領工作的 scope 與 acceptance 只以本 Cycle、contract 與 spec 為準。
- [Dev Hub workflow](../../../docs/dev-hub-workflow.md)
- 已完成的 #315 提供可操作 CMS 與 browser／a11y precedent；本 Cycle 的 current-only lifecycle 會明確取代其 two-step Publish 與 current／published preview contract。
