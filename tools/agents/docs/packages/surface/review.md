---
package: '@flighthq/surface'
status: authoritative
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/surface.md
  - source
  - changes.patch
  - charter.md
---

# surface — Review

Evidence: `incoming/builder-67dc46d64/head/packages/surface/` (`src/` + `dist/*.d.ts`) and the bundle `changes.patch`. Findings reference `67dc46d64:<path>`. The prior depth review (`reviews/depth/surface.md`, 88/100) and the maturation roadmap (`reviews/maturation/depth/surface.md`) both still exist and are absorbed here; this survey supersedes them. The charter's "What it is" is the only non-stub section (North star / Boundaries / Decisions are all `TODO`), so most of "what good means here" falls back to the codebase-map AAA standard for a software raster library and is flagged as candidate Open directions.

## Verdict

`authoritative — 90/100`. This is the model package the depth review already called it: 92 exported functions across 41 source files, every file colocated-tested (338 `it`s), covering the full `BitmapData` surface area plus a deep slice of canonical software-raster image processing. The Bronze maturation tier landed in full and a chunk of Silver beyond it. The score rises over the prior 88 because the named depth gaps (gradient fill, affine warp, alpha utilities, crop/pad/extend, channel split/merge, tone/curves, the `scrollSurface` hidden-state fix) are now real. It is held _below_ the worker's self-estimated 96 by two concrete defects this review verified against the diff — a new `surfaceWarp.ts` that is fully implemented and tested but **never wired into the barrel** (dead public API), and a surviving module-level hidden-state buffer in `surfaceMedian.ts` of exactly the category the `scrollSurface` fix was meant to eliminate — plus a stub charter that leaves the package's bar unstated and a status doc whose inventory has drifted from the code.

## Present capabilities (verified against source)

The package keeps everything the prior depth review inventoried (pixel access, copy/composite with the full OpenFL `BlendMode` table, resize with nearest/bilinear/bicubic-premultiplied, arbitrary-angle rotate, the blur/shadow/glow/bevel suite, color-matrix algebra, value+Perlin noise, histogram/coverage/ mismatch analysis, and the perceptual `SurfaceFingerprint` quartet). New this pass, all confirmed present and exported from the barrel (`67dc46d64:src/index.ts`):

- **Gradient fill** (`surfaceGradientFill.ts`): `fillSurfaceLinearGradient(dest, ramp, x0, y0, x1, y1, spread?)` and `fillSurfaceRadialGradient(dest, ramp, cx, cy, radius, focalX?, focalY?, spread?)` — paint a 256-entry RGBA ramp into a region with `pad`/`repeat`/`reflect` spread. This closes the depth review's highest-value gap; the ramp half (`buildSurfaceGradientRamp`) already existed.
- **General affine warp** (`surfaceAffine.ts`): `transformSurface(dest, source, matrix, edgeMode?, sampleMode?)` — full 2×3 affine in one resample, all four `SurfaceEdgeMode` values and all three `SurfaceResizeMode` sampling qualities.
- **Alpha-channel utilities** (`surfaceAlpha.ts`): `copySurfaceAlpha`, `multiplySurfaceAlpha` (the "fade" primitive, factor clamped to [0,1]), `setSurfaceAlpha` (constant alpha, clamped to [0,255]). `copySurfaceAlpha` reads alpha into a local before writing, documented alias-safe — verified.
- **Crop / pad / extend allocators** (`surfaceCrop.ts`): `cropSurface(source, rect)` → new `Surface`, `extendSurface(source, l, t, r, b, edgeMode?, fillColor?)` → padded `Surface`, `trimSurface(source)` → tightest non-transparent bounds (1×1 transparent when fully transparent). These return resized buffers, distinct from the `SurfaceRegion` sub-rect views.
- **Channel split/merge** (`surfaceChannel.ts`): `splitSurfaceChannels(source)` → `[Surface, Surface, Surface, Surface]`, `mergeSurfaceChannels(out, r, g, b, a)`.
- **Tone / curves** (`surfaceTone.ts`): `applySurfaceCurve(out, source, redLut, greenLut, blueLut, alphaLut?)` (per-channel 256-entry LUTs, `null` channel = unchanged, alias-safe) and `applySurfaceLevels(out, source, blackPoint?, whitePoint?, gamma?)` (builds a LUT internally). This is the nonlinear half of the color toolkit the matrix algebra lacked.
- **`scrollSurface` hidden-state fix** (`surfaceTransform.ts`): signature is now `scrollSurface(out, dx, dy, scratch)`, caller-provided scratch — the lone module-level `_scrollScratch` the depth review flagged is gone.
- **`floodFillSurface` followed suit**: signature is now `floodFillSurface(out, x, y, color, visited)`, taking a caller-provided `Uint8Array` visited buffer (`67dc46d64:src/surfaceFill.ts:44`). This is a bonus fix beyond the Bronze list, addressing the same hidden-state category the status doc itself raised as a concern.

