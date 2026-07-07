#!/usr/bin/env python
"""
Generate the SettleIT team timesheet diagnostic HTML from a Timesheets-for-Jira
export (.xlsx). See ../references/rules.md for the full logic and how to update
the CONFIG block for a new period.

Usage:
    python gen_diagnostic.py <input.xlsx> [output.html]

Defaults output to ./timesheet-diagnostic.html next to the input if omitted.
Requires: pandas, openpyxl  (pip install pandas openpyxl)
"""
import sys, os, warnings, datetime as dt, html
from collections import Counter, defaultdict
import pandas as pd
warnings.filterwarnings('ignore')

# ========================= CONFIG (edit per period) =========================
# Period the export covers. Everyone is measured against the working days in
# this window unless they are in KNOWN_START / KNOWN_END below.
PERIOD_START = dt.date(2026, 1, 1)
PERIOD_END   = dt.date(2026, 6, 30)

# Public holidays for the team's location (NSW shown). Time logged on these is flagged.
HOL = {dt.date(2026,1,1):'New Year', dt.date(2026,1,26):'Australia Day',
       dt.date(2026,4,3):'Good Friday', dt.date(2026,4,6):'Easter Mon',
       dt.date(2026,4,27):'Anzac(add)', dt.date(2026,6,8):"King's Bday"}

# Approved SettleIT epics/tickets for the period (from the period's Timesheets
# Confluence page). SettleIT-team members logging SettleIT time outside this set
# get flagged. Add any one-off tickets a manager has confirmed as approved.
APPROVED = {
    'SETTLEIT-2089','SETTLEIT-573','SETTLEIT-6024','SETTLEIT-8714','SETTLEIT-9877',
    'SETTLEIT-9878','SETTLEIT-9836','SETTLEIT-9804','SETTLEIT-9809',
    'SETTLEIT-10472',              # confirmed approved (William)
    'SETTLEIT-10501','SETTLEIT-10502',  # confirmed approved (Ivy)
}
RA = {'SETTLEIT-2089', 'SETTLEIT-573'}          # Research&Admin + Tech Debt (the capped bucket)
CAP_HIGH = 20.0                                  # R&A+TD must be <= this % of SettleIT time
CAP_LOW  = 3.0                                   # ...and not effectively zero (< this % flags "too low")

# Confirmed mid-period joiners/leavers ONLY. These clip a person's expected hours
# and blank-day count to their real employment window, so we don't falsely flag
# pre-hire / post-leave days. Everyone else is measured against the full period,
# so genuine gaps surface. Do NOT guess here — only add confirmed dates.
KNOWN_START = {'Jerold Shin': dt.date(2026, 3, 30)}
KNOWN_END   = {}

YOU = 'connor zhao'    # highlighted row (the reviewer). Lowercase match.
# ===========================================================================

