---
title: Custom Syntax
---

This project supports standard Markdown plus Quartz custom syntax.

## Smart Columns

Use `:::col` blocks next to each other to create columns.

```md
:::col
### Column A
- point 1
- point 2
:::

:::col
### Column B
- point 3
- point 4
:::
```

Notes:
- Consecutive `:::col` blocks render as one row of columns.
- A normal paragraph between `:::col` blocks starts a new row.

## Standard Markdown

You can also use normal Markdown and Obsidian-style syntax:
- headings, lists, tables, code blocks
- wikilinks `[[note-name]]`
- callouts
- math and Mermaid (if enabled in config)

## Reference

- Smart columns example: <https://wahengchang.github.io/quartz-note/Content-Writing/08.smart-columns>
