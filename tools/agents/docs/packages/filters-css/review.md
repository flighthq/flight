---
package: '@flighthq/filters-css'
status: solid
score: 84
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/filters-css.md
  - source
  - incoming/builder-67dc46d64
---

# Review: @flighthq/filters-css

Evidence: `incoming/builder-67dc46d64/head/packages/filters-css/` + `changes.patch`. The prior depth review (`reviews/depth/filters-css.md`, 35/100) is superseded — it predates this work entirely.

## Verdict

`solid` — 84/100. The package went from a 3-function blur/shadow corner to a near-complete CSS-filter backend: all 15 `BitmapFilter` kinds are now either translated or formally excluded with rationale, an SVG data-URI `url()` path was built from scratch (the structural gap the depth review called out), and `computeColorMatrixFilterCss` unlocks the entire native-shorthand vocabulary. The remaining deductions are a real export-name collision that reaches the SDK barrel, a closed `switch` over an open contract (structural fork B), and a backend whose output no renderer yet consumes.

## Status-doc verification (AS-CLAIMED → verified)

The worker report is accurate on substance but **wrong on file layout** in two places:

- It lists `cssInnerGlowFilter.ts` and a separate sharpen file. Reality: inner glow + inner shadow both live in `cssInnerShadowFilter.ts` (`67dc46d64:packages/filters-css/src/cssInnerShadowFilter.ts`), and sharpen lives with convolution in `cssConvolutionFilter.ts`. The _functions_ exist as claimed; the filenames in the status matrix do not match the tree.
- Everything else verified against source: 103 unit tests across 11 files (counted), the 15/15 descriptor matrix, the `getShadowFilterOffset` restoration, the `filter-css-svg` functional scene (present in `head` and the patch, baselines uncaptured as claimed), and the `cssColor.ts` de-duplication. The "previous score 82 → 91" self-estimate is in the right band; I land slightly lower (84) because of the barrel collision and fork-B drift the worker did not weigh.

## Present capabilities

Grounded in `67dc46d64:packages/filters-css/src/`:

- **Native shorthand emitters** — `computeBlurFilterCss` (`blur(Npx)`), `computeDropShadowFilterCss` (`drop-shadow(...)`), `computeOuterGlowFilterCss` (centered `drop-shadow(0 0 ...)`). All return `null` for anisotropic blur / knockout, correctly, since CSS `blur()`/`drop-shadow()` cannot express them.
- **`computeColorMatrixFilterCss`** — the headline addition. Classifies a 4×5 matrix against eight CSS shorthands (`grayscale`/`sepia`/`invert`/`brightness`/`contrast`/`saturate`/`hue-rotate`/`opacity`) with an EPSILON tolerance, recovering `saturate`/`hue-rotate` amounts by solving the W3C closed forms, then falls back to an SVG `feColorMatrix` data-URI for any general matrix. The hue-rotate inversion (2×2 solve of cos/sin, full-matrix re-verification) is genuinely careful work.
- **SVG data-URI infrastructure** (`svgFilterUrl.ts`) — `createSvgFilterDataUri` plus seven `fe*` builders (`svgFeColorMatrix`, `svgFeComposite`, `svgFeConvolveMatrix`, `svgFeFlood`, `svgFeGaussianBlur`, `svgFeMerge`, `svgFeOffset`). Pure string builders, no DOM, SSR-safe. Encoding is `%23` for `#`, double→single quotes, `%0A` for newlines, URL-encoded not base64 (documented rationale: shorter + stable bytes for caching).
- **SVG-pipeline emitters** — `computeInnerGlowFilterCss` / `computeInnerShadowFilterCss` (flood → clip to `SourceAlpha` → (offset) → blur → `atop` → merge), `computeBevelFilterCss` (two offset flood layers, highlight + shadow), `computeConvolutionFilterCss` (`feConvolveMatrix`, divisor falls back to kernel sum), `computeSharpenFilterCss` (fixed 3×3 unsharp kernel). Each returns `null` for the cases CSS/SVG cannot reach (anisotropy, knockout, malformed kernel).
- **Formal exclusions** (`cssFiltersAggregator.ts`) — `computeDisplacementMapFilterCss`, `computeGradientBevelFilterCss`, `computeGradientGlowFilterCss`, `computeMedianFilterCss`, `computePixelateFilterCss` each return typed `null` with a JSDoc + inline rationale pointing to `filters-surface`/`filters-gl`. This is the depth review's "convert silent omission into a recorded boundary" recommendation, delivered.
- **Dispatch + aggregation** — `computeBitmapFilterCss` (kind-keyed switch over all 14 emitters) and `computeFiltersCss` (skip-policy list join: unexpressible filters silently dropped, rest space-joined, `null` if empty/all-null).
- **`getShadowFilterOffset`** (`shadowFilterOffset.ts`) — an allocating wrapper over the out-param version in `@flighthq/filters`, restored because functional tests import it from here.
- **`rgbaFromColorInt`** (`cssColor.ts`) — the single shared color helper; the depth review's duplicated-`rgbaFromInt` finding is resolved.

