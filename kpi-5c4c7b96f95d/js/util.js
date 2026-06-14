/* util.js — date, aggregation and formatting helpers (global `U`) */
(function () {
  "use strict";

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function parseDate(s) {
    // 'YYYY-MM-DD' -> Date at local midnight (avoid TZ shifting the day)
    if (s instanceof Date) return s;
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function fmtDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Friday on/after the given date — matches the support sheet's "Week Ending".
  function weekEndingFriday(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const add = (5 - x.getDay() + 7) % 7; // Fri = 5
    x.setDate(x.getDate() + add);
    return x;
  }

  function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
  }

  // InfoTrack FY/third for a date: FY starts Jul; T1 Jul–Oct, T2 Nov–Feb, T3 Mar–Jun.
  function fyThird(d) {
    const m = d.getMonth() + 1; // 1..12
    let fy, third;
    if (m >= 7 && m <= 10) { third = 1; fy = d.getFullYear() + 1 - 2000; }
    else if (m >= 11)      { third = 2; fy = d.getFullYear() + 1 - 2000; }
    else if (m <= 2)       { third = 2; fy = d.getFullYear() - 2000; }
    else                   { third = 3; fy = d.getFullYear() - 2000; } // Mar–Jun
    return { fy, third, label: `T${third}FY${fy}` };
  }

  function weeksBetween(a, b) {
    return Math.max(1, Math.round((b - a) / (7 * 24 * 3600 * 1000)));
  }

  // ---- aggregation ----
  function countBy(items, keyFn) {
    const m = new Map();
    for (const it of items) {
      const k = keyFn(it);
      if (k == null) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }
  function sumBy(items, keyFn, valFn) {
    const m = new Map();
    for (const it of items) {
      const k = keyFn(it);
      if (k == null) continue;
      m.set(k, (m.get(k) || 0) + (valFn(it) || 0));
    }
    return m;
  }
  function sortedKeys(map) { return Array.from(map.keys()).sort(); }

  // ---- formatting ----
  const fmtPct = (x, dp = 2) => (x == null || isNaN(x)) ? "—" : (x * 100).toFixed(dp) + "%";
  const fmtNum = (x, dp = 2) => (x == null || isNaN(x)) ? "—" : Number(x).toFixed(dp);
  const fmtInt = (x) => (x == null || isNaN(x)) ? "—" : Math.round(x).toLocaleString();

  // Rate ratings (lower is better). Returns {label, cls} where cls in good|warn|bad.
  function rateLowerBetter(value, th) {
    if (value == null || isNaN(value)) return { label: "—", cls: "warn" };
    if (value <= th.elite) return { label: "Elite", cls: "good" };
    if (value <= th.high)  return { label: "High", cls: "good" };
    if (value <= th.medium) return { label: "Medium", cls: "warn" };
    return { label: "Low", cls: "bad" };
  }

  window.U = {
    MONTHS, parseDate, fmtDate, weekEndingFriday, monthKey, monthLabel, fyThird,
    weeksBetween, countBy, sumBy, sortedKeys, fmtPct, fmtNum, fmtInt, rateLowerBetter,
  };
})();
