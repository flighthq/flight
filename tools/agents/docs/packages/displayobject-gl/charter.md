---
package: '@flighthq/displayobject-gl'
crate: flighthq-displayobject-gl
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---


# displayobject-gl — Charter

## What it is

The WebGL2 leaf-renderer suite for the 2D display-object family — the per-subject GPU backend that draws every 2D display-object leaf (bitmap, shape, scale-9 shape, sprite, quad-batch, tilemap, text label, rich text, video, particle emitter, and container passthrough) over the `render-gl` core. Alongside the leaf renderers it owns the GPU-only subsystems that have no Canvas2D equivalent: scissor + stencil clipping/masking, a color-transform material/shader system, render-to-FBO caching (`cacheAsBitmap` analogue), and the velocity (motion-vector) rasterization pass.

It sits one layer above `render-gl` (the subject-agnostic GPU plumbing — state, targets, shaders, draw, surface) and is a sibling to the other `displayobject-<backend>` leaves (`displayobject-canvas`, `displayobject-dom`, the planned `displayobject-skia`). The data/region layers it consumes — clip regions, velocity data, particle simulation, shape fill regions — live in neighbor packages (`@flighthq/clip`, `@flighthq/velocity`, `@flighthq/particles`, `@flighthq/path`); this package owns only the GL rasterization side of those seams. It ends where a draw call ends: scene-graph traversal, transform/alpha propagation, and the update pipeline belong to `render`/`render-gl`, not here.

## North star

_Proposed from the review + the structural forks; not blessed. Each is a candidate the user should confirm, sharpen, or reject — open questions about the durable bar are in Open directions._

- **Every 2D display-object leaf has a GL renderer descriptor + paired draw/render free function.** Coverage of the full leaf set is the identity of the package; a missing leaf is unfinished work, not a boundary. (Met today across all twelve built-in kinds.)
- **Registry dispatch, never a closed `switch(kind)` in a hot path** (structural fork B). Renderers register per-descriptor (the tree-shakable golden path); velocity writers already use an open registry. As fill/stroke/blend-mode families grow, they dispatch through registries too, with dispatch hoisted out of the per-instance loop so the registry costs no per-frame perf.
- **GPU resources are explicitly owned and freed.** `destroy*` frees textures/FBOs deterministically; `register*`/`enable*` are opt-in with no module-top-level side effects; allocation in hot loops is avoided (scratch arrays, not per-frame `new`).
- **Full, unabbreviated, `gl`-prefixed, self-identifying names**, one colocated `*.test.ts` per source file. The package is held to the codebase-map AAA bar and currently meets it on naming and test depth.

## Boundaries

_Proposed; the contested lines are restated as questions in Open directions._

**In scope**

- WebGL2 (`#version 300 es`) leaf renderers for the 2D display-object family.
- GPU-only subsystems with no Canvas2D analogue: scissor/stencil clipping & masking, the color-transform material/shader system, render-to-FBO caching, velocity rasterization.
- The GL-side rasterization half of seams whose data lives in neighbor packages (clip regions, velocity data, particle sim, shape fill regions).

**Non-goals**

- Scene-graph traversal, transform/alpha/visibility propagation, and the update pipeline — owned by `render` / `render-gl`.
- Clip-region computation, velocity-data computation, particle simulation, stroke tessellation, shape fill-region extraction — owned by `@flighthq/clip`, `@flighthq/velocity`, `@flighthq/particles`, `@flighthq/path`. This package consumes their outputs.
- Other backends' rasterization (`displayobject-canvas`, `displayobject-dom`, `displayobject-skia`).

**Undecided (see Open directions)** — whether owning the shape fill/stroke command vocabulary (and dropping the `@flighthq/displayobject-canvas` runtime dependency) is in scope; where AA/MSAA/texture- filtering policy lives; whether eliminating all Canvas2D raster fallbacks is a goal or a permanent accepted boundary.

## Decisions

- **2026-07-02 — Canvas-raster fallback accepted; GPU options long-term.**
- **2026-07-02 — No umbrella registerAll — maximum tree-shaking.**
- **2026-07-02 — TS-leads, Rust conforms later.**

## Open directions

_Every candidate from the review, plus the structural forks that touch this package. These are questions for the user to settle, not positions._

