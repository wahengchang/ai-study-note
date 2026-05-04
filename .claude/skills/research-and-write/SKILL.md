---
name: research-and-write
description: Research a topic and turn it into a publishable AI-Hero-style developer post for src/content/blog/ — one named concept, one copy-pasteable artifact, opinionated, honest about failure. Use when the user wants to write a new post, draft a tutorial, capture an insight as a publishable note, or asks for "AI Hero style" / "Pocock style" output. Trigger on phrases like "write a post", "draft a tutorial", "make this a note", "research this", "AI Hero style", "Matt Pocock style", "publish what I figured out". Single-pass auto-pilot: writes directly to src/content/blog/ with full publishable frontmatter, runs build, syncs index — no sign-off gates. User interrupts at any time.
---

# Research and Write — AI-Hero-style developer posts for AI Study Note

**Single-pass auto-pilot:** **research** → **write** → **polish**, publishing directly to `src/content/blog/<slug>.md`. No sign-off gates by default; the user can interrupt at any time. Adapted from Matt Pocock's `aihero.dev` content patterns, scoped to this repo's taxonomy and Astro structure.

The output is **one tactic, one name, one thing the reader can use today** — published into `src/content/blog/` with valid frontmatter, a green `npm run build`, and a synced `<category>-index.md` (when markers exist).

## Halt conditions (the only gates)

The auto-pilot only stops for cases where the agent genuinely can't decide alone:

- **No artifact possible.** The source material has no copy-pasteable thing. Push back — the topic isn't ready to be a post.
- **Ambiguous category.** Subject signal in the research is genuinely split between two categories with no priority winner. Ask once which one.
- **Editorial blocker the agent can't fix.** Specifically: no honest iteration moment exists in the source material (the agent can't invent failures). Ask the author for one.
- **Build fails.** Delete the just-written file and report the schema error.

Everything else — slug, named concept, artifact extraction, length band, structure choice, frontmatter — the agent decides and ships.

## Inviolable rules

These never bend, regardless of length or topic:

- **Language: 繁體中文 (zh-tw)** for body prose and `description`. Technical terminology, library/framework names, command flags, and code identifiers stay in English. Bilingual form `代理 (agent)` / `延遲 (latency)` is encouraged for less-familiar concepts. Title can be zh-tw / English / mixed.
- **One named concept** per post. Used 3+ times so it sticks.
- **One copy-pasteable artifact** per post — snippet, prompt, checklist, config — placed in the **first half** of the post.
- **At least one paragraph showing iteration** ("I tried X, it broke, so I changed it to Y") — required for `short` and `medium` bands. Authenticity through specificity. **`chapter` band is exempt:** architecture chapters and research syntheses don't manufacture failure moments. Forcing one produces the inauthenticity the rule was meant to prevent.
- **No hype words**: revolutionary, game-changing, 10x, mind-blowing, supercharge, unleash. Banned.
- **No hedge mush**: "it depends", "your mileage may vary", "this is just my opinion". Pick a position.
- **No "in this post we'll explore..."** openings. Hook the reader on sentence one.
- **No closing fluff**: "I hope this was helpful!", "Let me know in the comments!". Banned.

## What flexes

- **Length** — adaptive, decided at the proposal stage based on topic depth.
- **Voice** — defaults to the Principal-Engineer-meets-Pocock blend; chapter-style posts can be more expository.
- **Structure** — the 6-beat shape (hook → artifact → why → where it breaks → how to use → sign-off) is the default, but chapter-style posts can use a multi-section outline.

---

## Phase 0 — Capture seed

Before researching anything, extract from the user (or the conversation) three things:

1. **The one-line claim.** What's the *thing* this post is asserting? If they can't say it in one sentence, push back until they can.
2. **The audience.** Default for this repo: working AI/agent engineers. Override if the user signals otherwise.
3. **The artifact (proposed).** What will the reader copy-paste? If genuinely none exists, push back — the topic is not ready to be a post.

Ask only if the seed is missing one of these. Don't interrogate when the user has clearly given them.

---

## Phase 1 — Research (smart-skip)

### Decide whether to research

**Skip research** when the seed is rich:
- User pasted a transcript, code, logs, or a long description (>200 words of source material)
- User says "I just figured out X" with concrete details
- User refers to a specific artifact in the repo / their own experience

**Research is mandatory** when the seed is thin:
- User says "write a post about \<topic\>" with no source material
- User references third-party tools / people / numbers without verification
- The post will make claims about library versions, pricing, model names, or feature availability

