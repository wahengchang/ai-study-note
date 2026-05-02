---
name: index-sync
description: Regenerate the auto-managed entry block inside src/content/blog/<category>-index.md while preserving every byte outside the markers. HTML-comment delimiters separate machine-managed entries from hand-curated editorial structure.
---

# Index Sync Skill

Keep `<category>-index.md` files current without erasing the editorial sections the author wrote between the markers.

## 1. Marker syntax

Each index page contains one or more **auto-managed regions** delimited by HTML comments. Anything outside these markers is editorial — the skill must not touch it.

```md
## Environment setup

<!-- auto:start category=setup-env section=environment-setup -->
- [Setup Node.js on MacBook](setup-nodejs-macbook/)
- [Setup Chrome DevTools for MCP](setup-chrome-devtools-on-chrome/)
- [Run Ubuntu in UTM on Apple Silicon](utm-set-ubuntu/)
<!-- auto:end -->
```

- `auto:start` carries attributes that scope what entries belong inside.
- `auto:end` has no attributes.
- An index file may have **multiple** auto blocks — one per editorial section.
- Attributes recognized:
  - `category=<name>` — required, must be one of the 5 enum values
  - `section=<slug>` — optional, narrows entries to those whose filename matches a section filter (see §3)
  - `sort=<pubDate-desc|pubDate-asc|title>` — optional, defaults to `pubDate-desc`

## 2. Scope

Only regenerate index pages whose category was touched in the current session. Determine "touched" via:

```bash
git diff --name-only HEAD -- 'src/content/blog/*.md'
```

Group changed files by their resolved category. For each unique category, regenerate `src/content/blog/<category>-index.md` if it exists. If no index file exists for a category, do nothing — never create one automatically.

## 3. Section filtering

When `section=` is set, only entries whose filename matches the section's filter are emitted. Filter rules live next to each marker as a comment for readability:

```md
<!-- auto:start category=setup-env section=environment-setup -->
<!-- filter: filename starts with `setup-` or `utm-` -->
- ...
<!-- auto:end -->
```

If no `section=` attribute, the block emits **every post** in the category that doesn't match a section filter elsewhere in the same file. This makes the unsectioned block a catch-all.

## 4. Entry format

Each entry is one line:

```md
- [<title>](<slug>/)
```

Where:
- `<title>` is the `title:` from frontmatter, with leading/trailing quotes stripped
- `<slug>` is the filename without `.md`
- The trailing `/` matches the project's `trailingSlash: "always"` config

Drafts (`draft: true`) are skipped — they are not built and not listed.

## 5. Sort

Default `pubDate-desc` (newest first). When `sort=title`, sort by `title` ascending (locale-insensitive).

## 6. Preservation rules

- **Bytes outside `<!-- auto:start -->` … `<!-- auto:end -->` are immutable.** Headings, prose, blockquotes, alternative blocks — all left exactly as found.
- Frontmatter on the index file itself is untouched.
- If a marker pair is malformed (start without matching end, or vice versa), abort with an error — do not "fix" it silently.
- If the regenerated content is byte-identical to the existing block, write nothing — keeps git diffs clean.

## 7. Bootstrap (no markers yet)

If an index file exists but contains no `auto:start` markers, do not regenerate. Emit a notification:

```
[index-sync] NO MARKERS: src/content/blog/<category>-index.md
  Insert <!-- auto:start category=<category> --> ... <!-- auto:end -->
  somewhere in the file to enable auto-regen for this category.
```

## 8. Output

For each regenerated file, emit one line:

```
[index-sync] <category>-index.md  blocks=<n>  entries=<n>  (changed|unchanged)
```

End with a summary:

```
[index-sync] regenerated A/B index files (C unchanged, D missing markers)
```
