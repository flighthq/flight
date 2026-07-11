---
package: '@flighthq/displayobject-wgpu'
crate: flighthq-displayobject-wgpu
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# displayobject-wgpu — Charter


## What it is

The WebGPU per-subject leaf-renderer set for 2D display objects: the GPU backend that draws every 2D display-object kind — bitmap, shape (incl. scale9), sprite / quad-batch, tilemap, particle emitter, text label, rich text, video, render-cache — into a `WgpuRenderState` over `render-wgpu` / `render`. It is one cell in the `<subject>-<backend>` render layering: subject-agnostic GPU plumbing lives below in `render-wgpu`; this package is the wgpu half of the display-object subject, the twin of `displayobject-gl` (GL) and the host-web-only `displayobject-canvas` / `displayobject-dom`.

It owns the wgpu side of: instanced sprite batching, tessellated-mesh shape rendering, scissor + stencil clipping, off-screen render-cache targets, color-transform materials, a per-state velocity-writer registry, a text-input overlay seam, and a per-frame stats surface. It does **not** own the GPU device/surface/shader plumbing (that is `render-wgpu`), the backend-agnostic update pipeline and registration core (`render`), or the shape-command IR (shared from `displayobject-canvas` and re-exported under `defaultWgpu*` aliases).

## North star

_Proposed from the design + the structural forks. Edit or reject in review._

- **Full 2D display-object kind coverage on wgpu.** Every kind the unified 2D graph can hold draws through a `defaultWgpu*Renderer`; a kind that renders on Canvas/GL but silently no-ops on wgpu is a gap to close, not an acceptable asymmetry.
- **A leaf over the GPU core, not a GPU engine.** Device, surface, shaders, targets, and present belong to `render-wgpu`; this package consumes that plumbing and adds only per-subject draw logic. When a feature needs new GPU plumbing (MSAA, texture-upload accounting), the plumbing lands below and this package wires to it.
- **Registry over closed union (fork B).** Renderer registration and the velocity-writer subsystem are open `Map`-keyed registries, opt-in behind `register*` / `enable*` functions, never a closed `switch(kind)`. The lone closed branch (blend dispatch) is a hot-loop concession that becomes a registry only if the taxonomy grows enough to warrant it.
- **Side-effect-free, single-root, opt-in.** `"sideEffects": false`, one `.` export, no top-level `registerRenderer`; all registration and subsystem enablement is a function the caller invokes by name. A 2D wgpu app pulls in only the kinds it registers.
- **Conformance to the TS spec, then Rust parity.** The TS package is the authoritative shape; `flighthq-displayobject-wgpu` conforms to it. (Order of TS-first vs. co-evolution is an open direction below.)

## Boundaries

_Proposed scope lines, drawn from the review and neighbors. Confirm in review._

In scope:

- wgpu draw logic for every 2D display-object kind, over `render-wgpu` / `render`.
- Sprite/quad-batch instancing, tessellated-mesh shapes + scale9 remapping, scissor/stencil clipping, render-cache targets, color-transform materials, the velocity-writer registry, the text-input overlay seam, and per-frame stats.
- The `register*` convenience surface for registering the package's built-in renderers.

Non-goals (owned elsewhere):

- GPU device/surface/shader/target/present plumbing → `render-wgpu`.
- Backend-agnostic registration, render state/queue, and the update pipeline → `render`.
- The shape-command IR and command builders → `displayobject-canvas` (re-exported here, not authored here).
- Canvas2D / DOM rendering → `displayobject-canvas` / `displayobject-dom` (host-web only; no wgpu analogue).
- 3D scene rendering → `scene-wgpu` (a different subject over the same GPU core).
- CPU filters/effects → `filters` / `effects` / `filters-surface`.

## Decisions

- **2026-07-02 — WGPU may lead; parity is the goal, not lockstep.**
- **2026-07-02 — No umbrella registerAll — maximum tree-shaking.**
- **2026-07-02 — TS-leads, Rust conforms later.**

## Open directions

Every candidate question from the review, plus the structural forks that touch this package. These are the real uncertainties — a direction pass must settle them; nothing here is decided.

1. **Blend-mode boundary (fork B trigger).** Is wgpu intentionally Normal+Add-only until a blend-mode taxonomy lands in `render` / `@flighthq/types`, or is the full blend set (Multiply, Screen, Overlay, …) in-scope here once unblocked? This is the single biggest visible feature gap, and it is the closed-branch that fork B says to revisit on growth.

2. **Stats API status and homing.** Is `WgpuRenderStats` a blessed long-term surface or a temporary diagnostic? Its home is `@flighthq/types` (a cross-package commitment) yet `textureUploadCount` is wired to nothing. Should there be a parallel `GlRenderStats`, or a backend-agnostic `RenderStats` in `render`, to avoid per-backend drift?

3. **Cross-backend register-all contract.** Should `register*DisplayObjectRenderers` / `register*SpriteRenderers` be a symmetric, blessed pattern across gl / wgpu / canvas / dom? The `displayobject-gl` twins are currently absent. If "register all built-ins for backend X" is a blessed shape, the symmetry is a charter-level decision, not a per-package add.

4. **Where GPU shape fills live (fork A / E).** Do GPU stroke tessellation, gradient fills, and bitmap fills belong in `@flighthq/path` as a shared tessellator consumed by both GPU backends, or per-backend? Shapes today are solid-fill mesh only; this gate on shape fidelity is explicitly cross-package.

5. **Rust-crate parity order.** `flighthq-displayobject-wgpu` is named in the conformance map. Is the intended order TS-Gold-then-Rust, or TS/Rust co-evolution? The charter should state which.

6. **Source-data vs. graph participation (fork A).** With the 2D graph unified, the velocity-writer registry and particle/quad-batch rendering straddle simulation source-data and scene-graph participation. Where is the line for what this package draws vs. what owns the node's data (particles ↔ sprite, tilemap)? Inherited from the SDK-wide fork; flagged here because this package consumes the fused result.

7. **Docs-fit revisions surfaced by the review** (admin, not package vision):
   - `render-backend-support.md` says "blend modes … wgpu = none"; the sprite path implements **Normal + Add**. Should read "wgpu = Normal + Add" to match the `displayobject-gl` line.
   - The TS Package Map (`index.md`) has no `displayobject-wgpu` / `displayobject-gl` / `displayobject-canvas` / `displayobject-dom` family entry, so a reader cannot locate where wgpu display rendering lives. Candidate: add the `displayobject-<backend>` family to the TS map.

8. **Stats integration test gap.** The stats functions are unit-tested in isolation but no test drives `resetWgpuRenderStats` → `flushWgpuSpriteBatch(count>0)` → assert counts; the wiring is verified only by reading source. Worth a blessed expectation once direction #2 settles.
