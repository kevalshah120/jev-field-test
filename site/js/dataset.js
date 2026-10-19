import { chrome, load, el, pct, fix, int, verdictPill, fail, qs, VERDICT, $, mount } from "./app.js";
import { dotWhisker, reliability, riskCoverage } from "./charts.js";

const app = $("#app");

const tile = (value, label, hint) => el("div", { class: "tile" }, el("b", {}, value), el("small", {}, label), hint ? el("div", { class: "muted", style: "font-size:.75rem" }, hint) : null);

function cutoffText(r) {
  if (r.cutoff == null) return "No confidence cut-off keeps the wrong rate of automated answers at or below 2% on this dataset, so every answer here needs a person or another check.";
  const all = r.cutoff_automated >= 0.995;
  let t = all
    ? `Every answer already meets the 2% target on this sample (${pct(r.cutoff_wrong)} wrong), so no gating is needed here.`
    : `Automating only answers at confidence ${r.cutoff.toFixed(2)} or more covers ${pct(r.cutoff_automated, 0)} of answers with ${pct(r.cutoff_wrong)} wrong on this sample.`;
  if (r.cutoff_heldout_wrong != null) {
    t += r.cutoff_heldout_wrong <= 0.02
      ? ` Fit on half and judged on the other half, the wrong rate was ${pct(r.cutoff_heldout_wrong)}, within the 2% target.`
      : ` Fit on half and judged on the other half, the wrong rate was ${pct(r.cutoff_heldout_wrong)}, so expect more than 2% on new data and set the cut-off stricter.`;
  }
  t += r.guaranteed_cutoff == null ? " No cut-off carries a statistical guarantee at this sample size." : ` A cut-off with a statistical guarantee exists at ${r.guaranteed_cutoff.toFixed(2)}, automating ${pct(r.guaranteed_automated, 0)}.`;
  return t;
}

async function main() {
  const id = qs().get("id");
  const [, rows, cal, slices] = await Promise.all([chrome("index.html", "Dataset"), load("datasets"), load("calibration"), load("slices")]);
  const r = rows.find((x) => x.id === id);
  if (!r) { mount(app, el("p", { class: "crumb" }, el("a", { href: "index.html" }, "Scorecard")), el("h1", {}, "Dataset not found"), el("p", {}, `There is no dataset called "${id || ""}".`)); return; }
  document.title = `${r.short_title} · Jev Field Test`;
  const c = cal[id], sl = slices[id] || (id === "xnli" ? slices.xnli_languages : null);
  const framing = (r.framing || []).map((q) => el("div", { class: "card", style: "margin-bottom:12px" },
    el("span", { class: "label" }, `${q.type} question${q.id ? ` · ${q.id}` : ""}`), el("p", { style: "margin:6px 0" }, q.instruction),
    q.options ? el("ul", { style: "margin:0;padding-left:1.1rem;font-size:.875rem" }, q.options.map((o) => el("li", {}, el("code", {}, o.key), o.text && o.text !== o.key ? ` ${o.text}` : ""))) : null,
    q.n_options > (q.options || []).length ? el("p", { class: "muted" }, `and ${q.n_options - q.options.length} more options`) : null));
  const sliceRows = sl ? el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "Slice"), el("th", { class: "num" }, "Answers"), el("th", { class: "num" }, "Accuracy"))),
    el("tbody", {}, sl.map((s) => el("tr", {}, el("td", {}, s.slice), el("td", { class: "num" }, int(s.n)), el("td", { class: "num" }, pct(s.accuracy)))))) ) : null;
  const second = r.top3 != null ? tile(pct(r.top3), "Right answer in top 3", `top 2: ${pct(r.top2)}`) : r.within_1 != null ? tile(pct(r.within_1), "Within one level") : r.roc_auc != null ? tile(fix(r.roc_auc), "ROC-AUC", "ranks yes above no") : tile("-", "Ranking");
  mount(app, 
    el("p", { class: "crumb" }, el("a", { href: "index.html" }, "Scorecard"), " / ", el("a", { href: `domains.html#${r.domain}` }, r.domain), " / ", r.short_title),
    el("div", { style: "display:flex;gap:12px;align-items:center;flex-wrap:wrap" }, el("h1", { style: "margin:0" }, r.short_title), verdictPill(r.verdict)),
    el("p", { class: "lead", style: "margin-top:12px" }, r.what_it_tests),
    el("div", { class: "flags" }, r.flags.map((f) => el("span", { class: "chip" }, f))),
    el("div", { class: "tiles", style: "margin-top:16px" },
      el("div", { class: "tile" }, el("b", {}, pct(r.accuracy)), el("small", {}, `Accuracy, interval ${pct(r.ci95[0])} to ${pct(r.ci95[1])}`), el("div", {}, dotWhisker({ acc: r.accuracy, ci: r.ci95, baseline: r.baseline, width: 170 })), el("div", { class: "muted", style: "font-size:.75rem" }, `tick = baseline ${pct(r.baseline)}`)),
      second, tile(fix(r.ece, 3), "Calibration error (ECE)", `after recalibration: ${fix(r.ece_recalibrated, 3)}`),
      tile(pct(r.wrong_all_90), "Wrong at confidence 0.9+", `of all answers; ${pct(r.confident_90, 0)} were that confident`)),
    el("p", { style: "margin-top:12px" }, `${VERDICT[r.verdict].word}. Accuracy ${pct(r.accuracy)} against an always-majority baseline of ${pct(r.baseline)}. ${int(r.answers)} answers from ${int(r.records)} items (${r.question_types.join(", ")}; ${r.n_options}${r.options_vary ? " at most" : ""} options). Median latency ${int(r.latency_p50_ms)} ms.`),
    r.human_tv != null ? el("p", {}, `Against 100 human raters per item: total variation ${fix(r.human_tv, 3)}, KL divergence ${fix(r.human_kl, 2)} (lower is closer to the human vote split).`) : null,
    el("h2", {}, "The question Jev saw"), framing.length ? framing : el("p", { class: "muted" }, "The options differ for each item, so there is no single option list to show."),
    el("h2", {}, "Can its confidence be trusted?"),
    el("div", { class: "grid cols-2" },
      el("div", { class: "card" }, el("p", { class: "chart-title" }, "Stated confidence against observed accuracy"), reliability(c.reliability, { minN: 10, label: `${r.title} reliability diagram` }), el("p", { class: "muted" }, "On the dashed diagonal, confidence matches how often Jev is right. Dot size is the number of answers.")),
      el("div", { class: "card" }, el("p", { class: "chart-title" }, "Risk and coverage"), riskCoverage(c.coverage, { label: `${r.title} risk and coverage` }), el("p", { class: "muted" }, "If you automate only the most confident share of answers, this is the error rate among them."))),
    el("div", { class: "callout" }, el("p", {}, el("strong", {}, "Recommended cut-off. "), cutoffText(r))),
    sliceRows ? [el("h2", {}, "By slice"), sliceRows] : null,
    el("h2", {}, "Source"), el("p", {}, `Run ${r.run}, tier ${r.tier}. Licence of the dataset: ${r.license}. Only aggregate results are published here, never dataset text.`));
}
main().catch((e) => fail(app, e));
