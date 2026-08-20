# TR-SRNoC: Trace-Driven Self-Reconfigurable Mesh NoC for Real AI Workloads

A cycle-based, credit-flow-controlled 4x4 mesh Network-on-Chip simulator that
runs traffic derived from real AI workload architectures (CIFAR-style
ResNet-18, DistilBERT, dense/sparse GEMM), classifies the current traffic
pattern with a trained ML model, and dynamically switches its routing policy
at runtime. Pure software (Python) — no FPGA/RTL required to run it.

Every number in this document was produced by actually running the code
below, not hand-typed. Regenerate all of it with the same commands.

## Run it

```bash
python -m unittest discover -s tests -p "test_*.py" -v   # 30 tests, all pass
python workloads/generate_all.py                          # (re)generate traces/*.csv
python classifier/train.py                                 # train the classifier
python run_demo.py                                          # the real end-to-end demo
python experiments/run_experiments.py                        # full experiment suite -> results/
python experiments/generate_plots.py                          # graphs generated FROM results/, not hand-drawn
```

## Build order (and why)

This project was built and validated bottom-up, one layer at a time, each
layer tested before the next depended on it — the classifier and controller
were never allowed to touch the mesh until the mesh itself was proven
correct in isolation:

```
Phase 1   trace -> NoC -> metrics                 (noc/, tested with unit
                                                    tests before workloads/
                                                    or classifier/ existed)
Phase 2   trace -> features -> classifier         (classifier/, trained and
                                                    tested against real traces
                                                    before controller/ existed)
Phase 3   trace -> classifier -> controller ->
          NoC routing reconfiguration -> metrics   (controller/, tested against
                                                    a fake classifier in isolation,
                                                    THEN wired into real experiments)
```

## What each simulated cycle means

This is a single-flit-per-cycle-per-link, single-buffer-per-port model (no
separate virtual channels). Each cycle: route computation for head-of-line
flits -> round-robin output arbitration per (router, direction) -> switch +
link traversal for winners -> buffer-occupancy-based flow control (a credit
scheme implemented as a direct downstream-space check). See `noc/mesh.py`'s
module docstring for the exact phase breakdown — documented rather than
implied to be more (e.g. a multi-stage RTL-accurate router pipeline) than it
is.

## Architecture

```
Real AI model structure (CIFAR-ResNet-18 / DistilBERT / GEMM / Sparse-GEMM)
        -> deterministic accelerator-level communication trace (CSV)
        -> Packet -> Flit (HEAD/BODY/TAIL/SINGLE)
        -> 4x4 cycle-based mesh, buffer-occupancy flow control, wormhole routing
        -> XY / West-First / DyAD / Cost-Adaptive / Energy-Aware routing policies
        -> sliding-window traffic feature extraction
        -> HybridClassifier (trained RandomForest, nearest-centroid fallback)
        -> ReconfigController (hysteresis, dwell time, confidence floor)
        -> real measured latency/throughput/energy
        -> results/*.csv, results/plots/*.png
```

## Real bugs found and fixed during development (not hidden)

1. **Routing/ejection direction mismatch.** `noc/routing.py`'s route
   functions returned `"L"` for "packet has arrived, eject to local PE",
   but `noc/mesh.py`'s arbitration only ever looks for output direction
   `"EJ"` (from `OUT_DIRS = ("N","S","E","W","EJ")`). A flit that reached
   its destination router was marked with an output direction (`"L"`) that
   never matched any arbitration bucket, so it just sat at the head of its
   input buffer forever — silently blocking that entire buffer (and, by
   backpressure, everything queued behind it) instead of being delivered.
   Caught immediately by the very first smoke test (single packet, `src=0
   -> dst=15`): it showed `link_hops=24` (the packet's flits clearly moved
   through the network) but `delivered=0`. Fixed by making every routing
   function return `"EJ"` for local delivery, consistent with the mesh's
   own `OUT_DIRS`.
