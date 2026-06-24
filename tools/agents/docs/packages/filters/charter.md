---
package: '@flighthq/filters'
crate: flighthq-filters
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# filters — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

The backend-independent definition layer for the OpenFL/Flash family of bitmap filters. It owns the plain-data **descriptors** — one `create*` per kind (blur, glow inner/outer, bevel, drop/inner shadow, color matrix, convolution, displacement map, gradient glow/bevel, plus the surface-effect set: median, pixelate, sharpen) — and the **backend-independent math and metadata** every filter backend shares: the kind catalog + narrowing guards, the clone/equals/normalize/serialize/validate spine, the color-matrix preset library, the convolution-kernel builders with separability metadata, the blur sigma↔box-radius math and quality→passes bridge, and descriptor-side bounds expansion (`getBitmapFilterMargin`, `getShadowFilterOffset`).

Where it ends: it does **not** rasterize. The actual per-substrate pixel work lives in the `filters-canvas` / `filters-css` / `filters-gl` / `filters-wgpu` / `filters-surface` backends, which consume these descriptors. The line with `materials` (color transforms) and with `surface` / `filters-surface` (the exact LUT path the approximate color-matrix presets defer to) is one of the open questions below.

A filter here is a plain data descriptor applied by an explicit per-backend function — never an OpenFL-style `BitmapFilter` instance assigned to `displayObject.filters` that a runtime quietly applies.

## North star (proposed)

_Proposed durable principles, inferred from the design and the SDK-wide forks. Edit or strike before blessing._

- **Descriptors are plain data; backends do the pixels.** Every filter is a tree-shakable value with no backend coupling and no hidden runtime behavior. The package's job is to define and reason about filters, not to draw them.
- **One canonical home for filter math and defaults.** Sigma↔radius, color-matrix presets, convolution kernels, separability, normalization defaults, and bounds margins are derived once here so the five backends stop re-deriving them. `@flighthq/types`-first: every kind constant and interface lives in the header; this package re-exports and implements against them.
- **Cover the full OpenFL/Lime filter feature set, in Flight's shape.** Aim for AAA descriptor completeness — the parameter set a developer expects from a mature bitmap-filter library — without mirroring OpenFL's class hierarchy or property-setter ergonomics.
- **Pure, alias-safe, sentinel-returning.** Math functions are side-effect-free; out-param functions read inputs to locals before writing; expected failures return sentinels (`null` / `false`), and throws are reserved for genuine API misuse.
- **A clean Wasm-mixable leaf.** Value-in / value-out descriptors and math keep this crate a candidate for a single-crate Rust→wasm drop-in (fork D), so the seam should stay plain data.

## Boundaries (proposed)

_Proposed scope lines, drawn from the review and neighbors. Edit before blessing._

In scope:

- Filter descriptor constructors and the kind catalog + guards.
- Clone / equals / normalize / serialize / validate over filters and filter lists.
- Backend-independent filter math: blur sigma/radius/quality, color-matrix presets and ops, convolution kernels + separability, bounds margins and shadow offsets.
- Canonical default constants (`DEFAULT_FILTER_*`) the backends adopt instead of re-deriving.

Non-goals (today):

- Any rasterization or GPU/Canvas/CSS pixel work — owned by the `filters-*` backends.
- Import/export of vendor filter blobs (OpenFL/SWF/Lottie) — a future `filters-formats` neighbor, deferred until there is a plurality of formats (triad plurality guard).
- Color-transform / shader material concerns owned by `materials`.
- The exact LUT form of approximate presets — currently deferred downstream to `filters-surface`.

## Decisions

None blessed yet.

## Open directions

_Every candidate question from the review, plus the structural forks that touch this package. These are where an agent asks rather than assumes._

1. **Identity / boundary line.** Bless or trim the grown identity: is this "descriptors + shared blur math" (the original seed) or, as the code has chosen, "the backend-independent filter _math and metadata_ library" (color-matrix presets, kernel builders, separability, bounds geometry)? Where exactly is the line with `materials` (color transforms) and with `surface` / `filters-surface` (the LUT path the approximate presets defer to)?
2. **Registry vs closed union for kind dispatch (fork B).** Three dispatch functions (`normalizeBitmapFilter`, `getBitmapFilterMargin`, `isValidBitmapFilter`) branch on hardcoded kind string literals while the rest of the package migrated onto the `*Kind` constants. Should these dispatch through an open registry keyed by `*Kind` (so vendor-prefixed custom filters can normalize / margin / validate), or is the built-in set closed by design and a closed `switch` acceptable? Either way the cases should reference the constants, not literals. Per fork B the default is a registry, with the closed-union exception reserved for a tight loop in a closed system. This is the clearest thing standing between `solid` and `authoritative`.
3. **Approximate presets — bless the lossy form, or require the exact LUT seam?** `createColorBalanceColorMatrix` (three-band model collapsed to a uniform offset) and `createLevelsColorMatrix` (linear-midpoint gamma approximation) cannot be exact as a 4×5 affine matrix and point at a nonexistent LUT path. Decide whether the package ships an exact-form API (a `*ColorLut` builder, or a typed handoff to `filters-surface`) or stays affine-only with the LUT living entirely downstream.
4. **`enableBitmapFilterSignals` and the `@flighthq/signals` dependency.** Live filter-stack mutation notification is parked pending an intentional dependency decision. Signals is "effectively always present" per the codebase map, so cost is low — record whether this is in scope for this package.
5. **Backend de-duplication ownership.** `normalizeBitmapFilter` + the `DEFAULT_FILTER_*` constants are the seam to remove ~150 lines of duplicated defaulting across `filters-canvas/css/gl/wgpu/surface`. This is cross-package work — surface it as a coordinated change, not an autonomous one; the charter should note filters as the owner of canonical defaults.
6. **Constructor throw policy.** `createColorMatrixFilter` throws on a wrong-length matrix while `fromBitmapFilterData` and the validators return sentinels. Settle whether `create*` filters validate-and-throw (API misuse) or validate-and-sentinel, so the constructor family is symmetric.
7. **Functional / visual coverage.** Presets have numerical golden tests but no cross-backend render scene confirming, e.g., that `createSepiaColorMatrix` looks like sepia through a real backend. Decide whether a `functional-test` scene is in scope for this package or owned by the backends.
8. **`filters-formats` neighbor (triad).** A vendor-blob import/export cell (OpenFL/SWF/Lottie) is deferred under the plurality guard. Note when a concrete format lands so the cell can be created deliberately rather than pre-emptively.
9. **Package Map line is understated.** `tools/agents/docs/index.md` still describes filters as just "blur, glow, bevel, drop-shadow, color-matrix, and convolution filters as plain data descriptors" — omitting the preset library, kernel builders, serialization/validation spine, and `getBitmapFilterMargin`. Candidate Map revision once the identity line is blessed.