Tests: 103 unit specs (11 files, verified by count) + one `filter-css-svg` functional scene asserting string output across all 15 kinds in a browser context.

## Gaps

- **No consumer.** `render-dom` has zero filter handling and does not import `@flighthq/filters-css` (grepped). The aggregator's own JSDoc says "render-dom should call this function directly" — but nothing does. The backend is a complete, well-tested seam that currently dead-ends; its visual correctness is unproven (the functional test asserts _strings_, not pixels, and DOM-backend baselines are uncaptured). Until `render-dom` wires it, "does the SVG inner-shadow actually render right" is untested.
- **Anisotropic blur uniformly punts.** Every blur-bearing emitter returns `null` for `blurX !== blurY`, yet `svgFeGaussianBlur` already accepts a `"bx by"` string — the SVG path _could_ express anisotropy for the five SVG-backed filters. The capability is built but unused; the shorthand path (`blur`/`drop-shadow`) genuinely cannot, but the SVG path artificially inherits the same limit.
- **`computeSharpenFilterCss` ignores `amount`.** It is a fixed 3×3 kernel gated on/off by `amount > 0`; a continuous sharpness is not expressed (acknowledged in JSDoc). Defensible, but a parity gap vs `filters-surface`/`filters-gl`.
- **No memoization seam.** Every call re-serializes the SVG string. Fine for now (keeps `sideEffects:false`), but per-frame DOM callers will re-encode identical descriptors each frame. Flagged by the worker; no caller-provided-cache parameter offered.
- **No Rust mirror.** `flighthq-filters-css` does not exist (correctly — `crate: null` per CONTRACT; Canvas/DOM substrate is host-web-only). The data-URI byte contract (single-quote, `%23`, no base64) is not yet recorded in the conformance map for the eventual host-web JS parity.

## Charter contradictions

The charter (`charter.md`) is a **stub** — `What it is` is seeded from the depth review, and `North star` / `Boundaries` / `Decisions` / `Open directions` are all `TODO`. There is therefore no blessed principle for the code to contradict. Falling back to the codebase-map AAA standard surfaces the contract issues below and the candidate Open directions at the end. Empty-by-vacancy, not empty-by-merit.

## Contract & docs fit

How the package lives up to the contract:

- **`@flighthq/types`-first** — all descriptor types imported from `@flighthq/types`; no inline cross-package types. `BitmapFilter` is confirmed an **open** contract (`67dc46d64:packages/types/src/BitmapFilter.ts`: "no central union to edit here").
- **Full unabbreviated names** — `compute<Filter>FilterCss` is consistent and self-identifying. The `svgFe*` builders abbreviate "Fe" but that is the SVG element's own name (`feColorMatrix`), not a Flight type, so it is honest.
- **Sentinels, not throws** — `null` for every "no CSS equivalent" / malformed case, documented per-function. Correct.
- **Single root export, `sideEffects: false`** — `package.json` declares both; `index.ts` is a thin barrel; no top-level side effects.
- **`out`-params** — the canonical out-param `getShadowFilterOffset` stays in `@flighthq/filters`; the allocating form here is an intentional convenience, JSDoc-documented. Reasonable.

Where the contract is **violated or strained** (the high-value findings):

