---
title: "Tag-as-truth: derive your blog's `category` from tags, not the other way around"
description: "Make `category:` a derived field via a deterministic Subject-tag priority list. Heuristic-only, author-wins, zero LLM calls."
pubDate: 2026-05-02
category: claude-code
tags:
  - guide
  - claude-code
  - agent-architecture
draft: false
---

A blog's `category` field shouldn't be a free choice. The most useful change I made to this site this week was making it a *derived* value — computed from tags via a deterministic priority list. One post, one category, zero ambiguity, zero LLM calls.

## The artifact

```
# Subject → category (first match wins)
1. tag `claude-code`        → category `claude-code`
2. tag `prompt-engineering` → category `prompt-notes`
3. tag `seo`                → category `seo-and-geo`
4. tag `openclaw`           → category `openclaw`
5. tag `devops` (no above)  → category `setup-env`
```

That's the whole model. Five rules. The agent that enforces it is heuristic-only — no API calls, no probabilistic reasoning. Same input always produces the same output.

## Why tag-as-truth works

The traditional model treats `category:` and `tags:` as parallel inputs the author fills independently. That sounds reasonable until you notice three failure modes that hit every personal blog eventually.

**Drift.** Author writes a tutorial, types `category: claude-code`, but only adds the tag `prompt-engineering`. Now the post sits in the Claude Code category but is filed by topic under prompt-engineering. Both lists feel half-true. You can't lint this drift away because there's no rule that says they should agree.

**Indecision.** Some posts genuinely fit two categories. Author picks one arbitrarily, regrets it months later, never goes back. The bucket distribution warps over time.

**Re-categorization is expensive.** Moving 20 posts to a new category means 20 frontmatter edits. With tag-as-truth, you change the priority list in one file and run a sweep.

The fix is to commit to a hierarchy. Tags are the canonical metadata authors think about — you tag what a post is *about*. Category is a *bucket*, which is downstream of about-ness. Stop pretending they're independent.

## Where it breaks

Tag-as-truth has one real failure mode: posts whose dominant tag and intended category disagree.

I lived this immediately. I had four posts I'd manually moved into `setup-env` because the *content* was generic (tmux cheat sheet, curl templates, generic automation guide). But all four still carried the `openclaw` tag from when they were drafted in OpenClaw context. The first time the categorizer's backfill ran, it dragged them right back to `openclaw` because rule #4 fires before rule #5.

The fix isn't to special-case those posts. The fix is to admit the tags lied — strip `openclaw` from posts that aren't actually about OpenClaw. Now the heuristic agrees with my intent because the tags do.

That's the discipline tag-as-truth imposes: **if you want a post in a different category, edit the tag, not the category.** Category never overrides tag, ever. It feels backwards for about ten minutes, then it feels obvious.

## How to use it today

If you have a markdown blog with a closed set of categories, you can install this in an afternoon:

1. **Lock categories with `z.enum`** in your content schema (Astro/Zod) — typos now fail at build instead of silently creating ghost categories.
2. **List your Subject tags** and write the priority order on paper. Specific should beat generic.
3. **Write a 30-line script** that walks frontmatter, applies the priority, fills missing categories. Author wins on existing values; only fills empty fields.
4. **Run it once over the whole corpus** to find drift. Don't auto-apply on first pass — eyeball the diff and decide whether the heuristic or your intuition is wrong.

The whole thing is heuristic, deterministic, and free. No LLM. No "confidence threshold". Just five rules and a sweep.

The most useful diagnostic you'll get from this exercise is *not* the category fixes. It's the realization that tags you didn't think about are silently classifying your posts. Once you see that, you stop adding tags casually.

---

*If you wire this into your own blog and the priority list disagrees with you on more than 10% of posts, the rules need revising — not the posts. Tag-as-truth is honest only when the rules are.*