def main():
    if len(sys.argv) < 2:
        sys.exit("usage: python gen_diagnostic.py <input.xlsx> [output.html]")
    inp = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.abspath(inp)) or '.', 'timesheet-diagnostic.html')
    tmpl_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             '..', 'assets', 'diag_template.html')

    d = pd.read_excel(inp, sheet_name=0, header=None)
    # Row 0 col0 = "Timesheet Period...", row1 = headers, data from row 2.
    # Columns 3.. are day-by-day; map each to a date starting at PERIOD_START.
    ndays = (PERIOD_END - PERIOD_START).days + 1
    date_cols = list(range(3, 3 + ndays))
    dates = [PERIOD_START + dt.timedelta(days=i) for i in range(ndays)]
    colDate = dict(zip(date_cols, dates))
    workdays = [x for x in dates if x.weekday() < 5 and x not in HOL]

    rows = []
    for r in range(2, d.shape[0]):
        if pd.isna(d.iloc[r, 1]) or str(d.iloc[r, 0]) == 'Total':
            continue
        daily = {colDate[c]: float(d.iloc[r, c]) for c in date_cols
                 if c < d.shape[1] and pd.notna(d.iloc[r, c]) and d.iloc[r, c] != 0}
        rows.append((str(d.iloc[r, 0]), str(d.iloc[r, 1]).strip(), str(d.iloc[r, 2]), daily))
    people = sorted(set(x[1] for x in rows))

    def fdate(x): return x.strftime('%d %b')

    recs = []
    for p in people:
        pr = [x for x in rows if x[1] == p]
        projhours = defaultdict(float); perday = defaultdict(float); sit_tickets = set()
        for proj, _, key, daily in pr:
            for dte, h in daily.items():
                projhours[proj] += h; perday[dte] += h
            if proj == 'SettleIT': sit_tickets.add(key)
        total = round(sum(perday.values()), 1)
        dom = max(projhours, key=projhours.get)
        sit = round(projhours.get('SettleIT', 0), 1)
        norm = Counter(round(v, 2) for dte, v in perday.items()
                       if dte in workdays and v > 0).most_common(1)[0][0]
        partials = sorted((k, v) for k, v in perday.items() if 0 < v < norm - 0.01)
        highs = sorted((k, v) for k, v in perday.items() if v > norm + 0.01)
        is_sit = dom == 'SettleIT'
        assess_sit = is_sit or (total > 0 and sit / total >= 0.45)
        first = min(perday); last = max(perday)
        known = p in KNOWN_START or p in KNOWN_END
        eff_start = KNOWN_START.get(p, dates[0]); eff_end = KNOWN_END.get(p, dates[-1])
        wd_window = [w for w in workdays if eff_start <= w <= eff_end]
        exp = round(len(wd_window) * norm, 1)
        blanks = [w for w in wd_window if w not in perday]
        started_late = first > PERIOD_START + dt.timedelta(days=6)
        ended_early = last < PERIOD_END - dt.timedelta(days=4)
        wk = sorted(x for x in perday if x.weekday() >= 5)
        hol = sorted((x, HOL[x]) for x in perday if x in HOL)
        over = sorted((x, round(perday[x], 1)) for x in perday if perday[x] > norm + 0.4)
        nonapp = sorted(t for t in sit_tickets if t not in APPROVED)
        ra = round(sum(h for proj, _, key, daily in pr if key in RA for h in daily.values()), 1)
        ra_pct = round(ra / sit * 100, 1) if sit > 0 else 0
        leave_days = sorted(dte for proj, _, key, daily in pr if key == 'SETTLEIT-6024' for dte in daily)
        leave_hours = round(sum(h for proj, _, key, daily in pr if key == 'SETTLEIT-6024'
                                for h in daily.values()), 1)
        recs.append(dict(p=p, dom=dom, is_sit=is_sit, assess=assess_sit, total=total, norm=norm,
            exp=exp, delta=round(total - exp, 1), sit=sit, ra=ra, ra_pct=ra_pct, first=first,
            last=last, blanks=blanks, started_late=started_late, ended_early=ended_early, wk=wk,
            hol=hol, over=over, nonapp=nonapp, leave_days=leave_days, leave_hours=leave_hours,
            known=known, eff_start=eff_start, eff_end=eff_end, partials=partials, highs=highs))

    def franges(days):
        if not days: return []
        out2 = []; s = e = days[0]
        for x in days[1:]:
            gap = [dd for dd in [e + dt.timedelta(days=i) for i in range(1, (x - e).days)]
                   if dd.weekday() < 5 and dd not in HOL]
            if not gap: e = x
            else: out2.append((s, e)); s = e = x
        out2.append((s, e)); return out2

    order = sorted(recs, key=lambda r: (not r['is_sit'], r['p']))
    def esc(s): return html.escape(str(s))
    def pill(cls, txt): return '<span class="pill %s">%s</span>' % (cls, esc(txt))

    rowshtml = []
    for r in order:
        p = r['p']; you = p.lower() == YOU; norm = r['norm']
        team = 'SettleIT' if r['is_sit'] else r['dom'].replace(' & ChatBot', '').replace(' - New Services', '')
        if r['assess'] and not r['is_sit']: team += ' / SettleIT'
        dl = r['delta']; reason = ''
        if abs(dl) < 0.6:
            tpill = pill('p-ok', 'on target')
        elif dl > 0:
            tpill = pill('p-warn', 'over +%gh' % dl)
            if r['highs']:
                hv = sorted(set(round(v, 2) for k, v in r['highs']))
                if len(hv) == 1:
                    reason = '%d day(s) logged at %gh/day (over the %g baseline) = +%gh' % (
                        len(r['highs']), hv[0], norm, round(len(r['highs']) * (hv[0] - norm), 1))
                else:
                    reason = '%d day(s) logged above %gh/day' % (len(r['highs']), norm)
            else:
                reason = 'logged more than %g×workdays — check for a duplicate/extra entry' % norm
        else:
            tpill = pill('p-err' if dl < -100 else 'p-warn', 'under %gh' % dl)
            bits = []
            if r['partials']: bits.append(', '.join('%s only %gh' % (fdate(k), v) for k, v in r['partials'][:3]))
            if len(r['blanks']): bits.append('%d blank workday(s)' % len(r['blanks']))
            reason = 'short — ' + ('; '.join(bits) if bits else 'a workday logged under %gh' % norm)
        if r['known']:
            expnote = 'employed %s–%s (confirmed) · exp %gh' % (fdate(r['eff_start']), fdate(r['eff_end']), r['exp'])
        else:
            expnote = 'full-period exp %gh @ %g/day' % (r['exp'], norm)
        reason_html = '<div class="muted" style="color:#a8410a">%s</div>' % reason if reason else ''
        span_note = ''
        if not r['known'] and (r['started_late'] or r['ended_early']):
            span_note = '<div class="muted">logged %s–%s · confirm start/end date?</div>' % (fdate(r['first']), fdate(r['last']))
        totalcell = '<span class="hours">%gh</span><div>%s</div>%s<span class="muted">%s</span>%s' % (r['total'], tpill, reason_html, expnote, span_note)
        holcell = pill('p-ok', 'none') if not r['hol'] else pill('p-err', '%d logged' % len(r['hol'])) + '<div class="muted">' + ', '.join('%s (%s)' % (fdate(x), n) for x, n in r['hol']) + '</div>'
        wkbits = []
        if r['wk']: wkbits.append(pill('p-err', '%d weekend' % len(r['wk'])) + '<div class="muted">' + ', '.join(fdate(x) for x in r['wk']) + '</div>')
        if r['over']:
            cls = 'p-err' if any(v > norm + 2 for _, v in r['over']) else 'p-warn'
            wkbits.append(pill(cls, '%d day(s) >%gh' % (len(r['over']), norm)) + '<div class="muted">' + ', '.join('%s:%gh' % (fdate(x), v) for x, v in r['over'][:6]) + ('…' if len(r['over']) > 6 else '') + '</div>')
        wkcell = '<br>'.join(wkbits) if wkbits else pill('p-ok', 'none')
        nb = len(r['blanks'])
        if nb == 0:
            covcell = pill('p-ok', 'complete — 0 gaps')
        else:
            cls = 'p-warn' if nb <= 6 else 'p-err'
            label = '%d blank day(s)' % nb if nb <= 6 else '%d blank workdays' % nb
            rngs = franges(r['blanks'])
            rngtxt = '; '.join(fdate(a) if a == b else '%s–%s' % (fdate(a), fdate(b)) for a, b in rngs)
            covcell = pill(cls, label) + '<div class="muted">' + rngtxt + '</div>'
        if not r['assess']:
            epiccell = pill('p-na', 'n/a — not SettleIT'); capcell = pill('p-na', 'n/a')
        else:
            if r['nonapp']:
                cls = 'p-err' if r['is_sit'] else 'p-warn'
                epiccell = pill(cls, 'non-approved') + '<div class="muted">' + ', '.join(t.replace('SETTLEIT-', '') for t in r['nonapp']) + '</div>'
            else:
                epiccell = pill('p-ok', 'all approved')
            rp = r['ra_pct']
            if rp > CAP_HIGH: capcell = pill('p-err', '%g%% — over' % rp)
            elif rp < CAP_LOW and r['sit'] > 50: capcell = pill('p-warn', '%g%% — too low' % rp)
            else: capcell = pill('p-ok', '%g%%' % rp)
            capcell += '<div class="muted">of %gh SettleIT</div>' % r['sit']
        # severity score -> name shade (green clean -> amber -> red)
        sc = 1.5*len(r['hol']) + 1.5*len(r['wk']) + min(len(r['over']),4)*0.5 + 0.3*len(r['blanks'])
        if r['assess'] and r['nonapp']: sc += 2
        if r['assess'] and r['sit'] > 50:
            if r['ra_pct'] > CAP_HIGH: sc += 2.5
            elif r['ra_pct'] < CAP_LOW: sc += 1.5
        if not r['known']:
            if r['delta'] < -100: sc += 4
            elif r['delta'] < -30: sc += 2
            elif abs(r['delta']) > 0.6: sc += 1
        if sc <= 0.001:
            namebg = '#1f9d55'; L = 42
        else:
            t = min(sc, 12) / 12.0
            hue = 45 - 45*t; L = round(82 - 48*t)
            namebg = 'hsl(%d,78%%,%d%%)' % (round(hue), L)
        nametxt = '#ffffff' if L < 58 else '#172b4d'
        submut = 'color:rgba(255,255,255,.8)' if L < 58 else 'color:#6b778c'
        cls_tr = ' class="you"' if you else ''
        namecell = esc(p) + ('<div style="font-size:11px;%s">(you)</div>' % submut if you else '') + '<div style="font-size:11px;%s">%s</div>' % (submut, esc(team))
        namestyle = ' style="background:%s;color:%s"' % (namebg, nametxt)
        green_attr = ' data-green="1"' if sc <= 0.001 else ''
        if r['leave_days']:
            rngs = franges(r['leave_days'])
            rngtxt = '; '.join(fdate(a) if a == b else '%s–%s' % (fdate(a), fdate(b)) for a, b in rngs)
            eqdays = round(r['leave_hours'] / 7.5, 1)
            leavecell = '<span class="hours">%g days</span><div class="muted">%gh logged</div><div class="muted">%s</div>' % (eqdays, r['leave_hours'], rngtxt)
        else:
            leavecell = pill('p-na', 'none logged')
        rowshtml.append('<tr%s data-person="%s"%s><td class="name"%s>%s</td><td class="totalcell">%s</td><td>%s</td><td>%s</td><td>%s</td><td class="leavecell">%s</td><td>%s</td><td>%s</td></tr>' % (cls_tr, esc(p), green_attr, namestyle, namecell, totalcell, holcell, wkcell, covcell, leavecell, epiccell, capcell))

    template = open(tmpl_path, encoding='utf-8').read()
    open(out, 'w', encoding='utf-8').write(template.replace('{{ROWS}}', '\n'.join(rowshtml)))
    print("wrote %s with %d people" % (out, len(order)))
    for r in order:
        iss = []
        if abs(r['delta']) > 0.6: iss.append('total%+g' % r['delta'])
        if r['hol']: iss.append('%dhol' % len(r['hol']))
        if r['wk']: iss.append('%dwknd' % len(r['wk']))
        if r['over']: iss.append('%dover' % len(r['over']))
        if len(r['blanks']) > 6: iss.append('%dgaps' % len(r['blanks']))
        if r['assess'] and r['nonapp']: iss.append('nonappr')
        if r['assess'] and r['sit'] > 50 and (r['ra_pct'] > CAP_HIGH or r['ra_pct'] < CAP_LOW):
            iss.append('RA%g%%' % r['ra_pct'])
        print('  %-3s %-22s %s' % ('SIT' if r['is_sit'] else 'oth', r['p'], iss if iss else 'CLEAN'))

if __name__ == '__main__':
    main()
