---
package: '@flighthq/effects'
updated: 2026-08-08
by: principal
---

# effects — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item below was re-checked against `packages/effects/src/` on 2026-08-08. A file:line here is a
claim about this tree, not about a session.

- **The defaults table is stale in both directions and consumed by nobody.**
  `renderEffectDefaults.ts:63` gives `BloomEffect` a `brightness` / `mipCount` / `thresholdKnee` that
  are not fields of `packages/types/src/BloomEffect.ts` (so unsettable) and omits `intensity`, which
  is. `getRenderEffectDefaults` / `normalizeRenderEffect` have no caller outside their own test —
  the table was never wired in, so it did not drift, it started wrong. Same shape in `SsrEffect`,
  `MotionBlurEffect`, `BokehDepthOfFieldEffect`.
- **`BloomEffect.passes` is read by nothing.** Declared at `packages/types/src/BloomEffect.ts:8`; the
  only `.passes` reads in the tree are the box-blur helpers' own `options.passes`, not a bloom runner.
  An accepted-and-discarded field typechecks and renders plausibly, which is what makes it expensive.
- **ToneMap exposure is a unit mismatch.** `toneMapMath.ts:33` defines `computeExposureScale` as EV
  stops (neutral 0) and is tested that way, but it is called by nothing but its test; the runners take
  `exposure` as a raw linear multiplier (neutral 1). It survives because 1× looks neutral.
- **No realization registry.** The ratified architecture makes realization *presence* the support
  matrix, via a `(kind, backend)` registry plus `explainEffectRealization`. Neither name exists
  anywhere in the tree, so backend coverage is still only discoverable by grepping each backend.
- **`RenderEffect` carries only `kind`** (`packages/types/src/RenderEffect.ts:13`). There is no
  pipeline-level `enabled` skip flag and no base-contract `intensity`; `intensity` is a per-descriptor
  field the backends read individually.
- **Two continuous-pointwise ops are still Effects.** `whiteBalanceEffect.ts` is exactly linear and
  its matrix builder already sits in the other tier (`adjustments/src/colorMatrixMath.ts:356`);
  `toneMapEffect.ts` is continuous pointwise and LUT-bakeable. Both are candidates to re-sort into
  `@flighthq/adjustments`. Posterize/dither correctly stay here — they are discontinuous.
- **`lerpRenderEffect` has no consumer.** Only `effects` itself
  imports it; `tween` and `timeline` — the packages it was built for — never do. Readonly array
  fields snap rather than interpolate.
- **No `serializeRenderEffect` / `deserializeRenderEffect`**, and no `EyeAdaptationEffect` (only
  `AutoExposureEffect`).
- **`strength` has a ratified meaning and no shared primitive to carry it.** Gain on coverage applied
  *after* the spatial operator, then clamped; there is no post-operator coverage-gain helper here for
  the runners to reach for. The per-backend defects belong to the `effects-gl` / `-wgpu` / `-canvas`
  cells; see [effect recipe model](../../effect-recipe-model.md) (settled section only — the rest of
  that doc is unratified).

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The entire 2026-06-25 entry was false as
  of this tree: it reported `src/` as "only the thin `create*Effect` factory files (44 files)" with
  `renderEffectDefaults.ts` and `toneMapMath.ts` absent, and parked both Recommended items on that
  basis. `src/` now holds 72 sources including both files, and both parked items landed —
  `FilmicToneMapOptions` / `AgxToneMapOptions` exist in `@flighthq/types` and thread through
  `computeFilmicToneMap` (`toneMapMath.ts:39`) / `computeAgxToneMap` (`:22`). Also dropped the
  "backends should honor `RenderEffect.enabled`" cross-package ask: that field does not exist on the
  base type. The pointwise catalog (`invert`, `grayscale`, `sepia`, `channelMixer`,
  `brightnessContrast`, `exposure`, `colorBlindSimulation`, `colorGrade`, `hueSaturation`,
  `liftGammaGain`, `lookupTableGrade`) has left for `@flighthq/adjustments`, and the CDL / LUT /
  color-science math with it.
- **2026-06-25** — Recommended sweep executed nothing; both items were retracted on a source read.
  Superseded by the entry above.
- **2026-06-24** — `builder-67dc46d64` bundle ingested as-claimed: the math modules (gaussian, tone
  map, bloom, depth, stylize, Kuwahara, god rays, edge detect), the introspection surface, and the
  Gold catalog descriptors.
