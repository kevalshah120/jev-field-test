import { chrome, load, el, pct, fix, int, fail, verdictPill, qs, $, mount } from "./app.js";
import { reliability, hbars, scatter } from "./charts.js";

const app = $("#app");

async function main() {
  const [meta, rows, domains, cal] = await Promise.all([chrome("trust.html", "Trust and confidence"), load("datasets"), load("domains"), load("calibration")]);
  const dom = [...domains].sort((a, b) => b.wrong_all_90 - a.wrong_all_90);
  const chart = hbars(dom.map((d) => ({ label: d.name, value: d.wrong_all_90, cls: d.wrong_all_90 >= .05 ? "bad" : d.wrong_all_90 >= .03 ? "mid" : "ok" })), { max: Math.max(.1, dom[0].wrong_all_90), label: "Share of answers wrong at confidence 0.9 or more, by domain", labelW: 170, w: 560 });
  const gated = rows.filter((r) => r.cutoff != null).sort((a, b) => b.cutoff_automated - a.cutoff_automated);
  const cutRows = [...rows].sort((a, b) => (a.cutoff == null) - (b.cutoff == null) || (b.cutoff_automated || 0) - (a.cutoff_automated || 0) || a.short_title.localeCompare(b.short_title));
  const recal = rows.filter((r) => r.ece_recalibrated != null && r.ece_raw_heldout != null);
  const better = recal.filter((r) => r.ece_recalibrated < r.ece_raw_heldout).length;
  const meanRaw = recal.reduce((s, r) => s + r.ece_raw_heldout, 0) / recal.length, meanScaled = recal.reduce((s, r) => s + r.ece_recalibrated, 0) / recal.length;
  const pts = recal.map((r) => ({ x: r.ece_raw_heldout, y: r.ece_recalibrated, cls: r.ece_recalibrated < r.ece_raw_heldout ? "ok" : "bad", label: `${r.title}: ${fix(r.ece_raw_heldout, 3)} to ${fix(r.ece_recalibrated, 3)}` }));
  const human = rows.filter((r) => r.human_tv != null);
  const q = qs();
  const filterBox = el("input", { type: "search", placeholder: "Filter the cut-off table", "aria-label": "Filter the cut-off table", value: q.get("q") || "" });
  const tbody = el("tbody");
  const draw = () => {
    const n = filterBox.value.trim().toLowerCase();
    tbody.replaceChildren(...cutRows.filter((r) => !n || `${r.title} ${r.domain}`.toLowerCase().includes(n)).map((r) => el("tr", {},
      el("td", {}, el("a", { href: `dataset.html?id=${r.id}`, title: r.title }, r.short_title)), el("td", {}, verdictPill(r.verdict)),
      el("td", { class: "num" }, r.cutoff == null ? "none" : r.cutoff.toFixed(2)), el("td", { class: "num" }, r.cutoff == null ? "-" : pct(r.cutoff_automated, 0)),
      el("td", { class: "num" }, r.cutoff == null ? "-" : pct(r.cutoff_wrong)), el("td", { class: "num" }, r.cutoff == null ? "-" : pct(r.cutoff_heldout_wrong)),
      el("td", { class: "num" }, r.guaranteed_cutoff == null ? "none" : r.guaranteed_cutoff.toFixed(2)))));
  };
  filterBox.addEventListener("input", draw);
  draw();
  mount(app, 
    el("p", { class: "label", style: "margin-top:32px" }, "Trust and confidence"),
    el("h1", {}, "Can Jev's confidence be trusted?"),
    el("p", { class: "lead" }, "Jev returns a probability for every option. Confidence ranks answers well, but a single threshold such as 0.9 is not safe across domains: set it per task from tables like these."),
    el("div", { class: "grid cols-2" },
      el("div", { class: "card" }, el("p", { class: "chart-title" }, "All answers, all datasets"), reliability(cal._all.reliability, { label: "Pooled reliability diagram" }),
        el("p", { class: "muted" }, "Stated confidence against observed accuracy for every answer in the 63 datasets. Dot size is the number of answers.")),
      el("div", { class: "card" }, el("h3", {}, "How to pick a threshold"),
        el("p", {}, "Choose the error rate you can live with, not a round number. Find the dataset closest to your task in the table below and read its cut-off."),
        el("p", {}, "Expect more wrong answers on new data than the table shows: the cut-off was fit on the same sample it is judged on, and the held-out column is the honest number."),
        el("p", {}, `A cut-off that keeps wrong answers at 2% or below exists on ${meta.gates_2pct} of ${meta.datasets} datasets. On the rest, B means human review, not a confidence gate. A statistically guaranteed cut-off exists on ${meta.gates_guaranteed}.`))),
    el("h2", {}, "Confident mistakes by domain"),
    el("p", {}, "Share of all answers that were wrong with confidence 0.9 or more (answer-weighted). Red is 5% or more, amber 3% or more."),
    el("div", { class: "card" }, chart),
    el("h2", {}, "Recommended cut-offs"),
    el("p", {}, "The lowest confidence at which at most 2% of automated answers are wrong (judged on at least 30 such answers), the share of answers that clears it, and the wrong rate measured on a held-out half. \"none\" means no cut-off reaches 2%."),
    el("div", { class: "filters" }, filterBox),
    el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, ["Dataset", "Verdict", "Cut-off", "Automated", "Wrong, same sample", "Wrong, held out", "Guaranteed cut-off"].map((h, i) => el("th", { scope: "col", class: i >= 2 ? "num" : "" }, h)))), tbody)),
    el("h2", {}, "Recalibration"),
    el("p", {}, `One temperature fit per task on half the answers, judged on the other half, changes confidence but not accuracy. Mean calibration error fell from ${fix(meanRaw, 3)} to ${fix(meanScaled, 3)}, better on ${better} of ${recal.length} datasets.`),
    el("div", { class: "card", style: "max-width:460px" }, scatter(pts, { max: .4, xLabel: "ECE, raw confidence", yLabel: "ECE, recalibrated", label: "Raw against recalibrated calibration error" }),
      el("p", { class: "muted" }, "Below the diagonal (green) recalibration helped; above (red) it hurt.")),
    el("h2", {}, "Against human disagreement"),
    el("p", {}, "On two sets each item was rated by many people. Jev is close to the human vote but far more certain than the raters, who often split."),
    el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, ["Dataset", "Total variation", "KL divergence", "Accuracy"].map((h, i) => el("th", { scope: "col", class: i ? "num" : "" }, h)))),
      el("tbody", {}, human.map((r) => el("tr", {}, el("td", {}, el("a", { href: `dataset.html?id=${r.id}`, title: r.title }, r.short_title)), el("td", { class: "num" }, fix(r.human_tv, 3)), el("td", { class: "num" }, fix(r.human_kl, 2)), el("td", { class: "num" }, pct(r.accuracy))))))),
    el("p", { class: "muted" }, "Total variation 0 means identical to the human vote split, 1 completely different. KL divergence measures how surprised the model is by the human split."));
}
main().catch((e) => fail(app, e));
