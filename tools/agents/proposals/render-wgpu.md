---
id: render-wgpu
title: '@flighthq/render-wgpu'
type: depth
target: render-wgpu
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/render-wgpu.md
  - tools/agents/docs/reviews/depth/render-wgpu.md
depends_on: []
updated: 2026-06-23
---

## Summary

_solid_ (72/100): a real, working WebGPU backend core (device bring-up, bitmap pipeline, uniform ring buffer, stencil masking, offscreen targets + pool, headless capture) that is one focused pass away from authoritative for its layer, with blend modes mostly stubbed, no MSAA, no scissor, no mipmaps, and no device-loss/error handling.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% that stops the core from silently degrading. Each item is self-contained and unblocks correct output for the leaf renderers already shipping.

- **Fixed-function blend modes** — in `wgpuShader.ts`, replace the `null` entries in `BLEND_MODES` for every mode expressible with a `GPUBlendState` alone: `BlendMode.Multiply` (`dst`/`zero` factors), `BlendMode.Screen` (`one`/`one-minus-src`), `BlendMode.Subtract` (`reverse-subtract` op), `BlendMode.Erase` (`zero`/`one-minus-src-alpha`), `BlendMode.Darken`/`BlendMode.Lighten` (`min`/`max` blend op where supported), `BlendMode.Invert` (best fixed-function approximation). The blend table must stop falling back to Normal by omission.
- **Document the separable-mode gap explicitly** — add a `requiresWgpuBlendReadback(blendMode): boolean` predicate (exported, returns `true` for `Overlay`/`Hardlight`/`Difference`/etc.) so callers can branch instead of getting a silent Normal. The fallback becomes an explicit, queryable decision, not a hidden one.
- **Scissor / rect-clip application** — add `pushWgpuScissorRect(state, out)` / `popWgpuScissorRect(state)` / `applyWgpuScissorRect(state, pass)` that actually call `pass.setScissorRect(...)`, driven by the already-present `scissorStack`/`currentScissorRect` runtime slots. Today the state is tracked and reset but never applied; wiring it is the cheap clip path the core advertises.
- **Collapse the two quad-draw paths** — route `drawWgpuQuad` and `drawWgpuQuadWithTransform` through a single `writeWgpuQuadUniforms` writer (and `setWgpuMatrixFromTransform`) instead of the duplicated inline 32-float pack. Kills the documented divergence risk between the two paths.
- **Named transform type on public signatures** — define/adopt `Readonly<Transform2DLike>` from `@flighthq/types` in `drawWgpuQuadWithTransform`, `writeWgpuMatrixOnlyUniforms`, `writeWgpuQuadUniforms`, `setWgpuMatrixFromTransform`, replacing the inline `{ a; b; c; d; tx; ty }` literals for grepability and SDK symmetry.
- **Type the render-target-result proxy** — replace the `renderProxy as never` cast and ad-hoc `{ alpha; material; transform2D }` literal in `drawWgpuRenderTargetResult` with a named `RenderTargetResultProxy` (or the existing `RenderProxy2D`) from `@flighthq/types`.

### Silver

Competitive with a well-regarded GPU 2D core: quality, robustness, and negotiation that professional use assumes.

- **MSAA pipeline variants** — extend the pipeline cache key (`blendMode-stencilMode-format`) to `blendMode-stencilMode-format-sampleCount`; add a `resolveTarget` path in `renderWgpuBackground`/`submitWgpuRenderPass` and a multisampled depth-stencil. Expose `WgpuRenderOptions.sampleCount` (1/4) and a `createWgpuRenderTarget` `sampleCount` option so offscreen targets can also be antialiased. Antialiased rotated/scaled edges are table stakes.
- **Mipmaps + anisotropy** — `generateWgpuTextureMipmaps(state, entry)` (compute or blit mip-chain), a `mipmapFilter`/`maxAnisotropy` sampler tier alongside the current linear/nearest selection, and a `WgpuTextureOptions` (`generateMipmaps`, `maxAnisotropy`) on `bindWgpuTexture`/`createWgpuTextureEntry`. Stops minified bitmaps shimmering.
- **Device-loss + error handling** — `onWgpuDeviceLost(state, listener): () => void` over `device.lost`, `pushWgpuErrorScope(state, filter)` / `popWgpuErrorScope(state): Promise<GPUError | null>` wrappers, and out-of-memory guards on texture/target creation that return sentinels (`null`) rather than throwing. Distinguish device loss (recoverable, re-create state) from misuse (throw).
- **Feature / limit negotiation** — pass `requiredFeatures`/`requiredLimits` to `requestDevice`; add `getWgpuAdapterCapabilities(adapter)` and gate `rgba16float` HDR targets behind a confirmed `float32-filterable`/blendable check, degrading to `rgba8unorm` with a queryable flag. Check `maxTextureDimension2D` on large-canvas/target paths.
- **Fullscreen pass primitive** — add `wgpuFullscreenPass.ts` (`drawWgpuFullscreenQuad` / `createWgpuFullscreenPipeline`) mirroring `render-gl`'s `glFullscreenPass.ts`, so post/filter/effect leaf packages have the canonical full-screen blit the core should own (today only single 6-vertex quads ship).
- **Shader registry parity** — add `wgpuShaderRegistry.ts` (`registerWgpuShader` / `getWgpuShader` by kind) to match `render-gl`'s `glShaderRegistry.ts`, completing the shader-binding seam beyond the per-node `setWgpuShader` resolver.
- **Separable Photoshop blend modes via read-back** — implement `Overlay`/`Hardlight`/`Difference`/`Multiply`-exact-where-needed through a destination-texture read-back path (sample the current target, blend in WGSL), gated by the `requiresWgpuBlendReadback` predicate from Bronze. Brings blend coverage to full parity with the Canvas/GL backends for cross-backend consistency.

