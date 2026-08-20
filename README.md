# AI Workload-Aware Self-Reconfigurable Mesh NoC

A workload-aware, self-reconfigurable Network-on-Chip (NoC) research project,
built as **two independently-built, purpose-built engines** in one repo
rather than one forced-together codebase:

- **`research-engine/`** (Python) &mdash; the rigorous, tested research core.
  A cycle-based, credit-flow-controlled 4x4 mesh simulator driven by traffic
  derived from *real* AI-model architectures (CIFAR-style ResNet-18,
  DistilBERT, dense/sparse GEMM via Cannon's algorithm), a trained
  RandomForest workload classifier, and a self-reconfiguring controller with
  hysteresis/dwell-time/confidence-floor anti-thrash safeguards. 23 unit
  tests. Its own README documents real bugs found and fixed, and an honest
  known limitation (DyAD routing isn't deadlock-free in this simulator).
  Produces `results/*.csv` and `results/plots/*.png`, all generated from
  code that actually ran &mdash; see `research-engine/README.md`.
- **the repo root** (TypeScript/React/Node) &mdash; the live, interactive
  demo. A real Express + WebSocket backend runs a cycle-accurate NoC engine
  (`server/src/engine/`) and streams live per-cycle state to a React
  frontend; nothing in the live view is mocked or precomputed. Supports five
  synthetic traffic patterns (CNN-local, transformer-global, MoE-bursty,
  hotspot, bit-complement) **and** replays the same real AI-workload traces
  the Python engine validated against (`RESNET18_TRACE` / `BERT_TRACE` /
  `GEMM_TRACE` / `SPARSE_GEMM_TRACE` in the Workload selector, sourced
  straight from `research-engine/traces/*.csv`). Its self-reconfiguring
  controller uses the same hysteresis + dwell-time safeguards as the Python
  one, ported over after the Python engine's experiments showed naive
  per-epoch switching thrashes.

## Why two engines, not one

Rewriting the live per-cycle WebSocket engine in Python, or reimplementing
real-trace replay and a trained ML classifier in TypeScript, would be a
large, fragile rewrite for little real benefit. Instead, each engine does
what it's already good at, and they're tied together concretely:

- The live app replays the *exact same recorded traffic* the offline engine
  validated against, not just similarly-named synthetic approximations.
- The live app's self-reconfiguration controller uses the anti-thrash design
  the offline engine's own experiments showed was necessary.
- The Research tab in the live app embeds the offline engine's real result
  plots and its honest, sometimes-unflattering findings (see
  `src/components/ResearchOverview.tsx`), clearly labeled as coming from a
  separate, offline, real-trace validation run &mdash; not implied to be the
  same numbers as whatever the live demo happens to show right now.

## No fabricated data, anywhere

Every number either engine reports is computed from a run that actually
happened. If you find a hardcoded claim that isn't backed by a real
computation, that's a bug &mdash; file it or fix it the same way a prior pass
over this codebase removed a batch of fabricated benchmark data and unverified
claims (e.g. an invented "&lt;1.2% silicon area overhead" figure with no
synthesis behind it).

## Run the live app

**Prerequisites:** Node.js 20+

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `GROQ_API_KEY` (only needed for
   the AI assistant panel &mdash; the simulator itself works without it).
3. `npm run dev` &mdash; starts the Vite dev server (`:3000`) and the backend
   (`:8787`) together, with `/api` and `/ws` proxied from the frontend to the
   backend.

```
npm run build   # vite build -> dist/, esbuild bundle -> server.js
npm start       # node server.js - serves the API, WebSocket, and the built frontend on one port
```

`PORT` controls which port the combined server listens on (defaults to
`8787`). Real AI-workload trace replay reads CSVs from
`research-engine/traces/` at server startup; if that directory is missing or
empty (e.g. a fresh checkout of just the root app), those four workload
options simply have no events to replay rather than failing the server &mdash;
run `python research-engine/workloads/generate_all.py` once to populate it.

## Run the research engine

**Prerequisites:** Python 3.10+, `pip install -r research-engine/requirements.txt`

```bash
cd research-engine
python -m unittest discover -s tests -p "test_*.py" -v   # 23 tests, all pass
python workloads/generate_all.py                          # (re)generate traces/*.csv
python classifier/train.py                                 # train the classifier
python experiments/run_experiments.py                        # full experiment suite -> results/
python experiments/generate_plots.py                          # graphs generated FROM results/, not hand-drawn
```

See `research-engine/README.md` for the full methodology, the real bugs
found and fixed during development, the honest known limitation (DyAD is not
deadlock-free here), and what each experiment actually showed &mdash;
including results that don't flatter the proposed controller.

## Deploying

This repo includes a `render.yaml` blueprint: a single Node web service
running `npm run build` then `npm start`. In the Render dashboard, "New +" →
"Blueprint", point it at this repo, and set the `GROQ_API_KEY` environment
variable (marked `sync: false` in the blueprint so it isn't committed). The
Python research engine is not part of the deployed web service &mdash; it's an
offline validation suite whose output (`results/`, `results/plots/`,
`traces/`) is committed and read by the Node server / bundled into the web
app at build time, not run live in production.

## Project layout

```
research-engine/     the Python offline research engine (see its own README)
server/               Express + WebSocket backend, cycle-accurate NoC engine (server/src/engine)
src/                  React/Vite frontend - renders whatever the backend sends, no local sim state
shared/types/noc.ts   types shared by both sides of the live app
public/research/      real result plots generated by research-engine/experiments/generate_plots.py
```

## Explicitly out of scope (documented, not silently skipped)

SystemVerilog/RTL translation and Verilator validation, an RL-based
controller (the current controller on both sides is a fixed rule table with
anti-thrash safeguards, not a learned policy), FPGA deployment, and
per-router independent routing-mode selection beyond what's already
implemented. See `research-engine/README.md`'s "Future work" section.
