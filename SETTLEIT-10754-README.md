# SETTLEIT-10754 — Proactive next-step suggestions (AI Paralegal)

**Handoff document.** Everything an AI agent needs to pick this work up: what was produced, what was
decided (and by whom), what is still open, and where the code lives.

Ticket: <https://infotrack.atlassian.net/browse/SETTLEIT-10754> — *"Automatic AI prompts for next step"*
Status as of 27 Jul 2026: **wave 1 built and merged.** The deterministic engine (PR
[#9334](https://github.com/InfoTrackGlobal/SettleIT/pull/9334)) and the frontend pills + auto-advance
(PR [#9339](https://github.com/InfoTrackGlobal/SettleIT/pull/9339)) are on `develop`. Wave 2 rules
([SETTLEIT-10817](https://infotrack.atlassian.net/browse/SETTLEIT-10817)) are still open, and **six
product questions are with Lexi** — see `next-step-decisions-and-questions.html` below.

---

## 1. Deliverables produced

Two self-contained HTML pages. Both are in this repo (`ai-coding`, public) and served via GitHub Pages.

| File (canonical path) | Live URL | What it is |
|---|---|---|
| `C:\code\ai-coding\ai-paralegal-interaction-lab.html` | <https://connorzhao-infotrack.github.io/ai-coding/ai-paralegal-interaction-lab.html> | **Interactive prototype** + research tab |
| `C:\code\ai-coding\next-step-engine-decision.html` | <https://connorzhao-infotrack.github.io/ai-coding/next-step-engine-decision.html> | **The plan** — deterministic engine, Lexi's chart redrawn |
| `C:\code\ai-coding\next-step-decisions-and-questions.html` | <https://connorzhao-infotrack.github.io/ai-coding/next-step-decisions-and-questions.html> | **Current status** — 6 open questions for Lexi, confirmed decisions, code findings |

Claude artifact mirrors (private, same content):

- Lab — <https://claude.ai/code/artifact/10de8ee7-263a-4020-b5b1-0007f48432f9>
- Plan — <https://claude.ai/code/artifact/d0eeef87-45bc-4154-917f-bdc7170d2f62>
- Earlier UX exploration (5 ranked pill placements; **artifact only, not in this repo**) —
  <https://claude.ai/code/artifact/eac39977-8a81-480d-baed-89a2470e3e72>

### 1a. `ai-paralegal-interaction-lab.html`

Clickable mock of the AI Paralegal chat. Controls in the top bar:

- **Variant** — `B+ · In-transcript (ship now)` (default), `A · Canonical stage (post-project)`,
  `C · Workspace + chat right`
- **Device** — Desktop / Phone · **Pill** — Docked / Trailing · **Statements** — Live / Versioned
- **⚡ Simulate client progress** — drives the scripted state changes · **Reset**
- **Theme** — light by default, toggle to dark
- Two page tabs: **🧪 Interactive lab** and **📊 Research & findings**

Demo script (order matters): place the settlement order → agent auto-advances into Onboarding →
⚡ Simulate (onboarding completes, auto-advances to Provide documents) → Book settlement date →
confirm booking (auto-advances into Settlement financials, pills appear) → ⚡ Simulate again
(council rates change — behaves differently per Statements toggle).

### 1b. `next-step-engine-decision.html`

The build plan. Sections: behaviour mock-up (auto-advance vs docked pills) → **"define pre-determined"**
(answers Lexi's direct question) → **Lexi's proactiveness chart redrawn** → does-the-chart-make-sense +
5 open questions → **the deterministic build** → *optional/parked* LLM section → appendix scorecard.

---

## 2. Decisions made (and by whom)

**People:** June Lee = **dev manager** (ticket reporter). Lexi Sun = **PM** (product/UX owner).
Corey / Dan P / Christian Beck = approval chain for design changes.

### From call 1 (21 Jul 2026, ~20 min — June, Lexi, Connor)

1. **Layout is frozen for this project.** The approved design (chat + right milestone rail, components
   rendered into the transcript) stays. Changing it needs re-approval Dan P/Corey want to avoid
   mid-flight. → Variant **A** (canonical stage) and **C** (workspace) are **post-project**.
2. **Ship-now solution = "B+"**, all behaviour inside the frozen layout:
   - Superseded copies of a component **collapse to one-line stubs**.
   - Only the **latest copy stays expanded and live** (SignalR/refetch), marked with a subtle green dot
     (label on hover) + a transient "Updated just now".
   - Completed actions lock into **immutable receipts**.
3. **Proactivity beats suggestions.** Single-route transitions **auto-advance** (no pill, no click) —
   the exec / Christian Beck "fewer clicks" ask. Pills only at genuine crossroads.
4. **Pill placement** — docked *above* the composer (ChatGPT-style). The other AI-paralegal team's
   below-composer pattern was rejected by all three.
5. **Parked** — wrapping agent messages in bubbles (tables/DTP look bad inside bubbles).

### From call 2 (21 Jul 2026 PM, ~6.5 min — Lexi, Connor)

6. **Lexi's dispute concern (still open, see §4):** a fully-live component rewrites the record a client
   disputed from — *"my old record will be gone"*; *"if I received a message, I don't expect it to
   change — that's the whole point of a chat."*
   Proposed answer: **two-class split** — status *windows* stay live; **$-figure *statements*
   (adjustments, DTP, trust) become stamped immutable versions**, superseded copies staying readable
   in place, changes arriving as a **new full stamped copy**, history also on ask.
   Connor leans all-live. The lab's **Statements: Live / Versioned** toggle demos both.

### After Lexi delivered the flow chart (Teams)

7. **The flows are pre-determined — no LLM in the next-step path.** Lexi's *"Proactiveness of SettleIT
   Agent"* chart is a state machine; every auto-vs-prompt decision is a fixed guard over order state.
   Even the financials crossroad just shows the fixed set of currently-valid sub-steps.
8. **Crossroad pills use a hand-authored fixed priority order** (no ranking model).
9. **LLM options are parked** as an optional future layer — documented but explicitly not planned.

### Interaction rules agreed along the way

- **Auto-advance depth = "start & show"** — open, prep, announce. **Never** fires outbound actions
  (client emails, lodgement, money, approval) without an explicit tap.
- **No undo/escape chip** on auto-advance — keep it clean.
- **Milestone click focus rule:** if a live copy exists **within the last 2 transcript entries** →
  scroll to it and flash its border (never re-render). **Older than that** → re-anchor: append a fresh
  copy at the bottom, old one collapses to a stub (don't drag the user away from the composer).
  Versioned statements always navigate, never duplicate.
- **Pill sizing:** 1–4 pills, design for ≤3. Labels ≤6 words, target 2–4, verb-first imperative.

---

## 3. The plan to implement (deterministic engine)

Mirror the existing `RenderToolCatalogue` pattern. Three pieces, all pure/testable, **no model call**:

1. **Transition map + guards** — every milestone/state → next action(s) + the chart's conditions
   ("only if onboarding still pending", "only if invitation status pending", "only if docs still
   missing"). This *is* Lexi's chart, in code/config.
2. **`NextStepCatalogue`** — the fixed set of real actions; each with stable id, label, `actionKind`
   (`view` | `action` | `outbound`), and the tool/component it fires. A pill can only ever be a real
   catalogue entry.
3. **Resolver → typed signal** — pure function: order state → `{ auto?, suggestions[] }`. Emitted on
   turn end and on milestone state-change. Client auto-advances or docks the pills.

Decision rules:

| Situation | Behaviour |
|---|---|
| One valid next action (not on-screen, not outbound) | auto-float, no pill |
| ≥2 valid actions (crossroad) | pills, fixed priority order |
| Guarded transition ("only if…") | evaluate condition first |
| Action already on screen / informational | no prompt |
| Outbound or irreversible | always a confirm tap |

Suggested phasing: transition map + catalogue + signal (deterministic) → wire FE `suggestionStore` +
docked pills → analytics (shown / tapped / ignored per catalogue id) from day one.

---

## 4. Open questions & unsolved concerns

### For Lexi (PM) — from her chart

1. *"Multiple arrows **usually** means prompt"* — what's the exception? (The dashed "upload manual
   docs" is an extra arrow but not a prompt because it's already on screen.)
2. Financials — exact condition gating each of **Adjustments / DTP / Trust**, and the **priority
   order** for the pills.
3. *"Detect missing documents"* — a deterministic required-docs checklist, or a judgment call?
4. *"One approval"* before Settlement — confirm it's a human tap (outbound → never auto).
5. **Priority Notice** and **ELNO** milestones exist in `RenderToolCatalogue` but aren't on the chart —
   in scope, sub-steps, or later?
6. **The two-class statements question (§2.6) is still undecided** — which components are "windows"
   (live) vs "statements" (stamped/versioned)? Lexi was flowing this down.

### Engineering unknowns (biggest first)

1. **Live-refresh seam.** Artifact components currently receive **frozen props** from the agent's
   `show_*` tool call. Making the latest copy self-refreshing requires them to re-read from React Query
   / SignalR keyed on order+milestone instead. **Spike this before committing to B+.**
2. **History reload** — on transcript rehydration, something must decide which copy of each component
   is "latest" (expanded + live) vs a stub. Not handled today.
3. **Auto-advance chaining** — cap at **one hop per event** or a completed state could cascade several
   milestones in one burst.
4. **"Behaviour free" is an assumption** — worth one line to Corey/Dan P confirming stubs, live dots and
   auto-advance don't count as "changing the approved design".
5. **Failure states** — what happens when the step auto-advance opens errors (e.g. booking API down)?
   Fall back to a pill? Undefined.
6. **Cross-team consistency** — the other AI-paralegal team puts suggestions *below* the composer; we
   rejected that. Still an open cross-team question.
7. **Parked:** message-bubble wrapping; DTP/financials table density inside a ~46rem chat column
   (an argument for the post-project canonical stage).

---

## 5. Codebase context (repo: `C:\code\settleit`)

Read `CLAUDE.md` and `.claude/rules/` first — especially `architecture.md` and
`frontend-agentic-client.md`.

### Frontend — `src/frontend/client/` (Agentic AI Client)

React 18 + TS, **Zustand** (not MobX), React Query, **AG-UI** `HttpAgent` for chat, Webpack, Zenith UI.
2-space indent. No default exports. Don't annotate component return types.

- `src/agent/runTurn.ts` — AG-UI event wiring; handles `show_*` tool calls and
  `<<<artifact type="…">>>` text markers → artifact store. **This is where a `suggest_next_steps`
  signal would be intercepted.**
- `src/components/Composer/Composer.tsx` — the input; the pill dock goes **above** this box.
- `src/components/ChatPanel/` — transcript rendering.
- `src/stores/` — `chat`, `session` (holds `selectedMilestone` / `activatedMilestones`), `artifact`.
  A new `suggestionStore` would live here.
- `src/artifacts/registry.tsx`, `registerArtifacts.ts` — render-tool → component registry.

### Backend — `src/api/AiAgent/`

- **`Client/InfoTrack.SettleIt.AiAgent.Client.Agents/RenderTools/RenderToolCatalogue.cs`** —
  **the pattern to mirror** for `NextStepCatalogue`: milestone-keyed descriptors + `ForMilestone()`,
  exported to `render-tools.schema.json` for the frontend.
- `RenderTools/RenderToolNames.cs` — stable `show_*` names + versioning rules (additive props keep the
  name; breaking change mints a new one).
- `Specialists/{Onboarding,Order,ProvideDocuments,SettlementFinancials}/` — agent factories + tools.
- `src/api/Modules/Client/` — shared specialist services (ADR 0003); in-process `AITool` data path.
- `MilestoneType` enum lives in `InfoTrack.SettleIt.Domain`.

**Note:** there is currently **no** next-step/suggestion code anywhere in the repo — this is greenfield.

---

## 6. Working with these HTML pages

Both pages are **single-file, fully self-contained** — no CDN, no external fonts or scripts. This is a
hard requirement because they're published both to GitHub Pages *and* as Claude artifacts (artifact CSP
blocks all external hosts). Consequences:

- **No mermaid** — it only renders natively inside Claude artifacts, not on GitHub Pages. All flow
  charts are hand-built HTML/CSS.
- System font stacks only (`Segoe UI` / `Constantia` serif / `Cascadia Code` mono).
- Theme: **light by default** (`document.documentElement.dataset.theme = 'light'`), with a toggle;
  tokens are defined for `:root`, `@media (prefers-color-scheme: dark)`, and both `[data-theme]` values.

### Update workflow

1. Edit the HTML in `C:\code\ai-coding\`.
2. Verify in a browser before pushing — check **both themes**, no horizontal body overflow, and no
   console errors.
3. Commit and push to `main`; GitHub Pages rebuilds in ~30 s.
4. The repo copies carry a `<!doctype html><meta charset><meta name="viewport">` preamble (the artifact
   host injects these automatically; GitHub Pages does not).

**Watch out:** CSS class-name collisions. A label with `class="lab cond"` accidentally picked up the
`.cond` *condition-card* styles (border, padding, shadow) and rendered as a floating box. Keep modifier
class names namespaced.

### Repo

`ai-coding` — <https://github.com/connorzhao-infotrack/ai-coding> — **public**, GitHub Pages enabled
from `main` / root. Everything here is fictional mock data (John Harrison, 50 Bondie Road) plus design
reasoning; no client data.

---

## 7. Suggested next steps

1. Get Lexi's answers to the six questions in §4, especially the **statements live-vs-versioned** call.
2. **Spike the live-refresh seam** (§4 engineering #1) — it gates the whole B+ approach.
3. Turn the §3 plan into a ticket with acceptance criteria (catalogue + resolver + signal contract).
4. Confirm with Corey/Dan P that these behaviours don't trip the design-approval line.

Local memory files with the same decisions live at
`C:\Users\connor.zhao\.claude\projects\C--code-settleit\memory\` —
see `settleit-10754-chat-ux-decisions.md` and `settleit-team-roles.md`.