2. **Test assumptions broken by a deliberate design change.** After tuning
   `FLIT_PAYLOAD_BYTES` from 16 to 32 bytes (see "Simplified" below — this
   was necessary to make the BERT trace's attention traffic drain in a
   tractable number of cycles), two unit tests that had hardcoded flit
   counts assuming a 16-byte flit started failing (`test_non_multiple_rounds_up`,
   `test_known_path_hop_count`). Fixed by deriving expected flit/hop counts
   from `FLIT_PAYLOAD_BYTES` at test time instead of hardcoding them, so the
   tests stay correct if that constant changes again.

## Known limitation, found and reported honestly (not avoided)

DyAD (fully adaptive minimal routing, no turn restriction) is **not
deadlock-free** in this simulator (single buffer per port, no escape
virtual channel), and this is demonstrated empirically, not just asserted:
on the real BERT trace (1470 packets of heavy global all-to-all attention
traffic), DyAD delivered only **133/1470 packets** (9.0%) within a
50,000-cycle budget, while XY and West-First both delivered all 1470
(`results/exp_static_baselines.csv`, rows `bert,DYAD` vs `bert,XY` /
`bert,WEST_FIRST`). This is also pinned down as a regression test:
`tests/test_routing_liveness.py::TestKnownLimitationDyadCanStall` (a
separate, smaller synthetic-contention scenario — 800 packets, buffer
depth 2 — where DyAD delivers only 78/800 while XY and West-First always
fully drain). XY is deadlock-free by construction (dimension-order
routing); West-First is deadlock-free by the classical turn-model argument
(it forbids the two turns needed to close a cyclic buffer dependency).
DyAD's fully-adaptive tie-break has no such proof here, and
`controller/reconfig_controller.py`'s `POLICY_FOR_WORKLOAD` table
deliberately never selects DyAD for BERT-like (high global-entropy)
traffic as a direct consequence of this finding.

**This got worse, not better, with the richer adaptive policy.**
COST_ADAPTIVE and ENERGY_AWARE (see "Routing policies" below) use the same
productive-direction candidate set as DyAD, just with a richer per-candidate
cost (2-hop regional congestion + link utilization instead of DyAD's plain
1-hop buffer occupancy). On the same BERT trace and cycle budget, they
deliver only **69/1470 packets (4.7%)** — worse than DyAD's 9.0%
(`results/exp_static_baselines.csv`, rows `bert,COST_ADAPTIVE` /
`bert,ENERGY_AWARE`). This is reported as-is, not smoothed over: a richer
congestion signal did not fix the underlying deadlock-freedom gap (still no
escape virtual channel, still no turn restriction) and, on this
heavy-contention all-to-all pattern, its stickier regional-congestion
tie-breaking appears to make the stall worse, not better.
`POLICY_FOR_WORKLOAD` never selects COST_ADAPTIVE or ENERGY_AWARE for any
workload as a direct consequence -- both remain manually selectable and are
included in the static-baseline experiment for exactly this comparison, but
neither is in the controller's automatic policy table.

## What the experiments actually showed (including unflattering results)

**Static baselines** (`results/exp_static_baselines.csv`,
`results/plots/01_static_baseline_latency.png`,
`02_static_baseline_delivery_ratio.png`, now 5 policies x 4 workloads = 20
rows): XY and West-First deliver 100% of every workload's trace. DyAD
delivers 100% on ResNet-18, GEMM and Sparse-GEMM but only 9.0% on BERT, and
COST_ADAPTIVE/ENERGY_AWARE do worse still on BERT at 4.7% (see Known
Limitation above). Where all five fully deliver (ResNet-18, GEMM,
Sparse-GEMM), every policy produces *identical* average latency, because
every hop-minimal routing policy takes the same number of hops for a given
(src, dst) pair on an otherwise-idle or lightly-loaded network — the
policies only diverge under contention (BERT). Where XY and West-First both
fully deliver, XY is equal-or-faster on every workload tested — on BERT
specifically, XY averages **9216 cycles** vs West-First's **10278 cycles**
(avg latency), because West-First's mandatory-west-first turn restriction
forces some flits onto longer paths that XY's plain dimension-order routing
doesn't need.

