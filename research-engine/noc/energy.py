"""Architecture-level energy estimate.

These per-event coefficients (picojoules) are ILLUSTRATIVE, chosen to be in
the right relative proportion described by published NoC energy breakdowns
(buffer read/write and crossbar traversal dominate over arbitration; link
energy is comparable to a buffer access for the short, one-hop wire lengths
typical of a mesh tile). They are NOT measured silicon power and NOT derived
from a synthesized design -- do not present them as such. Getting real power
numbers would require an RTL implementation run through a synthesis / power
analysis flow (see README.md future work).
"""

BUFFER_WRITE_PJ = 3.5
BUFFER_READ_PJ = 3.5
CROSSBAR_PJ = 2.0
ARBITRATION_PJ = 0.3
LINK_PJ = 4.5

# Static/leakage power, modeled as proportional to how many flit-slots are
# occupied on a given cycle (a flit sitting in a buffer keeps that storage
# powered whether or not it moves that cycle). This is what makes routing
# choice able to affect *total* energy at all in this model: dynamic energy
# (below) is purely a function of hop count, and every minimal-path routing
# policy (XY / WEST_FIRST / DYAD / COST_ADAPTIVE) produces the SAME hop
# count for a given (src, dst) pair, so none of them can reduce dynamic
# energy relative to each other. What a congestion-avoiding policy CAN do is
# reduce how long flits sit queued in buffers (buffer dwell time), which
# reduces static energy -- this is the real, honest, measurable lever
# ENERGY_AWARE routing uses (see routing.py), not a separate path-selection
# heuristic.
STATIC_LEAKAGE_PJ_PER_FLIT_SLOT_PER_CYCLE = 0.08

PER_LINK_HOP_PJ = BUFFER_WRITE_PJ + BUFFER_READ_PJ + CROSSBAR_PJ + ARBITRATION_PJ + LINK_PJ
PER_EJECTION_PJ = BUFFER_WRITE_PJ + BUFFER_READ_PJ + CROSSBAR_PJ + ARBITRATION_PJ


class EnergyModel:
    def __init__(self):
        self.link_hops = 0
        self.ejections = 0
        self.static_pj = 0.0

    def record_link_hop(self):
        self.link_hops += 1

    def record_ejection(self):
        self.ejections += 1

    def record_static(self, buffered_flit_count):
        """Called once per simulated cycle with the network-wide count of
        flits currently sitting in any input buffer (Mesh.in_flight_flit_count()),
        so static energy accrues for every cycle a flit spends queued, not
        just when it moves."""
        self.static_pj += buffered_flit_count * STATIC_LEAKAGE_PJ_PER_FLIT_SLOT_PER_CYCLE

    def total_pj(self):
        return self.link_hops * PER_LINK_HOP_PJ + self.ejections * PER_EJECTION_PJ + self.static_pj

    def breakdown(self):
        return {
            "link_hop_events": self.link_hops,
            "ejection_events": self.ejections,
            "link_hop_pj": self.link_hops * PER_LINK_HOP_PJ,
            "ejection_pj": self.ejections * PER_EJECTION_PJ,
            "static_pj": self.static_pj,
            "total_pj": self.total_pj(),
        }
