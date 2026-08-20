"""Generate all four workload traces into traces/*.csv and print a validated
summary of each. Run as: python workloads/generate_all.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workloads.trace_format import save_trace, validate_trace
from workloads.resnet18 import generate_resnet18_trace
from workloads.bert import generate_bert_trace
from workloads.gemm import generate_gemm_trace
from workloads.sparse_gemm import generate_sparse_gemm_trace

TRACES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "traces")


def main(dim=4):
    os.makedirs(TRACES_DIR, exist_ok=True)
    generators = {
        "resnet18": generate_resnet18_trace,
        "bert": generate_bert_trace,
        "gemm": generate_gemm_trace,
        "sparse_gemm": generate_sparse_gemm_trace,
    }
    for name, gen in generators.items():
        events = gen(dim=dim)
        summary = validate_trace(events, dim=dim)
        path = os.path.join(TRACES_DIR, f"{name}.csv")
        save_trace(events, path)
        print(f"{name:12s} -> {path}  {summary}")


if __name__ == "__main__":
    main()
