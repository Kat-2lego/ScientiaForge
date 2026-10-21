# English Coach

A daily spoken-English practice partner for SkillForge. Sipho asks how your day was, chats back like a real conversation partner, and at the end tells you your estimated English level and exactly how to improve.

It sits next to the **Articulation Coach** (the drills page). The drills train *how clearly you say things*; this trains *having a conversation*.

## What learners get

1. **Set-up (first visit only):** "Where is your English right now?" (A1 to C2, or *not sure yet*), "Which level do you want to reach?", topics they like, and minutes per day. Editable any time under *My progress*.
2. **A chat:** Sipho speaks first ("How was your day?"), remembers last time's topic, talks at the learner's level and gently stretches them towards their goal. He corrects mistakes by using the right form in his own reply, not by lecturing. Tap-to-talk, **hands-free** (he listens when he finishes), or *Type instead*. *Give me an idea* helps when they're stuck.
3. **Finish:** today's estimated level (for example "B1, about 40% of the way to B2"), five skill ratings, up to three *say it better* cards using their real words, words to try next time, and one thing to try tomorrow.
4. **My progress:** level day by day, streak, minutes, distance to the goal.

## Install

Unzip over the project root, then:

```
node apply-english-coach.mjs --dry-run     # preview
node apply-english-coach.mjs               # apply
```

It adds the route to `server.mjs`, the admin chart entry, the sidebar link on every page, and a link from the drills page. It works whether or not the Articulation Coach installer was run first, can be run twice safely, and keeps your Windows line endings. If a spot has changed it will not guess; it prints the exact lines to add by hand.

Then:

1. **Run `database/english_coach_migration.sql`** in the Supabase SQL editor (safe to re-run). Without it the page shows a message saying so.
2. Restart the server and hard-refresh the browser (`Ctrl+Shift+R`).
3. Open **English Coach** in the sidebar.

No new npm packages are needed. You do need `msedge-tts` **2.1.0 or newer** for the free voice (`npm install msedge-tts@latest`).

## Choosing the voice

The coach speaks through one setting, `ENGLISH_TTS_PROVIDER`. A paid voice that fails, runs slowly (over 12 seconds), or has hit the learner's daily budget is replaced by the free voice, so a conversation never goes silent.

| Provider | Setting | About one 10-minute chat* | Notes |
|---|---|---|---|
| **Groq Orpheus** | `groq` (default when `GROQ_API_KEY` is set) | R1.40 | Same key you already have. Expressive and fast. American-accented voices. |
| **OpenAI** | `openai` + `OPENAI_API_KEY` | R1.10 | Tone can be steered (`ENGLISH_TTS_ACCENT="South African"` asks for a light accent). |
| **ElevenLabs** | `elevenlabs` + `ELEVENLABS_API_KEY` | R3.20 (Flash), about double for the top models | Generally rated the most natural. Pick a voice id from their library. |
| **Edge** | `edge` | free | The fallback. Fine, but you can hear it is synthetic. |

\* About 3,600 characters spoken by Sipho, at R18 to the dollar, using list prices found in October 2026. Check each provider's pricing page.

**Do not take my word for which sounds best. Listen:**

```
node --env-file=.env tools/voice-sampler.mjs
```

It makes the same sentence in every voice you have a key for and builds `voice-samples/index.html` with a play button for each, plus how long each took. Pick a winner and put it in `.env`.

**Groq note:** Orpheus may need its terms accepted once at `console.groq.com/playground?model=canopylabs/orpheus-v1-english`. Until then the server logs that link and uses the free voice.

## Settings (all optional, in `.env`)

| Setting | Default | What it does |
|---|---|---|
| `ENGLISH_TTS_PROVIDER` | `groq` if a Groq key exists, else `edge` | `groq`, `openai`, `elevenlabs` or `edge` |
| `ENGLISH_TTS_VOICE` | `daniel` (Groq), `cedar` (OpenAI) | Voice name for Groq or OpenAI |
| `ELEVENLABS_VOICE_ID` | a stock voice | ElevenLabs voice id |
| `ELEVENLABS_MODEL` | `eleven_flash_v2_5` | `eleven_multilingual_v2` sounds richer and costs about double |
| `ENGLISH_EDGE_VOICE` | `en-ZA-LukeNeural` | The free fallback voice |
| `ENGLISH_TTS_ACCENT` | neutral | OpenAI only, for example `South African` |
| `ENGLISH_PREMIUM_TTS_CHARS_PER_DAY` | `12000` | Per learner (about 3 full chats), then the free voice. Resets if the server restarts. |
| `ENGLISH_TTS_TIMEOUT_MS` | `12000` | How long to wait for a voice before using the next |
| `ENGLISH_COACH_MODEL` | `openai/gpt-oss-120b` | Chat model. `openai/gpt-oss-20b` is the automatic backup. |
| `ENGLISH_SESSIONS_PER_DAY` | `8` | Finished chats per learner per day |
| `ENGLISH_MIN_GAP_MS` | `1200` | Minimum gap between a learner's requests |
| `ARTICULATION_WHISPER_MODEL` | `whisper-large-v3-turbo` | Shared with the drills |

