---
package: '@flighthq/render-wgpu'
updated: 2026-07-21
basedOn: ./review.md
---

# render-wgpu — Assessment

> Recommendation layer. Sorts the gaps in `review.md` into sweep-safe `Recommended` vs. parked `Backlog`. `Approved` is empty — approval is the user's verbal gate. Design forks and cross-package items are routed to the charter's Open directions (noted below; the charter is not edited here).
>
> **No maturation roadmap to absorb.** `reviews/maturation/depth/render-wgpu.md` does not exist — the review is the first survey of this package, so the only seed is `review.md` itself.
>
> The charter is a pure stub (all four sections `TODO`), so every design-shaped item lands in `Backlog` by default and feeds the charter's Open directions — there is no blessed North star or Boundary yet to make a call against. The structural forks most in play here are **D** (the runtime backend seam: what is the subject-agnostic core vs. the per-subject leaf) and **A** (source-data vs. graph-participation), both of which gate the core/leaf cut.

## Directed

1. **Defer `ApplicationRenderView` and partial-target parity until the GL contract settles.** Do not add an upward `@flighthq/application` dependency or preserve a premature WGPU factory merely for symmetry. Once GL functionals validate the shared `RenderTarget`/`Viewport`/pass semantics, implement the same lower-layer contract here.

## Recommended

Sweep-safe: within `@flighthq/render-wgpu`, no cross-package coupling, no breaking change, no open design decision. A blanket "do all recommended" can safely bless this set.

1. **Remove the dead branch and redundant runtime fetch in `drawWgpuFullscreenPass`.** `wgpuFullscreenPass.ts:106` reads `const pass = dest !== null ? runtime.renderPass : runtime.renderPass;` — both ternary arms are identical, and `getWgpuRenderStateRuntime` is called twice (`runtime2` re-fetch). The function always draws into the current open pass, so `dest` is effectively ignored. Collapse the ternary, drop the second fetch, and either honor `dest` or document/remove it. Pure within-file cleanup, no API or behavior change. — review.md#contract--docs-fit (Cleanliness / minor)

2. **Guard the timestamp readback against its multi-frame `mapAsync` hazard.** `scheduleWgpuTimestampReadback` (`wgpuTimestampQuery.ts:95`) calls `mapAsync` on a single readback buffer every submitted frame with no in-flight guard; a second submit before the prior map resolves makes `mapAsync` reject (silently swallowed → frozen value) or throw on some implementations. Add a "map pending" flag or a small ring of readback buffers. Internal correctness fix, no public surface change. — review.md#gaps (timestamp readback latent multi-frame hazard)

3. **Add `generateWgpuTextureMipmaps` and mip/anisotropy sampler support.** No mip chain exists today; samplers are linear/nearest with no `maxAnisotropy`, so atlas minification quality suffers. This is the standard within-package GPU primitive and is `render-gl` parity — additive, no design decision, no cross-package coupling. — review.md#gaps (mipmaps + anisotropy absent)

4. **Move `@flighthq/displayobject` from `dependencies` to `devDependencies` (after confirming it is test-only).** It appears only in test files (`createBitmap` in `wgpuDraw.test.ts`, `wgpuShaderBinding.test.ts`) yet sits in runtime `dependencies` — a layering inversion for a backend core (`displayobject-wgpu` depends on `render-wgpu`, never the reverse). The fix is to this package's own manifest; confirm the import is genuinely test-only, then relocate it. Within-package packaging correction, no API change, surfaced by `packages:check`. — review.md#contract--docs-fit (mis-declared dependency)

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Reason given per item. The design-shaped items also feed the charter's **Open directions** (noted for the charter; not edited here).

- **Separable / destination-read blend modes (Difference, Hardlight, Invert, Overlay).** Today they are predicate-only (`requiresWgpuBlendReadback` detects them; `BLEND_MODES` maps them to `null` → silent Normal fallback); no WGSL read-back pass exists. Building the read-back path is gated by Open direction #3 (cross-backend tolerance — is "close enough" to Canvas `globalCompositeOperation` acceptable, or is bit-exact parity required?). Design decision, not a sweep. → Open direction. — review.md#gaps (separable/destination-read blend modes) / candidate-open-directions (3)

