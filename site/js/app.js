// Shared helpers: data loading, formatting, header and footer, theme. No dependencies. All paths are relative.
export const NAV = [
  ["index.html", "Scorecard"], ["domains.html", "Domains"], ["failure-modes.html", "Failure modes"],
  ["stress-tests.html", "Stress tests"], ["trust.html", "Trust"], ["method.html", "Method"],
];
export const VERDICT = {
  A: { word: "Works as-is", short: "A", shape: '<svg viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="currentColor"/></svg>' },
  B: { word: "Cut-off or review", short: "B", shape: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0 10 10H0z" fill="currentColor"/></svg>' },
  C: { word: "Not usable", short: "C", shape: '<svg viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" fill="currentColor"/></svg>' },
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

const cache = new Map();
export function load(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch(`data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`could not load data/${name}.json (${r.status})`);
      return r.json();
    }));
  }
  return cache.get(name);
}

export const pct = (v, d = 1) => (v == null ? "-" : `${(100 * v).toFixed(d)}%`);
export const pct0 = (v) => pct(v, 0);
export const fix = (v, d = 2) => (v == null ? "-" : Number(v).toFixed(d));
export const int = (v) => (v == null ? "-" : Number(v).toLocaleString("en-US"));
export const usd = (v) => `$${Number(v).toFixed(2)}`;
export const titleOf = (r) => r.title;

export function verdictPill(letter) {
  const v = VERDICT[letter];
  return el("span", { class: `pill ${letter}`, title: v.word, html: `${v.shape}<span>${v.short} ${v.word}</span>` });
}

export function statusClass(status) {
  if (status.startsWith("Tested")) return "status-tested";
  if (status === "Partly") return "status-partly";
  return "status-none";
}

function wordmark() {
  const dots = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const on = r === 1 && c === 1;
    dots.push(`<circle cx="${4 + c * 8}" cy="${4 + r * 8}" r="${on ? 3 : 1.6}" fill="${on ? "var(--accent)" : "currentColor"}"/>`);
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${dots.join("")}</svg>`;
}

export async function chrome(active, title) {
  document.title = title ? `${title} · Jev Field Test` : "Jev Field Test";
  let config = {};
  try { config = await (await fetch("config.json")).json(); } catch (e) { /* optional */ }
  const nav = el("nav", { class: "site-nav", "aria-label": "Main" },
    NAV.map(([href, label]) => el("a", { href, "aria-current": href === active ? "page" : null }, label)));
  const toggle = el("button", { class: "icon-btn", type: "button", "aria-label": "Toggle dark mode", title: "Toggle dark mode",
    onclick: () => setTheme((document.documentElement.dataset.theme || systemTheme()) === "dark" ? "light" : "dark") }, "◐");
  const header = el("header", { class: "site-header" }, el("div", { class: "wrap" },
    el("a", { class: "brand", href: "index.html", html: `${wordmark()}<span>Jev Field Test</span>` }), nav,
    config.repo_url ? el("a", { class: "chip", href: config.repo_url, rel: "noopener" }, "GitHub") : null, toggle));
  const skip = el("a", { class: "skip", href: "#main" }, "Skip to content");
  document.body.prepend(header);
  document.body.prepend(skip);
  const meta = await load("meta");
  document.body.append(el("footer", { class: "site-footer" }, el("div", { class: "wrap" },
    el("p", {}, "Independent and unofficial. Not affiliated with TypeSafe AI. Run on ", el("code", {}, meta.model),
      `, ${meta.run_window}.`),
    el("p", {}, "Public datasets may have been seen in training and samples are small (300 items per dataset). ",
      "Read every result as a field test, not a certificate. ", el("a", { href: "method.html" }, "Method and limits"), "."),
    config.repo_url ? el("p", {}, el("a", { href: config.repo_url, rel: "noopener" }, "Source and data on GitHub")) : null)));
  return meta;
}

function systemTheme() { return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem("jft-theme", t); } catch (e) { /* storage may be blocked */ }
  document.dispatchEvent(new CustomEvent("themechange"));
}
export function initTheme() {
  try { const t = localStorage.getItem("jft-theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
}

export function mount(root, ...kids) {
  const flat = kids.flat(Infinity).filter((k) => k != null && k !== false);
  root.replaceChildren(...flat.map((k) => (k.nodeType ? k : document.createTextNode(String(k)))));
}

export function fail(root, err) {
  console.error(err);
  root.replaceChildren(el("div", { class: "err", role: "alert" }, `Could not load the data: ${err.message}. The pages need JavaScript and the files in data/.`));
}

export function qs() { return new URLSearchParams(location.search); }
export function setQuery(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  history.replaceState(null, "", u.toString() ? `?${u}` : location.pathname.split("/").pop() || "index.html");
}

// Pick the strong and weak lists by a stated rule (no hand-picking).
export function margin(r) { return r.accuracy - r.baseline; }
export function strongList(rows, n = 6) { return rows.filter((r) => r.verdict === "A").sort((a, b) => margin(b) - margin(a)).slice(0, n); }
export function weakList(rows, n = 6) { return rows.filter((r) => r.verdict === "C").sort((a, b) => margin(a) - margin(b)).slice(0, n); }

initTheme();
