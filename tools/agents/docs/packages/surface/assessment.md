---
package: '@flighthq/surface'
updated: 2026-06-24
basedOn: ./review.md
---

# surface — Assessment

Sorted from `review.md` (score `authoritative — 90`), absorbing the prior `reviews/maturation/depth/surface.md` roadmap (Bronze landed in full; the items below are what remains of Silver/Gold plus the two defects the review verified). The charter is still a stub — North star, Boundaries, and Decisions are all `TODO` — so anything touching the public shape (an `alphaType` argument, sampling unification, a codec neighbor, wide-gamut) is an Open direction, not a sweep. That keeps `Recommended` small and genuinely sweep-safe: the two in-source defects and one bonus hidden-state fix, all within `@flighthq/surface` with no public-signature break. Every structural fork the review raises (the `surface-formats` triad cell, the Wasm-mixing leaf, wide-gamut/bit-depth types) is routed to the charter's Open directions.

## Recommended

Strictly sweep-safe: within `@flighthq/surface`, no cross-package coupling, no breaking change, no open design decision.

- **Wire `surfaceWarp.ts` into the barrel (or remove the file).** `warpSurface` and `warpSurfaceQuad` are fully implemented and pass a colocated 10-`it` test, but `src/index.ts` has no `export * from './surfaceWarp'`, so neither function is reachable from `@flighthq/surface` and no `dist/surfaceWarp.d.ts` is emitted. Add the one barrel line (placing it alphabetically between `./surfaceTransform` and the type block, matching file order) to ship the already-written Silver perspective-warp item. If the file was committed prematurely, remove it and its test instead. Pure in-package wiring, no signature change. Pair the Rust side: add `crates/flighthq-surface/src/warp.rs` (`warp_surface`/`warp_surface_quad`) so the 1:1 mirror holds — see Backlog if Rust cannot be built in the executing environment. — review.md (Gaps: "perspective warp implemented but unreachable"; Contract & docs fit, defect 1).

- **Remove the module-level hidden-state scratch in `surfaceMedian.ts`.** `surfaceMedian.ts:78-81` declares retained `let _windowRed/_windowGreen/_windowBlue/_windowAlpha: Uint8Array | null` — the same no-hidden-state violation the Bronze `scrollSurface(..., scratch)` and the bonus `floodFillSurface(..., visited)` fixes eliminated. Change `medianSurface` to take a caller-provided scratch buffer (same pattern as `scrollSurface`), removing the module-level buffers; update the colocated test and the paired `flighthq-surface` `median` function to match. This is a public-signature change to one function, but it is pre-release, in-package, and the _established_ fix pattern for this exact category — sweep-safe under the no-compat-shim rule. — review.md (Contract & docs fit, defect 2; Gaps).

- **Correct the status doc's verified numbers and warp claim.** `status.md` records "40 test files, 322 tests" (actual 41 / 338), lists perspective warp as deferred (it is present and tested), and raises an imprecise `GradientSpread` vs `SpreadMethod` concern (`SpreadMethod` lives only in `ShapeCommand.ts`). Append a verified-correction note to the durable `status.md` so the continuity log is not carrying as-claimed errors. (Docs-only, within the package cell.) — review.md (Contract & docs fit, stale-docs; Notes for status verification).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Rust `warp.rs` + conformance-map entry for the scroll/flood divergence.** The TS warp barrel fix (Recommended) needs a paired `flighthq-surface::warp` to keep the 1:1 mirror, and the intentional `scrollSurface`/`floodFillSurface` TS-scratch-vs-Rust-clone divergence should be recorded in the conformance divergence map, not only the status doc. **Parked:** the worker could not compile Rust (no `cargo`), and the conformance map has a separate owner. Bundle with the barrel fix the moment a Rust environment is available.

