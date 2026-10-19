"""Export the stored Jev results to the JSON files behind the public website (`site/data/*.json`).

Offline only: reads `runs/*/report/summary.json`, the stored predictions and the experiments' `answers.jsonl`.
It never calls a model. Every number on the site is generated here (AGENTS.md: site numbers are never typed);
the only typed values are the published anchors, labelled with their source.

Usage: uv run python scripts/export_site_data.py [--out site/data]
"""

from __future__ import annotations

import argparse
import contextlib
import importlib.util
import io
import json
import re
import statistics
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from site_content import (  # noqa: E402
    ANCHORS,
    CONTAMINATION_RISK,
    DOMAIN_NAMES,
    DOMAIN_NOTES,
    FAILURE_MODES,
    OPEN_QUESTIONS,
    TEST_CATALOGUE,
    VERDICT_WORDS,
)

from sysone_bench.adapters import get_adapter  # noqa: E402
from sysone_bench.config import get_settings  # noqa: E402
from sysone_bench.eval.metrics import mcnemar_p, wilson  # noqa: E402
from sysone_bench.eval.report import _pooled_row, merge_results, verdict_letter  # noqa: E402

MODEL = "jev"
DATASET_RUNS = ["tier3-2026-09-27", "ulb-balanced-2026-09-27", "tier1-2026-09-27", "tier2-2026-09-29"]
EXPERIMENT_RUNS = {
    "ctibench_vsp_worded": "ctibench-vsp-worded-2026-09-29",
    "option_scaling": "option-scaling-2026-09-29",
    "jaggedness": "jaggedness-2026-09-29",
    "decomposition": "decomposition-2026-09-29",
    "none_option": "none-option-2026-09-29",
    "question_format": "question-format-2026-09-29",
    "phrasing": "phrasing-test-2026-09-27",
}
LIVE_RUNS = [
    "smoke-live-2026-09-27", *DATASET_RUNS[:2], "phrasing-test-2026-09-27", DATASET_RUNS[2], DATASET_RUNS[3],
    *[v for k, v in EXPERIMENT_RUNS.items() if k != "phrasing"],
]
# Jev cost per run (USD), from docs/RESULTS.md section 4 (the run log). Experiment scripts record cost per answer.
RUN_COST_USD = {
    "smoke-live-2026-09-27": 0.00027, "tier3-2026-09-27": 0.054, "ulb-balanced-2026-09-27": 0.0075,
    "phrasing-test-2026-09-27": 0.009, "tier1-2026-09-27": 0.42, "tier2-2026-09-29": 0.344,
}


def _runs_dir() -> Path:
    return get_settings().runs_dir


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _r(v: Any, nd: int = 5) -> Any:
    return None if v is None else round(float(v), nd)


# ---------------------------------------------------------------------------------------------------------------
# datasets
# ---------------------------------------------------------------------------------------------------------------
def load_dataset_results() -> tuple[dict[str, Any], dict[str, Any]]:
    """Jev's per-dataset summaries merged exactly as `sysone verdict tier3 ulb tier1 tier2` does (later run wins)."""
    summaries, info = [], {}
    for run in DATASET_RUNS:
        s = json.loads((_runs_dir() / run / "report" / "summary.json").read_text(encoding="utf-8"))
        summaries.append({"results": {MODEL: s["results"][MODEL]}})
        for d in s["results"][MODEL]:
            info[d] = {**s["datasets"][d], "run": run}
    return merge_results(summaries)["results"][MODEL], info


SHORT_OVERRIDES = {"bbh": "BIG-Bench Hard", "typed_decisions": "Typed decisions"}


def short_title(dataset_id: str, title: str) -> str:
    """Readable name for tables and chips: the registry title cut at the first parenthesis, 'via' or colon."""
    return SHORT_OVERRIDES.get(dataset_id) or re.split(r" \(| via |: ", title)[0]


def _n_options(v: Any) -> int:
    """Option count of a question; some datasets list a range such as '4-5' (options differ per item): the upper bound."""
    if v is None:
        return 2
    if isinstance(v, str):
        return int(v.split("-")[-1])
    return int(v)


