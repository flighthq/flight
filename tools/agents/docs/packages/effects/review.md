---
package: '@flighthq/effects'
status: solid
score: 90
updated: 2026-06-24
ingested:
  - status.md
  - source
  - changes.patch
  - charter.md
---

# effects — Review

Evidence: incoming bundle `builder-67dc46d64` (`head/packages/effects/`, `changes.patch`). Prior `reviews/depth/effects.md` does not exist in this tree (mid-migration), so this survey is grounded directly in source and the as-claimed `status.md`. All status claims below were verified against the diff and source unless noted.

## Verdict

**solid — 90/100.** A broad, well-built catalog of substrate-agnostic effect _intents_ plus a deep bench of canonical, deterministic recipe math. The descriptor layer is mature and contract-clean; the math layer is the standout — Oklab (Ottosson), ACES/Hable/AgX/Reinhard tone maps, separable Gaussian, Sobel, thin-lens CoC, Halton SSAO kernel — all named to their references, alias-safe, zero-alloc. What holds it short of _authoritative_ is not breadth but a few correctness and structural sharp edges (a color-aware-lerp bug, three parallel hand-maintained kind tables, an entirely TODO charter) and the fact that no backend consumes the new base-contract fields yet, so `enabled`/`intensity` are inert.

## Present capabilities

Verified counts: **69 source files (68 + `index.ts`), 68 colocated `*.test.ts`, 291 tests**, matching the status doc exactly. No top-level side effects (`sideEffects: false` honored), no `throw` statements anywhere (sentinel discipline clean), single root `.` export.

**Descriptor catalog (52 effects).** One `create<Name>Effect` factory per kind, each a thin constructor over a `@flighthq/types` interface (`{ kind: 'X', ...options }`, `Omit<X, 'kind'>` options). Spans color grade (ColorGrade, LiftGammaGain, LookupTableGrade, WhiteBalance, BrightnessContrast, HueSaturation, ChannelMixer, Exposure, ToneMap), blurs (Gaussian-family via Directional/Radial/Motion/CameraMotion, Bokeh DoF, TiltShift), bloom/HDR (Bloom, AutoExposure, GodRays, LensFlare, LensDirt), screen-space 3D (Ssao, Ssr, ContactShadows, VolumetricLight, ScreenSpaceFog), AA (Fxaa, Smaa, Taa), stylize (Kuwahara, Halftone, Dither, Posterize, Pixelate, Crt, Scanlines, Sketch, Outline, Glitch, FilmGrain, FilmEmulation), lens (BarrelDistortion, LensDistortion, ChromaticAberration, PanniniProjection, Displacement, Vignette), plus accessibility (ColorBlindSimulation) and the escape hatch (CustomShader). This is at or beyond the AAA bar for a post-process catalog.

**Recipe math (substrate-agnostic, the real depth).** Each module is shared so GL/WGPU/Canvas backends derive identical parameters:

- `gaussianMath` — sigma↔radius, normalized 1D separable kernel, pass count.
- `colorTemperatureMath` — Tanner-Helland Kelvin→RGB, white-balance multipliers.
- `colorScienceMath` — Rec.709/2020 luma, sRGB⇄linear (IEC 61966-2-1), HSL⇄RGB, Oklab⇄RGB (Ottosson).
- `toneMapMath` — Reinhard/extended-Reinhard, Narkowicz ACES, Hable Uncharted2, Uchimura filmic, AgX, exposure scale, ACES in/out matrices.
- `bloomMath`, `cdlMath` (ASC CDL + lift/gamma/gain bridge), `lutMath` (3D→2D strip), `depthMath` (linear depth, thin-lens CoC, Halton SSAO kernel), `stylizeMath` (Bayer, halftone, CRT mask, scanlines), `kuwaharaMath` (anisotropic Papari/Petkov variant), `godRaysMath` (Duda/Nunnally radial blur + normalization), `edgeDetectMath` (Sobel + outline/sketch param derivation).

**Pipeline-support data layer.** `renderEffectInputs` (`getRenderEffectInputs`, `RENDER_EFFECT_KINDS`, `getRenderEffectKinds`) promotes the `[HDR]/[DEPTH]/[MOTION]/[TEMPORAL]` doc tags into queryable data; `renderEffectValidation.validateRenderEffectList` returns the first unsatisfied input (sentinel `null`, skips `enabled === false`); `renderEffectDefaults` (`getRenderEffectDefaults`, `normalizeRenderEffect`) holds a 50-kind default table with a tested zero-preserving (`!== undefined`) merge; `renderEffectInterpolation` (`canLerpRenderEffects`, `lerpRenderEffect`) for tween/timeline animation.

**Contract-clean base type.** `RenderEffect` in `@flighthq/types` is an _open base contract_ (`kind` + optional `enabled`/`intensity`), explicitly not a closed union — a new effect extends it and registers a runner, with no central switch to edit. `RenderEffectInput`, `CdlValues`, `MotionBlurTarget` all correctly homed in `@flighthq/types`.

## Gaps

