# Jev Field Test

An independent field test of TypeSafe AI's **Jev** decision model (`jev-1.13.0`): 63 public datasets in 27 domains,
33,817 requests, and stress tests for the number of options, numbers, injected text, padding, wording and batching.
It shows where Jev works as-is, where it needs a confidence cut-off or review, and where it is not usable zero-shot,
and it maps TypeSafe's nine documented weak spots to what was measured.

**Live site: https://kevalshah120.github.io/jev-field-test/**

Independent and unofficial. Not affiliated with TypeSafe AI. Public datasets may have been seen in training, samples
are small (300 items per dataset), and the run used one model version in September 2026. Read every result as a
field test, not a certificate.

## What is here
| Path | What |
|---|---|
| `site/` | The static website (plain HTML, CSS and ES modules, no build step, no third-party requests) |
| `site/data/*.json` | Every number the site shows, generated from stored answers (the downloads on the Method page) |
| `provenance/` | The exporter and wording tables that generated the data, for reading (they need the private harness to run) |
| `docs/` | The findings page and the design brief the site was built from |
| `.github/workflows/pages.yml` | Deploys `site/` to GitHub Pages on every push to `main` |

## Run locally
```bash
python3 -m http.server 8000 --directory site
# open http://localhost:8000
```
Every path is relative, so the site also works under a sub-path such as `/jev-field-test/`.

## Data and licences
Code and site: MIT (see `LICENSE`). Only aggregate results are published, never dataset text. The datasets keep their
own licences (listed on the site's Method page); the question wording shown on dataset pages is our own. See
`DATA-NOTICE.md`.

Corrections and questions are welcome as issues.
