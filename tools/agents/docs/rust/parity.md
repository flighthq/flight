# Parity — the matrix differ

Parity is an **instrument**, not a goal. It runs several render environments in parallel and reports where they disagree. It is the tool that measures, among other things, the [conformance](conformance.md) property — but on its own it is just "do these selected environments draw the same picture?"

The TS-only meaning of parity (the existing `compare-render` "parity" mode: the raster backends agree with each other) is preserved as the _default selection_. Pulling Rust into the comparison is a flag, not a different tool.

## The compatibility matrix

A cell is `<impl>:<backend>`.

```
            canvas      dom        skia         gl          wgpu
ts          ts:canvas   ts:dom     —            ts:gl       ts:wgpu
rust-wasm   —           —          rwasm:skia   rwasm:gl    rwasm:wgpu
rust-native —           —          rnat:skia    rnat:gl     rnat:wgpu
```

Two structural facts:

1. **The matrix is sparse — the impls overlap, they don't coincide.** Rust has no Canvas2D/DOM cell (no substrate in the box; see the [existence rule](conformance.md#the-crate-existence-rule)); TS has no `skia` cell (its software renderer is Canvas2D). So same-cell conformance pairing happens at `gl` and `wgpu`; the software tier pairs _across_ columns — `rust:skia ~ ts:canvas`, a declared software-vs-software pair that is structural at best (different rasterizers, though both Skia-family). `rnat:skia` is also the **deterministic reference**: bit-identical across machines, GPU-free, so the GPU cells are checked for _consistency_ against it.
2. **Two runners span the matrix.**
   - The **browser parity runner** hosts `ts:*` and `rwasm:*` in one page and diffs them live (this is "wasm-web parity behind a flag").
   - The **native conformance runner** (`flighthq-capture` / `flighthq-functional`) produces `rnat:*` and diffs against stored `ts` baseline fingerprints — no browser required.

## Comparison strategies

The same set of selected cells can be compared two ways:

- **Consistency** — the selected cells must agree with _each other_; no cell is the authority. This is "backend parity": `ts:canvas ~ ts:gl ~ ts:wgpu`.
- **Conformance pairing** — `ts:X` is the reference and `rust:X` must match it: `ts:gl ~ rwasm:gl`, `ts:wgpu ~ rnat:wgpu`.

The strategy is usually implied by the selection (all-one-impl → consistency; spans impls → conformance pairing) and can be stated explicitly when ambiguous.

## Selection is the test definition

There is no fixed list of "the parity tests." A run is defined by which cells it selects, which is what makes fast, targeted passes cheap:

- `--impl ts` _(default)_ — all TS backends, asserting consistency. No Rust or wasm build. This is the per-PR gate.
- `--impl ts,rust --backend gl` — `ts:gl + r*:gl` only. A fast Rust↔TS conformance spot-check at one backend.
- `--backend gl,wgpu --impl ts` — `ts:gl + ts:wgpu` only. A fast intra-TS check of just the GPU backends.
- `--cells ts:gl,rwasm:gl` — explicit cells when the cartesian product of `--impl`/`--backend` is not what you want.

Non-existent cells (e.g. `rust:canvas`) are skipped, not errors.

## Tolerances and the WebGPU-headless caveat

- Comparisons are fingerprint/pixel diffs against a **per-scene-category tolerance**, declared, not a single global number. Solid fills and shader-deterministic effects can hold near-zero diff across implementations; text (different glyph rasterizers), antialiased edges, and some float-sensitive blending cannot, and may only reach coarse structural agreement. Do not loosen a global tolerance to make a text scene pass — set the category tolerance.
- On the headless software WebGPU adapter (swiftshader), WebGPU output is not always _presentable_ — screenshots can come back blank even though fingerprints compute. Diff WebGPU cells by **fingerprint, not screenshot pixels**. `flighthq-functional` already does this.

## Implementation status

This document describes the target design of the parity instrument. The current scripts implement parts of it: `scripts/rust-conformance.ts` does coverage-style conformance accounting (name-match), `scripts/compare-render.ts` does cross-backend consistency, and `flighthq-functional` does native fingerprint conformance against TS baselines. Unifying these behind one cell-selection flag surface — and the `parity` / `conformance` naming split — is tracked work, not yet fully realized in the scripts.

### `flighthq-functional` native runner

The native runner renders the whole `rnat:*` column — `skia`, `gl`, `wgpu` — and runs the scene × target matrix **in parallel** (a thread pool over every cell; each cell builds its own wgpu device / EGL context, skia is pure CPU, so the cells are independent). It reports all three comparison strategies in one pass:

- **regression** — each cell vs its committed baseline (`baselines/<name>.fp` for wgpu, `baselines/<target>/<name>.fp` for skia/gl).
- **conformance pairing** (`--parity`) — each cell vs the TS `webgpu` baseline the scene maps to.
- **consistency** — the rendered targets for a scene must agree with each other (no authority); disagreement fails the run.

Flags: `--target skia,gl,wgpu` selects cells, `--jobs N` sets worker threads, `--bless` writes baselines, `--parity` adds the TS comparison. The gl cell renders through a headless GLES 3.0 EGL context (surfaceless on Mesa; the runner sets `EGL_PLATFORM=surfaceless` before the pool starts) and skips cleanly where no context is available. The non-wgpu cells do not yet apply GPU effect chains, so effect scenes report `unsupported` there until `effects-gl` / a CPU effect path is wired — the sparse-matrix behavior this doc describes. As of 2026-06-23 skia and gl render shape scenes bit-identically to wgpu (consistency `OK`).
