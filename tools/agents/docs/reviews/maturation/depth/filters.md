# Maturation Roadmap: @flighthq/filters

**Current verdict:** solid — 72/100. A correct, tree-shakable descriptor factory layer with authoritative-grade blur math (`blurMath.ts`), but otherwise thin: it lacks the kind-catalog, clone/equals/normalize, color-matrix presets, convolution kernel builders, and quality→passes bridge that turn a folder of one-line factories into a real descriptor library.

Scope reminder: this package owns **descriptors + backend-independent filter math only**. Rasterization, CSS-string emission, GL/WGPU recipes, and bounds expansion stay in the `filters-canvas` / `filters-css` / `filters-gl` / `filters-wgpu` / `filters-surface` backends. Type contracts live in `@flighthq/types`. Nothing below should pull in a backend or break `"sideEffects": false`. The blur/motion **effects** (`MotionBlurEffect`, `RadialBlurEffect`, `DirectionalBlurEffect`, `CameraMotionBlurEffect`, `DisplacementEffect`) are the `RenderEffect` family, not `BitmapFilter` — out of scope here; do not absorb them.

## Bronze

The 20% that delivers 80% of the value: a typed kind catalog, the missing descriptor-ergonomics trio, color-matrix presets, and the quality bridge. All pure data/math, no backend coupling.

- **`BitmapFilterKind` catalog** (in `@flighthq/types` first, re-exported here). String constants for every concrete kind: `BlurFilterKind = 'BlurFilter'`, `DropShadowFilterKind`, `InnerShadowFilterKind`, `InnerGlowFilterKind`, `OuterGlowFilterKind`, `GradientGlowFilterKind`, `GradientBevelFilterKind`, `BevelFilterKind`, `ColorMatrixFilterKind`, `ConvolutionFilterKind`, `DisplacementMapFilterKind`, `MedianFilterKind`, `PixelateFilterKind`, `SharpenFilterKind`. Replace every magic `kind: 'BlurFilter'` literal in the constructors with the constant.
- **Per-kind narrowing guards.** `isBlurFilter(filter): filter is BlurFilter`, `isDropShadowFilter`, `isColorMatrixFilter`, `isConvolutionFilter`, `isDisplacementMapFilter`, `isBevelFilter`, `isGradientGlowFilter`, `isGradientBevelFilter`, `isInnerGlowFilter`, `isInnerShadowFilter`, `isOuterGlowFilter`, `isMedianFilter`, `isPixelateFilter`, `isSharpenFilter`, plus a base `isBitmapFilter(x): x is BitmapFilter` (has a string `kind`). Sentinel-style: return `false`, never throw.
- **`cloneBitmapFilter(filter): BitmapFilter`** — structural deep copy (matrices/arrays copied, not aliased). Allocating, so `clone*` named per the geometry ownership rule.
- **`copyBitmapFilterInto(out, filter)`** / out-param variant for hot reuse where the caller owns `out` of the matching kind. Alias-safe (read inputs into locals before writing).
- **`equalsBitmapFilter(a, b): boolean`** — structural equality including array contents; kind mismatch returns `false`.
- **`normalizeBitmapFilter(filter): Readonly<BitmapFilter>`** — apply the canonical Flash defaults once (blurX/blurY, quality=1, strength=1, angle=45, distance=4, knockout=false, inner/hideObject defaults, etc.) so the five backends stop re-defaulting independently. Returns a fully-specified descriptor. Define the default values as exported constants (`DEFAULT_BLUR_QUALITY`, etc.) so backends can reference them.
- **`getBlurPassCountForQuality(quality): number`** — the canonical Flash `quality` 1–3 → pass-count bridge that `blurMath` already presumes but nobody exposes. Clamp out-of-range; do not throw.
- **Color-matrix presets (the biggest by-omission gap).** Pure 4×5 math, exactly like `blurMath`:
  - `createIdentityColorMatrix(): number[]`
  - `createGrayscaleColorMatrix(): number[]` (luma-weighted desaturate)
  - `createSaturationColorMatrix(amount): number[]`
  - `createBrightnessColorMatrix(amount): number[]`
  - `createContrastColorMatrix(amount): number[]`
  - `createInvertColorMatrix(): number[]`
  - `createColorMatrixFilter` length validation: a 20-number array is required; wrong length → throw (programmer error / API misuse), matching the SDK "throw only on misuse" rule, and removing the current silent footgun.
- **`COLOR_MATRIX_LENGTH = 20` constant** exported for backends/validation reuse.

## Silver

Competitive with a well-regarded descriptor/color library: full color-matrix algebra, convolution kernel builders, serialization round-trip, and a complete defaulting/validation surface.

