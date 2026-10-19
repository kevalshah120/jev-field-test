// Inline-SVG charts, no library. Every chart carries an aria-label and <title> tooltips; colours come from CSS classes.
const NS = "http://www.w3.org/2000/svg";

function S(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid != null) e.append(typeof kid === "string" ? document.createTextNode(kid) : kid);
  return e;
}
const tip = (text) => S("title", {}, text);
function root(w, h, label) {
  return S("svg", { class: "chart", viewBox: `0 0 ${w} ${h}`, role: "img", "aria-label": label, preserveAspectRatio: "xMidYMid meet" });
}
const pc = (v, d = 0) => `${(100 * v).toFixed(d)}%`;

// Small dot-and-whisker with a baseline tick on a 0..100% axis (used in tables and tiles).
export function dotWhisker({ acc, ci, baseline, width = 140, height = 18, label }) {
  const x = (v) => 4 + v * (width - 8);
  const svg = root(width, height, label || `accuracy ${pc(acc, 1)}, interval ${pc(ci[0], 1)} to ${pc(ci[1], 1)}, baseline ${pc(baseline, 1)}`);
  svg.setAttribute("style", `width:${width}px;display:inline-block;vertical-align:middle`);
  svg.append(S("line", { class: "ax", x1: x(0), x2: x(1), y1: height / 2, y2: height / 2 }));
  if (baseline != null) svg.append(S("line", { class: "tick", x1: x(baseline), x2: x(baseline), y1: 2, y2: height - 2 }, tip(`baseline ${pc(baseline, 1)}`)));
  if (ci) svg.append(S("line", { class: "whisk", x1: x(ci[0]), x2: x(ci[1]), y1: height / 2, y2: height / 2 }));
  svg.append(S("circle", { class: "dot", cx: x(acc), cy: height / 2, r: 4 }, tip(`accuracy ${pc(acc, 1)}`)));
  return svg;
}

function axes(svg, { l, r, t, b, w, h, xTicks = [0, .25, .5, .75, 1], yTicks = [0, .25, .5, .75, 1], xLabel, yLabel, fmtX = pc, fmtY = pc }) {
  const X = (v) => l + v * (w - l - r), Y = (v) => h - b - v * (h - t - b);
  for (const v of yTicks) {
    svg.append(S("line", { class: "gridline", x1: l, x2: w - r, y1: Y(v), y2: Y(v) }), S("text", { x: l - 6, y: Y(v) + 3, "text-anchor": "end" }, fmtY(v)));
  }
  for (const v of xTicks) svg.append(S("text", { x: X(v), y: h - b + 14, "text-anchor": "middle" }, fmtX(v)));
  svg.append(S("line", { class: "ax", x1: l, x2: l, y1: t, y2: h - b }), S("line", { class: "ax", x1: l, x2: w - r, y1: h - b, y2: h - b }));
  if (xLabel) svg.append(S("text", { x: (l + w - r) / 2, y: h - 2, "text-anchor": "middle" }, xLabel));
  if (yLabel) svg.append(S("text", { x: 4, y: t - 12 }, yLabel));
  return { X, Y };
}

// Stated confidence against observed accuracy; dot area is proportional to the number of answers.
export function reliability(bins, { w = 360, h = 300, minN = 0, label = "Reliability diagram" } = {}) {
  const use = bins.filter((b) => b.n >= minN);
  const total = use.reduce((s, b) => s + b.n, 0) || 1;
  const svg = root(w, h, `${label}: ${use.map((b) => `confidence ${pc(b.confidence)} accuracy ${pc(b.accuracy)} (${b.n} answers)`).join("; ")}`);
  const { X, Y } = axes(svg, { l: 40, r: 10, t: 28, b: 34, w, h, xLabel: "stated confidence", yLabel: "observed accuracy" });
  svg.append(S("line", { class: "diag", x1: X(0), y1: Y(0), x2: X(1), y2: Y(1) }));
  svg.append(S("polyline", { class: "line", points: use.map((b) => `${X(b.confidence)},${Y(b.accuracy)}`).join(" ") }));
  for (const b of use) svg.append(S("circle", { class: "dot", cx: X(b.confidence), cy: Y(b.accuracy), r: 3 + 9 * Math.sqrt(b.n / total) },
    tip(`confidence ${pc(b.confidence, 1)}, accuracy ${pc(b.accuracy, 1)}, ${b.n} answers`)));
  return svg;
}

