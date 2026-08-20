"""Routing algorithms for an NxN mesh.

Node ids are row-major: node_id = y * dim + x, so x = id % dim (column),
y = id // dim (row). Direction "N" decreases y, "S" increases y, "E"
increases x, "W" decreases x. This is just a labeling convention (there is
no physical "up"); what matters is that it is applied consistently by
Mesh.neighbor() in mesh.py.

Five policies are implemented:

  XY (dimension-order routing): always finish all X-direction hops before
  any Y-direction hops. Deadlock-free by construction -- a packet's route
  never contains both an X-after-Y and a Y-after-X turn at the same node in
  a way that can close a cycle, because every packet's turn sequence is
  X*Y* (at most one turn, always X-then-Y).

  WEST_FIRST (Glass & Ni turn model): a packet that still needs to move west
  MUST do so before any north/south movement -- turning into west from a
  north or south move is forbidden. This removes 2 of the 8 possible turns,
  which is provably enough to break every cyclic dependency in a mesh
  (classical turn-model deadlock-freedom argument). Once no westward hop is
  left, the remaining productive directions (E/N/S) are chosen adaptively
  by picking whichever neighbor is least congested.

  DYAD (fully adaptive minimal routing): at every hop, choose the least
  congested of all *productive* (minimal, i.e. hop-count-reducing)
  directions, with no turn restriction at all. This is NOT deadlock-free in
  this simulator (single buffer per port, no escape virtual channel) -- see
  tests/test_routing_liveness.py for an empirical demonstration of that
  limitation, and README.md "Known limitation" for the reasoning.

  COST_ADAPTIVE (weighted-cost adaptive routing): like DYAD, only considers
  productive (minimal) directions -- so, honestly stated, Manhattan distance
  itself does not discriminate BETWEEN candidates, since every productive
  direction reduces remaining Manhattan distance by exactly 1 by
  construction. What it adds over DYAD's plain 1-hop buffer-occupancy
  comparison is a genuinely richer cost per candidate: a 2-hop regional
  congestion lookahead (this router's immediate neighbor in that direction,
  weighted 65%, plus that neighbor's neighbor, weighted 35%) plus a
  link-utilization term (how many packets already have a wormhole
  reservation at this router committed to leaving via that direction). Same
  deadlock caveat as DYAD applies (not proven or tested deadlock-free here).

  ENERGY_AWARE: uses the exact same path-selection as COST_ADAPTIVE. This is
  not a shortcut -- it's the honest consequence of this simulator's energy
  model (noc/energy.py): dynamic energy is purely a function of hop count,
  and every minimal-path policy here produces identical hop counts for a
  given (src, dst) pair, so no routing *choice* among them can reduce
  dynamic energy. The only real lever is static/leakage energy, which is
  proportional to how long flits sit queued in buffers -- exactly what
  congestion-avoiding routing already reduces. ENERGY_AWARE exists as a
  separate named policy (rather than just recommending COST_ADAPTIVE for
  low-power use) so the controller and experiments can select and measure it
  as its own mode, per the project's MODE 0-3 requirement.
"""


def id_to_xy(node_id, dim):
    return node_id % dim, node_id // dim


def xy_to_id(x, y, dim):
    return y * dim + x


def xy_route(cur_id, dst_id, dim):
    if cur_id == dst_id:
        return "EJ"
    cx, cy = id_to_xy(cur_id, dim)
    dx, dy = id_to_xy(dst_id, dim)
    if cx != dx:
        return "E" if dx > cx else "W"
    return "S" if dy > cy else "N"


def west_first_route(cur_id, dst_id, dim, congestion_fn=None):
    if cur_id == dst_id:
        return "EJ"
    cx, cy = id_to_xy(cur_id, dim)
    dx, dy = id_to_xy(dst_id, dim)
    if dx < cx:
        return "W"  # mandatory: must go west before turning any other way
    candidates = []
    if dx > cx:
        candidates.append("E")
    if dy < cy:
        candidates.append("N")
    if dy > cy:
        candidates.append("S")
    if not candidates:
        return "EJ"
    if len(candidates) == 1 or congestion_fn is None:
        return candidates[0]
    return min(candidates, key=congestion_fn)


def dyad_route(cur_id, dst_id, dim, congestion_fn=None):
    if cur_id == dst_id:
        return "EJ"
    cx, cy = id_to_xy(cur_id, dim)
    dx, dy = id_to_xy(dst_id, dim)
    candidates = []
    if dx > cx:
        candidates.append("E")
    if dx < cx:
        candidates.append("W")
    if dy < cy:
        candidates.append("N")
    if dy > cy:
        candidates.append("S")
    if not candidates:
        return "EJ"
    if len(candidates) == 1 or congestion_fn is None:
        return candidates[0]
    return min(candidates, key=congestion_fn)


def cost_adaptive_route(cur_id, dst_id, dim, cost_fn=None):
    """Same productive-direction candidate set as dyad_route; `cost_fn`
    (built by Mesh._cost_fn) supplies the weighted regional-congestion +
    link-utilization scalar per candidate direction instead of dyad_route's
    plain 1-hop buffer occupancy."""
    if cur_id == dst_id:
        return "EJ"
    cx, cy = id_to_xy(cur_id, dim)
    dx, dy = id_to_xy(dst_id, dim)
    candidates = []
    if dx > cx:
        candidates.append("E")
    if dx < cx:
        candidates.append("W")
    if dy < cy:
        candidates.append("N")
    if dy > cy:
        candidates.append("S")
    if not candidates:
        return "EJ"
    if len(candidates) == 1 or cost_fn is None:
        return candidates[0]
    return min(candidates, key=cost_fn)


ROUTING_FUNCS = {
    "XY": lambda cur, dst, dim, cf: xy_route(cur, dst, dim),
    "WEST_FIRST": lambda cur, dst, dim, cf: west_first_route(cur, dst, dim, cf),
    "DYAD": lambda cur, dst, dim, cf: dyad_route(cur, dst, dim, cf),
    "COST_ADAPTIVE": lambda cur, dst, dim, cf: cost_adaptive_route(cur, dst, dim, cf),
    "ENERGY_AWARE": lambda cur, dst, dim, cf: cost_adaptive_route(cur, dst, dim, cf),
}

# Which of Mesh's two congestion-signal builders each policy needs:
# COST_ADAPTIVE/ENERGY_AWARE want the richer weighted cost_fn; everything
# else wants the plain 1-hop buffer-occupancy congestion_fn.
COST_FN_POLICIES = {"COST_ADAPTIVE", "ENERGY_AWARE"}
