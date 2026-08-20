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

PER_LINK_HOP_PJ = BUFFER_WRITE_PJ + BUFFER_READ_PJ + CROSSBAR_PJ + ARBITRATION_PJ + LINK_PJ
PER_EJECTION_PJ = BUFFER_WRITE_PJ + BUFFER_READ_PJ + CROSSBAR_PJ + ARBITRATION_PJ


class EnergyModel:
    def __init__(self):
        self.link_hops = 0
        self.ejections = 0

    def record_link_hop(self):
        self.link_hops += 1

    def record_ejection(self):
        self.ejections += 1

    def total_pj(self):
        return self.link_hops * PER_LINK_HOP_PJ + self.ejections * PER_EJECTION_PJ

    def breakdown(self):
        return {
            "link_hop_events": self.link_hops,
            "ejection_events": self.ejections,
            "link_hop_pj": self.link_hops * PER_LINK_HOP_PJ,
            "ejection_pj": self.ejections * PER_EJECTION_PJ,
            "total_pj": self.total_pj(),
        }