### Gold

Authoritative / AAA: exhaustive, performant, and 1:1 with the Rust crate.

- **Batched/instanced core draw primitive** — give the core a real "draw, batched" entry it can own: `WgpuQuadBatch` (acquire/release pool over a growable instance buffer) + `drawWgpuQuadBatch(state, batch)`, the instanced counterpart to the single-quad emitters. The runtime already reserves `particleInstanceBuffer`/`spriteBatch*`; the core should expose the generic batch buffer the leaves build sprite/particle batches on, rather than every leaf re-rolling instancing.
- **Timestamp queries + profiling seam** — `enableWgpuTimestampQueries(state)`, `getWgpuFrameGpuTime(state): number` (sentinel `-1` when unsupported) over `timestamp-query`, for the performance budget an AAA core is expected to expose.
- **Pipeline cache persistence / warm-set completeness** — extend `warmWgpuPipelines` to warm every `(blendMode × stencilMode × format × sampleCount)` combination the registered leaves will use, plus an explicit warm list API so first-frame hitches are eliminated deterministically.
- **Optional z-ordered path** — a depth-write pipeline variant (`depthCompare` other than `always`) for callers that opt into z-based ordering, since depth-stencil textures are already allocated; keep painter's-order as the default.
- **Exhaustive error/edge coverage + tests** — colocated tests for device-loss recovery, OOM sentinels, every blend mode's `GPUBlendState`, scissor clipping, MSAA resolve, mipmap generation, and feature-degradation fallbacks. Add functional/parity scenes proving `wgpu` agrees with `gl` and `skia`/`canvas` on blend, clip, and AA.
- **Signals group for backend events** — `enableWgpuRenderStateSignals(state)` exposing `onDeviceLost` / `onContextResize` as `@flighthq/signals` groups (opt-in `enable*`), for hosts that need loose multi-listener notification of GPU lifecycle.
- **1:1 Rust-port parity** — bring `flighthq-render-wgpu` (wgpu/native) to match every function added above: blend table, scissor, MSAA, mipmaps, device-loss, negotiation, fullscreen pass, batch buffer, timestamp queries. The render present seam (`set_wgpu_frame_target_view` → `render_wgpu_background` → draw walk → `submit_wgpu_render_pass`) and the conformance map must list any intentional TS↔Rust divergence. This is the package that drives all four Rust hosts (winit/SDL/web/capture), so its core surface is the parity anchor.

## Sequencing & effort

Recommended order, with dependencies and items to surface:

1. **Bronze first, in one pass** (low effort, high payoff, no cross-package blocking). Order within: (a) fixed-function blend modes + `requiresWgpuBlendReadback` predicate, (b) scissor wiring, (c) collapse the two quad-draw paths, then (d/e/f) the typing cleanups. (a)–(c) change observable output and remove silent degradation; the typing items are mechanical and can ride along.
   - **Types dependency:** Bronze (e)/(f) need `Transform2DLike` and a `RenderTargetResultProxy`/`RenderProxy2D` named type confirmed in `@flighthq/types` first (header layer). If `Transform2DLike` already exists, this is adopt-not-define; if not, define it there before touching signatures. **Surface to user:** this likely affects `render-gl` signatures too (same inline-literal pattern) — a coordinated rename is a cross-package design item, not a render-wgpu-local one.

2. **Silver, robustness before quality.** Do device-loss + error scopes and feature/limit negotiation **before** MSAA/mipmaps — negotiation gates which MSAA sample counts and HDR formats are even legal, so it must land first. Then MSAA (medium-high effort: touches pipeline cache key, background/submit pass, depth-stencil), then mipmaps/anisotropy (medium). Fullscreen-pass and shader-registry parity are small and unblock filter/effect leaf packages — do them early in Silver so `filters-wgpu`/`effects-wgpu` can advance in parallel.
   - **Cross-package:** the fullscreen pass and shader registry are consumed by `filters-wgpu`/`effects-wgpu`; coordinate their seam shape with those leaves. Separable blend read-back must agree pixel-wise with the Canvas/GL implementations — this is a **cross-backend conformance decision**, surface it before implementing (a read-back blend may not bit-match a Canvas `globalCompositeOperation`, so the parity tolerance is a design call).

3. **Gold, last and largest.** Batched draw primitive is the biggest single item and should be designed jointly with `displayobject-wgpu` (sprite/particle batches) and `scene-wgpu` so the core's `WgpuQuadBatch` is the buffer they actually want — **surface this as a design decision** rather than guessing the instance layout. Timestamp queries, pipeline-warm completeness, z-order, and the signals group are independent and can be picked off in any order. The Rust parity pass should follow each TS feature landing (not batched at the end) so `flighthq-render-wgpu` never drifts far, and every divergence goes in the conformance map.

**Effort summary:** Bronze ≈ 1 focused session. Silver ≈ 3–4 sessions (negotiation+device-loss, MSAA, mipmaps, fullscreen/registry, separable blend). Gold ≈ open-ended; batched draw + full Rust parity are the bulk.

**Items to surface to the user (not auto-actioned):** (1) the `Transform2DLike`/proxy rename likely spans `render-gl` too; (2) the cross-backend tolerance for separable blend modes (read-back vs Canvas composite) is a conformance-policy decision; (3) the `WgpuQuadBatch` instance-buffer layout is a joint design with the leaf renderers.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/render-wgpu` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
