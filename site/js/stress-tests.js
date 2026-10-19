import { chrome, load, el, pct, fix, int, fail, $, mount } from "./app.js";
import { optionChart, pairedBars, hbars } from "./charts.js";

const app = $("#app");
const NAMES = { sst2: "SST-2", boolq: "BoolQ", sms_spam: "SMS spam", banking77: "Banking77", clinc150: "CLINC150", ctibench_rcm: "CTI-Bench CWE", cve_to_cwe: "CVE-to-CWE", humaid: "HumAID", hwu64: "HWU64", ledgar: "LEDGAR", financial_phrasebank: "Financial PhraseBank", fomc: "FOMC", scicite: "SciCite", climate_sentiment: "Climate disclosures" };
const nm = (k) => NAMES[k] || k;
const table = (head, body, numFrom = 1) => el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, el("tr", {}, head.map((h, i) => el("th", { scope: "col", class: i >= numFrom ? "num" : "" }, h)))),
  el("tbody", {}, body.map((r) => el("tr", {}, r.map((c, i) => el("td", { class: i >= numFrom ? "num" : "" }, c)))))));
const sec = (id, title, ...kids) => el("section", { id }, el("h2", {}, title), kids);

async function main() {
  const [, ex, bbhSlices, rows] = await Promise.all([chrome("stress-tests.html", "Stress tests"), load("experiments"), load("slices"), load("datasets")]);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  const w = ex.ctibench_vsp_worded, jag = ex.jaggedness, dec = ex.decomposition, none = ex.none_option, qf = ex.question_format;

  const options = sec("options", "Number of options",
    el("p", {}, "The same base items were asked with 4, 6, 16, 32 and 64 options (the right answer plus random wrong ones, nested so each larger set contains the smaller). Solid line: Jev. Dashed: chance. Hollow dot: the same items with the dataset's full label set, which has confusable neighbours."),
    el("div", { class: "grid cols-3" }, Object.entries(ex.option_scaling).map(([d, v]) => el("div", { class: "card" }, el("p", { class: "chart-title" }, nm(d)),
      optionChart({ ks: v.ks, accuracy: v.accuracy, chance: v.chance, full: v.full_label_set_accuracy, fullK: v.full_label_set_options > 64 ? 64 : v.full_label_set_options, title: nm(d) }),
      el("p", { class: "muted", style: "margin:4px 0 0;font-size:.8rem" }, `full set: ${v.full_label_set_options} options, ${pct(v.full_label_set_accuracy, 0)}`)))),
    el("p", { class: "callout" }, "Accuracy falls gradually and never collapses: CLINC150 stays at 96% or more, while LEDGAR drops from 97% to 76%. Confusable real label sets cost more than random distractors do."));

  const numbers = sec("numbers", "Numbers",
    el("p", {}, `Anonymous card numbers (a balanced fraud set) gave ${pct(ex.ulb.accuracy)}, which is chance (ROC-AUC ${fix(ex.ulb.roc_auc)}). Jev answered "not fraud" to every transaction. Describing CVSS severity levels in words instead of number ranges did not help either:`),
    el("div", { class: "card" }, pairedBars([{ label: "CVSS severity, 995 items", a: w.ctibench_vsp.accuracy, b: w.ctibench_vsp_worded.accuracy }], ["number ranges", "worded levels"], { label: "CVSS severity accuracy with number ranges against words" })),
    el("p", { class: "muted" }, `Paired on the same ${int(w.n)} items: ${w.only_numeric_right} right only with numbers, ${w.only_worded_right} right only with words, McNemar p = ${fix(w.mcnemar_p)}. Jev picked "high" ${w.ctibench_vsp.picks_high} and ${w.ctibench_vsp_worded.picks_high} times where ${w.gold_high} items are high. The task, not the wording, is the problem: a CVE description rarely states the metrics that set the band.`),
    el("h3", {}, "Counting and dates (BBH sub-tasks, 30 items each)"),
    el("div", { class: "card" }, hbars(bbhSlices.bbh.map((s) => ({ label: s.slice.replace(/_/g, " "), value: s.accuracy, cls: s.accuracy < .8 ? "bad" : "ok" })), { label: "BBH accuracy by sub-task", labelW: 190 })),
    el("p", { class: "muted" }, "BBH is public and may have been seen in training, so read the high scores as ceilings."));

  const names = { pad_before_2k: "2,000 words before", pad_after_2k: "2,000 words after", pad_before_8k: "8,000 words before", negated: "question negated", injected: "wrong-answer instruction injected", contradictory: "definitions swapped", base: "original" };
  const jrows = [];
  for (const [d, conds] of Object.entries(jag)) for (const [c, v] of Object.entries(conds)) jrows.push([nm(d), names[c] || c, pct(v.accuracy, 0), v.mean_conf.toFixed(3), c === "base" ? "-" : String(v.lost), c === "base" ? "-" : String(v.gained), v.mcnemar_p == null ? "-" : fix(v.mcnemar_p)]);
  const probes = sec("probes", "Failure-mode probes",
    el("p", {}, "100 items each of SST-2, BoolQ and SMS spam, asked in the original form and in disturbed forms. \"Lost\" and \"gained\" count items that flipped from right to wrong and from wrong to right."),
    table(["Dataset", "Condition", "Accuracy", "Mean confidence", "Lost", "Gained", "McNemar p"], jrows, 2),
    el("h3", {}, "Negated question: does P(q) + P(not q) equal 1?"),
    table(["Dataset", "Mean gap", "Items with gap above 0.2", "Logically consistent picks"], Object.entries(jag).map(([d, c]) => [nm(d), fix(c.negated.mean_abs_sum_minus_1, 3), pct(c.negated["share_gap_over_0.2"], 0), pct(c.negated.logically_consistent_picks, 0)]), 1),
    el("p", { class: "callout" }, "Padding, a negated question and an injected instruction barely move Jev. When the instruction and the option definitions contradict, Jev follows the instruction."));

  const decomposition = sec("decomposition", "One question or several narrow ones",
    el("p", {}, `Phishing as a single question gave ${pct(dec.single.accuracy)}. Six narrow yes/no questions asked together, combined by a small model fit on separate emails, gave ${pct(dec.decomposed.accuracy)} on the same ${dec.n_test} held-out emails (${dec.paired.only_decomposed_right} right only with decomposition, ${dec.paired.only_single_right} only with the single question, p = ${fix(dec.paired.mcnemar_p, 4)}). Most of the gain comes from matching what the dataset's label means: it counts spam as phishing.`),
    el("div", { class: "card" }, pairedBars([{ label: "Phishing, 300 emails", a: dec.single.accuracy, b: dec.decomposed.accuracy }], ["single question", "six narrow questions"], { label: "Phishing accuracy, single question against decomposition" })),
    table(["Sub-question", "ROC-AUC alone", "Weight in combiner"], Object.entries(dec.feature_roc_auc_on_test).map(([k, v]) => [k.replace(/_/g, " "), fix(v, 3), fix(dec.weights[k], 2)]), 1));

  const noneSec = sec("none-option", "A \"none of these\" option",
    el("p", {}, "Does an explicit way to abstain beat simply dropping the least confident answers? On four many-option datasets where the right answer is always listed, every \"none\" pick is an abstention."),
    table(["Dataset", "Abstained", "Accuracy, base", "Accuracy, not abstained", "Base, same share kept by confidence", "McNemar p"],
      Object.entries(none).map(([d, v]) => [nm(d), pct(v.abstained), pct(v.base_accuracy), pct(v.none_accuracy_answered), pct(v.base_selective_accuracy_same_coverage), fix(v.mcnemar_p)]), 1),
    el("p", { class: "callout" }, "Jev almost never abstains, and when it does, a confidence cut-off does the same job. Use a cut-off."));

  const b = qf.batching;
  const formats = sec("format", "Batching, option order, key names and wording",
    el("p", {}, `Batching: asking 28 emotion questions in one request gave the same yes/no pick as 28 separate requests on ${pct(b.pick_agreement, 2)} of ${int(b.answers)} answers (mean probability difference ${fix(b.mean_abs_prob_diff, 4)}, p = ${fix(b.mcnemar_p)}).`),
    el("h3", {}, "Option order and key names (100 items each)"),
    table(["Dataset", "Form", "Accuracy", "Same label as original", "Lost", "Gained", "McNemar p"],
      Object.entries(qf.order).flatMap(([d, conds]) => Object.entries(conds).map(([c, v]) => [nm(d), c === "base" ? "original" : c === "reversed" ? "options reversed" : "keys renamed to A, B, C", pct(v.accuracy, 0), c === "base" ? "-" : pct(v.same_label_as_base, 0), c === "base" ? "-" : String(v.lost), c === "base" ? "-" : String(v.gained), v.mcnemar_p == null ? "-" : fix(v.mcnemar_p)])), 2),
    el("h3", {}, "Yes/no as a question or as a statement"),
    table(["Dataset", "Question form", "Statement form", "Only question right", "Only statement right", "McNemar p"],
      Object.entries(ex.phrasing).map(([d, v]) => [nm(d), pct(v.question_accuracy), pct(v.statement_accuracy), String(v.only_question_right), String(v.only_statement_right), fix(v.mcnemar_p)]), 1),
    el("h3", {}, "Same question, two days later"),
    table(["Dataset", "Earlier run", "Re-asked"], ex.reproducibility.map((r) => [nm(r.dataset), pct(r.earlier), pct(r.re_asked)]), 1),
    el("p", { class: "callout" }, "Format, wording and order do not move Jev's answers significantly, and the same questions give the same results across days. The numbers describe the model, not the harness."));

  mount(app, 
    el("p", { class: "label", style: "margin-top:32px" }, "Stress tests"),
    el("h1", {}, "Beyond the datasets"),
    el("p", { class: "lead" }, "Besides the 63 datasets, Jev was tested by changing the question and the input on purpose: more and fewer options, numbers, extra text, an injected instruction, a negated question, a contradictory definition, splitting one question into several, and changing the format."),
    el("nav", { class: "subnav", "aria-label": "Sections" }, [["options", "Options"], ["numbers", "Numbers"], ["probes", "Probes"], ["decomposition", "Decomposition"], ["none-option", "None option"], ["format", "Format and wording"]].map(([id, t]) => el("a", { href: `#${id}` }, t))),
    options, numbers, probes, decomposition, noneSec, formats);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
main().catch((e) => fail(app, e));
