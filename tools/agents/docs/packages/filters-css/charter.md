---
package: '@flighthq/filters-css'
crate: null
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# filters-css — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/filters-css` is the **CSS/SVG emitter tier of the filter system** — the per-backend cell that translates Flight's plain-data `BitmapFilter` descriptors (defined in `@flighthq/types`) into the strings a DOM renderer applies: native CSS `filter` shorthands (`blur()`, `drop-shadow()`, `grayscale()`, `hue-rotate()`, …) where the descriptor maps cleanly, and SVG `<filter>` data-URIs (`url("data:image/svg+xml,…")`) where only SVG's `fe*` primitive graph can express the effect (inner shadow/glow, bevel, convolution, general color matrices). It is one of the `filters-<backend>` siblings (`filters-canvas`, `filters-gl`, `filters-surface`, `filters-wgpu`) that descend from `@flighthq/filters`, the data-descriptor package. It owns _translation_, not _application_: it produces strings and returns `null` for anything CSS/SVG cannot express; the consuming renderer (`render-dom`) is responsible for assigning the result. Where it ends and `@flighthq/filters` begins: `filters` holds the descriptor types and shared math (the out-param `getShadowFilterOffset`); `filters-css` holds the CSS/SVG string emitters. It has no Rust crate (`crate: null`) — the Canvas/DOM substrate is host-web-only.

## North star (proposed)

_Inferred from the design + the SDK forks — edit or reject in review._

1. **One emitter per descriptor; refuse the inexpressible honestly.** Every `BitmapFilter` kind has a `compute<Filter>FilterCss` that emits a string or returns a documented `null` — never a wrong-but- present approximation. The 15/15 descriptor matrix (translated _or_ formally excluded with a JSDoc rationale pointing at `filters-surface`/`filters-gl`) is the completeness bar.
2. **Sentinels, not throws.** `null` is the contract for "no CSS/SVG equivalent" or a malformed input; throwing is reserved for programmer error. The caller composes around `null`.
3. **Pure string builders, SSR-safe, side-effect-free.** No DOM, no global state, `sideEffects: false`. The SVG path is plain string assembly with a stable, documented byte contract (URL-encoded `%23`, single-quote attributes, no base64) so output is cache-stable.
4. **Stay tree-shakable behind a thin barrel.** A user importing one emitter pays for one emitter; the aggregator that pulls in every emitter is an opt-in convenience, not the only door.

## Boundaries (proposed)

_In scope_

- CSS native-shorthand and SVG-data-URI emitters for the `BitmapFilter` descriptor family.
- The shared CSS color helper (`rgbaFromColorInt`) and the SVG `fe*` primitive builders.
- The allocating `getShadowFilterOffset` convenience consumed by functional tests (pending the naming-collision decision in Open directions).

_Non-goals (proposed)_

- **Applying** filters to DOM nodes — that is `render-dom`'s job; this package only produces strings.
- A Rust crate — the substrate is host-web-only (`crate: null`, locked by CONTRACT).
- Effects CSS/SVG can structurally never reach (e.g. true displacement-map sampling, gradient bevel/glow, median, pixelate) — these are formally excluded here and homed in `filters-surface`/`filters-gl`.

## Decisions

None blessed yet.

## Open directions

Every question the review surfaced, plus the structural forks that touch this package. An agent **asks** here rather than assuming.

- **North star wording — "express what CSS can, refuse the rest honestly"?** Confirm the one-emitter-per-descriptor + documented-`null` principle as the blessed North star, and rule whether the **SVG data-URI path counts as "CSS"** or is a deliberate, named second tier within the same package.
- **Fork B (closed union vs. open registry) — the single most consequential fork here.** `computeBitmapFilterCss` is a closed `switch` over 14 literal kinds, but `BitmapFilter.kind` is an **open** `Kind` contract, and the sibling `filters-canvas` already uses a dispatch table (`canvasFilterDispatch.ts`). Per structural-forks.md fork B the default is a **registry** (`registerCssFilterEmitter(kind, fn)`); a user registering `'acme.Foo'` currently silently gets `null`. Registry, or keep the closed switch? Needs a decision, not an autonomous change.
- **Aggregation ownership — does this package own `computeFiltersCss`, or does `render-dom`?** The list-composition function lives here by assertion (JSDoc) but no renderer consumes it, so the placement is untested by use. Settle whether per-descriptor translation **and** list composition stay co-located, or composition moves to the consuming renderer.
- **`getShadowFilterOffset` name collision — rename or drop the re-export?** The same name is exported by `@flighthq/filters` (out-param) and `@flighthq/filters-css` (allocating); under the SDK barrel's `export *` the duplicate is silently omitted, violating "globally unique exported function names." Rename to `createShadowFilterOffset` (matching `create*`-allocates), drop the re-export, or rule that allocating convenience forms do not belong in backend packages at all?
- **Anisotropy via the SVG path — pursue or formally decline?** Every blur-bearing emitter returns `null` for `blurX !== blurY`, yet `svgFeGaussianBlur` already accepts a `"bx by"` string — the SVG tier _could_ express anisotropy for the five SVG-backed filters. In scope for the SVG tier, or a recorded non-goal?
- **`computeSharpenFilterCss` amount — continuous sharpness or fixed kernel?** Currently a fixed 3×3 unsharp kernel gated on/off by `amount > 0`; a continuous `amount` is not expressed. Parity gap vs `filters-surface`/`filters-gl` — close it or bless the on/off behavior?
- **Memoization seam — caller-provided cache for per-frame DOM callers?** Every call re-serializes the SVG string. Fine while `sideEffects: false`, but a per-frame `render-dom` caller re-encodes identical descriptors each frame. Offer a caller-provided-cache parameter, or rule re-encoding acceptable?
- **Visual-correctness gate — when does `render-dom` consume this, and what captures the baseline?** The backend is a complete, well-tested seam that currently dead-ends: `render-dom` does not import it, and the functional test asserts _strings_, not pixels. The package's actual rendering is unverified until a DOM-backend capture exists. This is cross-package and needs sequencing.
- **Conformance map — record the data-URI byte contract for host-web JS parity.** No Rust mirror exists (correctly), but the single-quote / `%23` / no-base64 byte contract is not yet recorded for eventual host-web JS parity.
- **Admin-doc drift to confirm:** the Package Map still describes `@flighthq/filters` as having "Canvas/CSS and multi-pass WebGL backends" and omits `@flighthq/filters-css` entirely. Add a `filters-css` line and correct the `filters` description to "data descriptors; per-backend emitters live in `filters-<backend>`."