def question_framing(dataset_id: str, max_options: int = 12) -> list[dict[str, Any]] | None:
    """The frozen question(s) as Jev sees them (our own wording, no dataset text). None for per-item questions."""
    try:
        tmpl = get_adapter(dataset_id).question_template()
    except Exception:
        return None
    if not tmpl:
        return None
    out = []
    for qid, q in list(tmpl.items())[:3]:
        w = q.to_wire()
        crit = w.get("criteria")
        item: dict[str, Any] = {"id": qid, "type": w["type"], "instruction": w["instructions"]}
        if isinstance(crit, dict):
            keys = list(crit)
            item["options"] = [{"key": k, "text": crit[k] if isinstance(crit[k], str) else json.dumps(crit[k])}
                               for k in keys[:max_options]]
            item["n_options"] = len(keys)
        elif isinstance(crit, list):
            item["options"] = [{"key": str(i), "text": t if isinstance(t, str) else json.dumps(t)} for i, t in enumerate(crit)]
            item["n_options"] = len(crit)
        out.append(item)
    return out


def dataset_rows(results: dict[str, Any], info: dict[str, Any], framing: bool = True) -> list[dict[str, Any]]:
    rows = []
    for d in sorted(results):
        res = results[d]
        r = _pooled_row(res)
        qs = [q for q in res["questions"].values() if q.get("n")]
        types = sorted({q["type"] for q in qs})
        within1 = None
        sc = [q for q in qs if q.get("within_1") is not None]
        if sc:
            within1 = sum(q["within_1"] * q["n"] for q in sc) / sum(q["n"] for q in sc)
        hq = next((q for q in qs if q.get("human_tv") is not None), None)
        pooled = res.get("pooled") or {}
        rt = pooled.get("recommended_threshold") or {}
        gt = rt.get("guaranteed") or {}
        rc = pooled.get("recalibration") or {}
        i = info[d]
        n = r["n_answers"]
        flags = []
        if d in CONTAMINATION_RISK:
            flags.append("possibly in training data")
        if n < 100:
            flags.append("too few answers to judge")
        if res["skipped_context"]:
            flags.append(f"{res['skipped_context']} items skipped (longer than the context)")
        rows.append({
            "id": d, "title": i["title"], "short_title": short_title(d, i["title"]), "domain": i["domain"], "tier": i["tier"], "role": i["role"], "run": i["run"],
            "what_it_tests": i["capability"] or i["title"], "license": i["license"],
            "records": res["records"], "answers": n, "planned": res["planned"], "skipped_context": res["skipped_context"],
            "question_types": types, "n_questions": len(qs), "n_options": max(_n_options(q.get("n_options")) for q in qs),
            "options_vary": any(isinstance(q.get("n_options"), str) for q in qs),
            "accuracy": _r(r["accuracy"]), "ci95": [_r(x) for x in r["ci"]], "baseline": _r(r["majority"]),
            "top2": _r(r["top2"]), "top3": _r(r["top3"]), "within_1": _r(within1), "roc_auc": _r(r["roc_auc"]),
            "mean_confidence": _r(r["confidence"]), "ece": _r(r["ece"]), "brier": _r(r["brier"]),
            "auroc_confidence": _r(r["auroc"]),
            "confident_90": _r(r["cov@0.9"]), "wrong_among_confident_90": _r(r["wrong@0.9"]),
            "correct_with_conf_70": _r(r["correct_conf"]),
            "wrong_all_90": _r(r["wrong_all_conf>=0.9"]), "wrong_all_70": _r(r["wrong_all_conf>=0.7"]),
            "wrong_all_50": _r(r["wrong_all_conf>=0.5"]),
            "verdict": verdict_letter(res),
            "cutoff": rt.get("threshold"), "cutoff_automated": _r(rt.get("coverage")),
            "cutoff_wrong": _r(rt.get("wrong_rate")), "cutoff_heldout_wrong": _r(rt.get("heldout_wrong_rate")),
            "cutoff_heldout_automated": _r(rt.get("heldout_coverage")),
            "guaranteed_cutoff": gt.get("threshold"), "guaranteed_automated": _r(gt.get("coverage")),
            "ece_recalibrated": _r(rc.get("heldout_ece_scaled")), "ece_raw_heldout": _r(rc.get("heldout_ece_raw")),
            "human_tv": _r(hq["human_tv"]) if hq else None, "human_kl": _r(hq["human_kl"]) if hq else None,
            "latency_p50_ms": _r(res["latency_p50_ms"], 1), "latency_p95_ms": _r(res["latency_p95_ms"], 1),
            "input_tokens": res["input_tokens"], "flags": flags,
            "framing": question_framing(d) if framing else None,
        })
    return rows


