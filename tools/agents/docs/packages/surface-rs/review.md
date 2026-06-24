---
package: '@flighthq/surface-rs'
status: authoritative
score: 94
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/surface-rs.md
  - source
  - changes.patch
---

# Review: @flighthq/surface-rs

## Verdict

`authoritative — 94/100`. A complete, faithful, conformance-tested wasm drop-in for the bulk-pixel surface of `@flighthq/surface`: 53 overrides with identical signatures, mirrored aliasing/version semantics, and tests that assert wasm output against the JS reference. This session (builder-67dc46d64) added no new overrides; it hardened the binding's _conformance harness_ — a mechanical shadow-coverage gate, per-enum discriminant cardinality tests (including the previously-missing BlendMode), edge-case and memory-stability tests, and cross-reference comments locking each discriminant map to its Rust decode function. The two remaining points (the `apply*FilterToSurface` interposition gap and the unaccelerated fingerprint/compare scans) are unchanged and correctly deferred as cross-boundary / toolchain-gated design questions. +2 over the prior 92 for the drift-guard and conformance-gate work.

## Present capabilities

The override set in `surfaceWasm.ts` is the complete bulk-pixel surface of `@flighthq/surface`, each re-exported by name from `index.ts` to shadow the `export * from '@flighthq/surface'`:

- **Blur:** `blurSurfacePixelsHorizontal`/`Vertical` (+ `Weighted` kernel variants), `boxBlurSurface`, `gaussianBlurSurface`.
- **Filter-grade effects:** `bevelSurface`, `gradientBevelSurface`, `glowSurface`, `innerGlowSurface`, `gradientGlowSurface`, `dropShadowSurface`, `innerShadowSurface`, `sharpenSurface`, `convolveSurface`, `displaceSurface`, `pixelateSurface`.
- **Morphology / rank:** `dilateSurface`, `erodeSurface`, `medianSurface`.
- **Color / channel:** `applySurfaceColorTransform`, `colorMatrixSurface`, `applySurfacePaletteMap`, `applySurfaceThreshold`, `copySurfaceChannel`, `mergeSurface`, `equalizeSurfaceHistogram`.
- **Composite / copy / transform:** `compositeSurfacePixels`/`Region`, `copySurfacePixels`, `flipSurfaceHorizontal`/`Vertical`, `rotateSurface` + `rotateSurface180`/`Clockwise`/`CounterClockwise`, `scrollSurface`, `resizeSurface` (nearest/bilinear/bicubic).
- **Fill / generate:** `fillSurfaceRectangle`, `fillSurfaceNoise`, `fillSurfacePerlinNoise`, `floodFillSurface`, `dissolveSurfacePixels`.
- **Query:** `getSurfaceHistogram`, `getSurfaceCoverage`, `getSurfaceColorBoundsRectangle`.
- **Pixel marshalling:** `extractSurfacePixels`/`32`, `writeSurfacePixels`/`32`, `premultiply`/`unpremultiplySurfacePixels`, `convertSurfacePixelOrder`.
- **Lifecycle:** `initSurfaceRs` (optional eager warm-up over lazy `ensureSurfaceRs`; bytes embedded in `surfaceWasmBytes.ts`, so synchronous, no fetch/IO).

Binding quality remains high and is unchanged from the prior review: identical option defaults and floor/round clamps (`roundRadius`/`roundPasses`), aliasing/version semantics replicated via `runRegionPair` + `isSameRegion`, `invalidateImageResource` called exactly where the JS reference invalidates, and zero-copy marshalling via `asUint8` (shared backing buffer) + `descOf` (6-element region pack). `"sideEffects": false`, single root `.` export, lazy self-init — all honored.

**What this session added (verified against `changes.patch`):**