// Error rate among the answers kept when only the most confident share is automated.
export function riskCoverage(curve, { w = 360, h = 300, label = "Risk and coverage", maxErr } = {}) {
  const pts = curve.map((p) => ({ x: p.coverage, y: 1 - p.accuracy }));
  const top = maxErr ?? Math.max(.1, Math.ceil(Math.max(...pts.map((p) => p.y)) * 10) / 10);
  const svg = root(w, h, `${label}: ${pts.map((p) => `automate ${pc(p.x)} of answers, ${pc(p.y, 1)} wrong`).join("; ")}`);
  const yt = [0, top / 2, top];
  const { X, Y } = axes(svg, { l: 40, r: 10, t: 28, b: 34, w, h, yTicks: yt.map((v) => v / top), fmtY: (v) => pc(v * top), xLabel: "share of answers automated (most confident first)", yLabel: "error among automated" });
  svg.append(S("polyline", { class: "line", points: pts.map((p) => `${X(p.x)},${Y(p.y / top)}`).join(" ") }));
  for (const p of pts) svg.append(S("circle", { class: "dot", cx: X(p.x), cy: Y(p.y / top), r: 3 }, tip(`automate ${pc(p.x)}: ${pc(p.y, 1)} wrong`)));
  return svg;
}

// Accuracy against number of options (categorical x), chance line, optional full-label-set mark.
export function optionChart({ ks, accuracy, chance, full, fullK, title }, { w = 300, h = 200 } = {}) {
  const svg = root(w, h, `${title}: accuracy ${ks.map((k, i) => `${k} options ${pc(accuracy[i])}`).join(", ")}${full != null ? `; full label set (${fullK} options) ${pc(full)}` : ""}`);
  const l = 38, r = 8, t = 12, b = 28;
  const X = (i) => l + (ks.length === 1 ? .5 : i / (ks.length - 1)) * (w - l - r), Y = (v) => h - b - v * (h - t - b);
  for (const v of [0, .5, 1]) svg.append(S("line", { class: "gridline", x1: l, x2: w - r, y1: Y(v), y2: Y(v) }), S("text", { x: l - 6, y: Y(v) + 3, "text-anchor": "end" }, pc(v)));
  svg.append(S("polyline", { class: "line2", points: ks.map((k, i) => `${X(i)},${Y(chance[i])}`).join(" ") }, tip("chance")));
  svg.append(S("polyline", { class: "line", points: ks.map((k, i) => `${X(i)},${Y(accuracy[i])}`).join(" ") }));
  ks.forEach((k, i) => {
    svg.append(S("circle", { class: "dot", cx: X(i), cy: Y(accuracy[i]), r: 3.5 }, tip(`${k} options: ${pc(accuracy[i], 0)} (chance ${pc(chance[i], 1)})`)), S("text", { x: X(i), y: h - b + 14, "text-anchor": "middle" }, String(k)));
  });
  if (full != null) {
    const idx = ks.indexOf(fullK);
    const fx = idx >= 0 ? X(idx) : w - r - 6;
    svg.append(S("circle", { class: "hollow", cx: fx, cy: Y(full), r: 4.5 }, tip(`full label set (${fullK} options): ${pc(full, 0)}`)));
  }
  svg.append(S("text", { x: (l + w - r) / 2, y: h - 2, "text-anchor": "middle" }, "number of options"));
  return svg;
}

// Horizontal bars: rows = [{label, value, cls}], values are fractions 0..max.
export function hbars(rows, { w = 520, rowH = 22, max = 1, fmt = (v) => pc(v, 1), label = "Bar chart", labelW = 150 } = {}) {
  const h = rows.length * rowH + 6;
  const svg = root(w, h, `${label}: ${rows.map((r) => `${r.label} ${fmt(r.value)}`).join("; ")}`);
  rows.forEach((r, i) => {
    const y = i * rowH + 3, bw = Math.max(1, (r.value / max) * (w - labelW - 56));
    svg.append(S("text", { x: labelW - 6, y: y + rowH / 2 + 1, "text-anchor": "end" }, r.label),
      S("rect", { class: r.cls || "dot", x: labelW, y: y + 3, width: bw, height: rowH - 8, rx: 2 }, tip(`${r.label}: ${fmt(r.value)}`)),
      S("text", { x: labelW + bw + 6, y: y + rowH / 2 + 1 }, fmt(r.value)));
  });
  return svg;
}

