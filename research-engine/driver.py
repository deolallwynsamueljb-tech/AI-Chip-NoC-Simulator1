"""Shared simulation driver used by run_demo.py, experiments/run_experiments.py
and dashboard_terminal.py, so there is exactly one place that knows how to
turn a trace (list of workloads.trace_format.TraceEvent) into a running Mesh.
"""

import time

from noc.mesh import Mesh
from noc.packet import Packet


class SimResult:
    def __init__(self, mesh, packets_expected, wall_seconds, timed_out, reconfig_log):
        self.mesh = mesh
        self.summary = mesh.metrics.summary(packets_expected)
        self.energy = mesh.energy.breakdown()
        self.wall_seconds = wall_seconds
        self.timed_out = timed_out
        self.reconfig_log = reconfig_log


def run_trace(
    events,
    dim=4,
    routing="XY",
    buffer_depth=8,
    max_cycles=200_000,
    controller=None,
    feature_window=200,
    on_cycle=None,
):
    """Run one trace to completion (or until max_cycles is exhausted).

    If `controller` is given (a controller.reconfig_controller.ReconfigController),
    every `feature_window` cycles the trailing window of packets actually
    injected in that window is handed to controller.maybe_reconfigure(mesh, window),
    which may call mesh.set_routing(...).

    `on_cycle(mesh)`, if given, is called after every step -- used by
    dashboard_terminal.py to render live state without this driver knowing
    anything about rendering.
    """
    m = Mesh(dim=dim, routing=routing, buffer_depth=buffer_depth)
    events_sorted = sorted(events, key=lambda e: e.inject_cycle)
    n = len(events_sorted)
    idx = 0
    t0 = time.time()
    timed_out = True
    window_buf = []

    for _ in range(max_cycles):
        while idx < n and events_sorted[idx].inject_cycle == m.cycle:
            e = events_sorted[idx]
            m.inject_packet(Packet(e.packet_id, e.src, e.dst, e.size_bytes, e.inject_cycle, e.op, e.layer))
            if controller is not None:
                window_buf.append(e)
            idx += 1

        m.step()

        if controller is not None and feature_window and m.cycle % feature_window == 0:
            cutoff = m.cycle - feature_window
            window_buf = [e for e in window_buf if e.inject_cycle > cutoff]
            controller.maybe_reconfigure(m, window_buf)

        if on_cycle is not None:
            on_cycle(m)

        if idx >= n and m.idle():
            timed_out = False
            break

    wall = time.time() - t0
    reconfig_log = controller.log if controller is not None else []
    return SimResult(m, n, wall, timed_out, reconfig_log)