- **`wasm shadow conformance` gate** (`surfaceWasm.test.ts:1132`). Iterates `EXPECTED_WASM_SHADOWS` and asserts every name is exported from the wasm module _and_ is a distinct function object from the `@flighthq/surface` reference. A future surface export that surface-rs forgets to shadow — or one that silently falls through to JS — turns this red mechanically. This is the right shape for keeping a drop-in's coverage honest over time.
- **`wasm discriminant map cardinality`** (`:1013`) — 7 tests, one per discriminant family, each exercising every variant and asserting byte-exact (or hit-count, or `expectByteClose`) agreement with the reference: `BlendMode` (15 variants), `SurfaceBevelType` (3), `SurfaceConvolutionEdge` (3), `SurfaceDisplacementMapMode` (4), `PixelOrder` (4), `SurfaceResizeMode` (3), `ThresholdOperation` (6).
- **Discriminant-drift comments** (`surfaceWasm.ts:878-916`) — each `repr(u8)` map now names the exact Rust `*_from_u8` decode function it must track, directly closing the prior review's "silent cross-language drift hazard" finding without a code generator.
- **BlendMode resolution.** I cross-checked the comment block against `packages/types/src/BlendMode.ts` (Add=0 … Subtract=14) and `crates/flighthq-surface-wasm/src/lib.rs:896` (`blend_mode_from_u8`): the Rust match covers 0-9 and 11-14 explicitly with `10 (Normal)` via the `_` wildcard, matching TS exactly. The prior status concern ("case 11 ⇒ Overlay skips 10") is confirmed correct, not a bug.
- **Edge-case / robustness tests** — `zero-area region edge cases` (:1170), `sub-region marshalling` (:948), `applySurfacePaletteMap all-null channel maps` (:149), `in-place aliased dest/source` (:630, asserts version is _not_ bumped on aliased flips/rotates), and `memory stability under repeated large-op calls` (:711, the wasm-memory-growth `ArrayBuffer`-detach hazard, 10× iterations).

The conformance harness shape is the standout: `import * as reference from '@flighthq/surface'`, assert wasm against reference, with a documented f32/f64 precision tolerance (`expectByteClose`, tolerance 1) for the fractional-intensity ops that diverge by one LSB. This is exactly the right posture for a binding.

## Gaps

Both carried forward from the depth review; both correctly deferred this session.

- **`apply*FilterToSurface` orchestrators are not accelerated, and not transitively.** `applyBlurFilterToSurface`, `applyDropShadowFilterToSurface`, etc. stay as plain JS re-exports, and inside `@flighthq/surface` they call the bulk primitives by _module-internal_ reference — so a consumer's wasm override never interposes. A user calling `gaussianBlurSurface(...)` directly gets wasm; a user calling the ergonomic filter wrapper does not. This is the single largest depth gap. The worker correctly identified that both fixes (an injection seam in `@flighthq/surface`/ `@flighthq/filters-surface`, or a sibling `@flighthq/filters-surface-rs`) cross a package boundary, and surfaced it as a design question rather than acting. (See Candidate open directions.)
- **`compareSurface` / `getSurfaceMismatch` / `createSurfaceFingerprint` stay JS by choice.** Full-buffer per-pixel scans that fit the single-crossing model. Deferred this session for lack of a Rust toolchain (the binding would need new `*_wasm` exports in `flighthq-surface-wasm` and a rebuild). Borderline omission, not a capability gap — every surface operation is still reachable through this package.

Correctly not overridden (missing-by-design): allocation/setup constructors, single-pixel getters/setters (crossing would dwarf the work), small allocate-once math builders, browser-API-bound `encodeSurface`/ `drawSurface`/`createSurfaceFromCanvas`, and string-work fingerprint format/parse. No domain _capability_ is absent.

## Charter contradictions

The charter's `What it is` is authored (a binding/acceleration layer, byte-for-byte drop-in, single boundary crossing per call); its `North star`, `Boundaries`, `Decisions`, and `Open directions` are all `TODO` stubs. Against the one authored section, there are **no contradictions** — the package is exactly the byte-compatible, identical-signature, single-crossing binding the charter describes. Everything else is judged against the codebase-map AAA standard and surfaced below as candidate open directions, since the charter is silent.

## Contract & docs fit

**Lives up to the contract:**

- **Full unabbreviated names, 1:1 with `@flighthq/surface`** — the whole point, honored precisely. Rust binding names (`gaussian_blur_surface_wasm`) stay internal; the public surface is pure TS naming.
- **`out`-params and aliasing** — `out`/`scratch`/`dest` outputs mirror the reference; `runRegionPair` reproduces the reference's alias-safe version-bump contract, and the new `in-place aliased dest/source` tests pin it.
- **Sentinels not throws** — `getSurfaceColorBoundsRectangle` returns `null` when not found; threshold/ dissolve return counts. No error-wrapping types.
- **Single root `.` export, `sideEffects: false`, lazy init** — all present; no top-level instantiation.
- **`crate: null` is correct.** surface-rs is on CONTRACT's explicit `null`-crate list. It is a TS shim over the `flighthq-surface-wasm` crate (which _does_ exist in the bundle), not a 1:1 TS↔Rust mirror — so it has no same-named `flighthq-surface-rs` crate, which is the intended shape per the Rust map's "Mixing" section (surface is the lead Wasm-mixable value-typed leaf).
- **Types home.** Surface option types are imported from `@flighthq/surface`; cross-package primitives (`ColorTransformLike`, `PixelOrder`, `SurfaceRegion`, `ThresholdOperation`, `BlendMode`) from `@flighthq/types`. Consistent with the current layout.