// Scatter with a diagonal (used for raw against recalibrated ECE).
export function scatter(points, { w = 360, h = 320, max = .4, xLabel, yLabel, label = "Scatter" } = {}) {
  const svg = root(w, h, `${label}: ${points.length} points`);
  const ticks = [0, .25, .5, .75, 1];
  const { X, Y } = axes(svg, { l: 44, r: 10, t: 28, b: 36, w, h, xTicks: ticks, yTicks: ticks, fmtX: (v) => (v * max).toFixed(2), fmtY: (v) => (v * max).toFixed(2), xLabel, yLabel });
  svg.append(S("line", { class: "diag", x1: X(0), y1: Y(0), x2: X(1), y2: Y(1) }));
  for (const p of points) svg.append(S("circle", { class: p.cls || "dot", cx: X(Math.min(1, p.x / max)), cy: Y(Math.min(1, p.y / max)), r: 3.5 }, tip(p.label)));
  return svg;
}

// Radar: axes = [labels], series = [{values, cls}] with values 0..1.
export function radar(axesLabels, series, { size = 420, label = "Radar chart" } = {}) {
  const c = size / 2, R = size / 2 - 70, n = axesLabels.length;
  const svg = root(size, size, `${label}: ${axesLabels.map((a, i) => `${a} ${series.map((s) => pc(s.values[i])).join(" / ")}`).join("; ")}`);
  const P = (i, v) => [c + Math.sin((2 * Math.PI * i) / n) * R * v, c - Math.cos((2 * Math.PI * i) / n) * R * v];
  for (const g of [.25, .5, .75, 1]) svg.append(S("polygon", { class: "gridline", fill: "none", points: axesLabels.map((_, i) => P(i, g).join(",")).join(" ") }));
  axesLabels.forEach((a, i) => {
    const [x, y] = P(i, 1.14);
    svg.append(S("line", { class: "gridline", x1: c, y1: c, x2: P(i, 1)[0], y2: P(i, 1)[1] }),
      S("text", { x, y: y + 3, "text-anchor": Math.abs(x - c) < 6 ? "middle" : x > c ? "start" : "end" }, a));
  });
  for (const s of series) svg.append(S("polygon", { class: s.cls, points: s.values.map((v, i) => P(i, v).join(",")).join(" ") }));
  return svg;
}

// Paired bars for two conditions: items = [{label, a, b}], names = [nameA, nameB].
export function pairedBars(items, names, { w = 520, rowH = 34, label = "Paired bars" } = {}) {
  const h = items.length * rowH + 24;
  const svg = root(w, h, `${label}: ${items.map((i) => `${i.label} ${names[0]} ${pc(i.a, 1)}, ${names[1]} ${pc(i.b, 1)}`).join("; ")}`);
  const l = 150, bw = w - l - 60;
  items.forEach((it, i) => {
    const y = i * rowH + 4;
    svg.append(S("text", { x: l - 6, y: y + 14, "text-anchor": "end" }, it.label),
      S("rect", { class: "dot", x: l, y, width: it.a * bw, height: 11, rx: 2 }, tip(`${names[0]}: ${pc(it.a, 1)}`)),
      S("text", { x: l + it.a * bw + 5, y: y + 10 }, pc(it.a, 1)),
      S("rect", { class: "dot2", x: l, y: y + 14, width: it.b * bw, height: 11, rx: 2 }, tip(`${names[1]}: ${pc(it.b, 1)}`)),
      S("text", { x: l + it.b * bw + 5, y: y + 24 }, pc(it.b, 1)));
  });
  svg.append(S("text", { x: l, y: h - 4 }, `top bar: ${names[0]}   bottom bar: ${names[1]}`));
  return svg;
}

export function textBar(counts, scale = 2) {
  const span = document.createElement("span");
  span.className = "textbar";
  span.setAttribute("aria-hidden", "true");
  for (const [k, cls] of [["A", "a"], ["B", "b"], ["C", "c"]]) {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = "■".repeat(Math.round((counts[k] || 0) * scale));
    span.append(s);
  }
  return span;
}
