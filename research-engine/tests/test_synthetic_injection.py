import unittest

from workloads.synthetic import generate_synthetic_trace
from workloads.trace_format import validate_trace


class TestSyntheticInjectionTrace(unittest.TestCase):
    def test_higher_injection_rate_yields_more_events(self):
        dim = 4
        low = generate_synthetic_trace(dim=dim, injection_rate=0.05, duration_cycles=500, seed=0)
        high = generate_synthetic_trace(dim=dim, injection_rate=0.40, duration_cycles=500, seed=0)
        self.assertGreater(len(high), len(low))

    def test_expected_event_count_matches_bernoulli_rate(self):
        # num_pes * duration_cycles independent Bernoulli(rate) trials -> mean count = rate * num_pes * duration.
        dim = 4
        rate = 0.2
        duration = 3000
        events = generate_synthetic_trace(dim=dim, injection_rate=rate, duration_cycles=duration, seed=1)
        expected = rate * dim * dim * duration
        self.assertAlmostEqual(len(events), expected, delta=expected * 0.1)

    def test_never_sends_to_self(self):
        events = generate_synthetic_trace(dim=4, injection_rate=0.5, duration_cycles=200, seed=2)
        for e in events:
            self.assertNotEqual(e.src, e.dst)

    def test_produces_a_structurally_valid_trace(self):
        events = generate_synthetic_trace(dim=4, injection_rate=0.1, duration_cycles=500, seed=3)
        summary = validate_trace(events, dim=4)
        self.assertGreater(summary["num_events"], 0)


if __name__ == "__main__":
    unittest.main()
