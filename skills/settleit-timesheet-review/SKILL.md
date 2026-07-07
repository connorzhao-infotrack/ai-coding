---
name: settleit-timesheet-review
description: >-
  Review/diagnose a SettleIT team timesheet export (Timesheets-for-Jira .xlsx,
  usually named like "timesheet_report (N).xlsx" in Downloads) and produce an
  interactive HTML diagnostic that flags, per person: total hours vs expected,
  time logged on weekends or public holidays, coverage gaps (blank workdays),
  leave dates to verify against Rippling, use of non-approved SettleIT epics,
  and Research & Admin + Tech Debt over the 20% cap. Use this whenever the user
  drops a team timesheet/CSV/xlsx export and asks to "check", "review",
  "diagnose", "update the diagnose page", or asks who is over/under, who logged
  holidays, who is over the R&A cap, or wants a shareable per-person timesheet
  status page — even if they don't name the skill. Also use for follow-up
  "check again" / "give me an updated diagnose page" turns after a new export.
---

# SettleIT timesheet review

Turns a Timesheets-for-Jira team export into a color-coded, per-person diagnostic
HTML page. The rules encode InfoTrack/SettleIT's H2FY26 timesheet policy; the math
and every judgement call are documented in `references/rules.md` — read it before
changing behavior or explaining a flag.

## Workflow

1. **Locate the export.** It's an `.xlsx` from the Timesheets-for-Jira app, wide
   format (one row per person×issue, columns 3+ are day-by-day hours). Usually in
   the user's Downloads as `timesheet_report (N).xlsx`. The latest N is the newest.

2. **Run the generator:**
   ```bash
   python scripts/gen_diagnostic.py "<path to xlsx>" "<output.html>"
   ```
   It prints a one-line-per-person issue summary to stdout and writes the HTML.
   Needs `pandas` + `openpyxl` (`pip install pandas openpyxl` if missing).

3. **Show it.** Open the HTML in the user's browser. A raw `file://` path is
   refused by the Chrome tool, so serve the folder over a tiny local server and
   open `http://localhost:PORT/...`:
   ```bash
   cd <folder> && python -m http.server 8777   # run in background
   ```
   Then navigate to `http://localhost:8777/<output>.html`.

4. **Report the deltas, don't dump the table.** Summarize who's clean and who has
   what to fix, most-actionable first. On "check again" turns, diff against the
   previous export and call out what changed (who fixed what, who's new).

## Important behaviors

- **The console summary omits small total-deltas** (it lists `total±X` only in the
  page). Someone can print as `CLEAN` yet still have a sub-threshold over/under on
  the page. When asked "is everyone clean", verify totals from the data, not just
  the printout.

- **Per-period config lives at the top of `scripts/gen_diagnostic.py`** — period
  dates, public holidays, the approved-epic set, the R&A cap, and `KNOWN_START/END`
  for confirmed mid-period joiners/leavers. Update these when the period or policy
  changes; `references/rules.md` explains each.

- **Only add a person to `KNOWN_START/END` when the date is confirmed.** It clips
  their expected hours/blank-days to their real window. Guessing hides real gaps.

- **When a manager confirms a ticket is legitimately approved** (e.g. an individual
  SETTLEIT-xxxxx), add it to `APPROVED` so it stops flagging.

## The interactive page

The generated HTML (built from `assets/diag_template.html`) is self-contained and
supports, all persisted in the browser via `localStorage` (key `tsdiag-marks-v1`):
- **Click any cell** to toggle a hand-drawn red circle; **click a name** to toggle a
  green ✓ (marks that person cleared).
- **Auto-circle issues** button — circles every flagged (amber/red) cell and ✓'s
  every all-clear row. After regenerating from a new export, re-run this to resync
  the marks to the new data (via JS: `clearMarks(); autoCircle();`).
- **Hide cleared** (green + ✓) and **Hide <group>** filter buttons; state persists.
- Name-cell shading runs green→amber→red by an overall severity score.

## Related outputs (optional)

The user often also wants a **shareable status card** (progress bar + all-clear list
+ the remaining fixes) or a **note to a colleague**. Those are one-off self-contained
HTML files — write them directly, styled to match; they don't need the generator.
See `references/rules.md` for the "fix-it message" pattern (moving R&A hours to a
delivery epic to get under the cap, with specific dates/amounts).
