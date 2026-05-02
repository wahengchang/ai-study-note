---
name: categorize
description: Resolve `category` and `tags` for notes in src/content/blog/ using the closed vocabulary in docs/content-taxonomy.md. Tag-as-truth — Subject dimension determines category via deterministic priority. Author wins — never overwrites manually set values; only fills empty fields.
---

# Categorize Skill

Determine **one** category and a valid tag set for a note in `src/content/blog/`. The result must be deterministic for the same input — no LLM ambiguity, no author-order dependence.

## 1. Source of truth

Always read **`docs/content-taxonomy.md`** before classifying. It is the only place categories, tags, and banned vocabulary are defined. If the taxonomy disagrees with this skill, the taxonomy wins — open a PR to update either.

## 2. Invariants

- **One post, one category.** Always exactly one value from the §1 table in the taxonomy.
- **Author wins.** If `category:` or `tags:` already has a value, do not overwrite. Only fill empty fields.
- **No invention.** Never produce a category or tag that is not in the taxonomy. Surface ambiguity instead.
- **No LLM calls.** This skill is heuristic-only. Ambiguous cases produce a notification, not a guess.

## 3. Subject → category priority

Walk the post's `tags` (Subject dimension) in this fixed order. **First match wins** — stop at the first hit.

| # | Subject tag present | Category |
|---|---|---|
| 1 | `claude-code` | `claude-code` |
| 2 | `prompt-engineering` | `prompt-notes` |
| 3 | `seo` | `seo-and-geo` |
| 4 | `openclaw` | `openclaw` |
| 5 | `devops` (and none above) | `setup-env` |

If no Subject tag is present → **ambiguous**. Emit notification (see §7), do not guess.

The priority order resolves "one post, one category": when both `claude-code` and `openclaw` are present, the post is `claude-code`. When both `openclaw` and `devops` are present, the post is `openclaw`.

## 4. Tag inference (when `tags:` is empty)

If a note has no tags, propose a minimal set: **exactly one Type tag + the matched Subject tag**. Tech tags are never inferred — the author adds them.

Type inference (pick the first match by content shape):

| Signal | Type |
|---|---|
| Filename starts `setup-` or contains `install`/`setup` and content has numbered steps | `guide` |
| Filename ends `-index` or content is an index of other notes | `reference` |
| Filename starts `ch[0-9]-` (chapter series) | `guide` |
| Body has `## Symptom` / `## Hypothesis` / `## Resolution` headings | `sop` |
| Body is mostly Q&A pairs with ≥3 questions | `faq` |
| Body is a single reusable prompt or template block | `template` |
| Body is multi-section research summary of an external source | `research` |
| Default if none match | `guide` |

Subject is the one that triggered the category match in §3.

If the note already has a Type tag but no Subject tag, only fill the Subject tag. Do not change the Type.

## 5. Banned tag normalization

Apply the banned-tag table from `docs/content-taxonomy.md` §2 ("Banned tags"). Examples:

- `AI` / `ai` → drop
- `prompting` → `prompt-engineering`
- `tutorial` → `guide`
- `Gemini` / `GEMINI` → `gemini`
- `harness-framework` / `agent` → `agent-architecture`

Banned-tag normalization **does** edit existing tag values (it is a fix, not a guess).

## 6. Authority rules

| State | Action |
|---|---|
| `category:` empty AND heuristic clean | Fill it |
| `category:` empty AND ambiguous | Leave empty, emit notification |
| `category:` set, value in enum | Do not touch |
| `category:` set, value not in enum | Emit "add `<value>` to `CATEGORIES`" notification — do not auto-edit |
| `tags:` empty | Fill via §4 |
| `tags:` set, contains banned tag | Normalize per §5 |
| `tags:` set, no banned tags | Do not touch |

## 7. Notification format (ambiguous case)

```
[categorize] AMBIGUOUS: src/content/blog/<slug>.md
  Tags found: <list> (no Subject tag matched §3 priority list)
  Action needed: add one of [claude-code | prompt-engineering | seo | openclaw | devops]
                 to `tags:` so the category can be resolved deterministically.
```

For unknown category values:

```
[categorize] UNKNOWN CATEGORY: src/content/blog/<slug>.md
  Found: category: <value>
  Action needed: add "<value>" to CATEGORIES in src/content.config.ts
                 OR change category to one of the existing 5 enum values.
```

## 8. Output (when applied)

For each post processed, emit one line:

```
[categorize] <slug>.md  category=<old>→<new>  tags=<old-count>→<new-count>  (filled|normalized|skipped:<reason>)
```

End with a summary count:

```
[categorize] processed N posts: filled=A normalized=B skipped=C ambiguous=D
```