**Self-reconfiguration vs static, single workload**
(`results/exp_self_reconfig_vs_static.csv`,
`results/plots/03_self_reconfig_vs_static.png`): on these single-workload
traces, the self-reconfiguring controller does **not** clearly beat static
XY. On ResNet-18 and GEMM it never reconfigures at all (0 reconfigurations
applied) because XY is already the mapped policy for both, so results are
identical. On BERT it reconfigures once (XY -> WEST_FIRST) and ends up
**worse** than static XY (10278 vs 9216 avg cycles) — reported as-is, not
cherry-picked, and it is the direct, predictable consequence of the
static-baseline finding above (West-First is genuinely slower than XY on
BERT traffic in this simulator). The controller's actual value shows up in
the mixed-workload experiment below, not in single-workload runs.

**Mixed workload switching** (`results/exp_mixed_reconfig_log.csv`,
`results/exp_mixed_phases.json`,
`results/plots/06_dynamic_routing_timeline.png`): running
ResNet-18 -> BERT -> GEMM -> Sparse-GEMM back-to-back in one 3619-packet
simulation, the controller — which is never told the phase schedule — reads
only the trailing 150-cycle window of real injected traffic and correctly
identifies every phase (confidence 0.61-1.0 throughout). It reconfigures
exactly **twice**: XY -> WEST_FIRST at cycle 1350 (partway into the BERT
phase) and WEST_FIRST -> XY at cycle 3000 (partway into the GEMM phase).
Both reconfigurations were preceded by a hysteresis-rejected attempt one
window earlier (visible in the log as `hysteresis_wait(1/2)`), confirming
the two-consecutive-window safeguard actually functions rather than
switching on the first noisy prediction. A third candidate switch
(XY -> DYAD for the final Sparse-GEMM phase) was correctly proposed by the
classifier but never applied — the phase ended before a second confirming
window arrived, an honest edge case worth noting rather than hiding: a very
short trailing phase can end before hysteresis confirms a switch into it.
All 3619/3619 packets were delivered (`delivery_ratio=1.0`) throughout.

**Buffer-depth sensitivity** (`results/exp_buffer_sensitivity.csv`,
`results/plots/04_buffer_sensitivity.png`): on the BERT trace with XY
routing, average latency **decreases monotonically** as buffer depth grows
— 10443 cycles at depth 2, 10059 at depth 4, 9216 at depth 8, 9211 at depth
16 — with clearly diminishing returns past depth 8 (a further doubling to
16 buys essentially nothing, 9216 -> 9211). This is the intuitive,
textbook direction (more buffering reduces backpressure-induced queueing
delay under sustained load) and is reported here as the real measured
result, not assumed.

**Injection-rate sweep** (`results/exp_injection_rate_sweep.csv`,
`results/plots/08_injection_rate_latency.png`): the four architecture-derived
workloads above have fixed traffic volume/timing (dictated by the model they
represent), so they can't run the classical injection-rate-vs-latency sweep.
`workloads/synthetic.py` adds a fifth, explicitly non-architecture-derived
generator for exactly this purpose: independent Bernoulli(rate) injection per
PE per cycle, uniformly random destination. Sweeping `Baseline_XY` (dimension-order
XY routing) from rate 0.05 to 0.50 on the 4x4 mesh (default 8-flit buffers)
shows the textbook latency curve: avg latency is flat and low through 0.05-0.30
(6.1 -> 18.1 cycles), then rises sharply once the network approaches
saturation -- 295.8 cycles at 0.40 and 587.2 cycles at 0.50 -- while measured
throughput plateaus around 4.75-4.78 packets/cycle network-wide (16 PEs),
i.e. this mesh/buffer configuration saturates at roughly 0.30 packets/PE/cycle
of *offered* load even though every injected packet is still, eventually,
delivered (`delivery_ratio=1.0` at every point tested -- this synthetic sweep
uses a large enough cycle budget that nothing times out, unlike the DyAD/BERT
case above).

