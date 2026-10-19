import { chrome, load, el, pct, fail, verdictPill, $, mount } from "./app.js";
import { radar, textBar } from "./charts.js";

const app = $("#app");

async function main() {
  const [, domains, rows] = await Promise.all([chrome("domains.html", "Domains"), load("domains"), load("datasets")]);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const top = [...domains].sort((a, b) => b.datasets.length - a.datasets.length || a.name.localeCompare(b.name)).slice(0, 10);
  const chart = radar(top.map((d) => d.name), [
    { values: top.map((d) => d.mean_baseline), cls: "poly2" }, { values: top.map((d) => d.mean_accuracy), cls: "poly" }],
    { label: "Mean accuracy (solid) against mean baseline (dashed) for the ten domains with most datasets" });
  const order = { A: 0, B: 1, C: 2 };
  const cards = [...domains].sort((a, b) => (b.counts.A - a.counts.A) || (a.counts.C - b.counts.C) || a.name.localeCompare(b.name)).map((d) =>
    el("article", { class: "card", id: d.domain },
      el("h3", {}, d.name),
      el("p", {}, textBar(d.counts), " ", el("span", { class: "muted" }, `${d.counts.A} A, ${d.counts.B} B, ${d.counts.C} C`)),
      el("p", {}, d.note),
      el("p", { class: "muted" }, `Mean accuracy ${pct(d.mean_accuracy)} against a mean baseline of ${pct(d.mean_baseline)}. ${pct(d.wrong_all_90)} of answers were wrong at confidence 0.9 or more.`),
      el("div", {}, d.datasets.map((id) => byId[id]).sort((a, b) => order[a.verdict] - order[b.verdict] || b.accuracy - a.accuracy).map((r) =>
        el("a", { class: "chip", href: `dataset.html?id=${r.id}`, title: `${r.title}: ${pct(r.accuracy)}, verdict ${r.verdict}` }, `${r.verdict} ${r.short_title}`)))));
  mount(app, 
    el("p", { class: "label", style: "margin-top:32px" }, "Domains"),
    el("h1", {}, "What to do, domain by domain"),
    el("p", { class: "lead" }, "One card per domain. A means works as-is, B means works with a confidence cut-off or human review, C means not usable zero-shot. The rule is the same for every dataset (see Method and limits)."),
    el("div", { class: "card" }, el("h3", {}, "Mean accuracy against baseline, ten largest domains"), radar ? chart : null,
      el("p", { class: "muted" }, "Solid shape: mean accuracy. Dashed shape: mean accuracy of always giving the most common answer.")),
    el("div", { class: "grid cols-2", style: "margin-top:16px" }, cards));
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
main().catch((e) => fail(app, e));
