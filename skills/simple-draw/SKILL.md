---
name: simple-draw
description: Create compact, readable Mermaid diagrams for Quartz notes. Use for quick step flows, decision branches, and lightweight visual summaries where clarity matters more than detail.
---

# Simple Draw Skill

Use this skill when the user needs a Mermaid diagram that is easy to scan and does not dominate the page.

## 1. Default Rules

- Prefer `flowchart LR`.
- Keep 4 to 6 core nodes.
- Keep one primary path (`A --> B --> C --> D`).
- Add side notes only if they directly help action.
- Keep each node to 1 to 2 short lines.
- Avoid `TD` unless the user explicitly asks for top-down.

## 2. Readability Rules

- Use high-contrast colors on dark themes.
- Do not use tiny HTML text like `<small>`.
- Use short labels and action verbs.
- Avoid crossing lines and dense branching.
- If the chart is still hard to read, remove nodes before adding style.

## 3. Quartz-Safe Mermaid Template

```mermaid
flowchart LR
  A["Step 1"] --> B["Step 2"] --> C["Step 3"] --> D["Step 4"]

  N1["Optional note"]
  B --> N1

  classDef main fill:#1f2329,stroke:#d1d5db,stroke-width:1.5px,color:#f9fafb,font-size:16px;
  classDef note fill:#fff7f7,stroke:#e53935,stroke-width:2px,color:#b91c1c,font-size:16px;
  class A,B,C,D main;
  class N1 note;
```

## 4. Decision Policy

- Use Mermaid only when it improves comprehension.
- If the logic is linear and obvious, use a bullet list instead.
- If the user says the chart is too big or hard to read, simplify first, then restyle.

## 5. Final Check

- Verify node labels are readable in one pass.
- Verify the chart fits horizontally without visual clutter.
- Run `npm run quartz -- build` after edits.
