---
package: '@flighthq/filters'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/filters.md
  - source
---

# filters — Review

## Verdict

solid — **88/100**. Two builder passes turned a thin-but-correct factory layer (72/100 at the prior depth review) into a genuine descriptor library: a `*Kind` catalog with narrowing guards, a clone/equals/normalize/serialize/validate spine, a substantial color-matrix preset library, a convolution-kernel library with separability metadata, the quality→passes bridge, and descriptor-side bounds-expansion (`getBitmapFilterMargin`). It is not the 96/100 the worker claimed — that estimate is self-reported and the remaining-to-100 list it cites (functional test, signals, Rust parity, backend de-dup) is real but the package also carries an internal inconsistency the status doc does not mention (the new dispatch functions hardcode kind literals while the package just migrated everything else off them) plus a known-approximate math caveat or two. It is solidly in upper-`solid` territory and a candidate for `authoritative` once the kind-literal switches and a small set of charter questions are settled. Every status claim I could check against the source is true; nothing was overstated about what exists, only about the score.

## Present capabilities

Grounded in `67dc46d64:packages/filters/src`.

**Descriptor constructors** — one `create*` per filter (`bevelFilter.ts` … `sharpenFilter.ts`, 14 files), each a thin spread over the `@flighthq/types` interface with the `kind` discriminant filled from the imported `*Kind` constant (verified: e.g. `colorMatrixFilter.ts` imports `ColorMatrixFilterKind`). The full OpenFL parameter set is surfaced via the type layer, plus the surface-effect descriptors beyond classic OpenFL (`createMedianFilter`, `createPixelateFilter`, `createSharpenFilter`).

**Kind catalog + guards** (`bitmapFilterGuards.ts`) — `isBitmapFilter` plus 14 per-kind narrowing guards, each comparing against the `*Kind` constant (not a literal). The 14 kind constants live correctly in `@flighthq/types` (`BitmapFilterKind.ts`).

**Descriptor ops** (`bitmapFilterOps.ts`) — `cloneBitmapFilter`/`cloneBitmapFilterList`, `copyBitmapFilterInto` (alias-safe via a deep-copy-then-assign), `equalsBitmapFilter`/`…List` (structural, array-aware), `normalizeBitmapFilter` (per-kind canonical Flash defaults, idempotent), and the nine `DEFAULT_FILTER_*` constants exported so backends can stop re-deriving them.

**Serialization seam** (`bitmapFilterSerialization.ts`) — `enumerateBitmapFilterKinds`, `fromBitmapFilterData` (validates `kind` against a known-kinds `Set`, deep-copies arrays, sentinel `null`), `toBitmapFilterData` (forward-looking projection seam).

**Validation** (`bitmapFilterValidation.ts`) — `isValidBitmapFilter` (kind-aware: checks color-matrix length, convolution `matrix.length === matrixX*matrixY`, gradient array presence), `isValidBitmapFilterList` (sentinel `false` for non-array), and `clampFilterQuality` (1–15) / `clampFilterStrength` (0–255).

**Blur math** (`blurMath.ts`, `blurQuality.ts`) — the package's most algorithmically real code: `computeBoxBlurRadius`, `computeBoxBlurPassRadius`, the new inverse `computeGaussianSigmaForBlurRadius`, and `getBlurPassCountForQuality` (the quality→passes bridge the prior review asked for). The blur-math suite asserts effective-sigma error bounds and the two-width invariant.

**Color-matrix library** (`colorMatrixMath.ts`) — `COLOR_MATRIX_LENGTH`, `applyColorMatrixToColor`, `multiplyColorMatrix` (alias-safe, reads all inputs to locals first), `concatColorMatrix`, and a broad preset set: identity, grayscale, desaturate, saturation, hue-rotate, brightness, contrast, sepia, invert, opacity, tint, channel-mixer, color-balance, levels, white-balance, plus the photographic presets polaroid/technicolor/vintage. Each is a pure number-array factory — no backend coupling, tree-shakable individually.

**Convolution kernels** (`convolutionKernels.ts`) — `ConvolutionKernelData`, box/edge-detect/ emboss(directional)/gaussian(separable)/laplacian/outline/sharpen builders, `getConvolutionDivisor`, `normalizeConvolutionKernel` (alias-safe out-param), and the new separability pair `getSeparableKernelFactors` (pivot outer-product verification, ε=1e-10) / `isSeparableKernel`.

