---
package: '@flighthq/displayobject-gl'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/displayobject-gl

Sorted from `review.md` (the verified survey of the builder-67dc46d64 pass) and the prior `reviews/maturation/depth/displayobject-gl.md` roadmap. The package is `solid` (80/100): breadth is authoritative-grade, and the ceiling is the offscreen-Canvas2D raster fallbacks (gradient/bitmap fills, strokes, all text). Almost every fidelity item that would lift that ceiling carries a cross-package dependency (`@flighthq/types` header-layer additions, `@flighthq/path`, `@flighthq/shape`, `@flighthq/text-shaping`) or rides an unresolved North-star decision — so it lands in Backlog or is routed to the charter, not Recommended. The Recommended set is deliberately tiny: it is exactly the within-package, non-design, non-breaking work, which is what makes a blanket "do all recommended" safe to bless.

## Recommended

Sweep-safe: within `@flighthq/displayobject-gl`, no cross-package coupling, no breaking public-API change, no open design decision.

- **Replace the `as unknown as` casts in `createGlShapeData` / `createGlTextLabelData` with a typed runtime-slot accessor.** The roadmap's Bronze cast-cleanup, minus the part that is actually cross-package: the `unknown[]` _command-buffer_ signature is a codebase-wide decision (see Backlog), but the local `as unknown as GlShapeData` / `as unknown as RendererData` casts on the runtime slot are a within-package smell, fixable with a typed nullable runtime-slot accessor per the entity/runtime pattern. No public-signature change, no neighbor touched. — review.md "Contract & docs fit", roadmap Bronze (loose-signatures item).
- **Track the orphan `GlBitmapSamplingLike` so it cannot rot.** The type landed types-first in `@flighthq/types` but is unconsumed in this package (and in `render-gl`). The _plumbing_ is cross-package (Backlog), but adding a within-package note/test-anchor that records the type as intentionally-deferred-not-dead — so `exports`/orphan scans and a future reader see the seam is pending, not abandoned — is local and sweep-safe. — review.md "What the incoming pass changed", "Gaps".

## Backlog

Parked: cross-package coordination, a larger scope, or waiting on an Open direction. Each carries the reason it is not sweep-safe.