- **`convertSurfaceAlphaType` + `createSurface(alphaType?)`.** Surface-level straight↔premultiplied conversion and an `alphaType` creation argument. **Parked:** a public-shape change to `createSurface` that touches every callsite, and the alpha-type model is an Open direction the charter must settle before the signature is changed.

- **Sampling unification through `SurfaceEdgeMode`.** Route `resizeSurface`/`rotateSurface` border handling through the shared edge-mode enum so all geometric ops behave consistently. **Parked:** a signature change to existing ops whose value (cross-op border consistency) is a design judgment, not a defect — Open direction.

- **Noise breadth to OpenFL `perlinNoise` parity.** `fillSurfaceSimplexNoise`/`fillSurfaceWorleyNoise`/ `fillSurfaceTurbulence` and extending `fillSurfacePerlinNoise` with `stitch`/`channelOptions`/ `fractalSum`-vs-`turbulence`. **Parked:** independent and in-domain, but a larger build (multiple new functions + paired Rust) than a sweep; a focused session, not a blanket-approval item. Could be promoted to Recommended once scoped, since it needs no design decision.

- **`@flighthq/surface-formats` neighbor package.** PNG/JPEG/GIF/WebP/BMP/TGA decode/encode + animated-frame reader under the subject-triad `-formats` pattern (plurality clearly satisfied; Rust uses `image-rs`). **Parked:** a new package — cross-package scope expansion needing a Package Map entry and a charter pass. Routed to Open directions.

- **Wide-gamut / color-management and higher-bit-depth backing.** `convertSurfaceColorSpace`, linear-light resample/blur, `createSurfaceF32`. **Parked:** changes `Surface`/`PixelFormat` in `@flighthq/types` and ripples into every renderer — a cross-boundary design decision; the worker correctly declined to act autonomously. Routed to Open directions.

- **Gold frontier: distance fields / generalized morphology / seamless blend / SIMD performance tier.** `computeSurfaceSignedDistanceField`, `morphSurface(out, kernel, op)`, `applySurfaceUnsharpMask`, `applySurfaceSeamlessBlend`, and a documented SIMD/WASM-SIMD fast-path tier. **Parked:** high-complexity standalone additions; the SIMD tier is environment-dependent and blocked on the Wasm build strategy. Larger than a sweep.

- **Wasm-mixing `surface-rs` leaf (fork D).** Ship the Rust `surface` crate as a wasm NPM drop-in. **Parked:** a scope/seam decision (does Flight publish the mixing leaf?) that shapes how strictly the package boundary must stay plain-data. Routed to Open directions.

- **Package Map line expansion.** The map's "Pixel-level manipulation of `ImageSource` values" undersells a 92-function library. **Parked:** the map is owned outside this cell; candidate revision for the map owner, not in-package work.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). These are the design forks that keep the bulk of the backlog parked:

1. **North star** — confirm the durable bar: explicit allocation everywhere (no hidden module buffers — which elevates the `surfaceMedian` fix from polish to principle), value-in/value-out leaf purity, and 1:1 Rust conformance as a hard gate.
2. **Alpha-type model** — should `createSurface` take an `alphaType` and is there a surface-level `convertSurfaceAlphaType`? (small public-shape change).
3. **Sampling unification** — route the older geometric ops' border handling through `SurfaceEdgeMode` for cross-op consistency? (signature change to existing ops).
4. **`@flighthq/surface-formats`** — approve/deny the codec neighbor under the triad `-formats` pattern (plurality satisfied; native-first → `image-rs`). New package.
5. **Wide-gamut & higher-bit-depth** — `convertSurfaceColorSpace`, `createSurfaceF32`; a `Surface`/`PixelFormat` change in `@flighthq/types` that ripples into every renderer.
6. **Wasm-mixing `surface-rs` leaf (fork D)** — is publishing the value-typed wasm drop-in in scope?
7. **GPU/backend seam** — record the (likely) decision to leave GPU filtering to the renderer packages rather than building a `SurfaceBackend`, keeping this the explicit CPU path.