**Shadow geometry** — `getShadowFilterOffset` (`shadowFilterOffset.ts`, pre-existing) and the new `getBitmapFilterMargin` (`bitmapFilterMargin.ts`): per-side pixel expansion for all 14 kinds, alias-safe out-param, never throws, expanding kinds (blur/drop-shadow/outer-glow/gradient-glow/ bevel/gradient-bevel) vs zero-margin inner/pixel-transform kinds.

Architecture/style holds: `sideEffects: false`, only dependency is `@flighthq/types`, all types re-exported from the header, single root `.` export, one colocated test per source file (82 `describe` blocks across 24 test files).

## Gaps

Mostly descriptor-ergonomics tier; the heavy raster work is correctly owned by the `filters-*` backends and is out of scope here.

- **Cross-backend de-duplication not yet realized.** `normalizeBitmapFilter` and the `DEFAULT_FILTER_*` constants now exist _precisely_ to centralize defaulting, but the five `filters-canvas/css/gl/wgpu/surface` packages still carry their own defaulting logic. The seam is built; the consumers have not adopted it. (Cross-package — surfaced, not a within-package gap.)
- **No functional/visual coverage.** Color-matrix and convolution presets have numerical golden tests but no cross-backend render scene confirming, e.g., that `createSepiaColorMatrix` looks like sepia through an actual backend. The worker correctly defers this as needing the `functional-test` skill.
- **Approximate color-matrix presets are sound but lossy by construction.** `createColorBalanceColorMatrix` (three-band model collapsed into a single uniform offset) and `createLevelsColorMatrix` (linear-midpoint gamma approximation) cannot be exact as a 4×5 affine matrix; both document this and point to a LUT in `filters-surface`. This is honest, but a mature library would also expose the LUT path (or a `*ColorLut` builder) so the exact form has a home — currently it is gestured at in a comment with no API.
- **No filter-stack/chain helpers.** There is no `BitmapFilterList` normalize/equals beyond the flat list ops, no composition or flattening of a filter stack into fewer passes, and no `enableBitmapFilterSignals` for live-mutation notification (deferred pending the `@flighthq/signals` dependency decision).
- **No import-format neighbor.** `@flighthq/filters-formats` (OpenFL/SWF/Lottie filter blobs) does not exist; deferred until a concrete format is on the roadmap. Reasonable per the triad plurality guard (no plurality of formats yet).

## Charter contradictions

The charter (`charter.md`) is a stub: "What it is" is seeded from the prior depth review; North star, Boundaries, Decisions, and Open directions are all `TODO`. There is therefore no blessed principle for the code to contradict. The seeded "What it is" line — descriptors plus the one piece of shared blur math — is _narrower_ than what the package now contains: it has grown a full color-matrix and convolution-kernel math library, a serialization/validation spine, and bounds geometry. That is not a contradiction (the charter is unblessed) but it is a signal the identity line needs rewriting to match reality. Flagged below as a candidate open direction.

## Contract & docs fit

**Lives up to the contract:**

- `@flighthq/types`-first: all 14 kind constants and all filter interfaces live in `@flighthq/types`; the package re-exports them and never defines a cross-package type inline.
- Full unabbreviated names throughout (`getBitmapFilterMargin`, `createGradientBevelFilter`, `computeGaussianSigmaForBlurRadius`). Boolean functions use `is*`. Accessors use `get*`.
- Out-params are alias-safe where they exist (`multiplyColorMatrix`, `normalizeConvolutionKernel`, `getBitmapFilterMargin`, `copyBitmapFilterInto`), and the relevant ones read inputs to locals first, as the rule requires.
- Sentinels-not-throws is mostly honored: `fromBitmapFilterData` → `null`, validators → `false`, clamps don't throw.
- Single root export, `sideEffects: false`, lone `@flighthq/types` dependency — clean.
- The crate mirror (`flighthq-filters`) is the right Rust target (pure value math, deterministic, no GPU) and is named for identity; deferred to the Rust pass, consistent with the conformance map.

