import { chrome, load, el, pct, int, usd, verdictPill, fail, qs, setQuery, strongList, weakList, margin, statusClass, VERDICT, $, mount } from "./app.js";
import { dotWhisker, textBar } from "./charts.js";

const app = $("#app");

function stat(value, label) { return el("div", { class: "stat" }, el("b", {}, value), el("span", { class: "label" }, label)); }

function listCard(title, note, rows) {
  return el("div", { class: "card" }, el("h3", {}, title), el("p", { class: "muted" }, note),
    el("table", {}, el("tbody", {}, rows.map((r) => el("tr", {},
      el("td", {}, el("a", { href: `dataset.html?id=${r.id}`, title: r.title }, r.short_title)),
      el("td", { class: "num" }, pct(r.accuracy)), el("td", { class: "num muted" }, `vs ${pct(r.baseline)}`))))));
}

function heatmap(domains) {
  const rows = [...domains].sort((a, b) => (b.counts.C - a.counts.C) || (b.counts.A - a.counts.A));
  const cell = (k, v) => el("td", { class: `cell-${k}${k !== "A" && v ? " hit" : ""}` }, v ? String(v) : "·");
  return el("div", { class: "table-wrap" }, el("table", { class: "heat" },
    el("caption", { class: "sr-only" }, "Datasets per domain by verdict"),
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Domain"), ...["A", "B", "C"].map((k) => el("th", { scope: "col", title: VERDICT[k].word }, `${k} ${VERDICT[k].word}`)))),
    el("tbody", {}, rows.map((d) => el("tr", {}, el("th", { scope: "row" }, el("a", { href: `domains.html#${d.domain}` }, d.name)),
      ...["A", "B", "C"].map((k) => cell(k, d.counts[k])))))));
}

function datasetTable(rows, domains) {
  const q = qs();
  const state = { q: q.get("q") || "", domain: q.get("domain") || "", verdict: q.get("verdict") || "", type: q.get("type") || "", sort: q.get("sort") || "accuracy", dir: q.get("dir") || "desc" };
  const types = [...new Set(rows.flatMap((r) => r.question_types))].sort();
  const input = el("input", { type: "search", placeholder: "Search dataset, domain or what it tests", "aria-label": "Search datasets", value: state.q });
  const sel = (label, key, opts) => el("select", { "aria-label": label }, el("option", { value: "" }, label), opts.map(([v, t]) => el("option", { value: v, selected: state[key] === v }, t)));
  const domSel = sel("All domains", "domain", domains.map((d) => [d.domain, d.name]));
  const verSel = sel("All verdicts", "verdict", ["A", "B", "C"].map((k) => [k, `${k} ${VERDICT[k].word}`]));
  const typeSel = sel("All question types", "type", types.map((t) => [t, t]));
  const count = el("span", { class: "count", "aria-live": "polite" });
  const body = el("tbody");
  const cols = [
    ["verdict", "Verdict", (r) => r.verdict], ["title", "Dataset", (r) => r.short_title.toLowerCase()],
    ["accuracy", "Accuracy (95% interval)", (r) => r.accuracy], ["baseline", "Baseline", (r) => r.baseline],
    ["wrong_all_90", "Wrong at 0.9+", (r) => r.wrong_all_90], ["cutoff", "Cut-off", (r) => r.cutoff ?? 2], ["answers", "Answers", (r) => r.answers],
  ];
  const head = el("tr");
  const buttons = {};
  for (const [key, label] of cols) {
    const b = el("button", { type: "button", onclick: () => { state.dir = state.sort === key && state.dir === "desc" ? "asc" : "desc"; state.sort = key; draw(); } }, label, " ", el("span", { "aria-hidden": "true" }));
    buttons[key] = b;
    head.append(el("th", { scope: "col", class: ["accuracy", "baseline", "wrong_all_90", "cutoff", "answers"].includes(key) ? "num" : (key === "title" ? "pin" : ""), "aria-sort": "none", "data-key": key }, b));
  }
  function draw() {
    const needle = state.q.trim().toLowerCase();
    let list = rows.filter((r) => (!state.domain || r.domain === state.domain) && (!state.verdict || r.verdict === state.verdict)
      && (!state.type || r.question_types.includes(state.type))
      && (!needle || `${r.title} ${r.id} ${r.domain} ${r.what_it_tests}`.toLowerCase().includes(needle)));
    const get = cols.find((c) => c[0] === state.sort)[2];
    list.sort((a, b) => { const x = get(a), y = get(b); return (x < y ? -1 : x > y ? 1 : 0) * (state.dir === "asc" ? 1 : -1); });
    body.replaceChildren(...list.map((r) => el("tr", {},
      el("td", {}, verdictPill(r.verdict)),
      el("td", { class: "pin" }, el("a", { href: `dataset.html?id=${r.id}`, title: r.title }, r.short_title), el("div", { class: "muted", style: "font-size:.8rem" }, r.domain)),
      el("td", { class: "num" }, pct(r.accuracy), " ", dotWhisker({ acc: r.accuracy, ci: r.ci95, baseline: r.baseline, width: 110 })),
      el("td", { class: "num muted" }, pct(r.baseline)), el("td", { class: "num" }, pct(r.wrong_all_90)),
      el("td", { class: "num" }, r.cutoff == null ? "none" : r.cutoff.toFixed(2)), el("td", { class: "num muted" }, int(r.answers)))));
    count.textContent = `${list.length} of ${rows.length} datasets`;
    for (const th of head.children) {
      const k = th.dataset.key, on = k === state.sort;
      th.setAttribute("aria-sort", on ? (state.dir === "asc" ? "ascending" : "descending") : "none");
      th.querySelector("span").textContent = on ? (state.dir === "asc" ? "▲" : "▼") : "";
    }
    setQuery({ q: state.q, domain: state.domain, verdict: state.verdict, type: state.type, sort: state.sort === "accuracy" ? "" : state.sort, dir: state.dir === "desc" ? "" : state.dir });
  }
  input.addEventListener("input", () => { state.q = input.value; draw(); });
  domSel.addEventListener("change", () => { state.domain = domSel.value; draw(); });
  verSel.addEventListener("change", () => { state.verdict = verSel.value; draw(); });
  typeSel.addEventListener("change", () => { state.type = typeSel.value; draw(); });
  draw();
  return {
    node: el("div", {}, el("div", { class: "filters", role: "search" }, input, domSel, verSel, typeSel, count),
      el("div", { class: "table-wrap" }, el("table", {}, el("caption", { class: "sr-only" }, "All 63 datasets, sortable"), el("thead", {}, head), body))),
    setDomain: (d) => { state.domain = d; domSel.value = d; draw(); }, setVerdict: (v) => { state.verdict = v; verSel.value = v; draw(); },
  };
}

