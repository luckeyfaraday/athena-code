# Athena Code UI Identity Design

How the TUI stops feeling like rebranded opencode and starts feeling like a
product with its own temperament — innovative and alive, but serious. The
reference point for tone is Claude Code: a tool that is unmistakably itself
through small, disciplined touches (whimsical spinner gerunds, a branded
welcome box, one signature color), never through clutter or cosplay.

## What we already own

The foundation is in place; this document is about composing it into an
identity rather than a costume:

- **The mark.** Six-spoke hollow-centre glyph, animated bloom in
  `athena-splash.tsx`. This is our logo; nothing else in the TUI competes
  with it.
- **The palette.** `theme/assets/athena.json`: deep-green ground, gold
  primary, jade success, marble text. Reads as "bronze and olive in a dark
  command room" — distinctive, and already applied everywhere via the theme
  system.
- **The voice seed.** "command room" subtitle, `ATHENA CODE` footer label.
- **The cheap extension point.** TUI feature plugins
  (`feature-plugins/athena.tsx`, `home/athena-status.tsx`) wire in with
  one-line patch hunks. Identity work should land there whenever possible;
  every new upstream hunk is permanent merge debt.

## Design pillars

### 1. One metaphor, used sparingly: the strategist's command room

Athena is the goddess of *strategy, craft, and wisdom* — not war for its own
sake, not mysticism. That gives us a lexicon that is serious by construction:

| Surface | Borrowed term | Ours |
|---|---|---|
| working spinner | "Loading…" | *Deliberating…, Weaving…, Surveying…, Marshalling…, Consulting the archive…* |
| session recall | "search results" | *the archive* |
| end-of-session summary | usage stats | *the day's ledger* |
| memory store | "memory loaded" | *N threads held · M recalled this turn* |

Rules of restraint (this is what "like Claude does it" actually means):

- The metaphor appears in **flavor text only** — spinners, summaries,
  empty-states. Never in command names, error messages, file paths, or
  anything a user must parse under stress. `/find-sessions` stays
  `/find-sessions`; an error is an error, not a "setback."
- One flavored word per line, maximum. "Weaving…" is charming;
  "Weaving the threads of the loom of memory…" is a Renaissance faire.
- Greek words and glyphs (α, Ω, laurel) are reserved for two or three fixed
  signature spots, not sprinkled.

### 2. The owl: a state-reactive companion glyph

The innovative centrepiece. A *small* (1–2 line) owl built from box/ASCII
glyphs that lives in one fixed location (home screen idle state; optionally
the corner of the working indicator in immersive mode) and reflects what the
agent is doing:

```
  idle        thinking      working        done         error
 (o,o)        (-,-)         (o,o)         (^,^)         (O,O)
 /)_)         /)_)          /)_)~         /)_)          /)_)
```

- **Idle:** eyes open, occasional blink (a 2-frame swap every 6–12 s on a
  randomized timer — rare enough to be noticed, not watched).
- **Thinking (reasoning stream active):** eyes closed.
- **Tool running:** a subtle tail/wing tick synced to the spinner.
- **Turn complete:** brief "alert" frame, then back to idle.

Why this works: it is *functional* art — the owl is a peripheral-vision
status indicator you can read from across the room, the way Claude Code's
spinner verbs tell you the agent is alive without you reading them. It is
also tiny: one component, theme colors only, no layout impact.

Placement: the idle home screen first; accompanying the working state once
the timing feels right in a prototype.

### 3. The home screen as the command room

The idle/home state is where borrowed tools feel most generic and where we
have the most free space. Compose it from feature-plugin widgets:

```
                    \ | /
                    /   \              ← the mark (static, small)
                   A T H E N A

   the archive     3,412 sessions across 4 agents · 12 from this repo
   the memory      87 threads held · last woven 2h ago
   this campaign   branch refactor/plugin-hooks · 3 sessions this week

   (o,o)   "Know the ground before you give battle."
```

- Every line is **real data we already compute** (sessionindex counts,
  memory status.json, git branch). No decorative fake stats — seriousness
  comes from the numbers being true.
- The closing aphorism is a rotating line from a small curated set
  (strategy/craft maxims, real attributions or none). One line, muted
  color. This is our equivalent of Claude Code's whimsy: quiet, and last.

### 4. Gamification that respects the player

Hard rule: **no XP, no levels, no streak-guilt, no badges-for-showing-up.**
That register is the opposite of serious. What earns its place is
*record-keeping with ceremony* — the feeling of a logbook, not a slot
machine:

- **The ledger (end of session / `/ledger`).** A compact styled summary:
  files touched, lines woven (+/-), tools invoked, memories stored,
  sessions recalled. Like Claude Code's cost line, but composed. This is
  gamification in the only sense that fits: it makes the work *visible and
  countable*, and people genuinely chase numbers they respect.
- **Laurels: rare, milestone-only marks.** First cross-agent recall;
  1,000th indexed session; a memory recalled 50 turns after it was stored.
  Rendered as a single gold `⸙`/laurel glyph moment in the footer with a
  one-line caption, then it's gone (a permanent list lives under
  `/ledger`). Rarity is the entire design: a laurel every few weeks is an
  event; one per session is noise.
- **The archive grows visibly.** The home screen's archive count quietly
  ticking up over months *is* the progression system. Cross-agent recall
  is our killer feature; the identity should make its accumulation felt.

### 5. Micro-texture: the meander discipline

A signature horizontal motif used in exactly the places upstream uses a
plain rule — a restrained Greek-key approximation from box-drawing chars:

