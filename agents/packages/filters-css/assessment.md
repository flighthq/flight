---
package: '@flighthq/filters-css'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/filters-css

The review lands the **integration delta** at `reject` (30/100). This supersedes the earlier score-84 assessment, which sorted the gaps of a richer `svgFilterUrl` backend that **did not land in this integration head**. The delta here is a single broken file: `index.ts` re-exports eight SVG `fe*` symbols from `./svgFilterUrl`, a module that does not exist in the package tree (verified by `ls`, `diff -rq base head`, and grep — `index.ts` is the only differing file and the only match for `svgFilterUrl`). The head is strictly worse than the base, which compiled: `tsc -b` (`include: ["src"]`, `rootDir: src`) cannot resolve `./svgFilterUrl`, and `exports:check` would reject eight exports with no colocated tests.

Because the delta is a build-breaking half-merge, the recommendation is **not** a within-package feature sweep — it is to resolve the dangling re-export before anything else is sorted. The substantive design forks the package carries (fork B registry, `getShadowFilterOffset` collision, anisotropy, aggregation ownership) are downstream of an SVG/aggregator layer that is **not present in this head**, so they remain parked in the charter's Open directions and are not actionable here. They are restated in the closing Notes only to keep them from being lost.

## Recommended

Sweep-safe: within `@flighthq/filters-css`, no cross-package coupling, no breaking change, no open design decision.

- **Restore buildability — resolve the dangling `./svgFilterUrl` re-export.** This is the only blocking, within-package action. Either revert `src/index.ts` to the base 3-export barrel (`computeBlurFilterCss`, `computeDropShadowFilterCss` + `getShadowFilterOffset`, `computeOuterGlowFilterCss`), **or** add `src/svgFilterUrl.ts` implementing all eight named exports plus a colocated `src/svgFilterUrl.test.ts`. Do not land the half-state: a barrel re-exporting a missing module is a hard `tsc -b` failure, which the codebase map explicitly gates on. (review.md#required-before-this-can-merge item 1)

- **Run `tsc -b` and `npm run exports:check` on the head before re-submitting.** Both currently fail on this package — `tsc -b` on the unresolvable `./svgFilterUrl`, `exports:check` on the eight new exports with no colocated test. Sweep-safe because it is a verification step, not a design choice; once buildability is restored these are the gates that confirm it. (review.md#required-before-this-can-merge item 3)

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction.

- **Land the SVG/aggregator tier as a coherent unit, not a barrel line.** _Parked: this is the actual feature work the broken `index.ts` gestured at — it is a larger change than a sweep and must arrive whole._ If the SVG path is meant to land in `filters-css`, it must come as implementation + colocated tests + the descriptor coverage the score-84 builder survey documented (color-matrix, inner-shadow/glow, bevel, convolution, sharpen, aggregator) — not as the appended export block alone. Pulling in only the barrel line from that builder snapshot is exactly the failure mode that produced this reject. (review.md#required-before-this-can-merge item 2)

- **Everything from the prior (score-84) assessment is held, not active.** _Parked: the gaps that earlier assessment sorted — honest-`null` SVG-anisotropy rationale, the `getShadowFilterOffset` barrel collision, fork B registry, aggregation ownership, the `render-dom` consume + pixel baseline, continuous `computeSharpenFilterCss`, the memoization seam, the data-URI byte contract, the Package Map revision — all presuppose the `svgFilterUrl`/aggregator layer that is **absent from this integration head.**_ None are actionable against the delta. They stay in the charter's Open directions and re-activate only once a coherent SVG tier actually lands here. (charter.md Open directions)

## Approved

_Frozen on the user's verbal approval only. Empty._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The charter is a stub (`draft: true`; North star / Boundaries / Decisions unblessed). The delta does not resolve any of these — it presupposes a layer that is not in this head — so they remain open exactly as the charter already records them:

1. **Does the SVG data-URI tier land in `filters-css` at all,** and if so as a coherent unit (implementation + tests + descriptor coverage)? The integration head asserts the surface (eight `svgFe*` exports) without the substrate — settle whether that tier belongs here before re-attempting the merge.
2. **Fork B (closed switch vs. open registry)** for `computeBitmapFilterCss` — not exercised by this delta; still the most consequential fork once the aggregator exists.
3. **`getShadowFilterOffset` barrel collision** — rename to `createShadowFilterOffset`, drop the re-export, or rule allocating convenience out of backend packages.
4. **Anisotropy via the SVG path** — pursue for the five SVG-backed emitters or formally decline; unverifiable while the SVG tier is absent.
5. **Aggregation ownership** — does `filters-css` own `computeFiltersCss`/`computeBitmapFilterCss`, or `render-dom`?
6. **Visual-correctness gate** — `render-dom` does not consume this backend; the actual render output is unproven until a DOM-backend pixel capture exists.