def slices(results: dict[str, Any]) -> dict[str, Any]:
    """Per-slice accuracy from the per-question blocks (BBH sub-tasks, AdvGLUE tasks, LegalBench tasks, typed workflows)
    and XNLI by language (example id prefix)."""
    out: dict[str, Any] = {}
    for d in ("bbh", "adv_glue", "legalbench", "typed_decisions"):
        qs = results[d]["questions"]
        out[d] = [{"slice": qid, "n": q["n"], "accuracy": _r(q["accuracy"]), "ci95": [_r(x) for x in q["accuracy_ci95"]],
                   "baseline": _r(q.get("majority_baseline"))} for qid, q in sorted(qs.items())]
    recs = _read_jsonl(_runs_dir() / "tier2-2026-09-29" / "predictions" / MODEL / "xnli.jsonl")
    by_lang: dict[str, list[bool]] = defaultdict(list)
    for rec in recs:
        if rec["status"] != "ok":
            continue
        a, g = rec["answers"]["nli"], rec["gold"]["nli"]["label"]
        by_lang[rec["example_id"].split("-")[0]].append(_pick(a) == str(g))
    out["xnli_languages"] = [{"slice": lang, "n": len(v), "accuracy": _r(sum(v) / len(v))} for lang, v in sorted(by_lang.items())]
    return out


def _pick(answer: dict[str, Any]) -> str:
    """The committed answer of a stored choice or score answer (Answer.predicted without the model classes)."""
    probs = answer["probabilities"]
    top = max(probs.values())
    tied = [o for o, p in probs.items() if p >= top - 1e-9]
    reported = answer.get("choice")
    return reported if reported in tied else tied[0]


# ---------------------------------------------------------------------------------------------------------------
# calibration
# ---------------------------------------------------------------------------------------------------------------
def calibration(results: dict[str, Any]) -> dict[str, Any]:
    """Reliability bins and coverage-accuracy curves per dataset: bins pooled over the dataset's questions (weighted by
    answers); the curve is the answer-weighted mean of each question's own curve at the same coverage grid."""
    out: dict[str, Any] = {}
    all_bins: dict[str, dict[str, float]] = {}
    for d, res in sorted(results.items()):
        bins: dict[str, dict[str, float]] = {}
        curve: dict[float, list[tuple[int, float]]] = defaultdict(list)
        for q in res["questions"].values():
            for b in q.get("reliability") or []:
                acc = bins.setdefault(b["bin"], {"n": 0, "conf": 0.0, "acc": 0.0})
                acc["n"] += b["n"]
                acc["conf"] += b["mean_confidence"] * b["n"]
                acc["acc"] += b["accuracy"] * b["n"]
                tot = all_bins.setdefault(b["bin"], {"n": 0, "conf": 0.0, "acc": 0.0})
                tot["n"] += b["n"]
                tot["conf"] += b["mean_confidence"] * b["n"]
                tot["acc"] += b["accuracy"] * b["n"]
            for p in q.get("coverage_curve") or []:
                curve[p["coverage"]].append((q["n"], p["accuracy"]))
        out[d] = {"reliability": _bins(bins), "coverage": _curve(curve)}
    out["_all"] = {"reliability": _bins(all_bins)}
    return out


def _bins(bins: dict[str, dict[str, float]]) -> list[dict[str, Any]]:
    return [{"bin": k, "n": int(v["n"]), "confidence": _r(v["conf"] / v["n"]), "accuracy": _r(v["acc"] / v["n"])}
            for k, v in sorted(bins.items()) if v["n"]]


