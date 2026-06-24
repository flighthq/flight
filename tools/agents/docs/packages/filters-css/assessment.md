---
package: '@flighthq/filters-css'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/filters-css

The review lands the package at `solid` (84/100): all 15 `BitmapFilter` kinds are translated or formally excluded, the SVG data-URI path is built, and `computeColorMatrixFilterCss` unlocks the native-shorthand vocabulary. The Bronze tier and most of Silver/Gold from the maturation roadmap have already landed, so this absorbs that roadmap (which can now be removed as one-time seed) and sorts the **residual** review gaps.

Three of the highest-value findings are **design forks or cross-package**, not sweep-safe: the `getShadowFilterOffset` barrel collision (needs a naming/re-export ruling), the closed-`switch`-vs-registry fork B decision, and aggregation ownership. These are routed to the charter's Open directions (the charter is a stub — North star / Boundaries / Decisions are all TODO), not into Recommended. That leaves `Recommended` thin on purpose: most of what remains genuinely requires a decision the user owns.

## Recommended

Sweep-safe: within `@flighthq/filters-css`, no cross-package coupling, no breaking change, no open design decision.

- **Honest-`null` rationale for the SVG-anisotropy decline.** Every blur-bearing emitter returns `null` for `blurX !== blurY`, even the five SVG-backed emitters whose `svgFeGaussianBlur` already accepts a `"bx by"` stdDeviation. _Whether_ to express anisotropy via SVG is a design fork (routed to Open directions). What is sweep-safe regardless of that ruling is making the decline **recorded, not silent**: a JSDoc/inline rationale on the SVG-backed emitters stating that anisotropy is declined here pending the SVG-anisotropy ruling, matching the package's own "convert silent omission into a recorded boundary" pattern that the formal exclusions already follow. (review.md#gaps)

- **Status-doc filename drift is already corrected in `review.md`.** No action in source — the worker's status matrix listed `cssInnerGlowFilter.ts` and a separate sharpen file, but inner glow + inner shadow live in `cssInnerShadowFilter.ts` and sharpen lives in `cssConvolutionFilter.ts`. The _functions_ are all present and correct; only the status-doc layout was wrong, and the review records the true layout. Listed here only so a later agent does not "fix" a non-bug. (review.md#status-doc-verification)

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction.

- **`getShadowFilterOffset` barrel collision — rename or drop the re-export.** _Parked: needs a naming decision and a ruling on whether allocating convenience forms belong in backend packages._ The name is exported from both `@flighthq/filters` (out-param) and `@flighthq/filters-css` (allocating), both `export *`-ed into the SDK barrel — under `export *` a doubly-exported name is silently omitted, so it may be unreachable through `@flighthq/sdk`. This violates the globally-unique-name rule and is a real contract defect, but the fix (`createShadowFilterOffset`? drop the re-export?) is a design fork. → charter Open directions. (review.md#contract--docs-fit item 1)

- **Fork B: registry vs. closed switch for `computeBitmapFilterCss`.** _Parked: the single most consequential design fork; needs a decision, not an autonomous change._ `BitmapFilter.kind` is `Kind` (open, vendor-prefixable), but the dispatch is a closed 14-case switch, so a user's `'acme.Foo'` kind silently returns `null`. Structural fork B defaults to a registry (`registerCssFilterEmitter(kind, fn)`), and the sibling `filters-canvas` already uses a dispatch table — but the closed switch is the tree-shaking-friendly form the JSDoc deliberately chose, and flipping it touches the package's whole dispatch shape. → charter Open directions (fork B ruling for this package). (review.md#contract--docs-fit item 2)

- **Aggregation ownership — does `filters-css` own `computeFiltersCss`, or `render-dom`?** _Parked: cross-package boundary (`filters-css` ↔ `render-dom`); the placement is asserted but untested by use._ → charter Open directions. (review.md#contract--docs-fit item 3, candidate open directions)

- **Wire `render-dom` to consume this backend + a DOM-backend pixel baseline.** _Parked: cross-package (`render-dom` has zero filter handling and does not import this package) and a visual-correctness gate._ The backend is a complete, well-tested seam that currently dead-ends; the functional test asserts _strings_, not pixels, so the SVG inner-shadow/bevel/convolution output is visually unproven until `render-dom` wires it and a capture exists. → charter Open directions (visual-correctness gate). (review.md#gaps, candidate open directions)

- **`computeSharpenFilterCss` continuous `amount`.** _Parked: borders a design fork (is continuous sharpness in scope for the CSS tier?) and is a parity gap vs. `filters-surface`/`filters-gl`, not a defect._ Today it is a fixed 3×3 unsharp kernel gated on/off by `amount > 0` (acknowledged in JSDoc). Defensible as-is; revisit once the SVG-anisotropy / North-star scope is settled. (review.md#gaps)

- **Memoization seam for repeated descriptors.** _Parked: offering a caller-provided-cache parameter is an API-shape decision, not a sweep-safe within-package change._ Every call re-serializes the SVG string; fine while no per-frame DOM caller exists, but a per-frame consumer will re-encode identical descriptors each frame. Sequenced after `render-dom` actually consumes the backend (the consumer that would feel it). (review.md#gaps)

- **Record the data-URI byte contract in the conformance map.** _Parked: cross-cutting (the conformance map / Rust host-web parity), not within-package._ The encoding choices (single-quote, `%23` for `#`, `%0A`, URL-encoded not base64) are the byte contract the eventual host-web JS path must match; no Rust crate exists (`crate: null`, correct), so this is a documentation item against the conformance map, not package code. (review.md#gaps — No Rust mirror)

- **Admin-doc revision: Package Map for the `filters-<backend>` split.** _Parked: edits the codebase map, not this package._ The `@flighthq/filters` Package Map entry still reads "Canvas/CSS … backends" and omits `@flighthq/filters-css` entirely; it should add a `filters-css` line and correct the `filters` description to "data descriptors; per-backend emitters live in `filters-<backend>`." Cross-cuts the whole filters family — surface to the user, do not edit autonomously. (review.md#contract--docs-fit — admin docs)

## Approved

_Frozen on the user's verbal approval only. Empty._
