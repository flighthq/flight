---
package: '@flighthq/surface-rs'
crate: null
draft: false
spunOut: flight-rs
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# surface-rs — Charter

> **Spun out (2026-07-10).** `@flighthq/surface-rs` and its `flighthq-surface-wasm` crate are **built and maintained in the separate `flight-rs` repository**, not this monorepo — `packages/surface-rs/` and `crates/` no longer exist here. This cell is kept for reference (the design/north-star below still describes the package's contract), but it is **not local build work**: do not scaffold it here, and it is excluded from the TODO's chartered-unbuilt list via the `spunOut` front-matter marker. The same applies to any future Rust/wasm `-rs` acceleration siblings — they live in `flight-rs`. The review and status logs below predate the spin-out and describe its in-repo history.

## What it is

Wasm-backed drop-in for `@flighthq/surface` — a binding/acceleration layer, not a standalone image-processing library. Re-exports the entire `@flighthq/surface` API and selectively shadows bulk per-pixel operations with Rust/wasm implementations compiled from the `flighthq-surface-wasm` crate. A consumer swaps `import from '@flighthq/surface'` for `import from '@flighthq/surface-rs'` and gets wasm-accelerated pixel operations with zero API change.

Has no Rust crate of its own (`crate: null`). The Rust side is `flighthq-surface-wasm` (a `RUST_ONLY` crate); this is a `TS_ONLY` package. They are a matched pair recorded in the conformance scripts.

## North star

1. **Pure drop-in shadow, never leading.** Signatures are byte-and-shape-identical to the `@flighthq/surface` that actually ships. surface-rs never adds, removes, or changes a parameter ahead of upstream. If upstream changes a signature, surface-rs updates in the same merge — not before, not after.
2. **Bridge where performance value is added.** A function is bridged to wasm because the Rust implementation is meaningfully faster than the JS one for bulk pixel work. Functions that are thin wrappers, quality/testing utilities, or JS-native (DOM interaction) stay as JS re-exports. Completeness is not a goal — performance value is.
3. **Single crossing per call.** Each wasm-backed function amortizes the JS↔wasm boundary over one crossing: marshal inputs, call Rust, marshal outputs. No per-pixel boundary crossings.
4. **Byte-exact conformance.** Wasm-backed operations must produce byte-identical output to the JS reference for the same inputs. The conformance test suite asserts this with parity tests against the JS implementation.
5. **Side-effect-free, tree-shakable.** The barrel re-exports `@flighthq/surface` and shadows only the wasm-backed functions. Unused shadows tree-shake out. No top-level wasm instantiation — the module loads lazily on first call.

## Boundaries

**In scope**

- Wasm bindings for bulk per-pixel surface operations where Rust provides meaningful speedup: blur, convolution, morphological, color-matrix, composite, geometric transforms, fill/generate, channel/format ops.
- Discriminant maps between TS string unions and Rust `repr(u8)` enums for marshalling.
- Conformance test suite asserting byte-exact parity with JS reference.
- The embed/copy scripts that package the wasm binary into the TS module.

**Out of scope (non-goals)**

- Wasm-only capabilities that `@flighthq/surface` does not expose. surface-rs is a shadow, not a superset.
- Functions where JS performance is adequate and wasm marshalling would add overhead for no gain (thin accessors, lifecycle, format detection).
- Quality/testing utilities (`compareSurface`, `getSurfaceMismatch`, `createSurfaceFingerprint`) — these are not hot-path; JS fallback is acceptable unless profiling shows otherwise.
- GPU-accelerated surface ops — that is a different acceleration path (`surface-gl`/`surface-wgpu` if ever built), not wasm mixing.
- The Rust crate itself (`flighthq-surface-wasm`) — that is a Rust-side concern owned by the Rust worktree.

## Decisions

- **2026-07-03 — Pure shadow posture confirmed.** surface-rs tracks shipped `@flighthq/surface` signatures, never leads. No wasm-only capabilities.
- **2026-07-03 — Bridge based on performance value, not completeness.** Functions are bridged to wasm where Rust is meaningfully faster. JS-adequate functions stay as re-exports. Fingerprint/compare/mismatch are acceptable as JS unless profiling says otherwise.
- **2026-07-03 — `filters-surface-rs` is a reasonable neighbor.** The `apply*FilterToSurface` orchestrator gap (filters-surface hard-binds to JS surface primitives) could be addressed by a `filters-surface-rs` sibling that interposes wasm-backed primitives. Same boundary discipline applies: value is added where filter application is a hot path over bulk pixel ops, not for completeness. Exact shape TBD.
- **2026-07-03 — Hidden-state removal is upstream-first.** `floodFillSurface`, `scrollSurface`, and `medianSurface` carry module-level mutable buffers in `@flighthq/surface`. The fix (caller-provided scratch) must originate in `@flighthq/surface` and only then be mirrored here in the same merge.

## Open directions

1. **`filters-surface-rs` shape and boundaries.** Approved as a reasonable neighbor, but the exact scope is undecided. Does it shadow all of `@flighthq/filters-surface`, or only the hot-path filter applications? Does it need its own wasm crate, or can it compose over `surface-wasm` bindings? Same "value added" test applies.
2. **Discriminant map drift guard.** Hand-maintained `repr(u8)` maps between TS string unions and Rust enums are a silent drift hazard. A conformance-drift guard test exists (53 expected shadows). Whether to escalate to a generated bridge (Gold-tier) or accept the current guard as sufficient is undecided.
3. **Conformance-map ownership for intentional divergences.** Any TS↔Rust scratch-vs-clone divergence belongs in the conformance divergence map, not only in binding-side comments. The process for recording these paired changes is not formalized.
4. **Wasm module loading strategy.** Currently the wasm binary is base64-embedded. For large binaries this inflates the JS bundle. Alternatives: fetch-based loading, streaming compilation, or a hybrid. Not urgent at current binary size but worth deciding before the binding set grows much larger.
5. **Other `-rs` mixing candidates.** The mixing pattern could extend beyond surface to other value-typed leaves: `geometry-rs` (math), `path-rs` (tessellation), `filters-rs` (descriptor math). Each would follow the same drop-in shadow discipline. Which are worth building depends on profiling real workloads.
