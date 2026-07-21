---
package: '@flighthq/effects'
updated: 2026-07-21
basedOn: ./review.md
---

# effects — Assessment

Sorted from the depth review (90/100), verified against the live tree (66 source files, 66 test files, 262 tests, 96 exports), and the direction session (2026-07-02). Eight charter decisions blessed — most significantly the per-kind handler registration pattern that dissolves the three central tables, and effects owning interpolation via registered field-role metadata.

The package is mature — 52 effect kinds, 10 recipe math modules, full pipeline-support layer. The major remaining architectural work is the registration migration (dissolving central tables into per-kind handlers on pipeline state) and the color-aware interpolation fix (structurally via field-role metadata).

## Depth gaps

1. **Define explicit effect-input attachment requirements.** Advanced effects must declare whether they need scene color, linear/sampleable depth, normals, velocity, material data, or frame history. Descriptors remain substrate-agnostic; the presence of a backend realization and the availability of required attachments form the honest support matrix.
2. **Stop treating stand-ins as feature completion.** SSAO, SSR, TAA, motion blur, depth of field, and similar effects are not complete when their attachment inputs are absent and the backend returns passthrough or color-only approximations. Keep the descriptor if useful, but diagnostics and support docs must expose the missing substrate.
3. **Keep attachment production below effect recipes.** Scene/deferred/prepass primitives produce the reusable buffers; effects consume them explicitly. Do not grow one “postprocess setup” utility that allocates every attachment and defeats tree-shaking.

## Recommended

Sweep-safe: within `@flighthq/effects` and `@flighthq/types`, no open design decision beyond what the charter has blessed.

1. **Add `FilmicToneMapOptions` / `AgxToneMapOptions`.** Both operators bake their parameter sets with honest "approximate / hardcoded" comments. Promoting constants to optional, defaulted option structs is additive — existing callers keep today's behavior. Purely within-package; adds no kind, touches no backend. Per charter Open direction #2.

2. **Add Package Map entry for effects.** Per charter Decision #7. `@flighthq/effects` and the `effects-*` backends are absent from the codebase map's Package Map. Add a complete entry reflecting the 52-effect catalog, recipe math, and pipeline-support layer.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Registration migration: dissolve central tables into per-kind handlers.** _Parked — architectural._ Blessed (Decision #2). Dissolve `RENDER_EFFECT_KINDS`, `RENDER_EFFECT_INPUTS`, `DEFAULTS` into per-kind handler companions registered on pipeline state via `register*Effect(state)`. Largest remaining item — touches all 52 effect factories + the pipeline-support functions + the render state type. Open direction #1 (migration scope and handler interface shape) needs settling first.

- **Fix `lerpRenderEffect` packed-color corruption via field-role metadata.** _Parked — depends on registration migration._ Blessed (Decision #3). Each effect kind registers field roles (color/scalar/array/enum); `lerpRenderEffect` consults the registry. The fix is structurally part of the registration migration — field-role metadata is one of the per-kind handler companions.

- **Wire backends to honor `enabled`/`intensity`.** _Parked — cross-package._ Blessed (Decision #4). The fields exist on `RenderEffect`; backends must honor `enabled === false` (skip) and `intensity` (dry-wet mix). Tracked obligation landing in `render` / `effects-gl` / `effects-wgpu` / `effects-canvas`.

- **Backend math migration.** _Parked — cross-package._ Each backend has duplicated blur/temperature/bloom math (~150 lines across 3 packages) that now exists as shared helpers in effects. Coordination across `effects-gl`/`effects-wgpu`/`effects-canvas`.

- **ColorGrade vs LiftGammaGain unification.** _Parked — open direction._ Both exist as separate descriptors with CDL bridge math. Needs a decision on whether to deprecate one or keep both.

- **AutoExposureEffect vs EyeAdaptationEffect distinction.** _Parked — open direction._ Decide whether histogram-bin temporal eye-adaptation is a separate kind or an extension of AutoExposure.

- **Rust `flighthq-effects` crate.** _Parked — global posture._ Strong value-typed-leaf conformance target. The deterministic math is the easiest conformance beachhead (no GPU, headlessly fingerprintable).

## Approved

- [2026-07-02 · picked] Sweep items 1–2: FilmicToneMapOptions/AgxToneMapOptions, Package Map entry
