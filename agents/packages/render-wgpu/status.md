---
package: '@flighthq/render-wgpu'
updated: 2026-08-16
by: builder4
---

# render-wgpu — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/render-wgpu/src/` (and `packages/types/src/`) on 2026-08-08.
A file:line here is a claim about this tree, not about a session.

- **`WgpuRenderStateSignals` is a header with no implementation.** The interface declares `onDeviceLost` and
  `onContextResize` (`packages/types/src/WgpuRenderStateSignals.ts:2-4`) and is exported from `types`'
  barrels, but `enableWgpuRenderStateSignals` / `getWgpuRenderStateSignals` exist nowhere in `packages/`.
  Device loss is therefore unobservable from this backend, and a consumer reading `@flighthq/types` sees a
  capability that is not there.
- **No profiling surface.** `enableWgpuTimestampQueries`, `getWgpuFrameGpuTime`, and
  `encodeWgpuTimestampResolve` are absent. `wgpuAdapterCapabilities.ts` still reports `timestamp-query`
  availability that nothing consumes.
- **No effect-target MSAA.** Pooled targets remain pinned to sampleCount 1 by a stated design choice
  (`wgpuRenderTargetPool.ts:14-15`). The main surface now has a separate, real AA path:
  `WgpuRenderOptions.antialias` renders at 2× in each axis and resolves once before presentation, default
  off. Effect targets still need multisample-capable pipeline variants to honor requested sample counts.
- **No sampleable depth.** `getWgpuRenderTargetDepthTexture` does not exist, which is exactly why
  `effects-wgpu` feeds `sceneDepthTexture: null` (`packages/effects-wgpu/src/wgpuRenderEffectPipeline.ts:165`)
  while its GL peer feeds a real texture. This is the single keystone under SSAO, screen-space fog, and
  depth-of-field on WGPU.
- **Painter's order only.** No depth-write pipeline variant (`getActiveWgpuDepthWritePipeline` is absent), so
  there is no opt-in z-ordered path.
- **Guard asymmetry with render-gl.** Only `enableWgpuTextureResolverGuards` exists here; `render-gl` carries
  three (`enableGlRenderStateGuards`, `enableGlRenderTextureGuards`, `enableGlTextureResolverGuards`). The
  diagnostics-inversion rule wants the missing two.
- **The scissor stack has no caller.** `pushWgpuScissorRect` / `popWgpuScissorRect` / `applyWgpuScissorRect`
  (`wgpuScissor.ts`) are exported, tested, and referenced by nothing outside this package — `scene2d-wgpu`
  never applies them, so a rect clip does not scissor on WGPU. The wiring belongs to that cell.
- **Darken and Lighten are not exact under partial coverage.** `MIN`/`MAX` do not distribute over
  `(1-a)*dst + a*B(src,dst)`, so at zero alpha Darken wipes the backdrop to black
  (`wgpuShader.ts:142-144`). Both want a destination-reading `BlendEffect`, matching the note in
  `render-gl`'s `DEFAULT_GL_BLEND_MODES`.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-19** — Wired `WgpuRenderOptions.antialias` at the single main-surface seam as a 2× supersample
  texture plus fullscreen linear resolve (`wgpuAntialias.ts`, `wgpuBackground.ts`); default and capture
  harness remain off, while effect-target MSAA remains a distinct open capability.
- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The whole 2026-06-24 "pass 2, 91/100" block
  checked out **false**: `wgpuTimestampQuery.ts` and `wgpuRenderStateSignals.ts` are not in `src/`, and
  `enableWgpuRenderStateSignals`, `getWgpuFrameGpuTime`, `getActiveWgpuDepthWritePipeline`, and
  `requiresWgpuBlendReadback` exist nowhere in `packages/`; the MSAA runtime fields are gone too. The
  headline **deferral** was equally wrong in the other direction — "mipmaps + anisotropy deferred, no current
  consumer" is closed by `wgpuMipmap.ts:10` (`generateWgpuMipmaps`, `getWgpuMipLevelCount`). The
  read-back blend-mode deferral is moot: Overlay/HardLight/Difference/Invert left the node-property
  `BlendMode` enum entirely and are now a `BlendEffect` (`wgpuShader.ts:138-141`).
- **2026-07-24** — Native BC/ETC2/ASTC `TextureContainer` uploads with capability reporting, format mapping,
  and an opt-in compressed `ImageResource` path; `wgpuCompressedTexture.ts`.
- **2026-06-24** — Claimed fixed-function blend coverage, scissor stack, fullscreen pass, adapter capability
  negotiation, MSAA, timestamp queries, and a signals group; only the scissor stack, fullscreen pass, and
  adapter capabilities survive in the tree.
