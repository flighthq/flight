---
package: '@flighthq/displayobject-gl'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/displayobject-gl

Sorted from `review.md` (the merge-gate survey of the `integration-b2824e3d8` delta against the approved base `origin/main` `eb73c3d74`) and the prior `reviews/maturation/depth/displayobject-gl.md` roadmap. The package is `solid` (84/100) and the incoming delta is a **clean merge** — test-only, with no production source touched. Its single substantive effect is to **retire** the prior blocker (the unresolvable `makeGlState` import) by adding an in-package, barrel-excluded `glTestHelper.ts` and migrating every test to it.

The standing ceiling is unchanged because the delta does not touch it: the offscreen-Canvas2D raster fallbacks (gradient/bitmap fills, strokes, all text) are base-state. Almost every fidelity item that would lift that ceiling carries a cross-package dependency (`@flighthq/types` header-layer additions, `@flighthq/path`, `@flighthq/shape`, `@flighthq/text-shaping`) or rides an unresolved North-star decision — so it lands in Backlog or is routed to the charter, not Recommended. The Recommended set is deliberately tiny: exactly the within-package, non-design, non-breaking work, which is what makes a blanket "do all recommended" safe to bless.

## Recommended

Sweep-safe: within `@flighthq/displayobject-gl`, no cross-package coupling, no breaking public-API change, no open design decision.

- **Fix the inaccurate word in the new `glTestHelper.ts` docstring.** The header comment claims it mirrors _"render-gl's own **private** glTestHelper pattern,"_ but render-gl's `makeGlState` is publicly re-exported from its barrel (`render-gl/src/index.ts`). Drop "private" (or rephrase to "render-gl's own glTestHelper pattern, but built through the public `createGlRenderState`"). One-word, within-package, no surface change. — review.md "Judged against the seven standards" #2.
- **Replace the `as unknown as` casts in `createGlShapeData` / `createGlTextLabelData` with a typed runtime-slot accessor.** (Carried forward from the prior assessment; base-state, untouched by this delta.) The roadmap's Bronze cast-cleanup, minus the part that is cross-package: the `unknown[]` _command-buffer_ signature is a codebase-wide decision (see Backlog), but the local `as unknown as GlShapeData` / `as unknown as RendererData` casts on the runtime slot are a within-package smell, fixable with a typed nullable runtime-slot accessor per the entity/runtime pattern. No public-signature change, no neighbor touched. — review.md "Contract & docs fit", roadmap Bronze (loose-signatures item).
- **Track the orphan `GlBitmapSamplingLike` so it cannot rot.** (Carried forward; base-state.) The type landed types-first in `@flighthq/types` but is unconsumed in this package (and in `render-gl`). The _plumbing_ is cross-package (Backlog), but a within-package note/test-anchor recording the type as intentionally-deferred-not-dead is local and sweep-safe. — review.md "How the delta resolves the prior finding" context; roadmap.

## Backlog

Parked: cross-package coordination, a larger scope, or waiting on an Open direction. Each carries the reason it is not sweep-safe. (All items below are base-state — the incoming delta touches none of them.)