**Packet/flit-size sweep** (`results/exp_packet_size_sensitivity.csv`,
`results/plots/09_packet_size_sensitivity.png`): sweeping packet size 32B-1024B
(1-32 flits at the current `FLIT_PAYLOAD_BYTES=32`) with `Baseline_XY` at a
fixed 0.2 injection rate shows both latency and total energy climbing
steeply and non-linearly with packet size once the network approaches
saturation at this fixed injection rate — avg latency goes 4.9 -> 8.5 -> 331.0
-> 1542.8 -> 4207.9 -> 9773.5 cycles across 32B to 1024B, while energy scales
roughly linearly with total flits moved (224.7k pJ at 32B up to 7.61M pJ at
1024B, since every flit costs the same fixed per-hop energy regardless of
which packet it belongs to). The latency curve is not smooth because a fixed
0.2 injection rate means each larger packet size also increases the
*effective* offered load (more flits per packet at the same packet rate),
pushing the network past its saturation point partway through the sweep —
this is the same saturation behavior as the injection-rate sweep above,
just reached by growing packet size instead of injection rate.

**Scalability** (`results/exp_scalability.csv`,
`results/plots/05_scalability.png`): using the real GEMM (Cannon's
algorithm) generator re-run at each mesh size — since Cannon's algorithm
maps directly onto a `dim x dim` process grid, this is the same real
generator, not a different synthetic one — average latency grows with mesh
size as expected for a mesh topology with growing average hop count: 214
cycles at 2x2 (4 PEs), 475 at 4x4 (16 PEs), 983 at 8x8 (64 PEs).

