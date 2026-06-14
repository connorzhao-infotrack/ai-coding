/* charts.js — ECharts builders (global `C`). app.js does aggregation; this renders. */
(function () {
  "use strict";

  let P = {};                 // palette
  const instances = new Map();

  function init(cfg) { P = cfg.palette; }

  function inst(elId) {
    const el = document.getElementById(elId);
    if (!el) return null;
    let ch = instances.get(elId);
    // If the cached instance is disposed OR its DOM node was replaced (e.g. the
    // KPI row was rebuilt via innerHTML), drop it and bind to the live element.
    if (ch && (ch.isDisposed() || ch.getDom() !== el)) {
      if (!ch.isDisposed()) ch.dispose();
      ch = null;
    }
    if (!ch) {
      ch = echarts.getInstanceByDom(el) || echarts.init(el, null, { renderer: "canvas" });
      instances.set(elId, ch);
    }
    return ch;
  }
  function render(elId, option) {
    const ch = inst(elId);
    if (ch) ch.setOption(option, true);
    return ch;
  }
  function resizeAll() { instances.forEach(ch => { if (!ch.isDisposed()) ch.resize(); }); }

  // ---- shared style fragments ----
  const axisText = () => ({ color: P.muted, fontSize: 11 });
  const baseGrid = (extra) => Object.assign({ left: 48, right: 18, top: 38, bottom: 46, containLabel: true }, extra || {});
  const catAxis = (data, rotate) => ({
    type: "category", data,
    axisLine: { lineStyle: { color: P.border } },
    axisTick: { show: false },
    axisLabel: Object.assign(axisText(), { rotate: rotate || 0, hideOverlap: true }),
  });
  const valAxis = (opts) => Object.assign({
    type: "value",
    axisLine: { show: false }, axisTick: { show: false },
    splitLine: { lineStyle: { color: P.grid, type: "dashed" } },
    axisLabel: axisText(),
  }, opts || {});
  const legendTop = (data) => ({
    data, top: 6, type: "scroll",
    textStyle: { color: P.muted, fontSize: 11 }, itemWidth: 12, itemHeight: 12, icon: "roundRect",
  });
  const tooltip = (trigger) => ({
    trigger: trigger || "axis",
    backgroundColor: "#11121f", borderColor: P.border,
    textStyle: { color: P.text, fontSize: 12 },
    axisPointer: { type: "shadow", shadowStyle: { color: "rgba(255,255,255,0.04)" } },
  });

  // ---- gauge (coverage / deploy freq / lead time) ----
  function gauge(elId, o) {
    const isPct = !!o.isPercent;
    const dp = o.decimals == null ? (isPct ? 1 : 2) : o.decimals;
    const opt = {
      series: [{
        type: "gauge", min: o.min || 0, max: o.max, radius: "94%", center: ["50%", "60%"],
        startAngle: 210, endAngle: -30,
        progress: { show: true, width: 12, roundCap: true, itemStyle: { color: o.color } },
        axisLine: { lineStyle: { width: 12, color: [[1, "#2a2c42"]] } },
        axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        pointer: { show: false }, anchor: { show: false },
        title: { show: false },
        detail: {
          valueAnimation: true, fontSize: 28, fontWeight: 800, color: P.text, offsetCenter: [0, "-2%"],
          formatter: (v) => (isPct ? v.toFixed(dp) + "%" : v.toFixed(dp) + (o.unit || "")),
        },
        data: [{ value: o.value }],
      }],
    };
    // optional target tick rendered as a thin colored segment
    if (o.target != null) {
      const t = Math.min(1, Math.max(0, (o.target - (o.min || 0)) / (o.max - (o.min || 0))));
      opt.series[0].axisLine.lineStyle.color = [[t, "#2a2c42"], [Math.min(1, t + 0.005), P.muted], [1, "#2a2c42"]];
    }
    return render(elId, opt);
  }

  // ---- deployments + change failures, weekly (Overview) ----
  function deployFailWeekly(elId, d) {
    return render(elId, {
      tooltip: tooltip("axis"),
      legend: legendTop(["Deployment Count", "Change Failure Count"]),
      grid: baseGrid(),
      xAxis: catAxis(d.weeks, 35),
      yAxis: valAxis(),
      series: [
        { name: "Deployment Count", type: "bar", data: d.deployments, itemStyle: { color: P.deployment }, barMaxWidth: 22 },
        { name: "Change Failure Count", type: "bar", data: d.failures, itemStyle: { color: P.changeFailure }, barMaxWidth: 22 },
      ],
    });
  }

  // ---- generic stacked categories (support / system issues) ----
  function stacked(elId, labels, cats, rotate) {
    return render(elId, {
      tooltip: tooltip("axis"),
      legend: legendTop(cats.map(c => c.label)),
      grid: baseGrid(),
      xAxis: catAxis(labels, rotate == null ? 35 : rotate),
      yAxis: valAxis(),
      series: cats.map(c => ({
        name: c.label, type: "bar", stack: "total",
        data: c.values, itemStyle: { color: c.color }, barMaxWidth: 30,
      })),
    });
  }

  // ---- pie / donut ----
  function pie(elId, items) {
    return render(elId, {
      tooltip: Object.assign(tooltip("item"), { formatter: "{b}: {c} ({d}%)" }),
      legend: { bottom: 0, textStyle: { color: P.muted, fontSize: 11 }, type: "scroll" },
      series: [{
        type: "pie", radius: ["42%", "70%"], center: ["50%", "46%"],
        avoidLabelOverlap: true, padAngle: 2,
        itemStyle: { borderColor: P.panelBg || "#1a1b2b", borderWidth: 2, borderRadius: 4 },
        label: { color: P.text, fontSize: 11, formatter: "{d}%" },
        labelLine: { lineStyle: { color: P.muted } },
        data: items.map(i => ({ name: i.name, value: i.value, itemStyle: { color: i.color } })),
      }],
    });
  }

  // ---- deployments by application, monthly stacked ----
  function deployByApp(elId, d) {
    return render(elId, {
      tooltip: tooltip("axis"),
      legend: legendTop(d.apps.map(a => a.name)),
      grid: baseGrid({ bottom: 60 }),
      xAxis: catAxis(d.months, 35),
      yAxis: valAxis(),
      series: d.apps.map(a => ({
        name: a.name, type: "bar", stack: "apps",
        data: a.data, itemStyle: { color: a.color }, barMaxWidth: 26,
      })),
    });
  }

  // ---- change failure rate line with DORA thresholds ----
  function cfrLine(elId, d) {
    const th = d.thresholds;
    // Adaptive max: always show the Elite line; grow to fit data / higher bands.
    const dataMax = Math.max(0, ...d.rates.filter((v) => v != null));
    const yMax = Math.max(th.elite * 1.25, dataMax * 1.3, 0.06);
    const mk = (val, name, color) => ({ yAxis: val, lineStyle: { color, type: "dashed", width: 1.5 }, label: { formatter: name, color, position: "insideEndTop", fontSize: 10 } });
    const lines = [mk(th.elite, "Elite 5%", P.good), mk(th.high, "High 10%", P.warn), mk(th.medium, "Medium 15%", P.bad)]
      .filter((m) => m.yAxis <= yMax);
    return render(elId, {
      tooltip: Object.assign(tooltip("axis"), { valueFormatter: (v) => v == null ? "—" : (v * 100).toFixed(2) + "%" }),
      grid: baseGrid(),
      xAxis: catAxis(d.months, 35),
      yAxis: valAxis({ max: yMax, axisLabel: Object.assign(axisText(), { formatter: (v) => (v * 100).toFixed(1) + "%" }) }),
      series: [{
        name: "Change Failure Rate", type: "line", smooth: true, connectNulls: true,
        data: d.rates, symbol: "circle", symbolSize: 6,
        lineStyle: { color: P.changeFailure, width: 2 }, itemStyle: { color: P.changeFailure },
        areaStyle: { color: "rgba(224,85,63,0.10)" },
        markLine: { silent: true, symbol: "none", data: lines },
      }],
    });
  }

  // ---- failed deployments monthly bar ----
  function failedDepMonthly(elId, d) {
    return render(elId, {
      tooltip: tooltip("axis"),
      grid: baseGrid(),
      xAxis: catAxis(d.months, 35),
      yAxis: valAxis(),
      series: [{ name: "Hotfixes", type: "bar", data: d.counts, itemStyle: { color: P.changeFailure }, barMaxWidth: 26 }],
    });
  }

  // ---- coverage by pipeline ----
  function coverage(elId, d) {
    const pct = (v) => (v * 100).toFixed(2) + "%";
    return render(elId, {
      tooltip: Object.assign(tooltip("axis"), { valueFormatter: (v) => v == null ? "—" : pct(v) }),
      legend: legendTop(["Branches", "Lines"]),
      grid: baseGrid({ bottom: 50 }),
      xAxis: catAxis(d.pipelines, 0),
      yAxis: valAxis({ max: 1, axisLabel: Object.assign(axisText(), { formatter: (v) => (v * 100).toFixed(0) + "%" }) }),
      series: [
        {
          name: "Branches", type: "bar", data: d.branches, itemStyle: { color: P.accent }, barMaxWidth: 46,
          label: { show: true, position: "inside", color: "#fff", fontSize: 10, formatter: (p) => pct(p.value) },
        },
        {
          name: "Lines", type: "bar", data: d.lines, itemStyle: { color: "#5ec8e0" }, barMaxWidth: 46,
          label: { show: true, position: "inside", color: "#08222b", fontSize: 10, fontWeight: 700, formatter: (p) => pct(p.value) },
          markLine: {
            silent: true, symbol: "none",
            data: [
              { yAxis: d.currentTarget, lineStyle: { color: P.warn, type: "dashed", width: 1.5 }, label: { formatter: "Current Target " + (d.currentTarget * 100).toFixed(0) + "%", color: P.warn, fontSize: 10, position: "insideEndTop" } },
              { yAxis: d.eliteTarget, lineStyle: { color: P.bad, type: "dashed", width: 1.5 }, label: { formatter: "Elite Target " + (d.eliteTarget * 100).toFixed(0) + "%", color: P.bad, fontSize: 10, position: "insideEndTop" } },
            ],
          },
        },
      ],
    });
  }

  window.C = { init, render, resizeAll, gauge, deployFailWeekly, stacked, pie, deployByApp, cfrLine, failedDepMonthly, coverage };
})();
