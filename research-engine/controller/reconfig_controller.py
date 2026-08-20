"""Runtime routing-policy controller.

Every `feature_window` cycles (see driver.run_trace) the controller is
handed the trailing window of packets actually injected into the network.
It asks the classifier what workload that traffic looks like, maps that
label to a target routing policy (POLICY_FOR_WORKLOAD, set from the
measured static-baseline results in results/exp_static_baselines.csv), and
switches the mesh's routing policy -- but only past three safeguards, so
one noisy window can't thrash the network:

  - confidence_floor: a RandomForest prediction below this confidence is
    ignored outright (the nearest-centroid fallback has no calibrated
    confidence and is always trusted, since it's already the last resort).
  - consecutive_required (hysteresis): the SAME candidate policy must be
    the target for this many consecutive windows before it is applied.
  - dwell_cycles: minimum cycles since the last actual reconfiguration
    before another one is allowed, regardless of what is predicted.

POLICY_FOR_WORKLOAD deliberately never maps to DYAD for bert-like traffic:
tests/test_routing_liveness.py::TestKnownLimitationDyadCanStall demonstrates
DyAD can stall under heavy global (all-to-all) contention in this
single-buffer-per-port simulator, and BERT's attention traffic is exactly
that pattern.
"""

from classifier.features import extract_features

POLICY_FOR_WORKLOAD = {
    "resnet18": "XY",
    "bert": "WEST_FIRST",
    "gemm": "XY",
    "sparse_gemm": "DYAD",
}


class ReconfigController:
    def __init__(
        self,
        classifier,
        dim=4,
        confidence_floor=0.5,
        dwell_cycles=300,
        consecutive_required=2,
        policy_for_workload=None,
    ):
        self.classifier = classifier
        self.dim = dim
        self.confidence_floor = confidence_floor
        self.dwell_cycles = dwell_cycles
        self.consecutive_required = consecutive_required
        self.policy_for_workload = policy_for_workload or POLICY_FOR_WORKLOAD

        self.last_reconfig_cycle = -10**9
        self._pending_label = None
        self._pending_count = 0
        self.log = []

    def maybe_reconfigure(self, mesh, window_events):
        if not window_events:
            return

        feat = extract_features(window_events, dim=self.dim)
        if feat is None:
            return

        label, confidence = self.classifier.predict(feat)
        target_policy = self.policy_for_workload.get(label, mesh.routing)

        record = {
            "cycle": mesh.cycle,
            "predicted_label": label,
            "confidence": confidence,
            "target_policy": target_policy,
            "current_policy": mesh.routing,
            "applied": False,
            "reason": "",
        }

        if confidence is not None and confidence < self.confidence_floor:
            record["reason"] = "below_confidence_floor"
            self._pending_label, self._pending_count = None, 0
            self.log.append(record)
            return

        if target_policy == mesh.routing:
            record["reason"] = "already_active"
            self._pending_label, self._pending_count = None, 0
            self.log.append(record)
            return

        if label == self._pending_label:
            self._pending_count += 1
        else:
            self._pending_label, self._pending_count = label, 1

        if self._pending_count < self.consecutive_required:
            record["reason"] = f"hysteresis_wait({self._pending_count}/{self.consecutive_required})"
            self.log.append(record)
            return

        if mesh.cycle - self.last_reconfig_cycle < self.dwell_cycles:
            record["reason"] = "dwell_time_block"
            self.log.append(record)
            return

        mesh.set_routing(target_policy)
        self.last_reconfig_cycle = mesh.cycle
        self._pending_count = 0
        record["applied"] = True
        record["reason"] = "applied"
        self.log.append(record)
