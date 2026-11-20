# Item H: Bindgen follows the usable surface

Design: `agents/ffi-usability.md` section 6. This is where the upstream-worthy flight-hx patches land (0004, and the bindgen halves of 0006, 0007, 0010, 0012). Use the patches at `github.com/flighthq/flight-hx/tree/main/patches/flight` as a statement of what flight-hx needed; they target an old commit, so do not apply them.

## Goal

Generated Haxe externs expose the reachable C surface with real types, so flight-hx can delete its patch set. Proves scenario G6.

## What to build

### H1. Node handle type

After Item B, nodes cross the ABI as `FlightNode*`. Bindgen emits one Haxe type for it and uses it wherever the C signature does, including arrays of nodes, optional returns, the field accessors (`flight_get_node2d_alpha` and the rest) and `flight_node_equals`. Decide and document how concrete kinds appear in Haxe (one node abstract, or thin per-kind abstracts over the same handle); whichever is chosen must not reintroduce a way to pass the wrong carrier.

Field accessors should surface as Haxe properties where the target supports it. Setters stay bare; do not add invalidation.

### H2. Owned byte results

The FFI already returns owned byte handles with `_result_len`, `_result_get` and `_result_free` (31 triples; for example the `flight_compress_deflate*` family). Bindgen currently types the return as `Dynamic` and emits none of the accessors (`generated/haxe/flight/_hl/_fn/Compression.hx:5`). Emit a byte-buffer abstract with length, element access, copy to `haxe.io.Bytes`, and dispose. On the JavaScript target it maps to `Uint8Array`.

Confirm the two sfnt functions (`assemble_sfnt_font`, `encode_sfnt_loca`) are generated on a fresh build; they were not visible in the stale output inspected.

### H3. Signals

The FFI maps `Signal<()>` to an owned handle (`build.rs:6551-6561`), and Item C adds connect wrappers per payload type with a context release callback. Bindgen has no signal handling at all. Emit:

- the signal handle types;
- connect, taking a Haxe function, returning a connection object;
- disconnect.

The Haxe closure must be rooted for as long as the connection lives and released from the C `release` callback. This is the part that can crash a garbage-collected runtime if wrong; write down how rooting works on HashLink and on hxcpp, and test it by forcing a collection between connect and emit.

### H4. HashLink float packing

HashLink corrupts by-value float arguments past a small count. For the HashLink target only, a function with more than six floating-point parameters gets a private native taking the floats packed in one array, and a public wrapper with the unchanged Haxe signature. The C ABI itself does not change; the packed entry is a shim in the HashLink C glue (`flight_hl.c`).

23 functions are affected today (`set_matrix4` and `create_matrix4_from_values` with 16; the OBB, matrix3, transform and cubic-bezier families with 9–10). Recount after the f64 migration; the rule is by count, not by a list. State the exact threshold and whether it counts `Single` and `Float` alike, with a reference to the HashLink behaviour it works around, phrased as a fact about HashLink.

### H5. Scan parity

Task T (bindgen scan 81 → 144 crates) was in review and not on the base when this was written. After it lands, confirm `flight-buffer`, `flight-command` and `flight-textlayout` are scanned, and recount free functions landing outside their owning module (4 of 270 before T: `freeTextLayoutParams`, `freeTextLineMetrics`, `freeRequirementSet`, `freeTimelineLabel`). If any remain, fix placement; if none, nothing to do.

### H6. Host features

When `flight-ffi` is built with a host feature (Items F, G), bindgen can generate externs for that host's functions. Follow the header decision recorded by Item F.

## Tests

- `npm run haxe:generate` and `npm run haxe:check` on all targets.
- Scenario **G6** on HashLink, executed, not just type-checked: G1 (scene graph and fields), G2 (headless render, with the `host-headless` feature, skipped without an adapter) and G4 (signal connect, forced GC, emit, disconnect), plus a 16-float matrix round trip that fails without H4.
- A compile-only check that the same Haxe source builds for the C++ target.

## Not in scope

- Changes to the C ABI (those belong to Items B, C, E).
- flight-hx's JavaScript-only host seam modules (patches 0013, 0014); they stay downstream.
- A hand-written Haxe convenience layer. Bindgen output must stay indistinguishable from careful hand-written externs, but API sugar is flight-hx's.

## Acceptance

- Generator unit tests pass and generated output is reviewed as text. Executing G6 on HashLink and the C++ compile check are flight-hx's, per [pass 2](pass-2.md); the Tests section above is not a gate here.
- No `Dynamic` return remains for byte results or signals.
- A short note for flight-hx, kept in status: for each patch 0004–0014, "superseded by upstream, delete" or "keep, because".
- Deterministic generation; `cargo fmt`, lint.

## Dependencies

Items B and C, and Task T. H2 and H4 depend on none of them and can start immediately.