- **Native GPU gradient fills (`glGradientFill.ts`).** The single highest-value gap, but **header-layer cross-package**: needs `GlGradientFill` / `GradientStopLike` in `@flighthq/types` first, and a `getShapeGradientFillRegions` companion in `@flighthq/shape`. Also gated on the North-star fork (eliminate-all-raster vs allowed-fallback). — roadmap Bronze; review.md Candidate open directions.
- **Native GPU stroke tessellation (`glStroke.ts`).** **Cross-package:** stroke tessellation (`tessellateStroke`, joins/caps) belongs in `@flighthq/path`, paired with a `getShapeStrokeRegions` in `@flighthq/shape`; the join/cap vocabulary must be coordinated with the Canvas backend for cross-backend match. — roadmap Bronze.
- **Own the shape command vocabulary / drop the `@flighthq/displayobject-canvas` runtime dep.** Today `index.ts` re-exports thirteen `defaultGl*` shape commands as aliases of `defaultCanvas*`. This can only _fully_ land after native gradient + stroke + bitmap fills exist (those are the borrowed paths), and whether dropping the canvas dep is even in scope is a **Boundary decision** routed to the charter. — roadmap Bronze (sequencing item 4); review.md "Gaps".
- **`remapGlScale9Commands` typed-signature tightening.** The review explicitly reframes the lone `unknown[]` public signature as a **codebase-wide command-buffer-type decision** (`ShapeData.commands` is `unknown[]` everywhere — the flat `[key, argCount, ...args]` buffer); tightening here alone would be inconsistent. Not within-package. — review.md "Contract & docs fit" #2.
- **`GlBitmapSampling` plumbing through `prepareGlSpriteBatchWrite` / `bindGlTexture`.** Making the already-landed type reachable from a draw call is the cross-package change the status itself deferred (touches `render-gl`). The _tracking_ of the orphan is Recommended; the _wiring_ is here. — review.md "Gaps".
- **`render-gl` `makeGlState` / `glTestHelper` barrel regression.** The bundle head drops `export { makeGlState } from './glTestHelper'` from `render-gl`, which would fail every `displayobject-gl` test at import time (the "193/193 passing" claim is not reproducible from the bundle). This package is the casualty, but the fix is a **`render-gl`** change — and the cleaner seam (a test-only entry, not a production barrel export of a `*TestHelper`) is also a `render-gl` decision. Surface, do not fix here. — review.md "Contract & docs fit" #1.
- **GPU text via SDF/MSDF glyph atlas (`glGlyphAtlas.ts` + text shader).** The marquee Silver feature, **blocked on the `@flighthq/text-shaping` seam** (designed, not built — 2026-06-22). Whether to ship a measure-only Canvas-fed atlas now and upgrade the shaper under it, or wait, is a project-level dependency decision routed to the charter. — roadmap Silver; review.md Candidate open directions.
- **Native GPU bitmap fills (`glBitmapFill.ts`).** Removes the last `getShapeFillRegions === null` raster fallback (after which `createGlShapeData` allocates no `HTMLCanvasElement`). Same North-star gating as gradient/stroke, and pairs with the canvas-dep-drop arc. — roadmap Silver.
- **MSAA / edge-antialiasing policy (`glShapeAntialias.ts`).** Whether AA/MSAA/texture-filtering policy belongs here or stays in the `render-gl` core is an explicit **Boundary** question routed to the charter; it also reaches into the shared framebuffer config. — roadmap Silver; review.md Candidate open directions.
- **Texture-cache eviction policy (`setGlTextureCacheBudget` / `evictGlTextureCache`).** Table-stakes for production, but the eviction _semantics_ (budget by pixel count vs texture count vs VRAM estimate, and trading `WeakMap` GC-safety for explicit eviction) are a **cross-package design fork** (`types` + `render-gl`). Routed to the charter. — roadmap Silver; review.md Candidate open directions.
- **Cross-backend parity scenes for the new GPU paths.** Functional-test scenes that run `ts:canvas`/`ts:webgl`/`rust:skia` through the parity differ. These can only be authored as each GPU path lands (gradient/stroke/bitmap/text), so they trail the Backlog fidelity items rather than being independently actionable now. — roadmap Silver.
- **`enableGlRendererSignals` lifecycle group.** Deferred-by-demand: only worth adding if a consumer needs to observe atlas growth / texture eviction / batch flushes. List as a deliberate decision, not speculative work. — roadmap Silver.
- **Gold tier — batched/instanced shape meshes (`glShapeBatch.ts`), advanced blend modes (`glAdvancedBlend.ts`, framebuffer-fetch), context-loss recovery (`handleGlContextLost` / `restoreGlRendererResources`), velocity/cache writers for the new GPU paths, debug/error-path diagnostics, and perf-budget tests.** Each depends on the Silver GPU paths existing first (you cannot write a shape-mesh velocity writer before native shape meshes, or batch meshes that route to canvas). Large scope; parked behind the fidelity arc. Note: per structural fork B, blend modes are a growing family — when that path is built it should be **registry-dispatched** with dispatch hoisted out of the per-instance hot loop, not a closed `switch(kind)`. — roadmap Gold.
- **Rust port `flighthq-displayobject-gl` (1:1 parity).** The roadmap explicitly defers the Rust mirror until the raster fallbacks are gone, so the port doesn't track the wrong architecture. Cross-worktree and downstream of all the above. — roadmap Gold; review.md "Gaps".

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

---

### Routed to the charter (Open directions — noted, not edited here)

These need a North-star / Boundary decision the assessment cannot make. They are surfaced for an explicit charter conversation, not placed in Recommended:

- **North star.** Is the bar "eliminate every Canvas2D raster fallback — a true GPU renderer," or "a GPU-accelerated blitter allowed to fall back to raster for rare fill/text cases"? The entire gradient/stroke/bitmap/SDF-text arc is gated on this.
- **Boundary — shape command ownership.** Is dropping the `@flighthq/displayobject-canvas` runtime dep (owning `defaultGlBeginGradientFill` / `defaultGlLineStyle` / …) in scope, or is borrowing Canvas's shape commands an accepted permanent boundary?
- **Boundary — AA/MSAA/texture-filtering policy.** Does it live here or in the `render-gl` core?
- **Registration story (one-line Decision, already implemented).** Bless `registerGlDisplayObjectRenderers` as the sanctioned convenience path alongside per-descriptor registration (the tree-shakable golden path), or declare the turnkey registrar a non-goal.
- **GPU text gating.** Build a measure-only Canvas-fed glyph atlas now (better-cached raster) vs wait for `@flighthq/text-shaping` — a project-level dependency decision.
- **Texture-cache eviction semantics.** Budget by pixel/texture/VRAM, and whether to trade `WeakMap` GC-safety for explicit eviction (`types` + `render-gl` fork).
- **Structural fork B (registry by default).** Confirm no closed `switch(kind)` creeps into the gradient/stroke/blend-mode paths as they grow; blend modes in particular should be registry-dispatched with dispatch hoisted out of the per-instance hot loop. (Velocity writers already use an open registry — good.)
