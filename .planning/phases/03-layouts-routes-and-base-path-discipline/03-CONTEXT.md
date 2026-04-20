# Phase 3: Layouts, Routes, and Base-Path Discipline - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

A reader can browse the full site locally — home, blog index, individual post, category page, tag page, and 404 — with the lean brutalist look and all internal links routed through `import.meta.env.BASE_URL`.

Covers:
- `src/layouts/BaseLayout.astro` (head, Header, Footer, slot)
- `src/layouts/PostLayout.astro` (wraps BaseLayout, post meta + prose slot)
- `src/components/Header.astro`, `Footer.astro`, `PostList.astro`
- `src/pages/index.astro` (home)
- `src/pages/404.astro`
- `src/pages/blog/index.astro` (blog index)
- `src/pages/blog/[...slug].astro` (post detail)
- `src/pages/categories/[category].astro` (category page)
- `src/pages/tags/[tag].astro` (tag page)
- Tailwind 4 theme tokens in `src/styles/global.css` matching the brutalist visual guideline
- Strict `import.meta.env.BASE_URL` usage — no hardcoded `/blog/`, `/tags/`, `/categories/`, or `/assets/` paths in `src/`

Does NOT cover:
- Deploy pipeline (Phase 4)
- Live site verification (Phase 5)
- CLAUDE.md Quartz→Astro rewrite (Phase 5)
- RSS, sitemap, OpenGraph — v2

</domain>

<decisions>
## Implementation Decisions

### Non-negotiable (from PROJECT.md)
- `import.meta.env.BASE_URL` for every internal link and asset URL — zero hardcoded paths
- Every `getCollection("blog", ...)` filters drafts: `({ data }) => !data.draft`
- Taxonomy pages dedupe via Set on tags and unique categories
- Markdown post bodies rendered with Tailwind Typography `prose` class

### Visual direction (from docs/visual-guideline.md)
- Background: `#050505` (global), `#000000` (cards)
- Accent: `#FF4F00` (brand-orange — links, buttons, focus rings)
- Border default: `#333333` (1px dividers, card outlines)
- Text: `#E5E5E5` (primary), `#737373` (muted)
- Monospace headings (JetBrains Mono / Fira Code / ui-monospace), sans body (Inter / Geist / system-ui)
- No gradients, no shadows, no blur. Border-radius 8px fixed.
- Hover: border color shift to orange or `#555`; slight background shift to `#111111`.
- Density: 14px base, 12-16px gap.

### Tailwind 4 theme wiring
- Use `@theme` block in `global.css` to declare CSS custom properties as Tailwind tokens:
  ```css
  @import "tailwindcss";
  @plugin "@tailwindcss/typography";

  @theme {
    --color-bg-global: #050505;
    --color-bg-card: #000000;
    --color-border-default: #333333;
    --color-border-active: #FF4F00;
    --color-brand-orange: #FF4F00;
    --color-text-primary: #E5E5E5;
    --color-text-muted: #737373;
    --font-mono: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
    --font-sans: Inter, Geist, system-ui, sans-serif;
  }
  ```
- This gives classes like `bg-bg-global`, `text-text-primary`, `border-border-default`, `text-brand-orange`.

### Component shapes

**BaseLayout.astro:**
- Props: `title: string`, `description?: string`
- Sets `<html lang="en">`, `<meta charset>`, `<meta viewport>`, `<title>`, `<meta description>`, base-prefixed favicon
- Imports global.css
- Renders `<Header />`, `<slot />`, `<Footer />`

**PostLayout.astro:**
- Props: `post: CollectionEntry<"blog">`
- Wraps BaseLayout with `post.data.title` + `post.data.description`
- Renders header block: title (h1 mono), metadata row (pubDate, category link, tags)
- Wraps `<slot />` in `<article class="prose prose-invert max-w-none">`

