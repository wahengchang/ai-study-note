# My Logic & Flow Notation
*A personal instruction sheet for writing clear logic docs*

---

## 1. The idea

Write your logic in plain steps — short, clear, no fluff. Use symbols to mark what kind of step it is. Add detail only when a step is complex.

**Every doc starts with a GOAL line. Everything else follows from that.**

---

## 2. Symbols — quick reference

| Symbol | Means | Example |
|--------|-------|---------|
| `1.  2.  3.` | A step | `1.  Get user from DB` |
| `→` | Output / gives / sends to | `→ { email, plan }` |
| `IF` | Condition check | `IF plan == "pro"` |
| `  YES / NO` | Branch from IF | `YES → step 4 / NO → END` |
| `FOR EACH` | Loop over a list | `FOR EACH order in orders[]` |
| `★` | Add detail block here | `3. ★ Send email` |
| `⚠` | Edge case / watch out | `⚠ can be null` |
| `?` | Not sure yet / to decide | `? maybe use AI here` |
| `//` | Comment / note to self | `// check with client first` |
| `END` | Flow is done | `END` |

---

## 3. Basic template

```
GOAL: one sentence — what this flow does

1.  [step description]  → [output]
2.  [step description]  → [output]  ⚠ [edge case if any]
3.  IF [condition]
      YES → step 4
      NO  → END
4.  [step]
    FOR EACH [item] in [list]
      4.1  [do something]
      4.2  [do something else]
    END LOOP
5.  END
```

---

## 4. Detail block  ★

Only add a detail block when a step has complex logic, tricky inputs/outputs, or an error case that matters. Mark the step with ★ so you know it has one.

```
3. ★ Send email via SendGrid
   IN:  { email, orderId, plan }
   DO:  pick template by plan, send
   OUT: { status: "sent" | "failed" }
   ERR: → notify Slack, stop
```

Keep it short. If a line needs more explanation, use `//` to add a note.

---

## 5. Full example

```
GOAL: send promo email to pro users after signup

1.  Trigger: new user signs up         → { userId, email }
2.  Get user plan from DB              → { plan }  ⚠ can be null
3.  IF plan == "pro"
      YES → step 4
      NO  → END
4. ★ Send promo email
   IN:  { email, plan }
   DO:  pick template #3, send         // SendGrid
   OUT: { status: "sent" | "failed" }
   ERR: → log error, END
5.  END
```

---

## 6. Rules

- Start every doc with `GOAL:` — one sentence only.
- One step per line. Keep steps short.
- Use `→` to show what a step outputs.
- Use `IF / YES / NO` for every decision. Always write both branches.
- Use `FOR EACH` for loops. Always close with `END LOOP`.
- Add `★` only when a step is complex. Do not over-detail simple steps.
- Use `⚠` inline for edge cases — do not write a separate section for them.
- Use `?` to mark anything not decided yet.
- Use `//` for notes to yourself — not instructions.
- End every doc with `END`.

---

*Personal use. Update rules as your style evolves.*