**Contract-fit drift / candidate revisions:**

- **Closed `switch` on magic kind literals — the most concrete finding (Fork B).** Three new dispatch functions branch on hardcoded string literals instead of the `*Kind` constants the package just migrated everything else onto: `normalizeBitmapFilter` (`bitmapFilterOps.ts`, `case 'BevelFilter'` …), `getBitmapFilterMargin` (`bitmapFilterMargin.ts`, `case 'BlurFilter'` …), and `isValidBitmapFilter` (`bitmapFilterValidation.ts`). The constructors and guards use the constants; these three do not. Two issues at once: (a) an _internal inconsistency_ the status doc did not surface (it claimed the literal→constant migration as done, but only for the constructor files), and (b) the structural-fork question — these closed unions tax every consumer of the pass and re-encode the kind taxonomy in three more places, so a custom/vendor-prefixed filter kind can never be normalized, margin-computed, or validated. Per Fork B the default is a registry; the nuance ("a tight loop within a closed system may keep a closed union") may justify keeping the switch, but at minimum the cases should reference the constants, and the registry-vs-closed decision should be made deliberately rather than by accident. This is the clearest thing standing between `solid` and `authoritative`.
- **`createColorMatrixFilter` throws on wrong length.** This is the one constructor that throws (`colorMatrixFilter.ts`) rather than returning a sentinel. Defensible under the "throw only on programmer error" rule — a wrong-length color matrix is API misuse, not an expected runtime failure — but it is asymmetric with `fromBitmapFilterData`/the validators that return sentinels for bad data, and worth an explicit ruling (throw vs clamp/sentinel) rather than leaving the asymmetry implicit.
- **Package Map line is now understated.** `tools/agents/docs/index.md` describes filters as "blur, glow, bevel, drop-shadow, color-matrix, and convolution filters as plain data descriptors with explicit Canvas/CSS and multi-pass WebGL backends." That omits the color-matrix preset library, the convolution-kernel builders, the serialization/validation spine, and `getBitmapFilterMargin` — the things that now justify this being a package rather than a folder of factories. Candidate Map revision.
- **Status-doc score is self-reported and slightly high.** The 91→96 estimate is the worker's own; this review lands it at 88 after accounting for the kind-literal inconsistency and the approximate-preset/throw asymmetries the status framed only as "design choices."

## Candidate open directions

These are charter silences I had to assume past; each should feed `charter.md › Open directions`.

1. **Identity / boundary line.** Is this package "descriptors + shared blur math" (the seed line) or has it deliberately become "the backend-independent filter _math and metadata_ library" (color-matrix presets, kernel builders, separability, bounds geometry)? The code has chosen the latter; the charter should bless or trim it. Where exactly is the line with `materials` (color transforms) and with `surface`/`filters-surface` (the LUT path the approximate presets defer to)?
2. **Registry vs closed union for kind dispatch (Fork B).** Should `normalize`/`margin`/`validate` dispatch through an open registry keyed by `*Kind` (so vendor-prefixed custom filters can participate), or is the built-in set closed by design and the switch acceptable? Either way, the switch cases should use the constants. This is a blessed-decision-shaped question.
3. **Approximate presets — bless the lossy form, or require the exact LUT seam?** `color-balance` and `levels` document that they cannot be exact as an affine matrix and point at a nonexistent LUT path. Decide whether the package ships an exact-form API (a `*ColorLut` builder, or a typed handoff to `filters-surface`) or stays affine-only and the LUT lives entirely downstream.
4. **`enableBitmapFilterSignals` and the `@flighthq/signals` dependency.** The worker correctly parks this pending an intentional dependency decision. Signals is "effectively always present" per the codebase map, so the cost is low, but the charter should record whether live filter-stack mutation notification is in scope for this package.
5. **Backend de-duplication ownership.** `normalizeBitmapFilter` is the seam to remove ~150 lines of duplicated defaulting across five backends. This is cross-package work — surface it as a coordinated change, not an autonomous one; the charter should note filters as the owner of canonical defaults.
6. **Constructor throw policy.** Settle whether `create*` filters validate-and-throw (current color-matrix behavior) or validate-and-sentinel, so the constructor family is symmetric.