```
─┐ ┌─────┐ ┌─────┐ ┌──        or, simpler:        ──◆──────────◆──
```

Candidates: dialog title rules, the ledger header, splash underline. Three
fixed locations, decided once, applied consistently — texture reads as
identity only when it repeats. (Validate glyph rendering across common
fonts/terminals first; fall back to the diamond rule if the key motif is
unreliable.)

## What we deliberately do NOT do

- No full-screen art beyond the existing splash. The splash is the one
  permitted spectacle.
- No themed renaming of core verbs/commands (sessions are sessions).
- No sound, no emoji, no rainbow.
- No engagement mechanics (streaks, daily goals, notifications-to-return).
- Nothing flavored on the error path. Errors are where trust is earned.

## Implementation map (cheap → expensive)

| Phase | Work | Surface | Patch cost | Status |
|---|---|---|---|---|
| 1 | Working verb at the session prompt | `session_prompt_right` slot (`component/athena-working-verb.tsx`) | none | done 2026-06-11 |
| 1 | Home screen command room (archive/campaign lines, owl, maxim) | `home_bottom` slot (`feature-plugins/home/athena-command-room.tsx`) | none | done 2026-06-11 |
| 1b | Bronze chrome: `border`/`borderSubtle` to antique bronze — every panel, dialog, and prompt border app-wide | theme only (`theme/assets/athena.json`) | none | done 2026-06-11 |
| 1b | Home hero: mark + wordmark + epithet + meander rule, responsive to terminal height | `home_logo` slot replace (`component/athena-home-hero.tsx`) | none | done 2026-06-11 |
| 1b | Footer takeover: brand + memory + everything upstream showed (dir/branch, MCP, version) under a bronze rule | `home_footer` slot, order 50 wins single_winner (`home/athena-status.tsx`); old footer shim hunk removed from patch | net negative | done 2026-06-11 |
| 1b | Prompt placeholder voice ("Brief me on this codebase", …) | branding string-swap hunk in `routes/home.tsx` | one swap hunk | done 2026-06-11 |
| 1c | Prompt frame: full thin border with ◆ corners replaces the thick left bar + ▀ panel fade (the most opencode-identifying shape) | `athenaPromptFrame` in overlay `branding.ts`; glyph-swap hunks in `component/prompt/index.tsx` | small swap hunks | done 2026-06-11 |
| 1c | Owl v2: four lines — ear tufts, face (rendered brighter), wing tick, perch | `util/athena-identity.ts` + `component/athena-owl.tsx` | none | done 2026-06-11 |
| 1d | Sidebar removed entirely: the session sidebar was the most opencode-shaped surface left; the conversation gets the full width and the command room owns identity/status | `sidebarVisible` pinned false + toggle command removed in `routes/session/index.tsx`; sidebar slot registrations and `athena-sidebar.tsx` deleted; old sidebar color hunks reverted | net negative | done 2026-06-12 |
| 1d | The weave: working animation — a gold shuttle (◆) carrying the weft across the warp replaces the upstream knight-rider scanner; animations-off fallback shows a static `◆╌╌` | `weaveFrames` in `util/athena-identity.ts` + `util/athena-weave.ts`; swap hunks in `component/prompt/index.tsx` (net negative) | small swap hunks | done 2026-06-12 |
| 1d | The grand owl: a 22×12-cell braille stipple owl (dot-density art — tufts, horned brow, eyes that blink to sleepy crescents, beak, feathered chest, stippled branch) joins the command room on terminals ≥45 rows; companion owl below that. Frames baked from `scripts/generate-braille-owl.ts` (seeded, reproducible — regenerate, never hand-edit) | `owlGrandLines` + `AthenaGrandOwl`; height gate in `home/athena-command-room.tsx` | none | done 2026-06-12 |
| 1d | Meander texture, overlay spots: Greek-key rule under the home hero and on the splash | `meanderLine` in `util/athena-identity.ts` | none | done 2026-06-12 |
| 2 | The ledger (end-of-session summary + `/ledger`) | feature plugin + existing command registration pattern | none | |
| 3 | Laurels (milestone store under `.context-workspace`, footer moment) | feature plugin + small persistence | none | |
| 3 | Meander texture in upstream dialog chrome (e.g. dialog title rules) | component-level, may touch upstream dialog chrome | medium — audit first | |

Phase 1 is mostly assembling data we already have; it changes the felt
identity more per line of code than anything else.

Phase 1 findings: the TUI plugin slot map (`TuiHostSlotMap` in
`packages/plugin/src/tui.ts`) covers `home_logo`, `home_bottom`,
`home_footer`, and `session_prompt_right` — everything Phase 1–3 needs
registers from `feature-plugins/athena.tsx` with zero new patch hunks. (The
sidebar slots existed too, but the sidebar itself was removed in 1d.) The
one place flavor cannot reach without a hunk is the hardcoded "Thinking"
label in upstream `routes/session/index.tsx` (`ReasoningHeader`);
deliberately deferred — "Thinking" is honest and serious as-is.

Phase 1d findings: the upstream working spinner is a knight-rider scanner
(`ui/spinner.ts` `createFrames`), instantly recognizable as opencode; the
weave replaces it at the one call site (`component/prompt/index.tsx`
`spinnerDef`) and is the second signature animation after the splash bloom.
The owl never accompanies the working state — the weave plus the working
verb carry it; the owl stays on the idle home screen where it belongs.

## Open questions

1. Aphorism set: 10 real, attributed maxims shipped in
   `util/athena-identity.ts`; grow the set over time, keep attribution.
