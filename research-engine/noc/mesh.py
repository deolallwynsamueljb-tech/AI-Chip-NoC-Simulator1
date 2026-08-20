"""Cycle-based NxN mesh NoC engine.

Model: single-flit-per-cycle-per-link, single buffer (FIFO) per input port
-- there are no separate virtual channels. Flow control is credit-based,
implemented directly as "does the downstream buffer have a free slot"
(functionally equivalent to a 0-cycle credit round trip; a real design would
have the credit signal itself take a cycle to arrive, which this simplifies
away and which is documented here rather than left implicit).

Every router has five input ports: N, S, E, W (from neighbor routers) and
INJ (from this tile's own PE, via a per-router injection queue). Output
directions are N, S, E, W and EJ (to this tile's own PE).

Each call to Mesh.step() advances the whole mesh by exactly one cycle, in
four synchronous phases so that no flit can travel more than one hop per
cycle regardless of the order routers happen to be visited in:

  1. ROUTE COMPUTE -- for every input port with a head-of-line (HOL) flit,
     decide its output direction. HEAD/SINGLE flits call the active routing
     policy. BODY/TAIL flits do NOT call the routing policy again; they
     reuse the output direction that this same router already assigned to
     their packet's HEAD flit (self.reservations). This wormhole path
     reservation is what guarantees every flit of one packet takes the same
     path through the network -- without it, an adaptive policy could route
     a packet's HEAD and TAIL differently as congestion changes between the
     cycles they each arrive, and the packet would never reassemble
     correctly at the destination.

  2. ARBITRATION -- for every (router, output direction) pair, collect the
     input ports whose HOL flit wants that direction AND whose downstream
     buffer currently has a free slot. A per-(router, direction) round-robin
     pointer picks one winner among them, so no input port can starve
     another indefinitely.

  3. SWITCH + LINK TRAVERSAL -- winners recorded in phase 2 are moved now,
     using the phase-2 snapshot (buffers touched in this phase are not
     re-examined until next cycle), so a flit always advances exactly one
     hop per cycle.

  4. INJECTION -- each router offers the next flit of its head-of-line
     packet to its own INJ buffer, but only if INJ has a free slot. This
     runs last so a freshly injected flit is not visible to route compute
     until the following cycle, and so injection is throttled by the same
     buffer_depth as every other port (this is what produces the
     counter-intuitive buffer-size sensitivity result under sustained
     overload -- see results/exp_buffer_sensitivity.csv).
"""

from collections import deque

from .packet import FlitType
from .routing import ROUTING_FUNCS, id_to_xy, xy_to_id
from .metrics import Metrics
from .energy import EnergyModel

IN_PORTS = ("N", "S", "E", "W", "INJ")
OUT_DIRS = ("N", "S", "E", "W", "EJ")
OPPOSITE = {"N": "S", "S": "N", "E": "W", "W": "E"}


class Router:
    def __init__(self, node_id, buffer_depth):
        self.node_id = node_id
        self.buffer_depth = buffer_depth
        self.in_buffers = {p: deque() for p in IN_PORTS}
        self.rr_pointer = {d: 0 for d in OUT_DIRS}
        self.reservations = {}  # packet_id -> output_dir, alive while this router holds any of its flits
        self.injection_queue = deque()  # Packet objects waiting to be flitized
        self._pending_flits = deque()  # flits of the current head-of-line packet not yet in INJ buffer