**Header.astro:**
- Site title link → `${base}` (home)
- Nav links → `${base}blog/`, `${base}categories/`, `${base}tags/` (note: categories/tags index not in scope for this phase, but link to one example?)
  - Decision: Header nav shows `Home`, `Blog`. No top-level categories/tags index page required — individual category/tag pages are only reachable via post metadata links.
- Monospace font, orange on hover

**Footer.astro:**
- Minimal: small muted copyright or repo link
- Base-prefixed links

**PostList.astro:**
- Props: `posts: CollectionEntry<"blog">[]`, optional `title?: string`
- Renders a flat list of card components: each card shows title (link to `${base}blog/<slug>/`), description, pubDate, category + tags
- 1-column on mobile, 2-col on tablet, possibly 3-col dense grid on desktop
- Border 1px `border-default`, radius 8px, hover orange border

### Page shapes

**/ (home):** Hero (site title + tagline) + recent posts section using `PostList` (e.g., 6 most recent non-draft posts)

**/blog/:** Full post list (all non-draft posts) using `PostList`, sorted by pubDate desc

**/blog/[...slug]:** `PostLayout` wrapping rendered Markdown

**/categories/[category]:** Title "Category: <name>" + `PostList` filtered to that category

**/tags/[tag]:** Title "Tag: <name>" + `PostList` filtered to that tag

**/404:** Simple brutalist 404 message with a link home

### Base-URL idiom
```astro
---
const base = import.meta.env.BASE_URL; // "/ai-study-note/" with trailing slash per config
---
<a href={`${base}blog/`}>Blog</a>
<a href={`${base}blog/${post.id}/`}>Read</a>
```

Note: With `trailingSlash: "always"` + `base: "/ai-study-note"`, Astro sets `BASE_URL` to `/ai-study-note/` (trailing slash). Always append path segments with trailing slash.

### Claude's Discretion
- Exact grid density / card layout (1 vs 2 vs 3 columns at breakpoints)
- Home page hero copy
- Footer contents
- Whether to show recent N posts on home (recommend 6-10)
- Whether post bodies get a reading-time estimate (deferred — v2)
- Typography plugin dark-mode: use `prose prose-invert` since background is near-black

</decisions>

<code_context>
## Existing Code Insights

### Current state (post Phase 2)
- `src/content/blog/` has 72 valid posts with full frontmatter
- `src/content.config.ts` is the schema (locked)
- `astro.config.mjs` has base/site/trailingSlash/vite plugins (locked)
- `src/pages/index.astro` has a placeholder Astro hello page — replace in this phase
- `src/styles/global.css` has only `@import "tailwindcss"` + `@plugin "@tailwindcss/typography"` — add `@theme` block
- `src/layouts/`, `src/components/`, other `src/pages/` directories do not exist yet — create them

### Integration Points
- Every post URL shape: `/ai-study-note/blog/<slug>/` — slug comes from `post.id` which is the filename without extension
- Every category URL: `/ai-study-note/categories/<category>/`
- Every tag URL: `/ai-study-note/tags/<tag>/`
- Static assets live at `/ai-study-note/assets/*.png` (from public/assets/)

</code_context>

<specifics>
## Specific Ideas

- Consolidate PostList styling into one component — do not duplicate card markup in multiple pages.
- Use Astro's `render(post)` pattern for post detail (imported from `astro:content`).
- Verification grep: `grep -rE "href=\"/(blog|categories|tags|assets)/" src/` MUST return zero matches after this phase.
- Consider suggesting plan structure: (1) Global styles + theme + base/post layouts + header/footer + postlist component, (2) Home + blog index + post detail, (3) Category + tag dynamic routes + 404.

</specifics>

<deferred>
## Deferred Ideas

- `RelatedNotes` component — v2
- RSS feed — v2
- OG image generation — v2
- Pagination on blog index — v2 (72 posts is fine as a single page for now)
- Search — out of scope (project-level exclusion)
- Reading time estimate — v2
- Theme switcher — out of scope

</deferred>