- **Color-matrix combinators & remaining presets:**
  - `multiplyColorMatrix(a, b, out?)` — compose two 4×5 matrices (the canonical "apply B then A") with an out-param hot path.
  - `concatColorMatrix(target, source)` — in-place compose, matching OpenFL `ColorMatrixFilter.concat` semantics.
  - `createHueRotateColorMatrix(degrees)`, `createSepiaColorMatrix()`, `createDesaturateColorMatrix(amount)`, `createColorMatrixFromTint(color, amount)`, `createOpacityColorMatrix(alpha)`.
  - `applyColorMatrixToColor(matrix, packedRgba): number` — evaluate the matrix against one packed `0xRRGGBBAA` value (useful for previews/tests; pure math, no surface).
- **Convolution kernel builders** (pure matrices + dimensions; pair with `createConvolutionFilter`):
  - `createSharpenKernel(amount?)`, `createBoxBlurKernel(size)`, `createGaussianKernel(size, sigma)`, `createEdgeDetectKernel()`, `createEmbossKernel(angle?)`, `createOutlineKernel()`, `createLaplacianKernel()`.
  - `createSharpenFilter` upgraded to internally compose a real `ConvolutionFilter` (or expose `getSharpenKernel(filter)`) so its descriptor is no longer an opaque marker.
  - `normalizeConvolutionKernel(matrix, out?)` — compute/divide by the kernel sum to a unit-gain divisor; `getConvolutionDivisor(matrix)`.
- **Serialization round-trip seam:**
  - `fromBitmapFilterData(data): BitmapFilter | null` — validate + reconstruct an untrusted scene-JSON object into a typed descriptor (sentinel `null` on unknown/invalid kind), the inbound counterpart to the already-serializable string kinds. Backed by a kind→reconstructor registry keyed off `BitmapFilterKind`.
  - `toBitmapFilterData(filter): Readonly<Record<string, unknown>>` — explicit plain-data projection (today it is identity, but pinning it as the seam protects against future runtime fields).
  - Round-trip test asserting `fromBitmapFilterData(toBitmapFilterData(f))` equals `f` for every kind.
- **Validation surface:** `isValidBitmapFilter(filter): boolean` (kind known + required fields present + array lengths/ranges sane), used by `fromBitmapFilterData`. Range clamps centralized: `clampFilterQuality`, `clampFilterStrength`.
- **`enumerateBitmapFilterKinds(): ReadonlyArray<Kind>`** — the canonical built-in kind list for tooling/inspectors.
- **`-formats` neighbor package** if/when an importer is needed (e.g. parsing OpenFL/SWF filter blobs or Lottie effect stacks): `@flighthq/filters-formats`, keeping the parser dependency out of the core descriptor package per the formats-neighbor pattern. Surface to the user before building — it depends on which import formats matter.
- **Blur math completeness:** `computeBlurSizeForRadius(radius)` / `computeGaussianSigmaForBlur(blurAmount, passes)` inverse helpers so backends share the sigma↔Flash-`blur` mapping, not just sigma→radius.
- **Filter-stack helpers** (still pure data): `cloneBitmapFilterList(filters)`, `equalsBitmapFilterList(a, b)` for the common case of a display object carrying an ordered list of filters.

## Gold

Authoritative descriptor reference: exhaustive presets, signals for live-edited filter stacks, full edge-case/error handling, complete tests and docs, and 1:1 Rust parity.

