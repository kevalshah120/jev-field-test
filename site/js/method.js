import { chrome, load, el, pct, int, usd, fail, $, mount } from "./app.js";

const app = $("#app");
const sec = (id, title, ...kids) => el("section", { id }, el("h2", {}, title), kids);
const list = (items) => el("ul", {}, items.map((i) => el("li", {}, i)));

async function main() {
  const [meta, rows] = await Promise.all([chrome("method.html", "Method and limits"), load("datasets")]);
  const FILES = [["meta.json", "Counts, cost, verdict rules, test catalogue, anchors, open questions"], ["datasets.json", "One row per dataset: every metric, verdict, cut-off, question framing, licence"],
    ["domains.json", "Verdict counts and notes per domain"], ["slices.json", "BBH sub-tasks, AdvGLUE tasks, LegalBench tasks, typed workflows, XNLI languages"],
    ["calibration.json", "Reliability bins and coverage curves per dataset"], ["experiments.json", "Every stress test"], ["failure_modes.json", "The nine failure modes with evidence"]];
  const anchors = meta.anchors.map((a) => {
    const mine = rows.find((r) => r.id === a.dataset);
    const pub = a.published != null ? pct(a.published) : `${pct(a.published_low, 0)} to ${pct(a.published_high, 0)}`;
    return el("tr", {}, el("td", {}, a.name), el("td", { class: "num" }, pct(mine.accuracy)), el("td", { class: "num" }, pub), el("td", {}, a.source));
  });
  const lic = [...rows].sort((a, b) => a.title.localeCompare(b.title));
  mount(app, 
    el("p", { class: "label", style: "margin-top:32px" }, "Method and limits"),
    el("h1", {}, "How this field test was run"),
    el("p", { class: "lead" }, `${meta.datasets} public datasets, ${int(meta.requests_total)} requests to ${meta.model} through TypeSafe's official API, ${meta.run_window}, ${usd(meta.cost_usd_total)} in total. Independent and unofficial.`),
    el("nav", { class: "subnav static", "aria-label": "Sections" }, [["catalogue", "Test catalogue"], ["scoring", "Scoring"], ["verdicts", "Verdict rules"], ["anchors", "Anchors"], ["limits", "Limits"], ["open", "Open questions"], ["reproduce", "Reproduce"], ["downloads", "Downloads"], ["licences", "Datasets and licences"], ["changelog", "Changelog"]].map(([id, t]) => el("a", { href: `#${id}` }, t))),
    sec("catalogue", "Test catalogue", el("p", {}, "Twelve live runs, all on the same model version, with no errors."),
      el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, ["#", "Test", "What it asks", "Result"].map((h) => el("th", { scope: "col" }, h)))),
        el("tbody", {}, meta.tests.map((t) => el("tr", {}, el("td", {}, String(t.n)), el("td", {}, el("strong", {}, t.name), el("div", { class: "muted mono", style: "font-size:.75rem" }, t.run)), el("td", {}, t.asks), el("td", {}, t.result))))))),
    sec("scoring", "How a result is scored",
      list(["Jev returns a probability for every option of every question (Choice, Score, or yes/no Noul). We score from that full distribution, never from the vendor's own confidence field.",
        "The predicted answer is Jev's own pick when it is among its most probable options; a yes/no answer counts as yes at 0.5 or more. Confidence is the probability on the pick.",
        "Accuracy comes with a 95% interval and is always shown next to the accuracy of always giving the most common answer.",
        "An item is sent to Jev only if it fits the context (32,000 tokens for the state plus the longest question). Nothing is truncated; longer items are skipped and counted.",
        "An answer that cannot be mapped onto the question's options is an error, never guessed. There were none.",
        "Questions were frozen before the runs, worded from each dataset's own label definitions, and never tuned on test items. A framing audit before the runs fixed our own wording problems in 13 datasets."])),
    sec("verdicts", "Verdict rules",
      el("p", {}, "One rule, applied to every dataset, written before the verdicts were read:"),
      el("div", { class: "grid cols-3" }, ["A", "B", "C"].map((k) => el("div", { class: "card" }, el("h3", {}, `${k}: ${meta.verdict_words[k].label}`), el("p", {}, meta.verdict_words[k].rule)))),
      el("p", {}, "\"Removes the baseline's errors\" compares Jev's error rate with that of always giving the most common answer, so datasets with a high baseline (for example ToxicChat at 92.3%) are judged fairly. The recommended cut-off targets at most 2% wrong among automated answers, with at least 30 automated answers, and is checked on a held-out half.")),
    sec("anchors", "Does the harness depress Jev? Two published numbers, reproduced",
      el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, ["Check", "This test", "Published", "Source"].map((h, i) => el("th", { scope: "col", class: i === 1 || i === 2 ? "num" : "" }, h)))), el("tbody", {}, anchors))),
      el("p", { class: "muted" }, "Re-asking four datasets two days later gave the same accuracy within one point, and format changes (batching, option order, key names) moved nothing significantly.")),
    sec("limits", "Limits",
      list(["Samples are small: 300 items per dataset (16 and 45 on two). Intervals are shown for that reason.",
        "Public datasets may have been seen in training: MMLU-Pro, MedMCQA, BoolQ, SST-2, BBH and QuALITY are flagged. Read their results as ceilings.",
        `One model version (${meta.model}) on one date range. The public Hugging Face Decision Index already uses jev-1.14.0, so these numbers describe 1.13.`,
        "English instructions only (XNLI uses English instructions on seven languages). Text only: Jev does not read images.",
        "Dataset labels are noisy, and for subjective tasks the label is one group of raters' view.",
        "This is not the same test as other public Jev benchmarks. It is wider (63 datasets, many domains, stress tests) and each dataset is small.",
        "Verdicts describe zero-shot use with the frozen questions. A tuned question, a cut-off, several narrow questions or fine-tuning can change the picture."])),
    sec("open", "Open questions (not tested)", list(meta.open_questions)),
    sec("reproduce", "Reproduce or extend",
      el("p", {}, "The harness (datasets, adapters, runner, scoring) lives in a separate working repository. This site is generated from stored answers; rebuilding it makes no model calls:"),
      el("pre", {}, "uv run python scripts/export_site_data.py\nuv run pytest tests/test_site_export.py"),
      el("p", {}, "The test compares every exported number with the tables in the results document, so the site cannot drift from the stored answers.")),
    sec("downloads", "Downloads", el("p", {}, "Everything the site shows, as plain files."),
      el("div", { class: "table-wrap" }, el("table", {}, el("tbody", {}, FILES.map(([f, d]) => el("tr", {}, el("td", {}, el("a", { href: `data/${f}`, download: f }, f)), el("td", { class: "muted" }, d))))))),
    sec("licences", "Datasets and licences",
      el("p", {}, "Only aggregate results are published, never dataset text. Each dataset keeps its own licence; \"unverified\" means we did not confirm it. Question wording shown on dataset pages is our own."),
      el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, ["Dataset", "Domain", "Licence", "Items asked"].map((h, i) => el("th", { scope: "col", class: i === 3 ? "num" : "" }, h)))),
        el("tbody", {}, lic.map((r) => el("tr", {}, el("td", {}, el("a", { href: `dataset.html?id=${r.id}` }, r.title)), el("td", {}, r.domain), el("td", {}, r.license), el("td", { class: "num" }, int(r.records)))))))),
    sec("changelog", "Changelog", list(["2026-10-19: first public version. Run on jev-1.13.0 (2026-09-27 to 2026-09-29), 63 datasets, 12 live tests, nine failure modes mapped."])));
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
main().catch((e) => fail(app, e));