The Bronze types landed in `@flighthq/types`: `GradientSpread` (`'pad' | 'reflect' | 'repeat'`) and `SurfaceEdgeMode` (`'clamp' | 'mirror' | 'transparent' | 'wrap'`), both re-exported from the surface barrel. Naming, `out`/`dest`/`source` ordering, allocation-verb discipline, and per-function alias documentation remain exemplary throughout.

## Gaps (vs the AAA raster-library target; charter silent, codebase-map standard applies)

The package is genuinely deep; the remaining gaps are frontier (Gold-tier) plus two defects (moved to Contract & docs fit). Vs a from-scratch reference raster library:

- **Perspective warp is implemented but unreachable.** `warpSurface` (full 3×3 homography, inverse-mapped, all edge/sample modes) and `warpSurfaceQuad` (4-corner DLT homography) are fully written and tested (`surfaceWarp.test.ts`, 10 `it`s), but `surfaceWarp.ts` is **not** in `src/index.ts` and produces no `dist/surfaceWarp.d.ts` — so the Silver "perspective warp" item is effectively _not shipped_ despite being authored. (Detailed under Contract & docs fit; flagged as a gap because from the consumer's view the capability is absent.)
- **No surface-level alpha-type converter.** `convertSurfaceAlphaType(out, target)` and a `createSurface(width, height, color?, alphaType?)` argument are absent; `alphaType` is still fixed at `'straight'` at creation. The pixel-array `premultiplySurfacePixels`/`unpremultiplySurfacePixels` helpers exist, but no `Surface`-level straight↔premultiplied op.
- **Noise breadth still partial.** Only value + Perlin (octaves, grayscale) are present. No `fillSurfaceSimplexNoise`/`fillSurfaceWorleyNoise`/`fillSurfaceTurbulence`, and `fillSurfacePerlinNoise` still lacks OpenFL `perlinNoise` parity (`stitch`/seamless, `channelOptions`, `fractalSum` vs `turbulence` mode, offsets).
- **Sampling not unified.** `resizeSurface`/`rotateSurface` still handle borders with implicit behavior rather than routing through the shared `SurfaceEdgeMode`; the new affine/warp paths use the enum, but the older geometric ops do not, so border behavior is inconsistent across ops (the depth review's cross-op-consistency note).
- **Gold frontier untouched (correctly):** wide-gamut/color-management (`convertSurfaceColorSpace`, linear-light resample/blur), higher-bit-depth backing (`createSurfaceF32`), distance fields / generalized morphology (`computeSurfaceSignedDistanceField`, `morphSurface`, `applySurfaceUnsharpMask`), seamless/Poisson blend, a `@flighthq/surface-formats` codec neighbor, and a SIMD performance tier. All of these need cross-package design decisions or a new package and are out of a within-package sweep.

Missing-by-design (correctly absent): vector path rasterization, text, the drawing API (`path`/ `displayobject`/`text` own those); GPU-side filtering (the renderer packages own that — this package is the explicit CPU/user-facing path).

## Charter contradictions

None against a blessed rule — North star, Boundaries, and Decisions are all `TODO`, so there is nothing yet to contradict. The "What it is" line (the `BitmapData` lineage plus a slice of ImageMagick/Pixman/ tiny-skia raster ops) matches the code precisely. One soft tension: the charter's framing implies a broad, finished raster library, and the implementation is close to that — but the _unexported warp_ and the _surviving hidden-state buffer_ are the two places the code quietly falls short of the "every allocation explicit / single coherent public surface" spirit the codebase map mandates. Not a charter violation (no rule exists), but worth recording so the charter, when authored, can make those bars explicit.

## Contract & docs fit

**Lives up to the contract:** full unabbreviated `Surface` type words on every export (`fillSurfaceLinearGradient`, `applySurfaceLevels`, not abbreviated forms); `out`/`dest`/`source` ordering uniform; allocation verbs (`create*`/`clone*`/`crop*`/`extend*`/`trim*`) cleanly separated from in-place out-param ops; sentinel discipline (`getSurfaceColorBoundsRectangle` → `RectangleLike | null`, `compareSurface` → `Surface | null`, `parseSurfaceFingerprint` → `SurfaceFingerprint | null`); types-first (`GradientSpread`, `SurfaceEdgeMode` defined in `@flighthq/types` before use); single `.` export; `sideEffects: false`; no module-top-level registration. `@flighthq/entity` and `@flighthq/resources` are both genuinely used (entity in `surface.ts`/`surfaceCrop.ts`/`surfaceChannel.ts`/`surfaceFrom.ts`; `invalidateImageResource` across ~20 files) — no dead deps. The Rust crate `flighthq-surface` tracks the additions: `affine.rs`, `alpha.rs`, `crop.rs`, `channel.rs`, `tone.rs`, `gradient_fill.rs` all present, mirroring the TS files 1:1. Good contract hygiene overall.

**Defects / candidate revisions:**

- **`surfaceWarp.ts` is dead public API — not in the barrel (defect).** The file fully implements `warpSurface` and `warpSurfaceQuad` with a colocated 10-`it` test that passes, but `src/index.ts` does not `export * from './surfaceWarp'` (verified in both `src/index.ts` and the `index.ts` diff), and no `dist/surfaceWarp.d.ts` is emitted. A consumer importing from `@flighthq/surface` cannot reach either function. This is a one-line fix (add the barrel line) but until it lands the work is invisible to users and to `npm run api`. The colocated test still runs, so `exports:check` does not catch it — the function is "tested" but not "exported from the package," a gap the checks miss. Either wire it into the barrel (shipping the Silver perspective-warp item) or remove the file if it was committed prematurely.
- **`surfaceMedian.ts` keeps module-level mutable scratch (defect, same category as the fixed `scrollSurface`).** `67dc46d64:src/surfaceMedian.ts:78-81` declares `let _windowRed/_windowGreen/ _windowBlue/_windowAlpha: Uint8Array | null = null` — hidden, retained, shared mutable state, exactly the no-hidden-state violation the Bronze `scrollSurface(... , scratch)` and the bonus `floodFillSurface(..., visited)` fixes were meant to eliminate. `medianSurface` should take a caller-provided scratch (or the retained buffers should be documented as a deliberate exception). The status doc flagged `floodFillSurface` as the remaining instance and missed this one; the package now has one surviving hidden-state op.
- **`scrollSurface`/`floodFillSurface` TS↔Rust divergence is recorded but asymmetric.** The status notes the Rust `scroll_surface` keeps a local `.clone()` (idiomatic) while TS now requires a caller-scratch — an intentional, behavior-identical divergence. Reasonable, but it is recorded only in the status doc, not the conformance divergence map; if `floodFillSurface` got the same treatment in Rust it should be recorded there too. (Cross-doc; flagged for the conformance-map owner, not a surface defect.)
- **Rust has no `warp.rs`.** Symmetric-by-accident: TS warp exists-but-unexported, Rust warp is simply absent. If the barrel fix ships TS warp, the paired `flighthq-surface::warp` must land to keep the 1:1 conformance the rust map requires. Track together.

**Where the admin docs are stale vs the code (candidate revisions):**

- **Status doc inventory has drifted.** It claims "40 test files, 322 tests" — actual is **41 files, 338 `it`s** (the warp file and its 10 tests are uncounted). It lists perspective warp as _deferred ("Omitted to keep this session focused")_ — but `surfaceWarp.ts` is present and tested. It raises a `GradientSpread` vs `SpreadMethod` consolidation concern citing "an existing `SpreadMethod` in types for the filters package" — but `SpreadMethod` exists only inside `ShapeCommand.ts` (the shape package's gradient descriptor), not as a filters/surface-adjacent type, so the consolidation concern as written is imprecise. These are status-as-claimed errors the review corrects; the durable `status.md` should carry the verified numbers.
- **Package Map line is understated but not wrong.** The map says "Pixel-level manipulation of `ImageSource` values — read from or generate image data." This is accurate but dramatically undersells a 92-function library; the depth review already noted the one-liner hides the scope. A fuller line (the `BitmapData` + raster-ops framing from the charter) would set correct expectations. Candidate revision for the map owner, not a defect.

## Candidate open directions (charter is a stub — the questions it should settle)

1. **North star.** What is the durable bar? Likely: explicit allocation everywhere (no hidden module buffers — which makes the `surfaceMedian` fix a North-star item, not a nicety), value-in/value-out leaf purity (the Wasm-mixing lead), and 1:1 Rust conformance as a hard gate. Confirm so future work is judged against it.
2. **Alpha-type model.** Should `createSurface` accept an `alphaType` and should there be a `convertSurfaceAlphaType(out, target)` surface-level op? This is a small public-shape change (touches every `createSurface` callsite) — fine pre-release, but it is a decision.
3. **Sampling unification.** Route `resizeSurface`/`rotateSurface` border handling through the shared `SurfaceEdgeMode` so all geometric ops behave consistently — a signature change to existing ops. Settle whether cross-op border consistency is a goal worth the churn.
4. **`@flighthq/surface-formats` neighbor.** Approve/deny a codec package (PNG/JPEG/GIF/WebP/BMP/TGA decode/encode + animated-frame reader) under the subject-triad `-formats` pattern, keeping codec weight out of the core bundle; native-first means the Rust side uses `image-rs`. Plurality is clearly satisfied (≥2 formats). Cross-package / new cell.
5. **Wide-gamut & higher-bit-depth.** `convertSurfaceColorSpace` and `Float32`/`Uint16` backing change `Surface`/`PixelFormat` in `@flighthq/types` and ripple into every renderer — a cross-boundary design decision the worker correctly refused to act on autonomously.
6. **Wasm-mixing leaf (fork D).** `surface` is the named lead for the `surface-rs` wasm-mixing seam (value-in/value-out pixel buffers, near-zero-copy). Confirm whether shipping that NPM drop-in is in scope, since it shapes how strictly the package must stay plain-data at its boundary.
7. **GPU/backend seam.** Likely out of scope by design (this package is the explicit CPU path) — record the decision to leave GPU filtering to the renderer packages rather than building a `SurfaceBackend`.

## Notes for status verification (as-claimed → verified)

The Bronze and Silver _function_ inventory the status claims is real and present in source and the barrel (gradient fill, affine, alpha trio, crop/extend/trim, channel split/merge, tone curves/levels, `scrollSurface` scratch fix). Corrections against the diff: (1) test counts are 41 files / 338 `it`s, not 40 / 322; (2) perspective warp is **not** deferred — it is implemented and tested but unexported; (3) the `floodFillSurface` "remaining hidden-state" concern is now _fixed_ (it takes `visited`), but a **new** hidden-state instance the status missed survives in `surfaceMedian.ts`; (4) the `SpreadMethod` consolidation concern is imprecise (`SpreadMethod` lives only in `ShapeCommand.ts`). The Rust additions could not be compiled in the worker's environment (no `cargo`) and remain unverified beyond file presence; the conformance gate is the real check.