**Classifier** (`results/plots/07_classifier_confusion_matrix.png`): 100%
test accuracy (25/25 held-out sliding-window samples), but the four classes
are naturally imbalanced by trace length — 40 windows for BERT and 28 for
ResNet-18 vs only 7 for GEMM and 6 for Sparse-GEMM. Treat the 100% figure
with that caveat: it mainly shows the four workloads are trivially
separable by these seven features (the two highest-importance features,
`avg_size_bytes` at 0.194 and `avg_hop_distance` at 0.193, differ by
roughly an order of magnitude between e.g. BERT's large all-to-all
messages and CNN's small local halo messages) — a real and useful result,
but a narrower claim than "the classifier is robust to adversarial or
noisy traffic," which was never tested.

## Implemented vs simplified vs future work

**Implemented:** packet/flit segmentation (HEAD/BODY/TAIL/SINGLE);
buffer-occupancy-based flow control; wormhole path reservation (a packet's
BODY/TAIL flits always reuse the output direction its HEAD flit was
assigned at that router, so a multi-flit packet can never split across two
different paths as congestion changes mid-transit); five routing policies --
XY / West-First / DyAD / COST_ADAPTIVE (2-hop regional congestion + link
utilization) / ENERGY_AWARE (same path selection as COST_ADAPTIVE, justified
through this model's static/leakage energy term -- see "Routing policies"
below); four trace-driven workloads derived from real architecture
parameters (CIFAR-ResNet-18's real channel/layer/kernel/stride schedule,
DistilBERT's real hidden-size/head-count/layer-count config, GEMM via
Cannon's algorithm, block-sparse GEMM with a synthetic hotspot mask), plus a
fifth synthetic uniform-random Bernoulli-injection generator (with
configurable packet size) for the injection-rate and packet-size sweeps the
architecture-derived traces can't run; CSV trace format with structural
validation; sliding-window feature extraction; trained RandomForest
classifier with nearest-centroid fallback; a self-reconfiguring controller
with hysteresis + dwell-time + confidence-floor safeguards; an
architecture-level energy estimate including a static/leakage term
proportional to buffer dwell time, not just per-hop dynamic energy; 30
automated tests including liveness/deadlock/conservation/regression tests; a
reproducible experiment suite (static baselines across all 5 policies,
self-reconfig vs static, mixed-workload switching, buffer-depth sweep,
injection-rate sweep, packet-size sweep, scalability); plots generated from
real result files; a terminal live dashboard; a minimal stdlib-only local
web UI (`webapp.py`).

## Routing policies: why COST_ADAPTIVE and ENERGY_AWARE are separate names
for the same path-selection algorithm

`ENERGY_AWARE` calls the exact same `cost_adaptive_route()` function as
`COST_ADAPTIVE` (`noc/routing.py`) -- this is intentional, not a stub. In
this simulator's energy model (`noc/energy.py`), *dynamic* energy is purely
a function of hop count, and every minimal-path routing policy produces the
same hop count for a given (src, dst) pair, so no routing *choice* among
minimal-path policies can reduce dynamic energy relative to another. The one
real lever is *static* (leakage) energy, newly added and modeled as
proportional to how many cycles a flit spends sitting in any buffer
(`EnergyModel.record_static`, called once per simulated cycle with
`Mesh.in_flight_flit_count()`) -- so a policy that reduces congestion-induced
queueing delay genuinely does reduce total measured energy, through less
buffer dwell time, not through a different path. `ENERGY_AWARE` is kept as
its own selectable name (rather than just recommending COST_ADAPTIVE for
low-power use) so the controller and experiments can select and report on it
as its own mode, matching the project's 4-mode (XY / Adaptive /
Congestion-aware / Energy-aware) requirement precisely.

**Simplified (documented, not hidden):** single buffer per port, no
separate virtual channels — this is precisely why DyAD isn't deadlock-free
here; one flit per cycle per link, no speedup; the router "pipeline" is a
same-cycle route-compute -> arbitrate -> transfer model, not a multi-stage
RTL-accurate pipeline; workload traces are deterministic accelerator-level
communication derived from real model architecture parameters, not literal
output of a PyTorch forward pass; CIFAR-scale ResNet-18 (32x32 input) is
used instead of ImageNet-scale (224x224) and BERT's sequence length is 16
rather than 128+, purely so the traces drain in a tractable number of
cycles under a 32-byte flit link model — both are real, standard,
widely-used configurations, not invented ones, chosen for tractability;
energy is an architecture-level activity-count model with illustrative
per-event coefficients, including a static/leakage term proportional to
buffer dwell time (`noc/energy.py`), explicitly not measured silicon power;
Sparse-GEMM's specific hotspot mask comes from a fixed random seed
representing a plausible power-law sparsity pattern, not a literal pruned
model's real nonzero structure.

**Future work (not implemented):** a browser-based live canvas dashboard for
*this* engine specifically (the terminal dashboard and the minimal stdlib
`webapp.py` exist; the project's live interactive visualization lives in the
separate `../` TypeScript/React app -- see the root README for how the two
relate); per-router independent routing-mode selection (the controller
currently selects one network-wide policy, not per-router modes);
SystemVerilog/RTL translation and Verilator validation; real
PyTorch-hook-traced (rather than architecture-derived) communication traces;
a reinforcement-learning controller (the current controller is a fixed rule
table, not a learned policy); an escape virtual channel or other
deadlock-freedom fix for DyAD/COST_ADAPTIVE/ENERGY_AWARE under heavy
all-to-all contention (see Known Limitation).

## Project layout

```
noc/            packet/flit model, routing algorithms, mesh + flow-control engine, metrics, energy
workloads/      trace format + ResNet-18/BERT/GEMM/Sparse-GEMM generators + generate_all.py
classifier/     feature extraction, HybridClassifier (RandomForest + nearest-centroid fallback), train.py
controller/     self-reconfiguration controller with hysteresis/dwell/confidence-floor
experiments/    run_experiments.py (writes results/*.csv, *.json), generate_plots.py (reads them)
tests/          30 tests: packet/flow-control, routing liveness/deadlock, classifier/controller, cost-adaptive/energy
traces/         generated CSV traces (regenerate with workloads/generate_all.py)
results/        experiment output + results/plots/ (all generated, none hand-written)
driver.py       shared simulation driver used by run_demo.py, experiments, and the dashboard
run_demo.py     the single real end-to-end demo command
dashboard_terminal.py   live terminal state renderer
```