1. **Export-name collision reaching the SDK barrel (contract violation).** `getShadowFilterOffset` is exported from **both** `@flighthq/filters` (out-param) and `@flighthq/filters-css` (allocating). The SDK barrel does `export *` from both (`67dc46d64:packages/sdk/src/index.ts`:21,23). Under `export *`, a name exported by two star-sources is a conflict — TS silently **omits** it from the re-export, so `getShadowFilterOffset` may be unreachable through `@flighthq/sdk` (or error, depending on settings). This directly violates "Prefer globally unique exported function names, especially from package roots and the SDK barrel." Two functions, same name, two allocation contracts, both starred into the barrel — the convenience wrapper needs a distinct name (e.g. `createShadowFilterOffset`, matching the `create*`-allocates convention) or to not be re-exported.

2. **Closed `switch` over an open contract (structural fork B drift).** `computeBitmapFilterCss` switches on `filter.kind` across 14 literal cases (`67dc46d64:.../cssFiltersAggregator.ts`:38-71). `BitmapFilter.kind` is typed `Kind` (open). Per structural-forks.md fork B, the default is a **registry**, with a closed union tolerated only for a tight hot loop inside a closed system — which this is not (it is per-filter string generation, not a hot path, and the type is explicitly open to vendor-prefixed custom kinds). A user registering `'acme.Foo'` cannot extend this dispatch; the switch silently returns `null`. The sibling `filters-canvas` uses `canvasFilterDispatch.ts` (a dispatch table) — this package should match. JSDoc already half-acknowledges the cost ("imports every emitter… import directly to preserve tree-shaking"), which is the closed-union tax fork B warns about.

3. **Aggregation ownership is unresolved.** `computeFiltersCss` lives here with a JSDoc note that it "lives here rather than in `@flighthq/render-dom`." Since no renderer consumes it, the placement is asserted but untested by use. A candidate Open direction, not a defect.

Where the **admin docs** need revising:

- The **Package Map** entry for `@flighthq/filters` still reads "…filters as plain data descriptors with explicit **Canvas/CSS** and multi-pass WebGL backends." The CSS (and Canvas) backends are now their own packages (`filters-css`, `filters-canvas`, `filters-gl`, `filters-surface`, `filters-wgpu`), and `filters-css` is not listed in the Package Map at all. Candidate revision: add a `@flighthq/filters-css` line and correct the `@flighthq/filters` description to "data descriptors; per-backend emitters live in `filters-<backend>`."
- CONTRACT.md correctly lists `filters-css` among the `crate: null` packages — no revision needed there.

## Candidate open directions

These are the charter silences I had to assume past; each is a question for the user to settle, not a prescription:

- **North star — "express what CSS can, refuse the rest honestly"?** The package's evident principle is one-emitter-per-descriptor, `null` for the inexpressible, with a recorded rationale. Worth blessing as the North star, including whether the SVG data-URI path counts as "CSS" or is a deliberate second tier.
- **Boundary — does this package own list aggregation (`computeFiltersCss`) or does `render-dom`?** The worker surfaced this explicitly. Settle whether per-descriptor translation + list composition stay co-located here, or composition moves to the consuming renderer.
- **Fork B ruling for this package — registry or keep the closed switch?** Given `BitmapFilter` is open and `filters-canvas` already uses a dispatch table, should `computeBitmapFilterCss` become a registry (`registerCssFilterEmitter(kind, fn)`)? This is the single most consequential design fork and needs a decision, not an autonomous change.
- **Anisotropy via the SVG path — pursue or formally decline?** The `"bx by"` capability exists in `svgFeGaussianBlur` but every emitter declines it. Is anisotropic blur in-scope for the SVG tier, or a recorded non-goal?
- **The `getShadowFilterOffset` collision — rename or drop the re-export?** Needs a naming decision (`createShadowFilterOffset`?) and a ruling on whether allocating convenience forms belong in backend packages at all.
- **Visual-correctness gate — when does `render-dom` consume this, and what captures the baseline?** The string-assertion functional test is a contract gate, not a pixel gate; the package's actual rendering is unverified until a DOM-backend capture exists.
