---
package: '@flighthq/effects-gl'
updated: 2026-08-20
by: builder5
---

# effects-gl — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/effects-gl/src/` on 2026-08-08. A file:line here is a claim
about this tree, not about a session.

- **46 per-kind runner/registrar pairs, and no batch registrar.** Registration is one
  `registerGl<Kind>Effect(state)` call per kind; `registerDefaultGlRenderEffects` and every category
  registrar (`registerBlurGlRenderEffects`, `registerColorGradeGlRenderEffects`, …) exist nowhere in
  `packages/`. A consumer wanting the full set writes 46 calls.
- **The uniform-location cache is barely reached.** `getGlEffectUniformLocation`
  (`glEffectProgramCache.ts`) is imported by 5 modules, while **42** effect modules still call
  `gl.getUniformLocation` inside their per-draw `setUniforms` closure (`glSsaoEffect.ts:21-23` is typical).
  The driver round-trip per uniform per frame is the thing the cache was added to remove.
- **Two runners are stand-ins under real names.** `applySsaoEffectToGl` darkens by local luminance variation
  rather than reconstructing view-space depth (`glSsaoEffect.ts:6-11`); `applySmaaEffectToGl` is a
  single-pass edge-aware blur, not the three-pass recipe (`glSmaaEffect.ts:6-8`). The depth blocker is gone
  on this backend — `beginGlRenderEffectPipeline` feeds a real `sceneDepthTexture`
  (`glRenderEffectPipeline.ts:169`) — so SSAO is now a runner gap, not a pipeline one.
- **`strength` is applied before the spatial operator, everywhere but Bevel.** `glEffectTintShader.ts:16`
  computes `min(1.0, a * u_alpha * u_strength)`, which folds colour alpha *inside* the clamp so alpha and
  strength are not independently controllable; `INVERT_TINT_FRAGMENT_SRC` (`:31`) inverts source alpha and
  then blurs, diverging from blur-then-invert exactly on antialiased borders; and
  `glOuterGlowEffect.ts:42-43` splits strength into `min(1,s)` pre-blur plus `floor(s)` repeated composites,
  which is neither continuous nor monotonic. `glBevelEffect.ts:137` is the one post-operator gain, and it
  names its uniform `u_intensity` while implementing strength. `effects-wgpu` and `effects-canvas` carry the
  identical shape. The missing primitive is a post-operator coverage-gain pass; see
  [effect-recipe-model](../../effect-recipe-model.md), which is **unratified** — the `strength` definition
  there is ratified, the surrounding recipe-ownership question is not.
- **`BloomEffect.passes` is accepted and discarded.** Declared at `packages/types/src/BloomEffect.ts:8`,
  read by no runner in this package or either sibling backend.
- **No chain metadata or validation.** `RenderEffectChainHint`, `validateGlRenderEffectChain`, and
  `orderGlRenderEffectChain` are absent from `packages/`; ordering hazards and HDR/depth mismatches are
  undetectable.
- **Two kinds are GL-only.** `defaultGlBokehDepthOfFieldEffectRunner` and `defaultGlCustomShaderEffectRunner`
  have no `effects-wgpu` counterpart, so a chain using either silently degrades to identity there.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-20** — Closed the stale Scanlines/Displacement Open item: `1d71634fc` had already moved both
  shaders into image-space rows, and their colocated tests now evaluate the shipped expressions to pin the
  scanline top-edge phase, displacement phase conversion, and vertical-offset sign.
- **2026-08-10** — Split the absolute-Y item: displacement is skip-all in `FLIGHT_PARITY_SKIP`
  (`captureFlightPreset.ts:42`), scanlines is not in the list at all. The 2026-08-09 entry below implied
  one shared cause; the skip is displacement's dominant one and does not apply to scanlines.

- **2026-08-09** — Recorded the two surviving absolute-Y effects (Scanlines, Displacement) in `Open`.
  Their fixed siblings landed in `a9f7adccb`/`0f0e85b23`; these two are a different fix shape and
  `functional-parity-orientation` structurally cannot flag either, so the Open item is the only record.

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-06-24 pass-2 headline checked out
  **false**: "uniform-location caching applied to all 42 effect source files" is contradicted by the tree —
  5 files import `getGlEffectUniformLocation`, 42 still call `gl.getUniformLocation` per draw. The
  cross-package SSAO deferral ("blocked on a G-buffer from `render-gl`") is also stale: the pipeline feeds a
  real depth texture at `glRenderEffectPipeline.ts:169`. The whole Pass-1 batch/category registrar API
  described below is gone from the tree.
- **2026-07-31** — Capability correction: 46 genuine per-kind runner/registrar pairs; identity TAA/SSR
  deleted in `6ecb599d8`, batch/category registrars retired in `2a7ac8bff`.
- **2026-06-25** — Recommended sweep produced no in-package edits; the one item was a cross-boundary edit to
  `agents/render-backend-support.md`.
- **2026-06-24** — Claimed batch/category registrars, `hasGlRenderEffectRunner`, uniform-location caching,
  and a mip-pyramid bloom; only the registry query and the cache module survive under those names.