- **North star: true GPU renderer, or GPU-accelerated blitter with raster fallback?** Today gradient fills, bitmap fills, strokes, and all text rasterize through a hidden offscreen Canvas2D and upload as a texture (resolution-bound). Is the durable bar "eliminate every Canvas2D raster fallback," or "a GPU backend allowed to fall back to raster for rare fill/text cases"? The entire gradient-shader / GPU-stroke / SDF-text arc is gated on this single answer. The depth/maturation reviews assume the former; it is not blessed.
- **Shape command vocabulary — own it or borrow it permanently?** `index.ts` re-exports thirteen `defaultGl*` shape commands as aliases of `defaultCanvas*` from `@flighthq/displayobject-canvas`, which remains a runtime `dependency`. Is owning the native fill/stroke command surface (and dropping the canvas dep) in scope, or is "borrow Canvas's shape commands" an accepted permanent boundary? The dep cannot be dropped until native fill/stroke land.
- **Registration convenience — bless `registerGlDisplayObjectRenderers`?** The turnkey one-call registrar (all twelve built-in renderers) now exists and is tested. Bless it as the sanctioned convenience path alongside per-descriptor registration, or treat the turnkey registrar as a non-goal? A one-line Decision the incoming pass has already implemented.
- **GPU text gating.** Build a measure-only Canvas-fed glyph atlas now (better-cached raster), or wait for the `@flighthq/text-shaping` seam (designed, not built as of 2026-06-22) and SDF/MSDF glyphs? A project-level dependency decision the package cannot make alone.
- **Texture-cache eviction semantics.** `textureCache` is a `WeakMap` with manual `deleteTexture` — no LRU / size budget. Budget by pixel count vs texture count vs VRAM estimate, and whether to trade `WeakMap` GC-safety for explicit eviction? A cross-package (`types` + `render-gl`) design fork. Related: `GlBitmapSamplingLike` / `GlBitmapSamplingFilter` (`'linear' | 'nearest'`) was added types-first to `@flighthq/types` but is defined-and-unconsumed — plumbing it through `prepareGlSpriteBatchWrite` / `bindGlTexture` is a deferred cross-package change; track it so the orphan type does not rot.
- **AA/MSAA/texture-filtering policy home** — does it belong here or in the `render-gl` core?
- **Closed-union vs registry creep (structural fork B).** Velocity writers already use an open registry (good). Confirm no closed `switch(kind)` creeps into the gradient/stroke/blend-mode paths as they grow — blend modes especially are a family that should be registry-dispatched, with dispatch hoisted out of the per-instance hot loop.
- **Source-data vs graph participation (structural fork A).** This package consumes particle sim, velocity, and clip data from neighbor packages over seams; confirm those seams stay on the "this package rasterizes, the neighbor owns the data" side of the line as the subject triad matures.
- **Loose public signature — `remapGlScale9Commands(unknown[])`.** Tightening it alone would be inconsistent, since `ShapeData.commands` is `unknown[]` codebase-wide (the flat `[key, argCount, ...args]` buffer). Surfaced as a **codebase-wide command-buffer-type decision**, not a within-package cleanup.
- **Cross-package regression blocking the test suite (highest-value finding).** In the bundle head, `@flighthq/render-gl`'s barrel no longer exports `makeGlState` (the `export … from './glTestHelper'` line present in base was dropped), yet every `displayobject-gl/src/*.test.ts` imports `{ makeGlState } from '@flighthq/render-gl'` — so the head tree's test suite is unresolvable at import time, contradicting the status doc's "193/193 passing" claim. A `render-gl` regression surfaced here because this package is its sole observed casualty. Separately: exporting a `*TestHelper` from a production barrel is itself a smell — prefer a dedicated test-only entry over the production root.
- **Gold-tier gaps (per the maturation roadmap), all unblessed in scope/priority:** context-loss recovery, shape-mesh batching/instancing, advanced blend modes, and velocity/cache writers for the new GPU fill/stroke/text paths once they exist.
- **Rust port (`flighthq-displayobject-gl`) timing.** The crate is declared but unbuilt; the roadmap defers it until the raster fallbacks are gone so the port does not mirror the wrong architecture. Confirm the defer-until-native-GPU-paths-land sequencing.
