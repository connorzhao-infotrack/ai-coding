/* app.js — orchestration: load, filter, aggregate, render (global flow) */
(function () {
  "use strict";

  const FALLBACK_COLORS = ["#f2c23e", "#3f7fd1", "#34b39a", "#e0455e", "#9b6cd1", "#5ec8e0", "#c0d14a", "#f2a73b", "#e07ab0"];
  let DB = null, CFG = null, state = { page: "overview" };

  // ---------- bootstrap ----------
  async function boot() {
    try {
      DB = await Data.loadAll();
    } catch (err) {
      showLoadError(err);
      return;
    }
    CFG = DB.config;
    C.init(CFG);

    document.querySelector(".brand-title").textContent = CFG.meta.title || "SettleIT";
    setupTabs();
    setupFilters();
    renderFooter();
    applyPreset("26");
    window.addEventListener("resize", debounce(() => C.resizeAll(), 150));
  }

  function showLoadError(err) {
    const el = document.getElementById("loadError");
    el.hidden = false;
    el.innerHTML =
      `<b>Couldn't load the data files.</b><br>${String(err.message || err)}<br><br>` +
      `Browsers block <code>fetch()</code> of local files when opening <code>index.html</code> directly. ` +
      `Serve the folder over HTTP instead — from <code>dashboard/</code> run:<br><br>` +
      `<code>python -m http.server 8080</code><br><br>then open <code>http://localhost:8080/</code>.`;
  }

  // ---------- tabs ----------
  function setupTabs() {
    document.querySelectorAll(".tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        state.page = btn.dataset.page;
        document.getElementById("page-" + state.page).classList.add("active");
        renderActivePage();
        setTimeout(() => C.resizeAll(), 30);
      });
    });
  }

  // ---------- filters ----------
  function setupFilters() {
    document.getElementById("presetSelect").addEventListener("change", (e) => applyPreset(e.target.value));
    document.getElementById("fromDate").addEventListener("change", renderActivePage);
    document.getElementById("toDate").addEventListener("change", renderActivePage);
  }

  function applyPreset(value) {
    const max = DB.maxDate;
    let from, to = new Date(max);
    if (["8", "13", "26", "52"].includes(value)) {
      from = new Date(max); from.setDate(from.getDate() - parseInt(value, 10) * 7);
    } else if (value === "third") {
      from = thirdStart(max);
    } else if (value === "fy") {
      from = fyStart(max);
    } else { // all
      from = new Date(DB.minDate);
    }
    document.getElementById("fromDate").value = U.fmtDate(from);
    document.getElementById("toDate").value = U.fmtDate(to);
    renderActivePage();
  }

  function thirdStart(d) {
    const m = d.getMonth() + 1, y = d.getFullYear();
    if (m >= 7 && m <= 10) return new Date(y, 6, 1);   // T1 Jul
    if (m >= 11) return new Date(y, 10, 1);            // T2 Nov (this year)
    if (m <= 2) return new Date(y - 1, 10, 1);         // T2 Nov (prev year)
    return new Date(y, 2, 1);                          // T3 Mar
  }
  function fyStart(d) {
    const y = d.getFullYear();
    return (d.getMonth() + 1 >= 7) ? new Date(y, 6, 1) : new Date(y - 1, 6, 1);
  }

  function currentRange() {
    return { from: U.parseDate(document.getElementById("fromDate").value), to: U.parseDate(document.getElementById("toDate").value) };
  }
  const inRange = (r, f, t) => r._d >= f && r._d <= t;

  // ---------- time-bucket generators ----------
  function genWeeks(from, to) {
    const out = []; let d = U.weekEndingFriday(from);
    while (d <= to) { out.push(new Date(d)); d = new Date(d); d.setDate(d.getDate() + 7); }
    return out;
  }
  function genMonths(from, to) {
    const out = []; let y = from.getFullYear(), m = from.getMonth();
    const endK = U.monthKey(to);
    while (true) {
      const k = `${y}-${String(m + 1).padStart(2, "0")}`;
      out.push(k);
      if (k === endK || out.length > 240) break;
      m++; if (m > 11) { m = 0; y++; }
    }
    return out;
  }
  const wkLabel = (d) => `${d.getDate()} ${U.MONTHS[d.getMonth()]}`;

  // ---------- page dispatch ----------
  function renderActivePage() {
    if (!DB) return;
    if (state.page === "overview") renderOverview();
    else if (state.page === "deployments") renderDeployments();
    else if (state.page === "support") renderSupport();
    else if (state.page === "unittests") renderUnitTests();
  }

  // ---------- Overview ----------
  function renderOverview() {
    const { from, to } = currentRange();
    const rels = DB.releases.records.filter(r => inRange(r, from, to));
    const hots = DB.hotfixes.records.filter(r => inRange(r, from, to));
    const sup = DB.support.records.filter(r => inRange(r, from, to)).sort((a, b) => a._d - b._d);

    renderKpis(rels, hots, from, to);

    // weekly deployments + failures
    const weeks = genWeeks(from, to);
    const wkKey = (d) => U.fmtDate(U.weekEndingFriday(d));
    const relW = U.countBy(rels, r => wkKey(r._d));
    const hotW = U.countBy(hots, r => wkKey(r._d));
    C.deployFailWeekly("ovDeployChart", {
      weeks: weeks.map(wkLabel),
      deployments: weeks.map(d => relW.get(U.fmtDate(d)) || 0),
      failures: weeks.map(d => hotW.get(U.fmtDate(d)) || 0),
    });

    // weekly support stacked
    C.stacked("ovSupportChart", sup.map(r => wkLabel(r._d)), supCats(sup));

    // donuts
    C.pie("ovDeployPie", appPieItems(rels));
    C.pie("ovSupportPie", supPieItems(sup));
  }

  function renderKpis(rels, hots, from, to) {
    const weeks = Math.max(1, U.weeksBetween(from, to));
    const deployFreq = rels.length / weeks;
    const cfr = rels.length ? hots.length / rels.length : null;
    const rec = hots.map(h => h.recoveryDays).filter(v => v != null);
    const mttr = rec.length ? rec.reduce((a, b) => a + b, 0) / rec.length : null;
    const cov = DB.coverage.headlineLineCoverage;
    const lead = CFG.dora.leadTime;

    const row = document.getElementById("kpiRow");
    row.innerHTML = "";

    // 3 gauges
    row.appendChild(gaugeCell("Unit Test Line Coverage", "ovGauge1",
      `SettleIT · target ${(CFG.coverage.currentTarget * 100).toFixed(0)}%`, true));
    row.appendChild(gaugeCell("Avg Deployments / Week", "ovGauge2",
      `${rels.length} deploys over ${weeks} wks · target ${CFG.dora.deploymentFrequency.target}`, false));
    row.appendChild(gaugeCell("Lead Time for Changes", "ovGauge3", "commit → prod", true));

    // 2 number tiles
    const cfrR = U.rateLowerBetter(cfr, CFG.dora.changeFailureRate.thresholds);
    row.appendChild(numberCell("Change Failure Rate", U.fmtPct(cfr), "", cfrR, "Elite ≤ 5%"));
    const mttrR = U.rateLowerBetter(mttr, CFG.dora.failedDeploymentRecovery.thresholds);
    row.appendChild(numberCell("Failed Dep' Recovery Time", U.fmtNum(mttr, 2), "d", mttrR, "Elite ≤ 0.04d"));

    // draw gauges (containers now in DOM and visible)
    C.gauge("ovGauge1", { value: cov * 100, max: 100, isPercent: true, decimals: 1,
      color: cov >= CFG.coverage.currentTarget ? CFG.palette.good : CFG.palette.bad, target: CFG.coverage.currentTarget * 100 });
    C.gauge("ovGauge2", { value: deployFreq, max: CFG.dora.deploymentFrequency.gaugeMax, unit: "", decimals: 2,
      color: deployFreq >= CFG.dora.deploymentFrequency.target ? CFG.palette.good : CFG.palette.warn, target: CFG.dora.deploymentFrequency.target });
    C.gauge("ovGauge3", { value: lead.seedValue, max: lead.gaugeMax, unit: "d", decimals: 1,
      color: U.rateLowerBetter(lead.seedValue, lead.thresholds).cls === "good" ? CFG.palette.good : CFG.palette.warn });
  }

  function gaugeCell(label, gaugeId, sub, seed) {
    const el = document.createElement("div");
    el.className = "kpi";
    el.innerHTML = `<div class="kpi-label">${label}${seed && gaugeId === "ovGauge3" ? ' <span class="seed-badge">SEED</span>' : ""}</div>` +
      `<div class="chart" id="${gaugeId}" style="height:150px"></div><div class="kpi-sub">${sub}</div>`;
    return el;
  }
  function numberCell(label, value, unit, rating, sub) {
    const el = document.createElement("div");
    el.className = "kpi";
    const color = rating.cls === "good" ? CFG.palette.good : rating.cls === "bad" ? CFG.palette.bad : CFG.palette.warn;
    el.innerHTML =
      `<div class="kpi-label">${label}</div>` +
      `<div class="kpi-value" style="color:${color}">${value}<span class="kpi-unit">${unit}</span></div>` +
      `<span class="rating ${rating.cls}">${rating.label}</span>` +
      `<div class="kpi-sub">${sub}</div>`;
    return el;
  }

  // category series helpers
  function supCats(records) {
    return CFG.support.categories.map(c => ({
      label: c.label, color: c.color, values: records.map(r => r[c.key] || 0),
    }));
  }
  function supPieItems(records) {
    return CFG.support.categories.map(c => ({
      name: c.label, color: c.color, value: records.reduce((a, r) => a + (r[c.key] || 0), 0),
    }));
  }
  function appPieItems(rels) {
    const m = U.countBy(rels, r => r.application);
    return orderedApps(Array.from(m.keys())).map((a, i) => ({
      name: a, value: m.get(a), color: CFG.applications.colors[a] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    }));
  }
  function orderedApps(apps) {
    const order = CFG.applications.order;
    return apps.slice().sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  }

  // ---------- Deployments ----------
  function renderDeployments() {
    const { from, to } = currentRange();
    const rels = DB.releases.records.filter(r => inRange(r, from, to));
    const hots = DB.hotfixes.records.filter(r => inRange(r, from, to));
    const months = genMonths(from, to);

    // stacked by application
    const apps = orderedApps(Array.from(new Set(rels.map(r => r.application))));
    const counts = new Map(); // `${month}|${app}`
    rels.forEach(r => { const k = U.monthKey(r._d) + "|" + r.application; counts.set(k, (counts.get(k) || 0) + 1); });
    C.deployByApp("depByAppChart", {
      months: months.map(U.monthLabel),
      apps: apps.map((a, i) => ({
        name: a, color: CFG.applications.colors[a] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
        data: months.map(mk => counts.get(mk + "|" + a) || 0),
      })),
    });

    // change failure rate per month
    const relM = U.countBy(rels, r => U.monthKey(r._d));
    const hotM = U.countBy(hots, r => U.monthKey(r._d));
    C.cfrLine("cfrLineChart", {
      months: months.map(U.monthLabel),
      rates: months.map(mk => relM.get(mk) ? (hotM.get(mk) || 0) / relM.get(mk) : null),
      thresholds: CFG.dora.changeFailureRate.thresholds,
    });

    // failed deployments per month
    C.failedDepMonthly("failedDepChart", { months: months.map(U.monthLabel), counts: months.map(mk => hotM.get(mk) || 0) });
  }

  // ---------- Support ----------
  function renderSupport() {
    const { from, to } = currentRange();
    const sup = DB.support.records.filter(r => inRange(r, from, to)).sort((a, b) => a._d - b._d);
    const sys = DB.systemIssues.records.filter(r => inRange(r, from, to)).sort((a, b) => a._d - b._d);
    const months = genMonths(from, to);

    // support by month (stacked)
    const supMonthCats = CFG.support.categories.map(c => ({
      label: c.label, color: c.color,
      values: months.map(mk => sup.filter(r => U.monthKey(r._d) === mk).reduce((a, r) => a + (r[c.key] || 0), 0)),
    }));
    C.stacked("supByMonthChart", months.map(U.monthLabel), supMonthCats);

    // category pie
    C.pie("supPie", supPieItems(sup));

    // system issues breakdown by month (stacked)
    const sysCats = CFG.support.systemIssueBreakdown.map(c => ({
      label: c.label, color: c.color,
      values: months.map(mk => sys.filter(r => U.monthKey(r._d) === mk).reduce((a, r) => a + (r[c.key] || 0), 0)),
    }));
    C.stacked("sysIssuesChart", months.map(U.monthLabel), sysCats);

    // definitions
    const defs = document.getElementById("catDefs");
    defs.innerHTML = CFG.support.categories.map(c =>
      `<div class="def"><span class="swatch" style="background:${c.color}"></span>` +
      `<div><div class="def-name">${c.label}</div><div class="def-text">${c.definition}</div></div></div>`
    ).join("");
  }

  // ---------- Unit Tests ----------
  function renderUnitTests() {
    const cov = DB.coverage;
    C.coverage("coverageChart", {
      pipelines: cov.records.map(r => r.pipeline),
      branches: cov.records.map(r => r.branches),
      lines: cov.records.map(r => r.lines),
      currentTarget: cov.currentTarget, eliteTarget: cov.eliteTarget,
    });
    document.getElementById("coverageNote").innerHTML =
      `<b>Note:</b> coverage is <b>seed data</b> taken from the original Power BI screenshot (${cov.asOf}). ` +
      `It is not in the workbooks — in Phase 2 it will be pulled live from Azure DevOps code-coverage results. ` +
      `Targets: current ${(cov.currentTarget * 100).toFixed(0)}%, elite ${(cov.eliteTarget * 100).toFixed(0)}%.`;
  }

  // ---------- footer ----------
  function renderFooter() {
    const f = document.getElementById("appFooter");
    f.innerHTML =
      `Data through <b>${U.fmtDate(DB.maxDate)}</b> · ` +
      `releases: ${DB.releases.count} · hotfixes: ${DB.hotfixes.count} · ` +
      `support weeks: ${DB.support.count} · system-issue weeks: ${DB.systemIssues.count} · ` +
      `migrated ${DB.releases.generatedAt}. Coverage & lead-time are seed values (Phase 2 wires the live source).`;
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  document.addEventListener("DOMContentLoaded", boot);
})();