class Mesh:
    def __init__(self, dim=4, routing="XY", buffer_depth=4):
        if routing not in ROUTING_FUNCS:
            raise ValueError(f"unknown routing policy {routing!r}")
        self.dim = dim
        self.routing = routing
        self.buffer_depth = buffer_depth
        self.routers = {i: Router(i, buffer_depth) for i in range(dim * dim)}
        self.cycle = 0
        self.metrics = Metrics()
        self.energy = EnergyModel()

    def set_routing(self, name):
        if name not in ROUTING_FUNCS:
            raise ValueError(f"unknown routing policy {name!r}")
        self.routing = name

    def neighbor(self, node_id, direction):
        x, y = id_to_xy(node_id, self.dim)
        if direction == "N":
            y -= 1
        elif direction == "S":
            y += 1
        elif direction == "E":
            x += 1
        elif direction == "W":
            x -= 1
        if 0 <= x < self.dim and 0 <= y < self.dim:
            return xy_to_id(x, y, self.dim)
        return None

    def inject_packet(self, packet):
        self.routers[packet.src].injection_queue.append(packet)

    def pending_packet_count(self):
        total = 0
        for r in self.routers.values():
            total += len(r.injection_queue)
            if r._pending_flits:
                total += 1  # head packet already partially flitized, still counted once
        return total

    def in_flight_flit_count(self):
        return sum(len(buf) for r in self.routers.values() for buf in r.in_buffers.values())

    def idle(self):
        return self.pending_packet_count() == 0 and self.in_flight_flit_count() == 0

    def _congestion_fn(self, router_id):
        def f(direction):
            nbr_id = self.neighbor(router_id, direction)
            if nbr_id is None:
                return float("inf")
            nbr = self.routers[nbr_id]
            return len(nbr.in_buffers[OPPOSITE[direction]])

        return f

    def step(self):
        cycle = self.cycle
        route_fn = ROUTING_FUNCS[self.routing]

        # Phase 1: ROUTE COMPUTE
        hol_dir = {}  # (router_id, in_port) -> out_dir, only for ports with a HOL flit
        for r in self.routers.values():
            cf = self._congestion_fn(r.node_id)
            for port in IN_PORTS:
                buf = r.in_buffers[port]
                if not buf:
                    continue
                flit = buf[0]
                if flit.ftype in (FlitType.HEAD, FlitType.SINGLE):
                    out_dir = route_fn(r.node_id, flit.dst, self.dim, cf)
                    if flit.ftype == FlitType.HEAD:
                        r.reservations[flit.packet_id] = out_dir
                else:
                    out_dir = r.reservations.get(flit.packet_id)
                    if out_dir is None:
                        raise RuntimeError(
                            f"wormhole reservation missing for packet {flit.packet_id} "
                            f"at router {r.node_id}, flit {flit.ftype}"
                        )
                hol_dir[(r.node_id, port)] = out_dir

        # Phase 2: ARBITRATION
        grants = {}  # (router_id, out_dir) -> winning in_port
        for r in self.routers.values():
            for out_dir in OUT_DIRS:
                candidates = [
                    port
                    for port in IN_PORTS
                    if hol_dir.get((r.node_id, port)) == out_dir
                ]
                if not candidates:
                    continue
                if out_dir == "EJ":
                    avail = candidates  # PE ejection is never a bottleneck in this model
                else:
                    nbr_id = self.neighbor(r.node_id, out_dir)
                    nbr = self.routers[nbr_id]
                    if len(nbr.in_buffers[OPPOSITE[out_dir]]) < nbr.buffer_depth:
                        avail = candidates
                    else:
                        avail = []
                if not avail:
                    continue
                start = r.rr_pointer[out_dir]
                ordered = sorted(avail, key=lambda p: (IN_PORTS.index(p) - start) % len(IN_PORTS))
                winner = ordered[0]
                grants[(r.node_id, out_dir)] = winner
                r.rr_pointer[out_dir] = (IN_PORTS.index(winner) + 1) % len(IN_PORTS)

        # Phase 3: SWITCH + LINK TRAVERSAL
        for (router_id, out_dir), in_port in grants.items():
            r = self.routers[router_id]
            flit = r.in_buffers[in_port].popleft()
            is_tail = flit.ftype in (FlitType.TAIL, FlitType.SINGLE)
            if out_dir == "EJ":
                self.metrics.record_ejection()
                self.energy.record_ejection()
                if is_tail:
                    latency = cycle - flit.gen_cycle + 1
                    self.metrics.record_delivery(flit, latency, cycle)
            else:
                self.metrics.record_link_hop()
                self.energy.record_link_hop()
                nbr = self.routers[self.neighbor(router_id, out_dir)]
                nbr.in_buffers[OPPOSITE[out_dir]].append(flit)
            if is_tail:
                r.reservations.pop(flit.packet_id, None)

        # Phase 4: INJECTION (visible starting next cycle)
        for r in self.routers.values():
            if not r._pending_flits and r.injection_queue:
                pkt = r.injection_queue[0]
                r._pending_flits.extend(pkt.make_flits())
            if r._pending_flits and len(r.in_buffers["INJ"]) < r.buffer_depth:
                f = r._pending_flits.popleft()
                r.in_buffers["INJ"].append(f)
                if not r._pending_flits:
                    r.injection_queue.popleft()

        self.metrics.sample_occupancy(self, cycle)
        self.cycle += 1
