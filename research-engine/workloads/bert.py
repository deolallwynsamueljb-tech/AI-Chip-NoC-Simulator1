"""DistilBERT-style transformer communication trace, derived from the real
published DistilBERT config: hidden_size=768, num_attention_heads=12,
num_hidden_layers=6, intermediate_size=3072. Sequence length is
configurable (default 128) and split evenly across the dim x dim PEs, so
each PE owns a contiguous block of `seq_len / (dim*dim)` tokens.

Traffic model: QKV projection, the output projection and the FFN are all
purely local matmuls once a PE has the activations it needs (its weight
tiles are resident, loaded once at model-load time and not re-sent per
inference, so they are not part of this per-inference trace). The one part
of a transformer layer that is NOT local is self-attention itself: every
token's query must be scored against every OTHER token's key, and every PE
only holds its own block of keys/values. So before attention can run, each
PE must obtain the K/V blocks of every other PE -- an all-to-all exchange,
once per layer. This is the defining trait of transformer NoC traffic:
global, high destination-entropy, low locality, in sharp contrast to a
CNN's neighbor-only halo exchange.

At the start (embedding lookup) PE 0 broadcasts token+position embeddings
to every other PE. At the end, the [CLS]-token pooled output is gathered to
PE 0 for the classification head, mirroring ResNet's avgpool+fc gather.

seq_len defaults to 32 rather than DistilBERT's usual 128-512 max sequence
length purely for cycle-accurate simulation tractability (a full 128-token
all-to-all KV exchange moves tens of megabytes network-wide per layer,
which a 16-byte-flit link model takes an intractable number of cycles to
drain) -- a short-context inference workload (seq_len=32) is itself a real,
common scenario, not an invented one; hidden_size/heads/layer count are all
still DistilBERT's real published config.
"""

from workloads.trace_format import TraceEvent

BYTES_PER_ELEM = 2  # bf16
COMPUTE_GAP_CYCLES = 15
EVENT_CYCLE_STRIDE = 1

HIDDEN_SIZE = 768
NUM_HEADS = 12
NUM_LAYERS = 6
SEQ_LEN = 16


def generate_bert_trace(dim=4, seq_len=SEQ_LEN, num_layers=NUM_LAYERS, start_cycle=0):
    n_pe = dim * dim
    assert seq_len % n_pe == 0, "seq_len must divide evenly across PEs for this trace model"
    tokens_per_pe = seq_len // n_pe

    events = []
    pid = 0
    cycle = start_cycle

    # Embedding broadcast (once, before layer 0)
    embed_size = tokens_per_pe * HIDDEN_SIZE * BYTES_PER_ELEM
    for pe in range(1, n_pe):
        events.append(TraceEvent(cycle, pid, 0, pe, embed_size, "EMBED_BCAST", "embedding"))
        pid += 1
        cycle += EVENT_CYCLE_STRIDE
    cycle += COMPUTE_GAP_CYCLES

    kv_block_size = tokens_per_pe * HIDDEN_SIZE * 2 * BYTES_PER_ELEM  # K and V together

    for layer in range(num_layers):
        layer_name = f"layer{layer}_attention"
        for i in range(n_pe):
            for j in range(n_pe):
                if i == j:
                    continue
                events.append(TraceEvent(cycle, pid, i, j, kv_block_size, "ATTN_KV_EXCHANGE", layer_name))
                pid += 1
                cycle += EVENT_CYCLE_STRIDE
        cycle += COMPUTE_GAP_CYCLES  # softmax*V, output proj, FFN -- all local

    # Pooled [CLS] output gather to PE 0 for the classification head
    pooled_size = HIDDEN_SIZE * BYTES_PER_ELEM
    for pe in range(1, n_pe):
        events.append(TraceEvent(cycle, pid, pe, 0, pooled_size, "POOLED_GATHER", "cls_head"))
        pid += 1
        cycle += EVENT_CYCLE_STRIDE

    return events


if __name__ == "__main__":
    import sys
    from workloads.trace_format import save_trace, validate_trace

    ev = generate_bert_trace(dim=4)
    print(validate_trace(ev, dim=4))
    save_trace(ev, sys.argv[1] if len(sys.argv) > 1 else "traces/bert.csv")