**Candidate contract / admin-doc revisions (user's gate, not mine):**

- **The Package Map has no `surface-rs` line.** The codebase-map `Package Map` lists `@flighthq/surface` but not `@flighthq/surface-rs`, even though CONTRACT.md explicitly enumerates surface-rs among the `crate: null` packages and the Rust map names it as the canonical Wasm-mixing example. The map should carry a one-line entry (the wasm-backed drop-in, neighbor of `surface`).
- **Test `describe` order.** The new mechanical-gate blocks (`wasm shadow conformance`, `wasm discriminant map cardinality`) do not correspond to exported functions, so they cannot mirror the source's alphabetized export order the way the per-op blocks do. This is a reasonable exception (they are cross-cutting gates, not per-function tests), but it is a place where the strict "describe blocks mirror exported function names" convention does not cleanly apply — worth a noted carve-out if `order:check` ever tightens here.
- **Binding wire-types are inline, not in `@flighthq/types`.** The `descOf` 6-element region pack, the 256-byte channel map, the 1024-entry histogram, and the rect 4-tuple are expressed as inline typed arrays rather than named `@flighthq/types` shapes. Functional today; the worker flagged a future types-first audit. Whether these binding-internal marshalling shapes _belong_ in the header layer at all (they are wasm-ABI details, arguably package-private) is itself an open question — see below.

**Status-doc vs. diff drift (minor):** the worker status lists "BlendMode discriminant audit" as a _Suggestion for Future Sessions_ (#3) and notes "BlendMode discriminant map is not in surfaceWasm.ts" as a _Concern_ — but the realized diff already performed that audit: the 15-variant comment block and the `BlendMode passes 15 variants` cardinality test are both present this session. The suggestion is stale; the work landed. (No code problem — a narrative/diff mismatch only.)

**Unverifiable in this environment:** tests cannot run (the wasm binary + glue are gitignored and require `npm run wasm` with a Rust toolchain, absent here). The new tests are syntactically and semantically valid and assert against the reference; correctness of the _claim_ that they pass is taken on the worker's word plus my static read. The discriminant maps and BlendMode decode were verifiable statically and check out.

## Candidate open directions

The charter is a stub past `What it is`; each of these is a question I had to assume an answer to.

1. **The `apply*FilterToSurface` interposition seam — injection vs. sibling package.** Should the ergonomic filter wrappers get the wasm path, and if so via an injection seam in `@flighthq/surface`/`@flighthq/filters-surface` or a sibling `@flighthq/filters-surface-rs`? This is a real cross-package design fork (the largest remaining depth gap) and belongs in the charter's Open directions, not a within-package recommendation.
2. **Fingerprint/compare acceleration — in scope for this binding?** Are the full-buffer scans (`createSurfaceFingerprint`, `compareSurface`, `getSurfaceMismatch`) inside surface-rs's mandate, or deliberately left as JS because they are test/diagnostic-time? Decide the boundary so it stops being "borderline."
3. **Boundaries / non-goals.** The charter's `Boundaries` is empty. The package has a clear implicit boundary (accelerate bulk per-pixel ops; never reimplement allocation, browser-API, or string work) that should be written down so future sessions do not over-extend it.
4. **Drift-guard ceiling — comments now, generated bridge later?** The discriminant maps are guarded by cross-reference comments + cardinality tests today; the Gold roadmap wants a generated `repr(u8)` bridge emitted from the Rust crate. Is the comment-plus-test guard sufficient (a Decision to record), or is the generated bridge a committed goal?
5. **Where do binding wire-types live?** Decide whether the wasm-ABI marshalling shapes are package-private details (stay inline) or header-layer types (move to `@flighthq/types`). This affects the Gold types-first audit and is a genuine layering question, not a mechanical rename.
6. **Mixing posture (per structural-forks fork D).** surface is the lead Wasm-mixable leaf. Is shipping surface-rs as a standalone `surface-rs` NPM drop-in (the Rust map's named example) an actual goal of this package, or is it only the in-repo acceleration path? The answer shapes what "authoritative" means here.
