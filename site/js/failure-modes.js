import { chrome, load, el, fail, statusClass, $, mount } from "./app.js";

const app = $("#app");

async function main() {
  const [meta, fms] = await Promise.all([chrome("failure-modes.html", "Failure modes"), load("failure_modes")]);
  const direct = fms.filter((f) => f.status.startsWith("Tested")).length, partly = fms.filter((f) => f.status === "Partly").length;
  mount(app, 
    el("p", { class: "label", style: "margin-top:32px" }, "Failure modes"),
    el("h1", {}, "TypeSafe's nine documented weak spots, tested"),
    el("p", { class: "lead" }, `TypeSafe's own "Jev 1.13 jaggedness" page lists nine known failure modes. We tested ${direct} directly and ${partly} partly; the ninth, generation, cannot apply to a decision model. Each section shows what was measured and what it means. Where we did not test something, it says so.`),
    el("nav", { class: "subnav", "aria-label": "Failure modes" }, fms.map((f) => el("a", { href: `#fm${f.n}` }, `${f.n} ${f.name.split(" (")[0]}`))),
    fms.map((f) => el("section", { class: "fm", id: `fm${f.n}` },
      el("div", {}, el("div", { class: "num-big" }, String(f.n).padStart(2, "0")), el("h2", { style: "margin:6px 0 8px;font-size:1.25rem" }, f.name), el("span", { class: `chip ${statusClass(f.status)}` }, f.status)),
      el("div", {}, el("ul", {}, f.evidence.map((e) => el("li", {}, e))), el("p", { class: "callout" }, el("strong", {}, "Reading. "), f.reading)))),
    el("h2", {}, "Beyond the nine"),
    el("p", {}, "Other tests bear on the same questions: the number of options (4 to 64 on the same items), numbers against words for severity levels, splitting one question into several, a \"none of these\" option, batching 28 questions in one request, and option order and key names. They are on the ", el("a", { href: "stress-tests.html" }, "stress tests page"), "."),
    el("h2", {}, "Not tested"),
    el("div", { class: "callout" }, el("ul", { style: "margin:0;padding-left:1.1rem" }, meta.open_questions.map((q) => el("li", {}, q))),
      el("p", { style: "margin-top:8px" }, "Each would cost cents to run on Jev, and none was run.")));
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
main().catch((e) => fail(app, e));
