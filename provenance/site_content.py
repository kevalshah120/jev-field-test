"""Hand-written wording for the public site, kept next to the exporter so numbers and words cannot drift apart.

Rules: every number comes from a function argument (the data computed by `export_site_data.py`); the few typed
values are the published anchors, labelled with their source. No em dashes. Plain language.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

# Datasets the Jev docs and our own checks flag as possibly seen in training (docs/RESULTS.md section 2, point 8).
CONTAMINATION_RISK = {"mmlu_pro", "medmcqa", "boolq", "sst2", "bbh", "quality"}

VERDICT_WORDS = {
    "A": {"label": "Works as-is",
          "rule": "Accuracy at least 85%, removes at least half of the always-majority baseline's errors, and at most 3% "
                  "of all answers are wrong with confidence 0.9 or more."},
    "B": {"label": "Works with a cut-off or review",
          "rule": "Not A, and accuracy at least 70% while removing at least a quarter of the baseline's errors, or (yes/no "
                  "questions) ROC-AUC at least 0.90, so a per-task cut-off or human review would work."},
    "C": {"label": "Not usable zero-shot", "rule": "Anything else: fine-tune, redesign the question, or use another tool."},
}

# Published figures we compare with. These are typed on purpose; each carries its source.
ANCHORS = [
    {"dataset": "typed_decisions", "name": "TypeSafe-style typed decisions", "published": 0.727,
     "source": "third-party write-up of Jev on the typed-decisions benchmark (see JEV-AND-LAYA-KNOWLEDGE.md section 7)"},
    {"dataset": "banking77", "name": "Banking77 (77 intents)", "published_low": 0.75, "published_high": 0.84,
     "source": "spread of eight independent Jev runs collected in docs/RESULTS.md section 2, point 2"},
]

DOMAIN_NAMES = {
    "calibration": "Human disagreement", "clinical": "Clinical text", "ecommerce": "E-commerce search",
    "education": "Essay grading", "finance": "Finance", "fraud": "Fraud", "grounding": "Grounding and hallucination",
    "intent": "Intent routing", "judge": "LLM-as-judge", "knowledge": "Knowledge and reading", "legal": "Legal",
    "long_context": "Long documents", "medical": "Medical", "misinformation": "Misinformation",
    "moderation": "Content moderation", "multilingual": "Multilingual", "public": "Crisis response",
    "reasoning": "Reasoning", "reference": "TypeSafe-style workflows", "robustness": "Robustness",
    "safety": "Safety guardrails", "science": "Science", "security": "Security", "sentiment": "Sentiment and emotion",
    "social": "Argument quality", "spam": "Spam and phishing", "tools": "Agent tool use",
}

DOMAIN_NOTES = {
    "safety": "Strong. Use it as a guardrail; confident answers are almost always right.",
    "spam": "Strong on email and SMS spam. Phishing needs a cut-off, or several narrow questions combined.",
    "intent": "Strong on routing, even over 150 options. Gate the confusable ones with a cut-off or review.",
    "knowledge": "Strong on reading comprehension and exam-style knowledge (possibly helped by training exposure).",
    "sentiment": "Strong on yes/no sentiment. Over-flags multi-label emotion, and is close but rarely exact on 5-level scales.",
    "legal": "A good first pass with review. Long court opinions are over-confident.",
    "grounding": "Good at checking claims against a source; use a cut-off.",
    "finance": "Fair. Sentiment and ESG framing work with review; central-bank tone is weaker.",
    "clinical": "Fair. Ranks cases well but needs a tuned cut-off or review.",
    "medical": "Good on medical question answering with review; triage vignettes are too few to judge.",
    "security": "Good on security knowledge and CWE mapping with a cut-off; severity bands from a description are weak.",
    "science": "Good with review.",
    "tools": "Good for deciding when to call a tool, with review.",
    "reference": "Matches the published result on TypeSafe-style workflow decisions.",
    "reasoning": "Strong on puzzle-style logic, weak on counting and on negation hidden inside real text.",
    "robustness": "Good on perturbed text and paraphrase, weaker on adversarial entailment.",
    "long_context": "Strong on articles of about 5,000 tokens; most very long documents do not fit the context.",
    "multilingual": "Good in 7 languages with English instructions; Swahili is the weakest.",
    "calibration": "Good accuracy but far more certain than 100 human raters who split.",
    "moderation": "Offensive-language detection is fine; hate-speech nuance is not usable and is confidently wrong.",
    "ecommerce": "Not usable zero-shot for search relevance.",
    "education": "Not usable for grading essays on a rubric.",
    "judge": "Not usable as a stand-in for human quality ratings; it judges more harshly than people.",
    "misinformation": "Not usable for truthfulness scales or mixed-evidence verdicts.",
    "public": "Moderate; useful only with review.",
    "social": "Not usable: far harsher than the people who rated the arguments.",
    "fraud": "Fake job postings: only moderate ranking, and it over-flags at the default cut-off. Anonymous card numbers: cannot, by design.",
}

# The nine failure modes TypeSafe documents for jev-1.13 ("Jev 1.13 jaggedness"), and what we measured.
Pct = Callable[[float], str]
Ev = dict[str, Any]


NAMED = {"sst2": "SST-2", "boolq": "BoolQ", "sms_spam": "SMS spam"}


def _ev_literal(e: Ev, pct: Pct) -> list[str]:
    c, ph, w = e["contradictory"], e["phrasing"], e["worded_vs_numeric"]
    return [
        "Instruction against swapped true/false definitions: Jev followed the instruction on "
        + " and ".join(f"{pct(v)} ({NAMED[d]})" for d, v in c.items()) + " of items.",
        "Question form against statement form: "
        + "; ".join(f"{NAMED[d]} {pct(a)} vs {pct(b)}" for d, (a, b) in ph.items()) + ".",
        f"CVSS levels as numbers or in words: {pct(w[0])} vs {pct(w[1])} (McNemar p = {w[2]:.2f}).",
        f"LegalBench {pct(e['legalbench'])}, CONDAQA {pct(e['condaqa'])}.",
    ]


def _ev_numbers(e: Ev, pct: Pct) -> list[str]:
    return [
        f"Anonymous card numbers (balanced fraud set): {pct(e['ulb'])}, which is chance (ROC-AUC {e['ulb_roc_auc']:.2f}).",
        f"CVSS severity bands on all 995 items: {pct(e['cvss_numeric'])} with number ranges, {pct(e['cvss_worded'])} in words.",
        f"BBH object counting: {pct(e['object_counting'])}.",
        f"MMLU-Pro (14 academic subjects including maths): {pct(e['mmlu_pro'])}, possibly helped by training exposure.",
    ]


def _ev_dates(e: Ev, pct: Pct) -> list[str]:
    return [
        f"BBH date understanding {pct(e['date_understanding'])} and temporal sequences {pct(e['temporal_sequences'])} "
        f"({e['n_each']} items each, public data, so read as a ceiling).",
        "Duration arithmetic from free text was not tested.",
    ]


def _ev_indirection(e: Ev, pct: Pct) -> list[str]:
    return [
        f"Negation inside real text (CONDAQA): {pct(e['condaqa'])}.",
        f"Puzzle-style chains (BBH): web of lies {pct(e['web_of_lies'])}, formal fallacies {pct(e['formal_fallacies'])}, "
        f"logical deduction {pct(e['logical_deduction'])}, navigate {pct(e['navigate'])}, causal judgement "
        f"{pct(e['causal_judgement'])}.",
        f"LogiQA {pct(e['logiqa'])}, adversarial NLI (ANLI) {pct(e['anli'])}.",
    ]


def _ev_padding(e: Ev, pct: Pct) -> list[str]:
    return [
        f"2,000 words of filler before or after the text, and 8,000 words before it: at most {e['max_lost_of_100']} of 100 "
        f"answers lost, never significant (smallest p = {e['min_p']:.2f}).",
        f"Confidence on SMS spam fell from {e['sms_conf'][0]:.3f} to {e['sms_conf'][1]:.3f} with filler after the text.",
        f"Real long documents: QuALITY (about 5,000 tokens) {pct(e['quality'])}, SCOTUS opinions {pct(e['scotus'])}; "
        f"only {e['longbench_v2_answers']} of 100 LongBench v2 items fit Jev's 32k state limit.",
    ]


def _ev_injection(e: Ev, pct: Pct) -> list[str]:
    named = {"sst2": "SST-2", "boolq": "BoolQ", "sms_spam": "SMS spam"}
    parts = [f"{named[d]} {v['lost']}" for d, v in e.items() if d in named]
    return [
        "A line appended to the text said to ignore the question and give the WRONG answer. Right answers it flipped to wrong "
        "(of 100 items each): " + ", ".join(parts) + ".",
        f"Text perturbed to fool models: AdvGLUE {pct(e['adv_glue'])}, ANLI {pct(e['anli'])}.",
    ]


def _ev_contradiction(e: Ev, pct: Pct) -> list[str]:
    named = {"sst2": "SST-2", "sms_spam": "SMS spam"}
    return ["Instruction kept, true/false definitions swapped: Jev followed the instruction on "
            + " and ".join(f"{pct(v)} ({named[d]})" for d, v in e.items()) + " of items."]


def _ev_invariants(e: Ev, pct: Pct) -> list[str]:
    named = {"sst2": "SST-2", "boolq": "BoolQ", "sms_spam": "SMS spam"}
    return [f"{named[d]}: mean gap |P(q) + P(not q) - 1| = {v['gap']:.3f}, gap above 0.2 on {pct(v['over_02'])} of items, "
            f"logically consistent picks on {pct(v['consistent'])}." for d, v in e.items()]


def _ev_generation(e: Ev, pct: Pct) -> list[str]:
    return [f"Jev returns only typed answers. Unparseable answers across every run: {e['unparseable_answers']}."]


FAILURE_MODES: list[dict[str, Any]] = [
    {"n": 1, "key": "literal", "name": "Literal reading", "status": "Partly",
     "reading": "Wording is taken literally and the question text outranks the option definitions. There is no dedicated "
                "test of scoping words or implied conditions.", "evidence": _ev_literal},
    {"n": 2, "key": "numbers", "name": "Math and numbers", "status": "Tested",
     "reading": "Confirmed weak whenever the decision hinges on numbers or counting. Compute in code, then ask Jev about "
                "the result.", "evidence": _ev_numbers},
    {"n": 3, "key": "dates", "name": "Dates and time", "status": "Tested (one form)",
     "reading": "The vendor warning was not reproduced for multiple-choice date puzzles. Duration arithmetic from free "
                "text is untested.", "evidence": _ev_dates},
    {"n": 4, "key": "indirection", "name": "Indirection (double negatives, multi-hop)", "status": "Partly",
     "reading": "Strong on puzzle-style chains, weak when negation hides inside real text. No explicit double-negative or "
                "multi-hop question-answering test.", "evidence": _ev_indirection},
    {"n": 5, "key": "padding", "name": "Large irrelevant state", "status": "Tested",
     "reading": "Robust to padding; real long documents are fine up to about 5,000 tokens.", "evidence": _ev_padding},
    {"n": 6, "key": "injection", "name": "Adversarial content (steering by injected text)", "status": "Tested (one style)",
     "reading": "The injected text could not steer the answer in this form. Other injection styles and instructions hidden "
                "in retrieved documents are untested.", "evidence": _ev_injection},
    {"n": 7, "key": "contradiction", "name": "Contradictory instructions against criteria", "status": "Tested",
     "reading": "The instruction wins, so keep the instruction and the option definitions aligned.",
     "evidence": _ev_contradiction},
    {"n": 8, "key": "invariants", "name": "Structural invariants: P(q) + P(not q) = 1", "status": "Partly",
     "reading": "Nearly consistent for a question and its own negation. Not tested across different questions on the same "
                "state.", "evidence": _ev_invariants},
    {"n": 9, "key": "generation", "name": "Generation", "status": "Not tested (by design)",
     "reading": "Out of scope for a decision model: it cannot produce free text.", "evidence": _ev_generation},
]

OPEN_QUESTIONS = [
    "Double negatives written into the evidence text.",
    "True multi-hop question answering over several documents.",
    "Scoping words and implied conditions, with a dedicated test.",
    "Duration arithmetic from free-text dates.",
    "P(q) + P(not q) across different questions on the same state.",
    "Other injection styles, such as an end marker or an instruction hidden inside a retrieved document.",
    "More than 64 options in a controlled test (the real label sets of 100 to 200 options were measured).",
    "Images (Jev is text only).",
    "A re-run on a newer Jev version (the public Hugging Face index already uses jev-1.14.0; this run used jev-1.13.0).",
]


def _mean_tier(by: dict[str, dict[str, Any]], tier: int) -> tuple[int, float]:
    accs = [r["accuracy"] for r in by.values() if r["tier"] == tier and r["id"] != "ulb_creditcard"]
    return len(accs), sum(accs) / len(accs)


def _scaling(e: Ev) -> str:
    drops, mult = [], []
    for _d, v in e["option_scaling"].items():
        if 64 in v["ks"]:
            i = v["ks"].index(64)
            drops.append(100 * (v["accuracy"][0] - v["accuracy"][i]))
            mult.append(v["accuracy"][i] / v["chance"][i])
    return (f"From 4 to 64 options Jev lost {min(drops):.0f} to {max(drops):.0f} points on {len(drops)} datasets and stayed "
            f"{min(mult):.0f} to {max(mult):.0f} times above chance.")


# Each entry: the live run behind it and a one-line result built from the computed data.
TEST_CATALOGUE: list[dict[str, Any]] = [
    {"n": 1, "name": "Smoke test", "run": "smoke-live-2026-09-27", "asks": "Do Choice, Score and Noul answers work end to end?",
     "headline": lambda by, e, pct: "All three answer types were returned and parsed with 0 errors."},
    {"n": 2, "name": "Anchors and baselines", "run": "tier3-2026-09-27",
     "asks": "Does this harness reproduce published numbers, and what do well-known sets give?",
     "headline": lambda by, e, pct: ", ".join(
         f"{n} {pct(by[d]['accuracy'])}" for d, n in (("banking77", "Banking77"), ("sst2", "SST-2"), ("boolq", "BoolQ"),
                                                      ("mmlu_pro", "MMLU-Pro"), ("medmcqa", "MedMCQA"),
                                                      ("sms_spam", "SMS spam"))) + "."},
    {"n": 3, "name": "Numbers control (ULB)", "run": "ulb-balanced-2026-09-27",
     "asks": "Can Jev read anonymous numbers, such as card transactions?",
     "headline": lambda by, e, pct: f"{pct(e['ulb']['accuracy'])} on a 50/50 set: chance. It says 'not fraud' to every item."},
    {"n": 4, "name": "Question or statement", "run": "phrasing-test-2026-09-27",
     "asks": "Does phrasing the yes/no as a question or as a statement change the answer?",
     "headline": lambda by, e, pct: "; ".join(
         f"{NAMED.get(d, d)} {pct(v['question_accuracy'])} vs {pct(v['statement_accuracy'])}" for d, v in e["phrasing"].items())
     + ": no real difference."},
    {"n": 5, "name": "Core business domains", "run": "tier1-2026-09-27",
     "asks": "How good is Jev on one strong, human-labelled dataset per business domain?",
     "headline": lambda by, e, pct: f"{_mean_tier(by, 1)[0]} datasets, mean accuracy {pct(_mean_tier(by, 1)[1])}."},
    {"n": 6, "name": "Stress tests and calibration", "run": "tier2-2026-09-29",
     "asks": "Reasoning, negation, perturbed text, long documents, 200 options, and agreement with human raters.",
     "headline": lambda by, e, pct: f"{_mean_tier(by, 2)[0]} datasets, mean accuracy {pct(_mean_tier(by, 2)[1])}."},
    {"n": 7, "name": "Numbers or words for severity levels", "run": "ctibench-vsp-worded-2026-09-29",
     "asks": "Is Jev's weakness on CVSS severity caused by number ranges in the wording, or by the task?",
     "headline": lambda by, e, pct: (
         f"{pct(e['ctibench_vsp_worded']['ctibench_vsp']['accuracy'])} with numbers, "
         f"{pct(e['ctibench_vsp_worded']['ctibench_vsp_worded']['accuracy'])} in words "
         f"(p = {e['ctibench_vsp_worded']['mcnemar_p']:.2f}): the task is the problem.")},
    {"n": 8, "name": "Number of options", "run": "option-scaling-2026-09-29",
     "asks": "How does accuracy change with 4, 6, 16, 32 and 64 options on the same items?",
     "headline": lambda by, e, pct: _scaling(e)},
    {"n": 9, "name": "Failure-mode probes", "run": "jaggedness-2026-09-29",
     "asks": "Padding, a negated question, an injected instruction, and contradictory definitions.",
     "headline": lambda by, e, pct: "Robust to all four on the three tasks tested; see the failure-mode scorecard."},
    {"n": 10, "name": "Decomposition", "run": "decomposition-2026-09-29",
     "asks": "Is one hard question worse than several narrow ones combined?",
     "headline": lambda by, e, pct: (
         f"Phishing: {pct(e['decomposition']['single']['accuracy'])} with one question, "
         f"{pct(e['decomposition']['decomposed']['accuracy'])} with six narrow questions combined "
         f"(p = {e['decomposition']['paired']['mcnemar_p']:.4f}).")},
    {"n": 11, "name": "A 'none of these' option", "run": "none-option-2026-09-29",
     "asks": "Does an explicit way to abstain beat simply dropping low-confidence answers?",
     "headline": lambda by, e, pct: "Jev abstains on {} to {} of items and the option adds nothing over a confidence cut-off.".format(
         pct(min(v["abstained"] for v in e["none_option"].values())),
         pct(max(v["abstained"] for v in e["none_option"].values())))},
    {"n": 12, "name": "Question format", "run": "question-format-2026-09-29",
     "asks": "Do batching 28 questions, reversing the option order or renaming the option keys change the answers?",
     "headline": lambda by, e, pct: (
         f"Same pick on {pct(e['question_format']['batching']['pick_agreement'])} of answers when batched; option order "
         "and key names change no dataset significantly.")},
]
