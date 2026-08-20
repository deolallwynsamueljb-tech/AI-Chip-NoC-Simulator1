"""Traffic feature extraction from a window of TraceEvent rows.

These are the features both the offline training script (classifier/train.py)
and the runtime controller (controller/reconfig_controller.py) use -- they
must stay in exact agreement, which is why FEATURE_NAMES / features_to_vector
live in one shared place rather than being duplicated.
"""

import math
from collections import Counter

FEATURE_NAMES = [
    "avg_hop_distance",
    "locality_ratio",
    "dest_entropy",
    "injection_rate",
    "avg_size_bytes",
    "unique_pairs_ratio",
    "burstiness",
]


def hop_distance(src, dst, dim):
    sx, sy = src % dim, src // dim
    dx, dy = dst % dim, dst // dim
    return abs(sx - dx) + abs(sy - dy)


def extract_features(events, dim=4):
    """events: list of TraceEvent. Returns a dict keyed by FEATURE_NAMES, or
    None if the window is too sparse to produce a meaningful sample."""
    n = len(events)
    if n < 2:
        return None

    dists = [hop_distance(e.src, e.dst, dim) for e in events]
    avg_hop_distance = sum(dists) / n
    locality_ratio = sum(1 for d in dists if d <= 1) / n

    dst_counts = Counter(e.dst for e in events)
    entropy = -sum((c / n) * math.log2(c / n) for c in dst_counts.values())
    max_entropy = math.log2(dim * dim) if dim * dim > 1 else 1.0
    dest_entropy = entropy / max_entropy if max_entropy > 0 else 0.0

    cycles = sorted(e.inject_cycle for e in events)
    span = max(1, cycles[-1] - cycles[0])
    injection_rate = n / span

    avg_size_bytes = sum(e.size_bytes for e in events) / n

    max_possible_pairs = dim * dim * (dim * dim - 1)
    unique_pairs = len({(e.src, e.dst) for e in events})
    unique_pairs_ratio = unique_pairs / min(n, max_possible_pairs)

    gaps = [b - a for a, b in zip(cycles, cycles[1:])]
    if gaps:
        mean_gap = sum(gaps) / len(gaps)
        var = sum((g - mean_gap) ** 2 for g in gaps) / len(gaps)
        burstiness = (var**0.5) / mean_gap if mean_gap > 0 else 0.0
    else:
        burstiness = 0.0

    return {
        "avg_hop_distance": avg_hop_distance,
        "locality_ratio": locality_ratio,
        "dest_entropy": dest_entropy,
        "injection_rate": injection_rate,
        "avg_size_bytes": avg_size_bytes,
        "unique_pairs_ratio": unique_pairs_ratio,
        "burstiness": burstiness,
    }


def features_to_vector(feat_dict):
    return [feat_dict[k] for k in FEATURE_NAMES]
