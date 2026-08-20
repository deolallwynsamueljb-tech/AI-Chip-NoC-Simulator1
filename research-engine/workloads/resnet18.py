"""ResNet-18 communication trace, derived from the real CIFAR-style ResNet-18
architecture (32x32x3 input; 3x3/stride-1 stem, no initial maxpool -- the
same adaptation used ubiquitously in CIFAR-10/100 ResNet-18 benchmarks,
e.g. the widely used pytorch-cifar / "ResNet for CIFAR" variant): stem conv
+ 4 stages of 2 BasicBlocks each (2 convs per block => 16 conv layers) +
stem conv1 = 17 conv layers + a final avgpool/fc, the standard "18-layer"
count. The full ImageNet-scale variant (224x224 input) uses the exact same
channel progression but ~7x larger spatial dimensions at every stage, which
produces halo messages far too large (tens of KB each) for a 16-byte-flit
cycle-accurate link model to move in a tractable number of cycles; the
CIFAR-scale variant is used here purely for that tractability reason, not
because the derivation method differs -- it is still a real, standard,
widely-benchmarked architecture, not an invented one.

Traffic model: at each conv-equivalent stage, that stage's output feature
map (channels x H x W) is spatially tiled onto the dim x dim mesh (one tile
per PE, tile shape ~= H/dim x W/dim x channels). A convolution needs pixels
from just outside its own tile's border -- the receptive-field "halo" -- so
each PE exchanges a border strip with its N/S/E/W neighbor only (never a
distant PE). Halo width is derived from the layer's kernel_size (and
inflated by +1 for stride-2 layers, whose larger downsampling receptive
field reaches further into the neighbor's border). This is why CNN traffic
is characteristically local / neighbor-only / reuse-heavy, unlike attention.

The final avgpool+fc stage needs every PE's pooled feature vector at one
place to run the classifier head, so it is modeled as a many-to-one gather
into PE 0 -- this produces a sharp, easily-detected "everything funnels to
one node" burst at the very end of the trace.

Between stages a COMPUTE_GAP_CYCLES gap is inserted with no traffic, standing
in for the local MAC compute time of that stage (during which the NoC is
idle) -- real accelerators alternate compute and communicate phases, they
don't communicate continuously.
"""

from workloads.trace_format import TraceEvent

BYTES_PER_ELEM = 2  # bf16
COMPUTE_GAP_CYCLES = 15
EVENT_CYCLE_STRIDE = 1

# (stage name, out_channels, H, W, kernel_size, stride) -- CIFAR-style ResNet-18
RESNET18_STAGES = [
    ("stem_conv1", 64, 32, 32, 3, 1),
    ("layer1_block0_conv1", 64, 32, 32, 3, 1),
    ("layer1_block0_conv2", 64, 32, 32, 3, 1),
    ("layer1_block1_conv1", 64, 32, 32, 3, 1),
    ("layer1_block1_conv2", 64, 32, 32, 3, 1),
    ("layer2_block0_conv1", 128, 16, 16, 3, 2),
    ("layer2_block0_conv2", 128, 16, 16, 3, 1),
    ("layer2_block1_conv1", 128, 16, 16, 3, 1),
    ("layer2_block1_conv2", 128, 16, 16, 3, 1),
    ("layer3_block0_conv1", 256, 8, 8, 3, 2),
    ("layer3_block0_conv2", 256, 8, 8, 3, 1),
    ("layer3_block1_conv1", 256, 8, 8, 3, 1),
    ("layer3_block1_conv2", 256, 8, 8, 3, 1),
    ("layer4_block0_conv1", 512, 4, 4, 3, 2),
    ("layer4_block0_conv2", 512, 4, 4, 3, 1),
    ("layer4_block1_conv1", 512, 4, 4, 3, 1),
    ("layer4_block1_conv2", 512, 4, 4, 3, 1),
]


def _halo_width(kernel_size, stride):
    base = max(1, (kernel_size - 1) // 2)
    return base + 1 if stride == 2 else base


def generate_resnet18_trace(dim=4, start_cycle=0):
    events = []
    pid = 0
    cycle = start_cycle

    for name, channels, H, W, kernel_size, stride in RESNET18_STAGES:
        tile_h = max(1, H // dim)
        tile_w = max(1, W // dim)
        halo = _halo_width(kernel_size, stride)

        for y in range(dim):
            for x in range(dim):
                pe = y * dim + x
                if x + 1 < dim:
                    size = max(1, tile_h * halo * channels * BYTES_PER_ELEM)
                    events.append(TraceEvent(cycle, pid, pe, pe + 1, size, "CONV_HALO_E", name))
                    pid += 1
                    cycle += EVENT_CYCLE_STRIDE
                if x - 1 >= 0:
                    size = max(1, tile_h * halo * channels * BYTES_PER_ELEM)
                    events.append(TraceEvent(cycle, pid, pe, pe - 1, size, "CONV_HALO_W", name))
                    pid += 1
                    cycle += EVENT_CYCLE_STRIDE
                if y + 1 < dim:
                    size = max(1, tile_w * halo * channels * BYTES_PER_ELEM)
                    events.append(TraceEvent(cycle, pid, pe, pe + dim, size, "CONV_HALO_S", name))
                    pid += 1
                    cycle += EVENT_CYCLE_STRIDE
                if y - 1 >= 0:
                    size = max(1, tile_w * halo * channels * BYTES_PER_ELEM)
                    events.append(TraceEvent(cycle, pid, pe, pe - dim, size, "CONV_HALO_N", name))
                    pid += 1
                    cycle += EVENT_CYCLE_STRIDE

        cycle += COMPUTE_GAP_CYCLES

    # avgpool + fc: every non-root PE gathers its pooled 512-channel feature
    # vector to PE 0, which runs the final classifier head.
    final_channels = RESNET18_STAGES[-1][1]
    gather_size = final_channels * BYTES_PER_ELEM
    for pe in range(1, dim * dim):
        events.append(TraceEvent(cycle, pid, pe, 0, gather_size, "FC_GATHER", "avgpool_fc"))
        pid += 1
        cycle += EVENT_CYCLE_STRIDE

    return events


if __name__ == "__main__":
    import sys
    from workloads.trace_format import save_trace, validate_trace

    ev = generate_resnet18_trace(dim=4)
    print(validate_trace(ev, dim=4))
    save_trace(ev, sys.argv[1] if len(sys.argv) > 1 else "traces/resnet18.csv")
