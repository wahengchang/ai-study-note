# Mermaid Diagram Standards

Reusable prompt fragment for Mermaid diagram rules and templates.

## When to Use Mermaid

Use diagrams **only** when they improve comprehension over plain text:
- Branching logic or decision trees
- Async flows with parallel paths
- State transitions
- Multi-service architectures

If the flow is linear and obvious, use a bullet list instead.

## Orientation Policy (Strict)

- **MUST** use `direction LR` (Left-to-Right) for flowcharts and state diagrams.
- **NEVER** use `TD` (Top-Down) — it wastes vertical space.
- Exception: Only if the user explicitly requests top-down.

## Node Rules

- Keep 4–6 core nodes on the primary path.
- One main path: `A --> B --> C --> D`.
- Side branches only when they directly aid understanding.
- Node labels: 1–2 short lines, action verbs preferred.

## Readability Rules

- High-contrast colors for dark themes (bg `#050505`).
- No tiny HTML text (`<small>`, `<sub>`).
- No crossing lines or dense branching.
- If still hard to read: remove nodes before adding style.

## Base Template

```mermaid
flowchart LR
  A["Step 1"] --> B["Step 2"] --> C["Step 3"] --> D["Step 4"]

  N1["Side note"]
  B --> N1

  classDef main fill:#1f2329,stroke:#d1d5db,stroke-width:1.5px,color:#f9fafb,font-size:16px;
  classDef note fill:#fff7f7,stroke:#e53935,stroke-width:2px,color:#b91c1c,font-size:16px;
  class A,B,C,D main;
  class N1 note;
```

## Decision Diagram Template

```mermaid
flowchart LR
  Q{"Decision?"} -->|Yes| Y["Action A"]
  Q -->|No| N["Action B"]

  classDef main fill:#1f2329,stroke:#d1d5db,stroke-width:1.5px,color:#f9fafb,font-size:16px;
  classDef decision fill:#1a1a2e,stroke:#FF4F00,stroke-width:2px,color:#f9fafb,font-size:16px;
  class Y,N main;
  class Q decision;
```
