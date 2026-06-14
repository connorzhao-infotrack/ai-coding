/* data.js — loads the JSON data store (global `Data`) */
(function () {
  "use strict";

  const FILES = {
    config: "data/config.json",
    releases: "data/releases.json",
    hotfixes: "data/hotfixes.json",
    support: "data/support-weekly.json",
    systemIssues: "data/system-issues.json",
    orders: "data/orders.json",
    releasesOverview: "data/releases-overview.json",
    coverage: "data/coverage.json",
  };

  async function loadAll() {
    const out = {};
    await Promise.all(Object.entries(FILES).map(async ([key, path]) => {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
      out[key] = await res.json();
    }));

    // records arrays with dates pre-parsed for convenience
    out.releases.records.forEach(r => { r._d = U.parseDate(r.date); });
    out.hotfixes.records.forEach(r => { r._d = U.parseDate(r.date); });
    out.support.records.forEach(r => { r._d = U.parseDate(r.weekEnding); });
    out.systemIssues.records.forEach(r => { r._d = U.parseDate(r.weekEnding); });

    // overall data date span (max across the time series)
    const maxOf = arr => arr.reduce((mx, r) => r._d > mx ? r._d : mx, new Date(2000, 0, 1));
    const minOf = arr => arr.reduce((mn, r) => r._d < mn ? r._d : mn, new Date(2999, 0, 1));
    out.maxDate = new Date(Math.max(maxOf(out.releases.records), maxOf(out.support.records)));
    out.minDate = new Date(Math.min(minOf(out.releases.records), minOf(out.support.records)));
    return out;
  }

  window.Data = { loadAll };
})();
