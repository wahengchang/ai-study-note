---
id: WG-001
status: completed
title: SEO Plugin 模組互動說明
work_items:
  - WI-001
owner: Main
branch: docs/seo-plugin-interaction-explainer
worktree: /Volumes/UGREEN 2TB /projects/ai-study-note-reset
pr: null
---

# SEO Plugin 模組互動說明

## Delivery
重寫 `discussion/seo-plugin-requirements.md`，以 lifecycle、CMS editing、SaveRevision、公開 metadata、sitemap/robots 的 owner-mediated scenario 表達現況與待定義互動。

## Verification
已核對 Host／Application 實作名稱與 contract；文件正好五個 scenario、五張 sequence diagram，每圖四或五個 participant，所有 Plugin arrow 都以 PluginHost 為另一端；repository-relative source links 可讀取。`git diff --no-index --check -- /dev/null discussion/seo-plugin-requirements.md` 預期以 exit 1 結束且無 whitespace error；`git diff --check` 通過。