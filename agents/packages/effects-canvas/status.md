---
package: '@flighthq/effects-canvas'
updated: 2026-08-08
by: principal
---

# effects-canvas — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/effects-canvas/src/` on 2026-08-08. A file:line here is a
claim about this tree, not about a session.

- **15 runner/registrar pairs against effects-gl's 46.** Realized here: Bevel, Blend, Bloom, Blur,
  Composite, DropShadow, FilmGrain, GradientBevel, GradientGlow, InnerGlow, InnerShadow, OuterGlow,
  Pixelate, Scanlines, Vignette. The 31 GL kinds with no canvas realization — the colour-grade band, the
  screen-space band, and most of the stylize band — are not stubs, they are absent, and a chain using one
  degrades to an identity copy without a diagnostic.
- **An unregistered kind is a pipeline-level identity copy, by design.** `canvasRenderEffectPipeline.ts:146-151`
  copies source into the next ping-pong target rather than registering per-kind passthrough runners, so
  registration stays the backend's honest proof of support. Keep this rule when adding kinds.
- **`CanvasRenderEffectSupport` is an orphan header.** The three-tier vocabulary
  (`'approximate' | 'passthrough' | 'real'`) lives at `packages/types/src/CanvasRenderEffectSupport.ts` and
  is exported from `types`' `index.ts` and `contract.ts`, but no module in `packages/` consumes it, and
  neither `CANVAS_RENDER_EFFECT_SUPPORT` nor `getCanvasRenderEffectSupport` has ever existed in package
  source. Either the tier query lands or the type goes; a consumer scanning `@flighthq/types` currently
  reads a capability that is not there.
- **No batch registrar and no guard module.** `registerAllCanvasRenderEffects` and the category registrars
  are absent, so registration is 16 individual calls; `enableCanvasRenderEffectGuards` is absent, so the
  silent identity-copy path above has no shakeable warning behind it.
- **`strength` is applied before the spatial operator.** `canvasOuterGlowEffect.ts:72-74` and
  `canvasDropShadowEffect.ts:76-78` split it into `min(1,s)` pre-blur plus `floor(s)` repeated composites,
  which is neither continuous nor monotonic — `strength: 1.9` behaves as `1.0`. The GL and WGPU legs carry
  the identical shape, so the fix is one shared post-operator coverage-gain pass, not three. See
  [effect-recipe-model](../../effect-recipe-model.md), which is **unratified**: the `strength` definition
  in it is ratified, the recipe-ownership question is not.
- **`BloomEffect.passes` is accepted and discarded** — declared at `packages/types/src/BloomEffect.ts:8`,
  read by no runner here or in either sibling backend.
- **jsdom cannot execute canvas drawing commands**, so the colocated tests verify algorithm math and
  does-not-throw only. Visual correctness for this backend rests entirely on the functional baselines.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The 2026-07-31 correction was itself already
  stale and is the most significant thing dropped: it recorded "eight genuine runner/registrar pairs —
  Bloom, Blur, DropShadow, FilmGrain, OuterGlow, Pixelate, Scanlines, Vignette", and the tree carries
  **fifteen**, with Bevel, Blend, Composite, GradientBevel, GradientGlow, InnerGlow, and InnerShadow having
  landed since. The 2026-06-24 inventory below it was false in the other direction — the 44-kind
  `CANVAS_RENDER_EFFECT_SUPPORT` table, the category registrars, and the 35-runner
  `registerAllCanvasRenderEffects` do not exist. The `LookupTableGradeEffect` deferral is moot: no LUT-grade
  runner exists here at all, and the shared LUT pass is `canvasColorLutPass.ts`.
- **2026-07-31** — Capability correction: unsupported runner/apply modules deleted in `6ecb599d8`, batch
  registration retired in `2a7ac8bff`, `CANVAS_RENDER_EFFECT_SUPPORT` confirmed never to have existed.
- **2026-06-24** — Claimed a 44-kind support table, category registrars, and 35 real/approximate runners
  over `drawCanvasImageDataPass` / `drawCanvasAccumulationPass`; none of those names are in the tree.
