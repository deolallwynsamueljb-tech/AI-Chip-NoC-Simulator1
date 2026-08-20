"""Packet -> Flit segmentation.

A Packet is the logical unit produced by a workload trace (one row of a CSV
trace = one Packet). It is chopped into Flits before it enters the mesh,
because the mesh moves at most one flit per link per cycle. FLIT_PAYLOAD_BYTES
sets how many bytes one flit carries; everything else (latency, hop count,
energy) is measured at flit granularity and then rolled back up to the
packet when its TAIL/SINGLE flit is delivered.
"""

from dataclasses import dataclass
from enum import Enum
import math

FLIT_PAYLOAD_BYTES = 32  # 256-bit flit, typical of AI-accelerator NoC links (wider than general-purpose CPU NoCs)


class FlitType(Enum):
    HEAD = "HEAD"
    BODY = "BODY"
    TAIL = "TAIL"
    SINGLE = "SINGLE"


@dataclass
class Flit:
    packet_id: int
    ftype: FlitType
    src: int
    dst: int
    seq_index: int
    num_flits: int
    gen_cycle: int
    op: str
    layer: str


@dataclass
class Packet:
    packet_id: int
    src: int
    dst: int
    size_bytes: int
    gen_cycle: int
    op: str = ""
    layer: str = ""

    def num_flits(self) -> int:
        return max(1, math.ceil(self.size_bytes / FLIT_PAYLOAD_BYTES))

    def make_flits(self):
        n = self.num_flits()
        flits = []
        for i in range(n):
            if n == 1:
                ftype = FlitType.SINGLE
            elif i == 0:
                ftype = FlitType.HEAD
            elif i == n - 1:
                ftype = FlitType.TAIL
            else:
                ftype = FlitType.BODY
            flits.append(
                Flit(
                    packet_id=self.packet_id,
                    ftype=ftype,
                    src=self.src,
                    dst=self.dst,
                    seq_index=i,
                    num_flits=n,
                    gen_cycle=self.gen_cycle,
                    op=self.op,
                    layer=self.layer,
                )
            )
        return flits
