---
name: minimax-tts
description: High-quality text-to-speech (TTS) using the MiniMax API (t2a_v2). Use when you want audio output (mp3) from text in any supported language (e.g., 廣東話/粵語, 國語, 英語). Includes Cantonese defaults and supports short clips (<20s).
metadata: {"openclaw":{"emoji":"🔊","requires":{"bins":["curl","python3"] ,"env":["MINIMAX_API_KEY"]},"primaryEnv":"MINIMAX_API_KEY"}}
---

Generate short audio via MiniMax TTS (default: <20 seconds).

This skill is not restricted to Cantonese. Cantonese (Yue) is the default profile only.
If the user requests another language (e.g. 國語 / Mandarin, 英語 / English), generate in that language and choose appropriate `--voice` / `--boost` values.

## Quick use

Create an mp3 (default Cantonese profile):

```bash
{baseDir}/scripts/tts.sh --text "今晚食咩好？" --output "./out.mp3"
```

Recommended Cantonese defaults (already set in the script):
- `--boost "Chinese,Yue"`
- `--voice "Chinese (Mandarin)_HK_Flight_Attendant"` (HK-accented voice; adjust if you have a better voice_id)
- These are defaults, not a restriction. For 國語 / Mandarin, 英語 / English, or other languages, override `--voice` and (if useful) `--boost`.

## Workflow (important)

- 先寫好文字，再生成語音 (draft text first, then generate audio).
- Always review the exact text in a readable form before TTS. The text should visibly include punctuation, spacing, pauses, ellipses, and tone/attitude cues.
- If the text does not read well on screen, the generated speech usually sounds worse.
- Practical writing cues for better output:
  - punctuation for pauses: `，` `。` `？` `！`
  - spacing / line breaks for rhythm and emphasis
  - ellipses for hesitation / soft pause: `...` or `……`
  - interjections / tone words when needed (e.g. `啊`, `啦`, `喎`)

## Configuration

Provide `MINIMAX_API_KEY` via OpenClaw skill env (recommended) or a local `.env` file.

### Option B: .env next to the skill
Create:
- `{baseDir}/.env`

With:

```bash
MINIMAX_API_KEY=...
```

## Notes / guardrails

- Keep requests short. For the “<20s” default, aim for roughly **<= 80–120 Chinese characters** (depends on speed and punctuation).
- Use punctuation to control pauses.
- Follow the user's requested language. Override the default Cantonese-oriented `--voice` / `--boost` when generating 國語 / Mandarin, 英語 / English, or other languages.
- Store generated files in an organized folder (not project root). Keep the source text and mp3 together using the same base name.
- Recommended pattern: `generated/minimax-tts/YYYY-MM-DD/HHMMSS-topic-v01.txt` and `.mp3`
- Create the output directory first (`mkdir -p generated/minimax-tts/YYYY-MM-DD`) before running `tts.sh`.
- If you need a different voice, pass `--voice <voice_id>`.