def _curve(curve: dict[float, list[tuple[int, float]]]) -> list[dict[str, Any]]:
    return [{"coverage": c, "accuracy": _r(sum(n * a for n, a in pts) / sum(n for n, _ in pts))}
            for c, pts in sorted(curve.items())]


# ---------------------------------------------------------------------------------------------------------------
# experiments
# ---------------------------------------------------------------------------------------------------------------
def _load_experiment(name: str):
    sys.path.insert(0, str(ROOT / "experiments"))
    spec = importlib.util.spec_from_file_location(f"exp_{name}", ROOT / "experiments" / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _captured(fn, *args) -> Any:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        fn(*args)
    return json.loads(buf.getvalue())


def _answers(run: str) -> list[dict[str, Any]]:
    return _read_jsonl(_runs_dir() / run / "answers.jsonl")


def experiment_jaggedness() -> dict[str, Any]:
    return _captured(_load_experiment("jaggedness").summarize, _answers(EXPERIMENT_RUNS["jaggedness"]))


def experiment_decomposition() -> dict[str, Any]:
    golds = {e.example_id: e.gold["phishing"].label for e in get_adapter("phishing_email").load()}
    return _captured(_load_experiment("decomposition").summarize, _answers(EXPERIMENT_RUNS["decomposition"]), golds)


def experiment_none_option() -> dict[str, Any]:
    return _captured(_load_experiment("none_option").summarize, _answers(EXPERIMENT_RUNS["none_option"]))


def experiment_question_format() -> dict[str, Any]:
    return _captured(_load_experiment("question_format").summarize, _answers(EXPERIMENT_RUNS["question_format"]))


def experiment_phrasing() -> dict[str, Any]:
    """Question form vs statement form (stored in the old p_yes format), Jev only."""
    by: dict[tuple[str, str], dict[str, tuple[bool, bool]]] = defaultdict(dict)
    for r in _answers(EXPERIMENT_RUNS["phrasing"]):
        if r.get("model") != MODEL or r.get("p_yes") is None:
            continue
        by[(r["dataset"], r["form"])][r["id"]] = (r["p_yes"] >= 0.5) == bool(r["gold"])
    out = {}
    for ds in sorted({d for d, _ in by}):
        q, s = by[(ds, "question")], by[(ds, "statement")]
        ids = sorted(q.keys() & s.keys())
        b = sum(q[i] and not s[i] for i in ids)
        c = sum(s[i] and not q[i] for i in ids)
        out[ds] = {"n": len(ids), "question_accuracy": _r(sum(q[i] for i in ids) / len(ids), 3),
                   "statement_accuracy": _r(sum(s[i] for i in ids) / len(ids), 3),
                   "only_question_right": b, "only_statement_right": c, "mcnemar_p": mcnemar_p(b, c)}
    return out


def _correct(rec: dict[str, Any], qid: str) -> bool | None:
    a = rec["answers"].get(qid)
    if rec["status"] != "ok" or a is None:
        return None
    return _pick(a) == str(rec["gold"][qid]["label"])


def experiment_worded() -> dict[str, Any]:
    """Numeric vs worded CVSS levels on the same 995 items (paired)."""
    run = _runs_dir() / EXPERIMENT_RUNS["ctibench_vsp_worded"] / "predictions" / MODEL
    recs = {n: {r["example_id"]: r for r in _read_jsonl(run / f"{n}.jsonl") if r["status"] == "ok"}
            for n in ("ctibench_vsp", "ctibench_vsp_worded")}
    ids = sorted(recs["ctibench_vsp"].keys() & recs["ctibench_vsp_worded"].keys())
    out: dict[str, Any] = {"n": len(ids)}
    flags = {}
    for n, rr in recs.items():
        flags[n] = [_correct(rr[i], "severity") for i in ids]
        picks = [_pick(rr[i]["answers"]["severity"]) for i in ids]
        within = [abs(int(p) - int(rr[i]["gold"]["severity"]["label"])) <= 1 for p, i in zip(picks, ids, strict=True)]
        acc = sum(flags[n]) / len(ids)
        out[n] = {"accuracy": _r(acc), "ci95": [_r(x) for x in wilson(sum(flags[n]), len(ids))],
                  "within_1": _r(sum(within) / len(ids)),
                  "picks_high": sum(p == "3" for p in picks),
                  "mean_confidence": _r(statistics.mean(max(rr[i]["answers"]["severity"]["probabilities"].values())
                                                       for i in ids))}
    gold_high = sum(str(recs["ctibench_vsp"][i]["gold"]["severity"]["label"]) == "3" for i in ids)
    b = sum(a and not w for a, w in zip(flags["ctibench_vsp"], flags["ctibench_vsp_worded"], strict=True))
    c = sum(w and not a for a, w in zip(flags["ctibench_vsp"], flags["ctibench_vsp_worded"], strict=True))
    out.update(gold_high=gold_high, only_numeric_right=b, only_worded_right=c, mcnemar_p=mcnemar_p(b, c))
    return out


def experiment_option_scaling(results: dict[str, Any]) -> dict[str, Any]:
    """Accuracy per number of options (paired base items) and Jev's accuracy on the same items with the full label set."""
    run = _runs_dir() / EXPERIMENT_RUNS["option_scaling"]
    summ = json.loads((run / "report" / "summary.json").read_text(encoding="utf-8"))["option_scaling"]
    out: dict[str, Any] = {}
    earlier = {"tier1-2026-09-27", "tier2-2026-09-29", "tier3-2026-09-27"}
    for d, s in sorted(summ.items()):
        ks = s["paired_ks"]
        paired = s["paired"][MODEL]
        base_ids = {r["example_id"].split("#")[0] for r in _read_jsonl(run / "predictions" / MODEL / f"{d}.jsonl")}
        full = []
        for er in sorted(earlier):
            p = _runs_dir() / er / "predictions" / MODEL / f"{d}.jsonl"
            if p.exists():
                for rec in _read_jsonl(p):
                    if rec["example_id"] in base_ids:
                        qid = next(iter(rec["gold"]))
                        c = _correct(rec, qid)
                        if c is not None:
                            full.append(c)
                break
        out[d] = {"ks": [int(k) for k in ks], "n_base_items": s["paired_base_items"],
                  "accuracy": [_r(paired[k]["accuracy"]) for k in ks], "chance": [_r(paired[k]["chance"]) for k in ks],
                  "mean_confidence": [_r(paired[k]["mean_confidence"]) for k in ks],
                  "full_label_set_options": results[d]["questions"][next(iter(results[d]["questions"]))].get("n_options"),
                  "full_label_set_accuracy": _r(sum(full) / len(full)) if full else None, "full_label_set_n": len(full)}
    return out


def experiment_ulb(results: dict[str, Any]) -> dict[str, Any]:
    q = results["ulb_creditcard"]["questions"]
    q = next(iter(q.values()))
    return {"accuracy": _r(q["accuracy"]), "ci95": [_r(x) for x in q["accuracy_ci95"]], "roc_auc": _r(q.get("roc_auc")),
            "f1_positive": _r(q.get("f1_positive")), "mean_confidence": _r(q["mean_confidence"]), "n": q["n"]}


def reproducibility(none_option: dict[str, Any], rows: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    """The same frozen question re-asked two days later (none-option base arm) vs the earlier run on the same items."""
    return [{"dataset": d, "earlier": rows[d]["accuracy"], "re_asked": v["base_accuracy"], "n": v["n"]}
            for d, v in none_option.items()]


# ---------------------------------------------------------------------------------------------------------------
# failure modes, domains, meta
# ---------------------------------------------------------------------------------------------------------------
def failure_modes(rows: dict[str, dict[str, Any]], ex: dict[str, Any], sl: dict[str, Any],
                  unparseable: int) -> list[dict[str, Any]]:
    bbh = {s["slice"]: s for s in sl["bbh"]}
    jag = ex["jaggedness"]
    pad = [jag[d][c] for d in jag for c in ("pad_before_2k", "pad_after_2k", "pad_before_8k") if c in jag[d]]
    neg = {d: jag[d]["negated"] for d in jag}
    inj = {d: jag[d]["injected"] for d in jag}
    con = {d: jag[d]["contradictory"] for d in jag if "contradictory" in jag[d]}
    wd = ex["ctibench_vsp_worded"]
    ph = ex["phrasing"]
    pct = lambda v: f"{100 * v:.1f}%"  # noqa: E731
    ev = {
        "literal": {
            "contradictory": {d: _r(v["followed_instruction"], 3) for d, v in con.items()},
            "phrasing": {d: [v["question_accuracy"], v["statement_accuracy"]] for d, v in ph.items()},
            "worded_vs_numeric": [wd["ctibench_vsp"]["accuracy"], wd["ctibench_vsp_worded"]["accuracy"], wd["mcnemar_p"]],
            "legalbench": rows["legalbench"]["accuracy"], "condaqa": rows["condaqa"]["accuracy"],
        },
        "numbers": {
            "ulb": ex["ulb"]["accuracy"], "ulb_roc_auc": ex["ulb"]["roc_auc"], "cvss_numeric": wd["ctibench_vsp"]["accuracy"],
            "cvss_worded": wd["ctibench_vsp_worded"]["accuracy"], "object_counting": bbh["object_counting"]["accuracy"],
            "mmlu_pro": rows["mmlu_pro"]["accuracy"],
        },
        "dates": {"date_understanding": bbh["date_understanding"]["accuracy"],
                  "temporal_sequences": bbh["temporal_sequences"]["accuracy"], "n_each": bbh["date_understanding"]["n"]},
        "indirection": {"condaqa": rows["condaqa"]["accuracy"], "web_of_lies": bbh["web_of_lies"]["accuracy"],
                        "formal_fallacies": bbh["formal_fallacies"]["accuracy"],
                        "logical_deduction": bbh["logical_deduction_five_objects"]["accuracy"],
                        "navigate": bbh["navigate"]["accuracy"], "causal_judgement": bbh["causal_judgement"]["accuracy"],
                        "logiqa": rows["logiqa"]["accuracy"], "anli": rows["anli"]["accuracy"]},
        "padding": {"max_lost_of_100": max(p["lost"] for p in pad), "min_p": min(p["mcnemar_p"] for p in pad),
                    "sms_conf": [jag["sms_spam"]["base"]["mean_conf"], jag["sms_spam"]["pad_after_2k"]["mean_conf"]],
                    "quality": rows["quality"]["accuracy"], "scotus": rows["scotus"]["accuracy"],
                    "longbench_v2_answers": rows["longbench_v2"]["answers"]},
        "injection": {d: {"lost": v["lost"], "n": v["n"], "followed": v["followed_injection"]} for d, v in inj.items()}
        | {"adv_glue": rows["adv_glue"]["accuracy"], "anli": rows["anli"]["accuracy"]},
        "contradiction": {d: v["followed_instruction"] for d, v in con.items()},
        "invariants": {d: {"gap": v["mean_abs_sum_minus_1"], "over_02": v["share_gap_over_0.2"],
                           "consistent": v["logically_consistent_picks"]} for d, v in neg.items()},
        "generation": {"unparseable_answers": unparseable},
    }
    out = []
    for fm in FAILURE_MODES:
        out.append({**{k: fm[k] for k in ("n", "key", "name", "status", "reading")},
                    "evidence": fm["evidence"](ev[fm["key"]], pct)})
    return out


def domains(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        by[r["domain"]].append(r)
    out = []
    for d, rs in sorted(by.items()):
        n = sum(r["answers"] for r in rs)
        counts = {k: sum(r["verdict"] == k for r in rs) for k in "ABC"}
        out.append({
            "domain": d, "name": DOMAIN_NAMES.get(d, d), "note": DOMAIN_NOTES.get(d, ""), "datasets": [r["id"] for r in rs],
            "counts": counts, "answers": n,
            "mean_accuracy": _r(statistics.mean(r["accuracy"] for r in rs)),
            "mean_baseline": _r(statistics.mean(r["baseline"] for r in rs)),
            "wrong_all_90": _r(sum(r["wrong_all_90"] * r["answers"] for r in rs) / n),
        })
    return out


def count_requests() -> dict[str, Any]:
    """Jev requests that were answered, per live run (one request = one item with all its questions)."""
    runs = _runs_dir()
    by_run: dict[str, int] = {}
    for run in LIVE_RUNS:
        pred = runs / run / "predictions" / MODEL
        if pred.exists():
            ids = 0
            for f in pred.glob("*.jsonl"):
                ids += len({r["example_id"] for r in _read_jsonl(f) if r["status"] == "ok"})
            by_run[run] = ids
        elif run == EXPERIMENT_RUNS["phrasing"]:
            by_run[run] = sum(1 for r in _answers(run) if r.get("model") == MODEL)
        else:
            by_run[run] = len(_answers(run))
    return {"total": sum(by_run.values()), "by_run": by_run}


def meta(rows: list[dict[str, Any]], ex: dict[str, Any], unparseable: int) -> dict[str, Any]:
    runs = _runs_dir()
    cost = 0.0
    for run in LIVE_RUNS:
        if run in RUN_COST_USD:
            cost += RUN_COST_USD[run]
            continue
        f = runs / run / "answers.jsonl"
        if f.exists():
            cost += sum(r.get("cost_usd", 0.0) for r in _read_jsonl(f))
        else:  # runner runs carry the cost in status.json totals
            st = json.loads((runs / run / "status.json").read_text(encoding="utf-8"))
            cost += st["totals"]["cost_usd"]
    requests = count_requests()
    try:
        commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True,
                                check=True).stdout.strip()
    except Exception:
        commit = None
    counts = {k: sum(r["verdict"] == k for r in rows) for k in "ABC"}
    by_id = {r["id"]: r for r in rows}
    pct = lambda v: f"{100 * v:.1f}%"  # noqa: E731
    tests = [{k: v for k, v in t.items() if k != "headline"} | {"result": t["headline"](by_id, ex, pct)}
             for t in TEST_CATALOGUE]
    return {
        "model": "jev-1.13.0", "vendor": "TypeSafe AI", "run_window": "2026-09-27 to 2026-09-29",
        "datasets": len(rows), "domains": len({r["domain"] for r in rows}), "verdicts": counts,
        "dataset_records": sum(r["records"] for r in rows), "dataset_answers": sum(r["answers"] for r in rows),
        "requests_total": requests["total"], "requests_by_run": requests["by_run"], "input_tokens": sum(r["input_tokens"] for r in rows),
        "cost_usd_total": round(cost, 3), "cost_basis": "run log of docs/RESULTS.md plus per-answer cost of experiments",
        "median_latency_ms": round(statistics.median(r["latency_p50_ms"] for r in rows), 0),
        "unparseable_answers": unparseable, "harness_commit": commit,
        "mean_accuracy_per_dataset": _r(statistics.mean(r["accuracy"] for r in rows)),
        "gates_2pct": sum(r["cutoff"] is not None for r in rows),
        "gates_guaranteed": sum(r["guaranteed_cutoff"] is not None for r in rows),
        "independent_and_unofficial": True, "anchors": ANCHORS, "tests": tests,
        "verdict_words": VERDICT_WORDS, "open_questions": OPEN_QUESTIONS,
    }


def build() -> dict[str, Any]:
    results, info = load_dataset_results()
    rows = dataset_rows(results, info)
    by_id = {r["id"]: r for r in rows}
    sl = slices(results)
    ex: dict[str, Any] = {
        "ulb": experiment_ulb(results), "ctibench_vsp_worded": experiment_worded(),
        "option_scaling": experiment_option_scaling(results), "jaggedness": experiment_jaggedness(),
        "decomposition": experiment_decomposition(), "none_option": experiment_none_option(),
        "question_format": experiment_question_format(), "phrasing": experiment_phrasing(),
    }
    ex["reproducibility"] = reproducibility(ex["none_option"], by_id)
    unparseable = sum(r["unparseable_answers"] + r["errors"] for r in results.values())
    return {
        "meta": meta(rows, ex, unparseable), "datasets": rows, "domains": domains(rows), "slices": sl,
        "calibration": calibration(results), "experiments": ex, "failure_modes": failure_modes(by_id, ex, sl, unparseable),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default=str(ROOT / "site" / "data"))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    data = build()
    for name, payload in data.items():
        (out / f"{name}.json").write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {out / (name + '.json')}")


if __name__ == "__main__":
    main()
