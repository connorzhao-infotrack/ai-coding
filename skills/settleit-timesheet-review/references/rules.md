# SettleIT timesheet review — rules & math

The full logic behind every flag. The generator (`scripts/gen_diagnostic.py`)
implements this; this file is the source of truth for *why*.

## Input shape

Timesheets-for-Jira export, sheet 0, no header row used:
- Row 0, col 0: `Timesheet Period: ...`
- Row 1: column headers (`Project Name`, `Time entry: User`, `Issue Key`, day columns…, `Total`)
- Rows 2..: one row per **person × issue-key**. Col 0 = project, col 1 = person,
  col 2 = issue key, cols 3.. = hours per calendar day starting at `PERIOD_START`.
- A trailing `Total` row is ignored.

A person can appear under several projects (SettleIT, Family, AI Paralegal &
ChatBot, MCP, Quality Assurance, Disclosure & Shared Services). Hours are summed
per day across all their rows.

## Who the strict rules apply to

Classify each person by **dominant project** (most hours):
- `is_sit` = dominant project is `SettleIT`.
- `assess` (SettleIT rules apply) = `is_sit` OR SettleIT is ≥45% of their hours.
  This catches split people (e.g. Family/SettleIT) whose SettleIT time is
  substantial enough to hold to the epic/cap rules.

**Universal checks (everyone, any project):** total hours vs expected, weekends,
public holidays, per-day over-logging, coverage (blank workdays).
**SettleIT-only checks (`assess` people):** approved-epic use, and the
Research & Admin + Tech Debt cap. Non-SettleIT people show `n/a` in those columns.

## Daily norm

Each person's expected hours/day = the **modal** daily total across their worked
weekdays (usually 7.5; Family logs 7.6; some contractors 8.0). Using their own
modal rate avoids false over/under flags from a flat assumption.

## Total lodged vs expected

- Expected = (working days in the person's window) × their norm.
- Window = full period, UNLESS they're in `KNOWN_START`/`KNOWN_END` (confirmed
  joiner/leaver), which clips it to real employment. This is the ONLY thing that
  should shrink the window — a late first-entry alone does **not**, because that's
  usually just unlogged time we want to surface.
- Tolerance is tight: `|delta| < 0.6h` = "on target". Anything else is flagged with
  a plain-English reason:
  - **over**: if the extra comes from days above the norm, say how many and the
    rate (e.g. "57 days at 7.6h/day = +5.7h" — the Family rate, not an error);
    else "check for a duplicate/extra entry".
  - **under**: name the partial days ("01 May only 1h") and/or blank workdays.
- A late-first / early-last span (but not confirmed) still shows the real delta
  plus a muted "logged X–Y · confirm start/end date?" nudge.

## Weekends & public holidays

Any hours on a Saturday/Sunday, or on a date in `HOL`, are flagged. `HOL` is
location-specific (NSW by default). If team members are offshore/interstate,
their local holidays differ — flag but caveat; don't assume.

## Coverage (blank workdays)

Blank = a working day in the window with zero hours. Counted over the **full
window** (not just between first and last entry) so pre-start unlogged stretches
show up — this is what makes a −85h total reconcile with "13 blank days" instead
of hiding them. Contiguous blanks are compressed into date ranges in the cell.

## Approved epics

SettleIT time logged against an issue key not in `APPROVED` is flagged
(`non-approved`, red for `is_sit`, amber for split people). The base set is the
period's Timesheets Confluence page epics: 2089, 573, 6024, 8714, 9877, 9878,
9836, 9804, 9809. Add confirmed one-off tickets to `APPROVED` as managers approve
them (e.g. 10472 for William, 10501/10502 for Ivy).

## Research & Admin + Tech Debt cap

`RA` = {2089 Research & Admin, 573 Tech Debt}. `ra_pct` = RA hours ÷ SettleIT hours.
- **> 20% (`CAP_HIGH`)** → flagged "over". This is a ceiling (finance rule).
- **< 3% (`CAP_LOW`) with real SettleIT time** → "too low": everyone does *some*
  admin, so ~0% usually means it wasn't logged. A normal-low figure (e.g. 6%) is
  fine — only near-zero flags.
- 10–20% is the ideal band; being comfortably under is fine.
- **Moving RA hours matters where they go:** shifting to another *SettleIT* epic
  (e.g. 9836) drops the ratio; shifting to a non-SettleIT project (e.g. AI
  Paralegal AIPC-128) shrinks the denominator too and barely moves the %.

## Leave column

Leave = hours on `SETTLEIT-6024`. Shown as day-equivalents (hours ÷ 7.5), total
hours, and the specific date ranges — so the person's manager can verify against
Rippling. (Note: Rippling visibility is limited to your own direct reports; others
need their manager. Leave is surfaced, not auto-reconciled.)

## Severity → name shade

A score drives the green→amber→red name-cell shade:
`1.5×holidays + 1.5×weekends + 0.5×min(over-days,4) + 0.3×blanks
 + 2 (non-approved) + 2.5 (RA over) or 1.5 (RA near-zero)
 + total-delta penalty (4 if <−100, 2 if <−30, 1 if any off-target; skipped for
 confirmed joiners/leavers)`.
Score 0 → solid green + `data-green="1"` (drives the Hide-cleared filter). Higher
scores interpolate amber→dark-red. Over-hours are down-weighted so a few "8.0h vs
7.5h" days don't read as severe as genuinely missing 300 hours.

## Fix-it message pattern (for getting under the R&A cap)

When someone is over 20%, produce a specific, shareable instruction:
1. Compute hours to move: `RA - CAP_HIGH% × SettleIT`.
2. Prefer moving off the **chunky R&A days first** (any day logged well above the
   usual 1h) so fewer dates are touched — list those dates and amounts.
3. Move them onto an approved **SettleIT delivery epic** (9836/10472), not a
   non-SettleIT project.
4. State the resulting %. If only 1h/day entries remain, moving N hours = touching
   N days; pick a clean contiguous block and give the exact dates.