- **`lerpRenderEffect` corrupts packed-color fields.** The lerp introspects field types at runtime and treats every `number` as a scalar to interpolate linearly. Packed-RGBA fields (`VignetteEffect.color`, `OutlineEffect.color`, `ColorGrade.shadows/midtones/highlights = 0x808080ff`, `LiftGammaGain.*`, `VolumetricLight.lightColor`) are numbers too, so animating between two colors lerps the _integer_ `0x000000ff → 0xffffffff` — channels bleed across byte boundaries and produce garbage intermediate colors. There is no per-channel unpack/lerp/repack path and no field-role metadata to distinguish a color from a scalar. This is the most consequential correctness gap.
- **Three parallel hand-maintained kind tables + 52 factory files.** `RENDER_EFFECT_KINDS` (52), `RENDER_EFFECT_INPUTS`, and `DEFAULTS` (50) are independent literal tables that must be kept in sync by hand, on top of the 52 `create*Effect` files. Already drifting: `ChannelMixerEffect` and `CustomShaderEffect` are in the catalog but absent from `DEFAULTS` (CustomShader is documented as intentional; ChannelMixer reads as an omission, not a decision). Nothing mechanically guarantees a new effect lands in all four places. See _Contract & docs fit_ — this is the fork-B/registry question.
- **No backend consumes the new base fields.** `enabled` and `intensity` exist on `RenderEffect` and are honored by `validateRenderEffectList`, but no recipe in `@flighthq/render` or the `effects-*` backends reads them yet, so the dry-wet mix and skip flag are inert end-to-end. Flagged in status as cross-package; recorded here as a real gap, not closed.
- **Approximate operators left hardcoded.** `computeFilmicToneMap` (Uchimura GT) and `computeAgxToneMap` bake their parameter sets; no `FilmicToneMapOptions`/`AgxToneMapOptions` to tune them. AgX is the scalar-sigmoid approximation, not the full matrix+curve. Honest comments note this; acceptable for now.
- **No serialization/versioning.** No `serializeRenderEffect`/`deserializeRenderEffect` tied to the scene-migration model in `conventions/types-layout.md`. Structural clone likely suffices today, but the versioned-migration hook is absent.
- **Rust mirror not started.** `crates/flighthq-effects` was not touched; the deterministic math here is the easiest conformance target in the SDK (no GPU, headlessly fingerprintable) and is the obvious next conformance beachhead.
- **Catalog-completeness nits.** `AutoExposureEffect` vs a distinct `EyeAdaptationEffect` (histogram eye-adaptation) is unresolved; `lerpRenderEffect` does not interpolate readonly arrays (`BloomEffect.mipWeights`) — documented as by-design but a real animation limitation.

## Charter contradictions

None — but only because the charter is almost entirely `TODO`. _What it is_ is a seeded one-liner; _North star_, _Boundaries_, _Decisions_, _Open directions_ are all empty. There is no stated principle for the code to contradict. Against the codebase-map fallback (AAA completeness, plain-data-over-runtime, open contracts, sentinels, out-params, full names) the package is strongly aligned: descriptors are plain data, the base is an open contract not a closed union, math is out-param/alias-safe, names are unabbreviated and reference-grade. The `lerpRenderEffect` color bug is the one place the _plain-value color convention_ ("packed RGBA, one consistent convention") is silently violated in behavior — it treats the convention's integers as opaque scalars.

## Contract & docs fit

**Lives up to the contract — strongly.**

- `@flighthq/types`-first: every descriptor interface, `RenderEffectInput`, `CdlValues`, `MotionBlurTarget` are in `@flighthq/types`; the package imports them, never redefines.
- Full unabbreviated names; `get*`/`is*`/`has*` and `create*`/`compute*` verbs used correctly; `compute*`/`get*` math writes to `out`, alias-safety asserted in comments and (per status) tested.
- Sentinels not throws (verified: zero `throw`); single root export; `sideEffects: false` with no top-level execution.
- Open base contract for `RenderEffect` is exactly the fork-B "registry/open-contract by default" shape.

**Candidate contract/doc revisions (user's gate, not acted on):**

- **Package Map line is stale.** `tools/agents/docs/index.md` does not list `@flighthq/effects` in its Package Map at all (it lists `filters`/`filters-gl` but not `effects` or the `effects-*` backends). A 52-effect, 291-test package is missing from the map — a candidate Map addition.
- **Fork B (closed-union vs open-registry) applies _inside_ the package.** The base type is open, but the support layer (`DEFAULTS`, `RENDER_EFFECT_INPUTS`, `RENDER_EFFECT_KINDS`) re-introduces three closed, hand-maintained `kind`-keyed tables — the exact "closed switch that should be a registry" drift the structural-forks doc warns about. Worth a decision: co-locate defaults/inputs with each effect (a small per-kind descriptor record the factory and tables derive from) so adding an effect touches one file, vs. keeping central tables. This is a design fork, not a sweep.
- **Charter is a stub** (see below) — the highest-leverage doc gap for this cell.

## Candidate open directions

Each is a question the empty charter forced this review to assume; they feed the charter's Open directions for the user to settle:

1. **Where does the effects boundary end?** Effects holds _intents + recipe math_ but no backend execution (the `effects-gl`/`effects-wgpu`/`effects-canvas` packages do). Is the math layer permanently in `effects` (shared substrate), or does some of it belong in a `render`-adjacent home? State the data-vs-execution line as a Boundary.
2. **Is the central-table model blessed or a registry target?** (Fork B applied internally, above.) The charter should rule whether per-kind metadata co-locates with the factory or stays in central tables.
3. **Color-aware interpolation as a stated requirement.** Does `effects` own correct animated interpolation of its descriptors (requiring packed-color awareness / per-field role metadata), or is interpolation a tween/timeline concern that consumes a lower-level helper? The current bug is a symptom of this being undecided.
4. **`enabled`/`intensity` ownership of the dry-wet contract.** The base contract defines them; the charter should state that backends _must_ honor them and that effects owns the contract (so the cross-package wiring is a tracked obligation, not an open TODO).
5. **Serialization/versioning posture.** Does `effects` own `serialize/deserializeRenderEffect` against the scene-migration model, or defer to a generic scene serializer? A Boundary call.
6. **Catalog scope ceiling.** Is 52 the intended ceiling, or are EyeAdaptation, parameterized filmic/AgX, and similar canonical-but-missing pieces in scope? A North-star "what AAA means here" line would settle the completeness nits without a per-effect debate.