## How the level is judged, and its limits

The estimate uses the CEFR scale (A1 to C2). After a chat, an AI examiner rates five skills (fluency, vocabulary, grammar, organising ideas, interacting) from what the learner said. It sees only the learner's lines, is told to be conservative, and is told to ignore spelling and punctuation (it reads a speech transcript) and never to judge accent.

Safeguards, all covered by tests:

- A quote shown as "you said" is only kept if it really appears in what the learner said.
- Thin evidence caps the level: a very small vocabulary can't score above B1, and so on up the scale.
- Under 25 words it refuses to rank at all and says why.
- Every result is labelled **low, medium or high confidence**; chats of about 3 minutes or more are more reliable.
- The learner's "level" on the progress page is smoothed over their last few chats, so one odd day doesn't swing it.
- If the examiner fails, nothing is saved and the learner can retry. A level is never invented.

It is a useful guide, **not an official certificate** like IELTS or Cambridge.

## Privacy and safety

- **Never stored:** recordings, transcripts, or quotes of what a learner said. Quotes appear on the result screen and are then gone. Nothing a learner says appears in server logs.
- **Stored:** their goals, and per chat the level, skill ratings and a few short themes (what to work on, words to try, topics). Learners can delete everything under *My progress*.
- **Distress:** if a learner says something about self-harm or abuse, a fixed, caring reply is returned and the message is **never sent to the AI**. It gives the SADAG suicide crisis line (0800 567 567), and Childline (116) for under-18s. Those exchanges are also left out of the conversation history and the assessment. Hands-free is switched off so the microphone isn't turned back on.
- **Under 18:** the coach uses age-appropriate topic rules (the sign-up age group is used), never asks for surnames, addresses, schools or phone numbers, and always says it is an AI if asked.
- Helpline numbers were checked in October 2026. Numbers change, so re-check them once a year (`server/services/conversationCoach.js`).

## Tests

```
node --test server/tests/english.test.mjs server/tests/vad.test.mjs server/tests/articulation.test.mjs
```

## Try it yourself (5 minutes, with headphones)

1. Open English Coach and complete set-up. Choose *not sure yet* to try the starting-level flow.
2. **Start today's chat.** You should hear Sipho greet you by name and ask how your day was.
3. Tap the mic, answer for 10 to 15 seconds, tap again. Your words appear, then his reply, which he speaks.
4. Make a deliberate mistake ("Yesterday I go to the shop"). His reply should use the right form naturally.
5. Tap **Give me an idea**, then **Type instead**, and send something.
6. Turn on **Hands-free**. After he speaks the mic should start by itself and send about 2.5 seconds after you stop.
7. Say about 30 words in total, then **Finish and see my level**. Check the quotes in "How you can improve" are things you really said.
8. Open **My progress**. Chat on a few days to see the line grow.
9. In the admin dashboard, "English Coach" should appear in *Feature Usage Over Time*.

## Troubleshooting

| You see | Cause |
|---|---|
| "tables are not set up yet" | Run `database/english_coach_migration.sql` |
| Sipho's voice is robotic | Look for `English coach voice:` in the server terminal: Groq terms not accepted, a wrong key, or only the free voice is available. Update `msedge-tts`. |
| No avatar, just an "S" | Harmless. The page works without it. |
| "I could not hear you" | Wrong microphone selected, or too quiet |
| Hands-free cuts people off | It waits 2.5 s of quiet. Tap the mic to send early, or switch it off. |
| "Speech coaching is not set up" | `GROQ_API_KEY` is missing |

## Not covered by my testing

- I had no API keys, so every voice provider was tested against mock servers using their documented request formats, **never with a real voice**. Voice quality is for your ears to judge.
- I could not test with a real microphone or browser. The page was tested in a simulated browser with a fake microphone.
- The sidebar link and chat page were verified against a copy of your repo. The capitalisation problems that already existed in your project (see below) are separate and are not touched by the English Coach installer.

## Before you deploy to Linux hosting: `fix-case-sensitivity.mjs`

Windows doesn't care whether a link says `dashboard.html` or `Dashboard.html`. Render, Railway and most servers do, so those links show a missing sidebar or stylesheet once deployed. In your project (as of this build) there were **about 46 such references in 20 files** (a couple more if the Articulation Coach is installed): the sidebar's `dashboard.html` and `cvDashboard.html`, the sign-up page's `Login.html`, the three interview-simulator imports (`AvatarEngine.js` and friends), three stylesheets, and the marketing pages' `login.html` / `signup.html` / `features.html`.

```
node fix-case-sensitivity.mjs --dry-run    # see every change first
node fix-case-sensitivity.mjs              # fix them
```

It fixes the *reference* to match the real file name and never renames files. It changes a reference only when exactly one file matches ignoring case, keeps Windows line endings, is safe to re-run, and lists any link that points at a file that doesn't exist at all (a different problem it won't touch). Commit the result.
