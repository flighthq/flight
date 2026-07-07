---
package: '@flighthq/displayobject-wgpu'
updated: 2026-06-24
basedOn: ./review.md
---

# displayobject-wgpu — Assessment

The package reviews `solid — 90/100`: full 2D kind coverage, an open velocity-writer registry, clipping/render-cache/color-transform subsystems, and a clean builder-67dc46d64 hygiene increment (register-all convenience, the stats API, typed renderer-data helpers, four closed exports:check gaps). Almost every remaining gap is externally gated — blend taxonomy in `render`/`@flighthq/types`, a shared tessellator in `@flighthq/path`, MSAA in `render-wgpu`, the `text-shaping` seam — so the sweep-safe within-package surface is small. The charter is still a stub (only "What it is" filled), so the larger questions are routed to **Open directions**, not Recommended.

## Recommended

Strictly sweep-safe: within `@flighthq/displayobject-wgpu`, no cross-package coupling, no breaking change, no open design decision. Safe for a blanket "do all recommended."

- **Stats integration test.** The four `WgpuRenderStats` functions are unit-tested in isolation, but no test drives `resetWgpuRenderStats` → `flushWgpuSpriteBatch(count>0)` → assert `batchFlushCount` / instance counts. The `recordWgpuBatchFlush` wiring (`wgpuSpriteBatch.ts` line ~200) is verified only by reading source. Add a colocated test that exercises the live path. Pure within-package test; no behavior change. (review.md#gaps — "No stats integration test")
- **Degenerate-input sentinel hardening.** Audit the text/shape fallback paths so a zero-size text field, empty shape, or missing GPU device no-ops / returns a sentinel rather than throwing, reserving throws for misuse (drawing with no registered material). The contract-fit review already finds sentinels used correctly for expected-absence; this closes the residual degenerate-geometry edge cases the roadmap calls out. Within-package, no API-shape change. (depth roadmap Bronze — "Honest sentinels for unsupported paths")
- **Velocity-writer coverage for the remaining drawable kinds.** Extend the existing open velocity-writer registry (`registerWgpuVelocityWriter`, today covering display-object / particle-emitter / quad-batch) with default writers for the other kinds the screen path can draw — shape meshes, tilemap, text, video — so motion-blur input is exhaustive rather than batch-only. This is purely additive to an already-open registry (fork B already satisfied), no new design decision, fully within-package. (depth roadmap Gold — "Velocity-field completeness")

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction.

- **Wire `recordWgpuTextureUpload`.** Defined/exported/tested but has no caller; counts nothing until `render-wgpu`'s upload path (`bindWgpuTexture` / `updateWgpuTextureEntry`) calls it. _Parked: requires editing `render-wgpu` — cross-package._
- **Blend modes beyond Normal + Add.** `wgpuSpriteBatch.ts` silently resolves any other `BlendMode` to Normal. _Parked: blocked on a blend-mode separable/non-separable taxonomy in `render`/`@flighthq/types`, and the non-separable modes (overlay/hardlight) need a dest-read pass both GPU backends must implement identically. Open direction #1._
- **GPU stroke tessellation, gradient shading, and bitmap fills.** Shapes are solid-fill mesh today. _Parked: blocked on a shared tessellator / fill-descriptor home in `@flighthq/path` (+ gradient-stop types in `@flighthq/types`) so GL/wgpu/skia share one stroker rather than three private copies. The cross-package design decision must land first. Open direction #4._
- **MSAA / multisample pipelines (`WgpuAntialiasOptions`).** Every tessellated edge and stencil clip is aliased. _Parked: a `render-wgpu` core change first (multisample pipelines + resolve targets; the target pool pins `sampleCount 1` by design); this package then opts its fill/clip pipelines in. Cross-package, sequenced after the core._
- **GPU glyph-atlas text (label + rich text), incl. SDF/MSDF.** _Parked: the headline feature gap, blocked on the `text-shaping` seam landing; the atlas / glyph-key / shaped-run types are shared SDK header (`@flighthq/types`) and shared with `displayobject-gl` — a coordinated text-stack effort, not a wgpu-private atlas._
- **`register*DisplayObjectRenderers` / `register*SpriteRenderers` twins for `displayobject-gl`.** The status flags the missing GL siblings; the shared built-in `*Kind` list would live in `@flighthq/types`. _Parked: a two-package edit and a cross-backend-contract decision. Open direction #3._
- **Color-transform material asymmetry.** GL exposes `glColorTransformMaterial` + `glUniformColorTransformMaterial`; wgpu collapses to one. _Parked: needs a cross-backend decision — add `wgpuUniformColorTransformMaterial` for symmetry, or record the single material as intentional in the conformance/divergence map. Not a silent in-package add._
- **Custom-shader ergonomics — a documented `WgpuShaderMaterial` contract.** Formalize the per-node `resolveWgpuShader` escape hatch (uniform layout, sampler bindings, the `getWgpuQuadBatchPreludeWGSL` prelude) with a worked example. _Parked: formalizing a public material contract is an API-shape decision, not sweep-safe hygiene; larger scope._
- **Timestamp / GPU-pass profiling (`enableWgpuTimestampQueries`, `getWgpuPassTimings`).** _Parked: self-contained but larger Gold-tier scope over the `timestamp-query` feature; defer behind the cheaper CPU-counter stats already landed._
- **Render-cache depth.** Dirty-region invalidation, cache-target pooling (`acquireWgpuRenderTarget`/`releaseWgpuRenderTarget`), size budgeting, mipmapped cache textures. _Parked: larger within-package scope, beyond a single sweep._
- **Full vector-fill robustness.** Self-intersecting paths, even-odd vs nonzero winding, holes, analytic-AA fill edges, scale-tied curve-flattening tolerance. _Parked: depends on the shared `@flighthq/path` tessellator (same blocker as strokes/gradients); cross-package + large._
- **Exhaustive error/edge handling.** Device-lost recovery, oversize-texture / atlas-overflow, zero/NaN transforms, the full unsupported-feature sentinel matrix under test. _Parked: larger hardening track; the atlas-overflow slice is coupled to the gated glyph-atlas work._
- **Cross-backend parity functional-test scenes.** Strokes / gradients / bitmap fills / blend modes / clipping rendered through wgpu and asserted against canvas/GL via `test:parity`. _Parked: most of the subjects (strokes, gradients, advanced blend) do not exist on wgpu yet — these baselines follow the gated features above._
- **`render-backend-support.md` is stale on wgpu blend.** It states "wgpu = none"; the sprite batch implements Normal + Add (pipeline-keyed by blend mode). Should read "wgpu = Normal + Add" to match the `displayobject-gl` line. _Parked: edits a shared admin doc, not the package — out of the within-package sweep set; queue as a doc-correctness fix._
- **TS Package Map missing the `displayobject-<backend>` family.** The head `index.md` Package Map lists `render-canvas`/`render-dom`/`render-webgl` and `filters-gl` but no `displayobject-gl` / `displayobject-wgpu` / `displayobject-canvas` / `displayobject-dom` line, so a reader cannot find where wgpu display rendering lives. _Parked: edits the shared map (`index.md`), cross-cutting; queue as a doc fix alongside the render reorg._
- **Rust-crate parity (`flighthq-displayobject-wgpu`).** Function-for-function mirror over `render-wgpu`/wgpu, checked by the parity differ against `rust:skia`. _Parked: a separate track that should follow the TS Gold shape, not lead it. Open direction #5._

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter (Open directions — do not edit the charter here)

The charter is a stub. These design forks / cross-package questions surfaced during assessment and belong in `charter.md › Open directions` for an explicit direction pass, not in Recommended:

1. **Blend-mode boundary** — is wgpu intentionally Normal+Add-only until the `render`/`types` blend taxonomy lands, or is the full OpenFL blend set in-scope here once unblocked? (Biggest visible feature gap; touches `render`/`@flighthq/types`.)
2. **Stats-API status** — is `WgpuRenderStats` (homed in `@flighthq/types`, with `textureUploadCount` wired to nothing) a blessed long-term surface or a temporary diagnostic? Should there be a parallel `GlRenderStats`, or a backend-agnostic `RenderStats` in `render`? A direction call avoids per-backend drift.
3. **Cross-backend register-all contract** — is "register all built-ins for backend X" a blessed, symmetric pattern across gl/wgpu/canvas/dom (with the shared `*Kind` list in `@flighthq/types`)?
4. **GPU shape-fill home** — do stroke tessellation / gradients / bitmap fills live in `@flighthq/path` as one shared tessellator consumed by both GPU backends (and later skia), or per-backend? Gate on shape fidelity; fork A/E territory.
5. **Rust-parity order** — TS-Gold-then-Rust, or co-evolution, for `flighthq-displayobject-wgpu`?
