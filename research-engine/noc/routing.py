"""Routing algorithms for an NxN mesh.

Node ids are row-major: node_id = y * dim + x, so x = id % dim (column),
y = id // dim (row). Direction "N" decreases y, "S" increases y, "E"
increases x, "W" decreases x. This is just a labeling convention (there is
no physical "up"); what matters is that it is applied consistently by
Mesh.neighbor() in mesh.py.

Three policies are implemented:

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


ROUTING_FUNCS = {
    "XY": lambda cur, dst, dim, cf: xy_route(cur, dst, dim),
    "WEST_FIRST": lambda cur, dst, dim, cf: west_first_route(cur, dst, dim, cf),
    "DYAD": lambda cur, dst, dim, cf: dyad_route(cur, dst, dim, cf),
}