async function main() {
  const [meta, rows, domains, fms] = await Promise.all([chrome("index.html", "Can Jev make this decision for you?"), load("datasets"), load("domains"), load("failure_modes")]);
  document.title = "Jev Field Test: can Jev make this decision for you?";
  const v = meta.verdicts, tableAnchor = "#datasets";
  const table = datasetTable(rows, domains);
  const tile = (k) => el("a", { class: `verdict-tile ${k}`, href: tableAnchor, onclick: () => table.setVerdict(k) }, el("b", {}, `${v[k]} of ${meta.datasets}`), el("strong", {}, VERDICT[k].word), el("span", {}, meta.verdict_words[k].rule));
  const browse = el("div", { class: "browse", role: "group", "aria-label": "Filter the table by domain" },
    [...domains].sort((a, b) => b.mean_accuracy - a.mean_accuracy).map((d) => el("button", { type: "button", "aria-pressed": "false", onclick: (e) => { table.setDomain(d.domain); location.hash = "datasets"; } },
      el("span", {}, d.name), textBar(d.counts), el("span", { class: "num mono" }, pct(d.mean_accuracy, 0)))));
  mount(app, 
    el("section", { class: "hero" },
      el("p", { class: "label eyebrow" }, `Field test · ${meta.model} · September 2026`),
      el("h1", {}, "Can Jev make ", el("span", { class: "a" }, "this decision"), " for you?"),
      el("p", { class: "lead" }, `An independent test of TypeSafe's Jev on ${meta.datasets} public datasets in ${meta.domains} domains, plus stress tests for the number of options, numbers, injected text, padding and wording. Jev works as-is on ${v.A} of ${meta.datasets}, needs a confidence cut-off or review on ${v.B}, and is not usable zero-shot on ${v.C}.`),
      el("div", { class: "stats" }, stat(String(meta.datasets), "datasets"), stat(String(meta.domains), "domains"), stat(int(meta.requests_total), "requests answered"),
        stat(usd(meta.cost_usd_total), "total API cost"), stat(`${int(meta.median_latency_ms)} ms`, "median latency"))),
    el("h2", { id: "verdicts" }, "The verdict, in three numbers"),
    el("div", { class: "grid cols-3" }, tile("A"), tile("B"), tile("C")),
    el("h2", {}, "Browse by domain"), el("p", { class: "muted", html: "Each block is one dataset: <span class=\"textbar\"><span class=\"a\">■</span></span> A works as-is, <span class=\"textbar\"><span class=\"b\">■</span></span> B cut-off or review, <span class=\"textbar\"><span class=\"c\">■</span></span> C not usable. Pick a domain to filter the table." }),
    el("div", { class: "card" }, browse),
    el("h2", {}, "Where Jev is strong, and where it is not"),
    el("div", { class: "grid cols-2" },
      listCard("Strongest (verdict A)", "Largest lead over the always-majority baseline.", strongList(rows)),
      listCard("Weakest (verdict C)", "Furthest below or closest to the baseline. A negative gap means worse than always saying the common answer.", weakList(rows))),
    el("h2", {}, "Datasets by domain and verdict"), el("p", { class: "muted" }, "Only misses are coloured. A cells are faded; counts are datasets."), heatmap(domains),
    el("h2", {}, "TypeSafe's nine documented weak spots"),
    el("p", { class: "muted" }, "Five were tested directly, three partly, and one cannot apply to a decision model. ", el("a", { href: "failure-modes.html" }, "See the evidence")),
    el("div", { class: "grid cols-3" }, fms.map((f) => el("a", { class: "card", href: `failure-modes.html#fm${f.n}`, style: "text-decoration:none;color:inherit" },
      el("span", { class: "label" }, `Failure mode ${f.n}`), el("h3", { style: "margin-top:4px" }, f.name), el("span", { class: `chip ${statusClass(f.status)}` }, f.status)))),
    el("h2", { id: "datasets" }, "All datasets"), table.node);
  const hash = location.hash.slice(1);
  if (hash) document.getElementById(hash)?.scrollIntoView();
}
main().catch((e) => fail(app, e));
