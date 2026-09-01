---
title: Auto Prompt Optimizer — Open Source Research Brief
---

## Context

Research scaffold for [wahengchang/ai-study-note#61](https://github.com/wahengchang/ai-study-note/issues/61): identify the open-source project referenced in the Xiaohongshu post "寶藏開源項目，自動優化專業級提示詞" ([source](http://xhslink.com/o/7iAalKtM6SX)) and evaluate fit for `ai-study-note`.

> [!warning]
> Draft scaffold. Content below is a research plan, not verified findings. `@writer` agent will populate verified entries once the upstream project is identified.

## Research Scope

| Axis | Question |
|------|----------|
| Identity | Which repo/project does the post refer to? |
| Problem | What prompt-engineering pain does it solve? |
| Mechanism | How does it auto-optimize (meta-prompt, DSPy-style, RL, eval loop)? |
| Usage | Install, entry points, minimal viable invocation |
| Fit | Does it belong in `ai-study-note` as a first-class note or an index entry? |

## Candidate Projects (to verify)

:::col
**Meta-prompt optimizers**
- [DSPy](https://github.com/stanfordnlp/dspy) — declarative LM programs with teleprompter/MIPROv2
- [PromptPerfect](https://promptperfect.jina.ai/) — commercial, not OSS
- [Automatic Prompt Engineer (APE)](https://github.com/keirp/automatic_prompt_engineer)
:::col
**Self-refine / eval-driven**
- [EvoPrompt](https://github.com/beeevita/EvoPrompt) — evolutionary search
- [promptimize](https://github.com/preset-io/promptimize) — regression harness
- [TextGrad](https://github.com/zou-group/textgrad) — autodiff-style prompt gradients
:::

## Deliverables (per issue DoD)

- [ ] Confirm original Xiaohongshu project identity (repo URL + one-line pitch)
- [ ] TL;DR (3–5 lines) — what it does, how, who it's for
- [ ] Core features — bullet list, each with evidence (README quote, code path)
- [ ] At least 3 reusable takeaways — portable patterns usable outside the tool
- [ ] Recommendation — include in `ai-study-note`? As what (note / index / skipped)

## Execution Plan

1. Resolve the Xiaohongshu short link and extract the repo reference.
2. If the repo is identified, clone/read README + `examples/` + one canonical test.
3. If the link is unrecoverable, triangulate via candidate list above, match on the post's claim ("自動優化專業級提示詞").
4. Draft findings inline in this note under a `## Findings` section.
5. Replace scaffold sections; remove the `warning` callout once verified.

## Agent Delegation

- **Primary**: `@writer` — populate `Findings`, `Takeaways`, `Recommendation` following the [writer agent](../../claude/agents/writer.md) output format.
- **Secondary**: `@reviewer` — audit for evidence, style, and Quartz conventions before closing the issue.

## Links

- Issue: wahengchang/ai-study-note#61
- Related note: [karpathy-llm-wiki-pattern](./karpathy-llm-wiki-pattern.md)
- Related note: [system-prompt-patterns-research](./system-prompt-patterns-research.md)