- **Exhaustive color-matrix library:** `createColorBalanceColorMatrix`, `createLevelsColorMatrix(black, white, gamma)`, `createChannelMixerColorMatrix`, `createColorMatrixFromCurves`, `createWhiteBalanceColorMatrix(temperature, tint)`, `invertColorMatrix(matrix, out?)` (true 4×5 affine inverse where defined; `null` when singular), and named photographic presets (`createVintageColorMatrix`, `createPolaroidColorMatrix`, `createTechnicolorColorMatrix`, etc.) shipped as data constants so they tree-shake individually.
- **Exhaustive convolution kernels:** parameterized Gaussian/box/motion-blur/sharpen/unsharp-mask/Sobel-X/Sobel-Y/Prewitt/high-pass/low-pass/Gabor builders, each with separability metadata (`isSeparableKernel`, `getSeparableKernelFactors`) so GPU backends can choose 1D passes — pure math the backends consume, no rasterization here.
- **`enableBitmapFilterSignals(...)` group** (defined here, dispatched via `@flighthq/signals`) for editors/inspectors that mutate live filter descriptors and need change notification (`onFilterChanged`), opt-in per the enable\*-group rule. Off by default; zero cost when not enabled.
- **Bounds-math seam (descriptor side only):** `getBitmapFilterMargin(filter, out?)` returning the per-side pixel expansion a filter needs (blur radius + shadow distance projected by angle, etc.). This is backend-independent geometry the backends currently each recompute; the _application_ of margins to a rectangle stays in the backends, but the math constant belongs here. Surface as a design decision — confirm with the backend owners that this is the right home before moving it.
- **Robustness & edge cases:** zero/negative blur → no-op descriptor normalization; NaN/Infinity guarding in matrix builders; quality clamp to 1–15 (Flash allows up to 15); knockout/inner/hideObject interaction documented; deterministic clone of nested gradient color/ratio/alpha arrays.
- **Complete test coverage:** clone≡copy-into, equals reflexive/symmetric, normalize idempotent, round-trip for every kind, color-matrix preset numeric goldens, kernel sum/divisor goldens, guard exhaustiveness (every kind matched by exactly one `is*`). Wire color-matrix and convolution presets into a `tests/functional` scene across Canvas/DOM/WebGL backends for cross-backend visual parity.
- **Docs:** a package README mapping OpenFL filter classes → Flight descriptors + preset catalog, and a color-matrix recipe cheat-sheet.
- **Rust parity (`flighthq-filters` crate):** 1:1 mirror — `BitmapFilterKind` as `KindId`/string constants, snake_case free functions (`clone_bitmap_filter`, `equals_bitmap_filter`, `normalize_bitmap_filter`, `compute_box_blur_radius`, `create_grayscale_color_matrix`, `multiply_color_matrix(&a, &b, out)` with `&mut` out-params, `from_bitmap_filter_data -> Option<...>`). Add the color-matrix/kernel presets and the blur-math functions to the conformance map and a parity scene so the descriptor math is fingerprint-checked TS↔Rust. (The crate is value-typed leaf math — a strong early conformance/"mixing" target; no GPU, deterministic.)

## Sequencing & effort

Recommended order — each tier is cumulative and the early items unblock the backends immediately:

1. **Bronze, types-first.** Add the `BitmapFilterKind` constants + base `BitmapFilter` already exist in `@flighthq/types`; extend `@flighthq/types` with the kind constants and any default-value constants **before** touching the package (the header is the design surface). Then in `@flighthq/filters`: swap literals for constants, add guards, `clone`/`copy-into`/`equals`/`normalize`, `getBlurPassCountForQuality`, color-matrix presets, and the `createColorMatrixFilter` length validation. Low effort, high leverage — this is the work that lets the five `filters-*` backends delete their duplicated defaulting/guard code. **Coordinate the backend de-duplication as a follow-up** across those packages (cross-package; surface as a suggestion, don't reach across boundaries unprompted).
2. **Silver.** Color-matrix combinators, convolution kernel builders, and the `from/toBitmapFilterData` round-trip seam. Moderate effort; the kernel builders need a small amount of signal-processing care (separability, divisor normalization) but no new dependencies. Decide here whether `@flighthq/filters-formats` is warranted — **defer until a concrete import format (SWF/OpenFL/Lottie) is requested.**
3. **Gold.** Exhaustive presets, the signals group, Rust parity, functional scenes, and docs. The Rust crate and the cross-backend functional scenes are the largest single chunks; the presets are breadth-not-depth and can land incrementally.

**Cross-package / design-decision items to surface (do not act on autonomously):**

- **`getBitmapFilterMargin` ownership** — the bounds-expansion _math_ arguably belongs here, but it currently lives in the backends. Confirm the home with the backend owners before moving it; this is the one item that touches the descriptor/backend boundary.
- **Backend defaulting de-duplication** — once `normalizeBitmapFilter` exists, the `filters-canvas/css/gl/wgpu/surface` packages should consume it instead of re-defaulting. That edit spans five packages; raise it as a coordinated change.
- **`@flighthq/filters-formats`** — only if an import format is on the roadmap.
- **Effect family boundary** — keep `MotionBlurEffect` / `RadialBlurEffect` / `DirectionalBlurEffect` / `CameraMotionBlurEffect` / `DisplacementEffect` out of this package; if they need a descriptor/factory home, that is an `effects` concern, not `filters`. Flag if a task tries to merge them.

**Dependencies:** all Bronze/Silver work depends only on `@flighthq/types` (and `@flighthq/signals` for the Gold signals group). Nothing here introduces a backend dependency or breaks `"sideEffects": false` / the single root `.` export. Run `npm run check` after each tier and `npm run api filters` to confirm naming symmetry and exhaustiveness; `npm run exports:check` after adding any export (each needs a colocated test).