- **A batched/instanced core draw primitive (`WgpuQuadBatch`) + the shared instance-buffer layout.** The review's status doc and the leaf packages (`displayobject-wgpu`/`scene-wgpu`) make this a joint layout decision — whether the core owns the batch primitive at all is the core/leaf cut. Cross-package design fork (structural forks A and D). → Open direction. — review.md#gaps (no batched/instanced core primitive) / candidate-open-directions (1, 2)

- **Emit `onContextResize`.** The signal is allocated but never fired — a dangling producer. Whether the host (owns the canvas resize event) or `renderWgpuBackground` (detects dimension change) emits it is undecided (Open direction #5); until it is, even removing the dead allocation pre-judges the call. → Open direction. — review.md#gaps (`onContextResize` allocated but never emitted) / candidate-open-directions (5)

- **Device-loss recovery action half.** `onDeviceLost` fires but there is no resource-recreation path and no `pushErrorScope`/`popErrorScope` OOM guards. The recovery story is larger than a sweep and partly a design question (what is recreated, by whom, on which signal) — it touches the host and the leaf consumers. Parked. — review.md#gaps (device-loss recovery half-built)

- **`warmWgpuPipelinesForScene(format/blend/sample set)`.** The current warm-set is 18 combinations (1 format, sampleCount=1); HDR/MSAA/depth-write variants compile lazily. A scene-aware warm function needs the scene's actual format/blend/sample set, which is owned by the leaf renderer — so it is coupled to the core/leaf boundary (Open direction #1), not pure within-core work. Parked pending that cut. — review.md#gaps (warm-set partial by construction) / candidate-open-directions (1)

- **MSAA-capable offscreen `createWgpuRenderTarget` (`sampleCount`).** Only the main canvas pass is MSAA-capable today; the pool would need to match on sample count. This is Open direction #4 (does the offscreen target support MSAA filter targets?) — a scope decision, not a sweep. → Open direction. — review.md#candidate-open-directions (4)

- **Rust `flighthq-render-wgpu` parity.** None of the pass-1/pass-2 surface (feature negotiation, MSAA, timestamps, z-order, signals, expanded warm set) is mirrored in the crate, and the divergences (closure→callback/channel, async map→futures/poll) are not recorded in the conformance map. Cross-worktree coordination, not within-package TS work. — review.md#gaps (Rust parity not done)

- **Signal payload-form divergence (`Signal<(args) => void>` vs. the Rust payload struct).** `WgpuRenderStateSignals` uses the TS listener-function form; multi-arg `onContextResize` (`width, height`) will not map cleanly to a single Rust payload struct. Whether this is a blessed conformance-map entry or the TS seam is reshaped (payload-struct signals) is Open direction #6 — a cross-package/TS↔Rust shape decision. → Open direction. — review.md#contract--docs-fit (signal form) / candidate-open-directions (6)

- **Add the wgpu/gl cores and the `<subject>-<backend>` leaves to the codebase-map Package Map.** The TS Package Map still reads "render-canvas/-dom/-webgl" and does not list `render-wgpu` (nor `render-gl`, `displayobject-wgpu`, …); the render reorg's layering is documented only in the Rust map. A docs/admin fix outside this package's source — surfaced for the map maintainer, not a code sweep. — review.md#contract--docs-fit (Package Map silence)

- **Author the charter's North star / Boundaries.** `lastDirection: null`; the dominant finding is that the charter is a pure stub. The central question — render-wgpu's boundary vs. `displayobject-wgpu`/`scene-wgpu`/`filters-wgpu`/`effects-wgpu` (which primitives belong in the subject-agnostic core vs. the per-subject leaf) — should become the charter's North star and would settle the batch-primitive, scene-warm, and scissor/fullscreen/shader-registry ownership questions by precedent. Charter authoring is the user's gate, not an assessment action. → Open direction. — review.md#candidate-open-directions (1)

## Approved

_Frozen on the user's verbal approval only. None yet._
