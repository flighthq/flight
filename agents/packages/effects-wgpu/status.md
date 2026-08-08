---
package: '@flighthq/effects-wgpu'
updated: 2026-08-08
by: principal
---

# effects-wgpu — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/effects-wgpu/src/` on 2026-08-08. A file:line here is a claim
about this tree, not about a session.

- **44 per-kind runner/registrar pairs, and no batch registrar.** Registration is one
  `registerWgpu<Kind>Effect(state)` call per kind; `registerStandardWgpuRenderEffects` and every band
  registrar (`registerAntialiasingWgpuRenderEffects`, `registerBloomWgpuRenderEffects`, …) exist nowhere in
  `packages/`.
- **The pipeline feeds no depth.** `beginWgpuRenderEffectPipeline` sets `sceneDepthTexture: null`
  (`wgpuRenderEffectPipeline.ts:165`) while the GL peer feeds a real texture
  (`packages/effects-gl/src/glRenderEffectPipeline.ts:169`). The blocker is upstream and named:
  `getWgpuRenderTargetDepthTexture` does not exist in `render-wgpu`. Until it does, every depth-dependent
  kind on this backend is a stand-in by construction.
- **`applySsaoEffectToWgpu` is a luminance-variation stand-in under the real name**
  (`wgpuSsaoEffect.ts:7-11`), for exactly that reason.
- **Two kinds present on GL are missing here.** There is no `BokehDepthOfField` and no `CustomShader`
  runner, so a chain carrying either silently degrades to identity on WGPU.
- **No guard module.** `effects-gl` carries `enableGlRenderEffectGuards`; `enableWgpuRenderEffectGuards`
  does not exist. An unregistered kind, a missing backdrop, or a dropped descriptor field is silent here
  and warned about there.
- **`strength` is applied before the spatial operator.** `wgpuEffectTintShader.ts:24` computes
  `min(1.0, a * colorAlpha.w * strength)`, folding colour alpha inside the clamp; the invert variant
  (`:41`) inverts before the blur rather than after; and `wgpuOuterGlowEffect.ts:39-40` splits strength into
  `min(1,s)` pre-blur plus `floor(s)` repeated composites. `wgpuBevelEffect.ts:125` is the one
  post-operator gain and names its uniform `intensity`. Identical to the GL and canvas legs — the fix is one
  shared post-operator coverage-gain pass. See [effect-recipe-model](../../effect-recipe-model.md), which is
  **unratified**: the `strength` definition in it is ratified, the recipe-ownership question is not.
- **`BloomEffect.passes` is accepted and discarded** — declared at `packages/types/src/BloomEffect.ts:8`,
  read by no runner here or in either sibling backend.
- **No chain validation.** `validateWgpuRenderEffectChain` and `RenderEffectChainHint` are absent from
  `packages/`.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Two 2026-06-24 headline claims checked out
  **false**: the "full three-pass SMAA with an analytical area function" is not in `wgpuSmaaEffect.ts`, and
  the "GL registrar taxonomy reconciliation" it reports landing in `effects-gl` describes band registrars
  that exist in neither package. The TAA history-buffer deferral is moot — `historyTarget` appears nowhere
  in `packages/` and the TAA runner itself was deleted in `6ecb599d8`. The depth deferral is the one that
  survived verification, and it is now the only cross-package blocker left standing.
- **2026-07-31** — Capability correction: 44 genuine per-kind runner/registrar pairs; identity TAA/SSR and
  the depthless BokehDepthOfField blur deleted in `6ecb599d8`, band registrars retired in `2a7ac8bff`.
- **2026-06-24** — Claimed a 45-runner library, band registrars, `hasWgpuRenderEffectRunner`, a progressive
  bloom mip-chain, and three-pass SMAA; only the registry query and the per-kind runners survive.
