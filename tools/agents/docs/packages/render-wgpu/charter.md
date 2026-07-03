---
package: '@flighthq/render-wgpu'
crate: flighthq-render-wgpu
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# render-wgpu — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/render-wgpu` is the **WebGPU backend core** of the render layering — the subject-agnostic GPU plumbing for the WebGPU technology, the sibling of `render-gl` (glow/WebGL2) under the backend-agnostic `@flighthq/render`. It owns the render state lifecycle (adapter/device negotiation, canvas-context configuration, the uniform ring buffer), the frame loop (`renderWgpuBackground` / `submitWgpuRenderPass`, MSAA draw-and-resolve, depth-stencil management), the pipeline cache and blend table (keyed on `blendMode-stencilMode-format-sampleCount[-depthwrite]`), the quad draw path, texture upload/binding, offscreen render targets + pool, scissor, the fullscreen pass primitive, the shader/material registries, timestamp profiling, frame-capture readback into a `@flighthq/surface` buffer, and a tree-shaken device-lost signal group.

It is **not** a per-subject renderer. It draws no display objects, sprites, scenes, or filters on its own; those live in the `<subject>-wgpu` leaves (`displayobject-wgpu`, `scene-wgpu`, `filters-wgpu`/`effects-wgpu`) that register against `@flighthq/render` and call into this core. The seam between "subject-agnostic GPU plumbing" (here) and "per-subject draw" (the leaf) is the central boundary this package has to hold — and it is exactly the boundary the review flags as still blurred (scissor, fullscreen-pass, and shader-registry primitives ship here but are wired by the leaves).

## North star (proposed)

1. **Subject-agnostic GPU plumbing, nothing more.** This package is named by its _technology_ (WebGPU), not its subject. It should compose with any subject's leaf renderer without ever importing a subject package. A runtime dependency on `displayobject` (or any node/graph package) is a layering inversion: the leaves depend on the core, never the reverse.
2. **`render-gl` is the sibling reference.** The two GPU cores should stay symmetric in shape and naming — `registerWgpuBitmapShader` mirrors `registerGlBitmapShader`, the pipeline/blend/warm surfaces line up — so a reader who knows one knows the other and a per-subject leaf can target both through parallel seams.
3. **Explicit GPU ownership, deterministic teardown.** `destroy*` frees the GPU resources this core owns (buffers, textures, targets, query sets) and is honest about what it does _not_ own (the shared device). Allocation is named (`create*`/`acquire*`), pool brackets are paired (`acquire`/`release`), and out-param draw paths are alias-safe by reading inputs into locals first.
4. **Opt-in cost, tree-shaken by default.** No top-level registration or side effects; signals, timestamp queries, and every effect gate behind `enable*`/`register*`/`create*`. A scene that does not use a capability does not pay for it (`sideEffects: false`, signal groups tree-shaken when unused).
5. **The conformance/readback path is first-class.** Frame capture into a `@flighthq/surface` buffer is the screenshot/conformance instrument, and the Rust `flighthq-render-wgpu` crate is the parity target. Surfaces, formats, and the captured pixel layout should map cleanly across the TS↔Rust seam.

## Boundaries (proposed)

**In scope:**

- WebGPU render state lifecycle, frame loop, MSAA, depth-stencil, offscreen targets + pool.
- The pipeline cache, fixed-function blend table, stencil/scissor state, fullscreen pass primitive.
- Quad draw path, texture upload/binding, uniform packing, the shader/material registries.
- Adapter-capability negotiation, timestamp profiling, device-lost signals, frame-capture readback.

**Non-goals:**

- **Per-subject rendering.** Display objects, sprites, 3D scenes, filters, and effects are drawn by the `<subject>-wgpu` leaves, not here.
- **The backend-agnostic core.** Registration, the render queue, the update pipeline, and the draw contracts live in `@flighthq/render`; this package implements them for WebGPU.
- **Canvas2D / DOM substrates.** Those are other backends (and in the Rust port, not ported at all); WebGPU is this package's only technology.
- **Subject data or scene-graph participation.** Node data, transforms, and graph membership belong to the node/subject packages; this core consumes render nodes, it does not own them.

## Decisions

None blessed yet.

## Open directions

Every candidate question below comes from `review.md` and the structural forks that touch this package. They are surfaced for an explicit conversation, not assumed.

1. **The core/leaf cut — the central undecided boundary.** What exactly belongs in this subject-agnostic core vs. in `displayobject-wgpu` / `scene-wgpu` / `filters-wgpu` / `effects-wgpu`? Scissor, the fullscreen pass, and the shader/material registries ship here but are wired by the leaves. This is proposed as the North star above, but the precise line needs your ruling. (Touches structural fork A — source-data vs. graph-participation — and fork D — the runtime backend seam.)
2. **Does the core own a batched/instanced draw primitive (`WgpuQuadBatch`)?** And if so, what is the shared instance-buffer layout? The sprite-batch runtime fields are populated by `displayobject-wgpu` today, not by a core primitive. This is a cross-package design decision with the `displayobject-wgpu` / `scene-wgpu` consumers — surfaced, not assumed.
3. **Cross-backend tolerance for separable / destination-read blend modes.** Difference, Hardlight, Invert, and Overlay are detected (`requiresWgpuBlendReadback`) but not implemented — no WGSL read-back pass exists. Is "close enough" to Canvas `globalCompositeOperation` / WebGL acceptable, or does the parity spec require bit-exact matching? This gates whether (and how exactly) the read-back path is built. (Touches fork B — closed union vs. registry — for how the blend table is dispatched as it grows.)
4. **Should offscreen `createWgpuRenderTarget` support `sampleCount` (MSAA filter targets)?** Today only the main canvas pass is MSAA-capable; the pool would need to match on sample count.
5. **Who emits `onContextResize`** — the host (which owns the canvas resize event) or `renderWgpuBackground` (which can detect a dimension change)? Until decided, the signal is allocated but never produced (dead).
6. **Is the Rust signal/async divergence a blessed conformance-map entry, or should the TS seam be reshaped?** `WgpuRenderStateSignals` uses the listener-function `Signal<(args) => void>` form; the Rust map mandates `Signal<T>` parameterized by _payload_, and the multi-arg `onContextResize` (`width, height`) will not map to a single payload struct. Closure→channel and `mapAsync`→futures/poll are similar divergences. Bless them in the conformance map, or reshape the TS seam (payload-struct signals) to keep the crates 1:1? (Touches fork D — and the Wasm-mixing dimension of it.)
7. **Should `@flighthq/displayobject` move to `devDependencies`?** It appears only in _test_ files yet sits in `dependencies` — a layering inversion for a subject-agnostic core. Confirm the dependency is genuinely test-only and demote it (a candidate `packages:check`/manifest fix).
8. **Package Map silence.** The TS codebase-map Package Map does not list `render-wgpu` (nor `render-gl` or the `<subject>-<backend>` leaves); the render reorg's layering is documented only in the Rust map. Should the TS Package Map gain the wgpu/gl cores and the leaves?
9. **How far should device-loss recovery and texture quality go?** Device-loss has the notification half (`onDeviceLost`) but no resource-recreation/`pushErrorScope` action half; mipmaps and anisotropy are absent (no `generateWgpuTextureMipmaps`, no mip chain / `maxAnisotropy`). Are these in this core's mature scope, or deferred?
