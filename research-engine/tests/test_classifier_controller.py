import os
import unittest

from classifier.classifier import HybridClassifier
from classifier.features import extract_features
from controller.reconfig_controller import ReconfigController
from noc.mesh import Mesh
from workloads.bert import generate_bert_trace
from workloads.gemm import generate_gemm_trace

MODEL_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "classifier", "model", "workload_classifier.joblib")


@unittest.skipUnless(os.path.exists(MODEL_PATH), "run classifier/train.py first")
class TestHybridClassifier(unittest.TestCase):
    def test_predicts_bert_window_as_bert(self):
        clf = HybridClassifier()
        events = generate_bert_trace(dim=4)
        window = [e for e in events if 0 <= e.inject_cycle < 100]
        feat = extract_features(window, dim=4)
        label, confidence = clf.predict(feat)
        self.assertEqual(label, "bert")

    def test_predicts_gemm_window_as_gemm(self):
        clf = HybridClassifier()
        events = generate_gemm_trace(dim=4)
        window = [e for e in events if 0 <= e.inject_cycle < 100]
        feat = extract_features(window, dim=4)
        label, confidence = clf.predict(feat)
        self.assertEqual(label, "gemm")


class FakeClassifier:
    """Returns a fixed (label, confidence) sequence regardless of input, so
    the controller's hysteresis/dwell logic can be tested in isolation from
    the real trained model."""

    def __init__(self, sequence):
        self.sequence = list(sequence)
        self.i = 0

    def predict(self, feat):
        val = self.sequence[min(self.i, len(self.sequence) - 1)]
        self.i += 1
        return val


class TestReconfigController(unittest.TestCase):
    def _fake_window(self, n=5):
        from workloads.trace_format import TraceEvent

        return [TraceEvent(i, i, 0, 1, 64, "OP", "L") for i in range(n)]

    def test_hysteresis_blocks_single_noisy_prediction(self):
        clf = FakeClassifier([("bert", 0.9)])  # single window: needs consecutive_required=2
        ctrl = ReconfigController(clf, dim=4, confidence_floor=0.5, dwell_cycles=0, consecutive_required=2)
        mesh = Mesh(dim=4, routing="XY", buffer_depth=4)
        ctrl.maybe_reconfigure(mesh, self._fake_window())
        self.assertEqual(mesh.routing, "XY")
        self.assertFalse(ctrl.log[-1]["applied"])

    def test_reconfigures_after_consecutive_agreement(self):
        clf = FakeClassifier([("bert", 0.9), ("bert", 0.9)])
        ctrl = ReconfigController(clf, dim=4, confidence_floor=0.5, dwell_cycles=0, consecutive_required=2)
        mesh = Mesh(dim=4, routing="XY", buffer_depth=4)
        ctrl.maybe_reconfigure(mesh, self._fake_window())
        ctrl.maybe_reconfigure(mesh, self._fake_window())
        self.assertEqual(mesh.routing, "WEST_FIRST")
        self.assertTrue(ctrl.log[-1]["applied"])

    def test_confidence_floor_blocks_low_confidence_prediction(self):
        clf = FakeClassifier([("bert", 0.1), ("bert", 0.1)])
        ctrl = ReconfigController(clf, dim=4, confidence_floor=0.5, dwell_cycles=0, consecutive_required=1)
        mesh = Mesh(dim=4, routing="XY", buffer_depth=4)
        ctrl.maybe_reconfigure(mesh, self._fake_window())
        self.assertEqual(mesh.routing, "XY")
        self.assertEqual(ctrl.log[-1]["reason"], "below_confidence_floor")

    def test_dwell_time_blocks_rapid_reconfiguration(self):
        clf = FakeClassifier([("bert", 0.9), ("sparse_gemm", 0.9)])
        ctrl = ReconfigController(clf, dim=4, confidence_floor=0.5, dwell_cycles=1000, consecutive_required=1)
        mesh = Mesh(dim=4, routing="XY", buffer_depth=4)
        ctrl.maybe_reconfigure(mesh, self._fake_window())  # applies bert -> WEST_FIRST
        self.assertEqual(mesh.routing, "WEST_FIRST")
        ctrl.maybe_reconfigure(mesh, self._fake_window())  # sparse_gemm -> DYAD, but dwell blocks it
        self.assertEqual(mesh.routing, "WEST_FIRST")
        self.assertEqual(ctrl.log[-1]["reason"], "dwell_time_block")


if __name__ == "__main__":
    unittest.main()