### How to research (when running)

- `WebSearch` for breadth — 3–5 queries on the central claim, named entities, recency markers ("2026", "latest version", etc.)
- `WebFetch` on the **1–3 most credible sources** for depth. Prefer primary (official docs, the person's own posts, the GitHub repo) over aggregators.
- For library/framework versions, check the package's npm page or GitHub releases.

### Length band (decided here)

Based on topic and source material, pick **one** length band:

| Band | Words | When |
|---|---|---|
| `short` | 400–800 | One tactic, one named pattern, one artifact. The Pocock default. |
| `medium` | 800–1500 | A pattern with multiple named sub-concepts, or a deeper why-it-works section. |
| `chapter` | 1500–3000 | Architecture chapters (`ch[0-9]-*`), full system breakdowns, multi-section research syntheses. |

Default: `short`. Move up only when the topic genuinely demands it.

### The research file (silent sidecar)

Write a sidecar file at `.research/<slug>.md` (gitignored). It is a **working artifact** — the agent uses it to organize sources before writing, and to verify claims later if the post needs revision. **Do not show it in chat unless the user asks** ("show me the research", "what did you find").

Five sections, exactly:

```md
# Research: <topic>

## The claim
<one sentence>

## What's true (with sources)
- Fact 1 — [source URL]
- Fact 2 — [source URL]

## What's contested or uncertain
- Open question 1
- Disputed claim 2

## The named concept (decided)
<short, memorable, copy-pasteable name>

## The artifact (decided)
<the snippet/prompt/checklist drafted in full>

## Length band
<short | medium | chapter> — <one-line reason>
```

The agent decides the named concept, artifact, and length band itself. No sign-off — these are working decisions, not gates.

---

## Phase 2 — Write

Write directly to `src/content/blog/<slug>.md` with **full publishable frontmatter**. There is no separate WIP location — use the `draft: true` frontmatter flag if a post needs to land but stay out of the build.

### Slug naming

Generate from the named concept or central topic. Kebab-case. ≤60 chars. Verify it doesn't collide with an existing file in `src/content/blog/` before writing. Examples:

- "Grill Me skill" → `grill-me-skill.md`
- "How OpenClaw routes via bindings" → `openclaw-routing-via-bindings.md`
- "Triage state machine for production bugs" → `triage-state-machine-for-bugs.md`

### Full frontmatter (resolved upfront)

Write all 6 schema fields when the file is created. The agent has enough signal from the research phase to fill them all — `category` and `tags` resolve from the post's Subject (see `.claude/skills/categorize/SKILL.md` §3 priority list), `description` is a one-line zh-tw synthesis of the central claim:

```yaml
---
title: "<the title>"
description: "<zh-tw synthesis, ≤160 chars, ~80 zh-tw chars>"
pubDate: <today, YYYY-MM-DD>
category: <one of CATEGORIES from src/content.config.ts>
tags:
  - <type>          # exactly one from Dimension A
  - <subject>       # one or more from Dimension B
  - <tech>          # optional, zero or more from Dimension C
---
```

If the Subject signal genuinely splits between two priority winners (rare), halt and ask once. Otherwise decide and write.

### The structure (6-beat default)

```
1. Hook         (1–3 sentences — the claim, sharp and specific)
2. The artifact (snippet / prompt / named pattern, in code or quote block)
3. Why it works (2–4 short paragraphs — the reasoning)
4. Where it breaks (1 paragraph — honest failure modes)
5. How to use it (numbered steps OR a short "do this today" line)
6. Sign-off     (1 sentence — what to read next, OR a question to argue with)
```

Chapter-band posts can replace this with a multi-section outline, but each major section should still produce something concrete.

### The opening

First sentence must make the reader want the second. Three reliable shapes:

- **The claim** — "This five-line skill is the most useful thing I've written this year."
- **The reframe** — "Rubber ducking didn't die when LLMs arrived. It got better."
- **The specific scene** — "I was 40 minutes into a feature when Claude finally asked the right question."

### Voice rules

- Short paragraphs. 1–3 sentences each. Never longer than 4.
- Active voice. "The agent asks you questions" beats "questions are asked by the agent."
- Concrete over abstract. "I added the line `provide your recommended answer`" beats "I tuned the prompt for better UX."
- Show iterations. At least one paragraph that says "I tried X, it broke, so I changed it to Y."
- Title: 繁中 / English / mixed all OK (matches existing corpus — `Ch1: OpenClaw 架構：四大支柱`, `Telegram Bot 橋接 Claude Code 運作原理`).
- Description: zh-tw, ≤160 chars (Chinese is denser; ~80 zh-tw chars fits the limit).
- Body: zh-tw prose. Technical terms (`webhook`, `prompt`, `getStaticPaths`, `p99 latency`) stay English. Bilingual hints `代理 (agent)` are acceptable.

### No sign-off

The post is now at its final URL. The user can interrupt, ask for revisions in place, or open the file in the IDE — but the agent does not pause to ask.

---

## Phase 3 — Polish

Polish runs **in place** on `src/content/blog/<slug>.md`. Three steps. **The build must pass at the end** or the agent deletes the file and reports.

### Step 3.1 — Mechanical auto-fixes

These get applied without asking:

- **Word count**: trim if over the band's max; the workflow refuses to inflate to the min — that produces fluff.
- **Hype words** (`revolutionary`, `game-changing`, `10x`, `mind-blowing`, `supercharge`, `unleash`): replace with the specific concrete word, or delete the sentence.
- **Hedge mush** (`it depends`, `your mileage may vary`, `just my opinion`, `I think maybe`): delete or replace with a position.
- **Banned openings** (`In this post we'll explore`, `As developers we all know`, `AI is changing everything`): replace with a hook from §opening.
- **Banned closings** (`Hope this helps`, `Let me know in the comments`): replace with a concrete action / question / pointer.

### Step 3.2 — Editorial blockers (agent-fix-first)

For each blocker, the agent attempts the fix in place. Only halt if it genuinely can't be fixed without information the agent doesn't have.

| Blocker | Agent action |
|---|---|
| No named concept used 3+ times | Edit body to strengthen the naming (add 1–2 explicit references) |
| No copy-pasteable artifact in the first half | Move the artifact up |
| First sentence is generic | Rewrite using one of `[claim / reframe / scene]` |
| Zero iteration paragraphs (`short` / `medium` only) | **Halt** — ask the author for the "I tried X, it broke" moment. The agent cannot invent failures. **Chapter band is exempt** — skip this check. |

### Step 3.3 — Categorize sweep (fill-the-gaps)

Invoke `@categorizer` on the published file. Since Phase 2 wrote full frontmatter, this is usually a no-op or a banned-tag normalization pass. It only fires substantively if the agent left a field empty (e.g. ambiguous category that was deferred to the user).

### Step 3.4 — Build (auto-syncs indexes via prebuild hook)

- Run `npm run build`. If it fails, **delete** `src/content/blog/<slug>.md` and report the schema error.
- The `prebuild` hook (`scripts/sync-indexes.mjs`) regenerates every `<category>-index.md` auto-block automatically. No separate invocation needed. See `.claude/skills/index-sync/SKILL.md` for marker grammar if a new index file needs bootstrapping.

---

## Output to the user

At the end of polish, deliver four things in chat:

1. **The published path** — `src/content/blog/<slug>.md` (with category and word count).
2. **The tweetable one-liner** — for distribution.
3. **A 2-sentence email-newsletter summary** — for the list.
4. **The three biggest editorial choices** — so the author can push back if they disagree. The file is already at its final URL; revisions are in-place edits.

---

## Quality checklist (run before declaring done)

- [ ] Word count is within the chosen band.
- [ ] Exactly **one named concept**, used 3+ times.
- [ ] Exactly **one copy-pasteable artifact**, in the first 50% of the post.
- [ ] At least one paragraph shows iteration / honest failure.
- [ ] No hype words. No hedge mush. No banned openings or closings.
- [ ] First sentence would make a stranger read the second.
- [ ] Every present-day factual claim was verified via search (research file shows source).
- [ ] Most paragraphs are 1–3 sentences.
- [ ] The post is tweetable in a single sentence (write it, save for output §2).
- [ ] Frontmatter validates the `blog` schema (all 6 required fields).
- [ ] `npm run build` exits 0.

If any box is unchecked, fix or halt per §3.1 / §3.2. Do not declare done on a post that fails the editorial blockers.

---

## What this skill does not do

- **Refining existing posts** — that's a separate flow (out of scope by Q1).
- **Capturing chat transcripts** — out of scope.
- **Long-form research papers / academic essays** — wrong shape; redirect.
- **Marketing copy / landing-page text** — wrong shape; redirect.