- **Native GPU gradient fills (`glGradientFill.ts`).** The single highest-value fidelity gap, but **header-layer cross-package**: needs `GlGradientFill` / `GradientStopLike` in `@flighthq/types` first, and a `getShapeGradientFillRegions` companion in `@flighthq/shape`. Also gated on the North-star fork (eliminate-all-raster vs allowed-fallback). — roadmap Bronze.
- **Native GPU stroke tessellation (`glStroke.ts`).** **Cross-package:** stroke tessellation (`tessellateStroke`, joins/caps) belongs in `@flighthq/path`, paired with a `getShapeStrokeRegions` in `@flighthq/shape`; the join/cap vocabulary must be coordinated with the Canvas backend for cross-backend match. — roadmap Bronze.
- **Own the shape command vocabulary / drop the `@flighthq/displayobject-canvas` runtime dep.** Today `index.ts` re-exports thirteen `defaultGl*` shape commands as aliases of `defaultCanvas*`. Can only _fully_ land after native gradient + stroke + bitmap fills exist, and whether dropping the canvas dep is in scope is a **Boundary decision** routed to the charter. — roadmap Bronze (sequencing item 4).
- **`remapGlScale9Commands` typed-signature tightening.** The lone `unknown[]` public signature is a **codebase-wide command-buffer-type decision** (`ShapeData.commands` is `unknown[]` everywhere — the flat `[key, argCount, ...args]` buffer); tightening here alone would be inconsistent. Not within-package. — review.md "Contract & docs fit".
- **`GlBitmapSampling` plumbing through `prepareGlSpriteBatchWrite` / `bindGlTexture`.** Making the already-landed type reachable from a draw call is a cross-package change (touches `render-gl`). The _tracking_ of the orphan is Recommended; the _wiring_ is here.
- **GPU text via SDF/MSDF glyph atlas (`glGlyphAtlas.ts` + text shader).** The marquee Silver feature, **blocked on the `@flighthq/text-shaping` seam** (designed, not built — 2026-06-22). Whether to ship a measure-only Canvas-fed atlas now or wait is a project-level dependency decision routed to the charter. — roadmap Silver.
- **Native GPU bitmap fills (`glBitmapFill.ts`).** Removes the last `getShapeFillRegions === null` raster fallback. Same North-star gating as gradient/stroke; pairs with the canvas-dep-drop arc. — roadmap Silver.
- **MSAA / edge-antialiasing policy (`glShapeAntialias.ts`).** Whether AA/MSAA/texture-filtering policy belongs here or in the `render-gl` core is an explicit **Boundary** question routed to the charter; reaches into the shared framebuffer config. — roadmap Silver.
- **Texture-cache eviction policy (`setGlTextureCacheBudget` / `evictGlTextureCache`).** Table-stakes for production, but the eviction _semantics_ (budget by pixel count vs texture count vs VRAM estimate, and trading `WeakMap` GC-safety for explicit eviction) are a **cross-package design fork** (`types` + `render-gl`). Routed to the charter. — roadmap Silver.
- **Cross-backend parity scenes for the new GPU paths.** Functional-test scenes that run `ts:canvas`/`ts:webgl`/`rust:skia` through the parity differ. Can only be authored as each GPU path lands, so they trail the Backlog fidelity items. — roadmap Silver.
- **`enableGlRendererSignals` lifecycle group.** Deferred-by-demand: only worth adding if a consumer needs to observe atlas growth / texture eviction / batch flushes. A deliberate decision, not speculative work. — roadmap Silver.
- **Gold tier — batched/instanced shape meshes (`glShapeBatch.ts`), advanced blend modes (`glAdvancedBlend.ts`, framebuffer-fetch), context-loss recovery (`handleGlContextLost` / `restoreGlRendererResources`), velocity/cache writers for the new GPU paths, debug/error-path diagnostics, and perf-budget tests.** Each depends on the Silver GPU paths existing first. Large scope; parked behind the fidelity arc. Per structural fork B, blend modes are a growing family — when built it should be **registry-dispatched** with dispatch hoisted out of the per-instance hot loop, not a closed `switch(kind)`. — roadmap Gold.
- **Rust port `flighthq-displayobject-gl` (1:1 parity).** The roadmap defers the Rust mirror until the raster fallbacks are gone, so the port doesn't track the wrong architecture. Cross-worktree, downstream of all the above. — roadmap Gold.

### Resolved by the integration-b2824e3d8 delta (was Backlog)

- **~~`render-gl` `makeGlState` / `glTestHelper` barrel regression.~~** The prior assessment parked this as a `render-gl` fix: the bundle head had dropped `export { makeGlState } from './glTestHelper'`, leaving every `displayobject-gl` test unresolvable. The incoming delta **resolves it in-package** — `glTestHelper.ts` now builds state through render-gl's **public** `createGlRenderState`, and all ~22 tests import it locally. The suite no longer depends on render-gl re-exporting a test helper at all. This is exactly the "dedicated test-only entry over the production root" seam the prior review recommended. No further action; the broader question of whether render-gl _itself_ should still publish a `*TestHelper` from its production barrel is a render-gl concern, not this package's.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

---

### Routed to the charter (Open directions — noted, not edited here)

These need a North-star / Boundary decision the assessment cannot make. Surfaced for an explicit charter conversation, not placed in Recommended:

- **North star.** Is the bar "eliminate every Canvas2D raster fallback — a true GPU renderer," or "a GPU-accelerated blitter allowed to fall back to raster for rare fill/text cases"? The entire gradient/stroke/bitmap/SDF-text arc is gated on this.
- **Boundary — shape command ownership.** Is dropping the `@flighthq/displayobject-canvas` runtime dep (owning `defaultGlBeginGradientFill` / `defaultGlLineStyle` / …) in scope, or is borrowing Canvas's shape commands an accepted permanent boundary?
- **Boundary — AA/MSAA/texture-filtering policy.** Does it live here or in the `render-gl` core?
- **Registration story (one-line Decision, already implemented).** Bless `registerGlDisplayObjectRenderers` as the sanctioned convenience path alongside per-descriptor registration (the tree-shakable golden path), or declare the turnkey registrar a non-goal.
- **GPU text gating.** Build a measure-only Canvas-fed glyph atlas now vs wait for `@flighthq/text-shaping` — a project-level dependency decision.
- **Texture-cache eviction semantics.** Budget by pixel/texture/VRAM, and whether to trade `WeakMap` GC-safety for explicit eviction (`types` + `render-gl` fork).
- **Structural fork B (registry by default).** Confirm no closed `switch(kind)` creeps into the gradient/stroke/blend-mode paths as they grow; blend modes in particular should be registry-dispatched with dispatch hoisted out of the per-instance hot loop. (Velocity writers already use an open registry — good.)
- **Test-helper seam (render-gl side).** The delta fixed displayobject-gl's coupling cleanly; the open _cross-package_ question is whether `render-gl` should keep publishing its own `makeGlState` from its production barrel or also move to a test-only entry. Not this package's decision, but worth one ruling for consistency.
