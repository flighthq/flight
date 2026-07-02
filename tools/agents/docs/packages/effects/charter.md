---
package: '@flighthq/effects'
crate: flighthq-effects
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# effects — Charter

## What it is

`@flighthq/effects` is the **substrate-agnostic catalog of post-process render effects**: plain-data descriptors (one `create*Effect` per kind), plus deterministic recipe math that all backends derive identical parameters from. 52 effect kinds spanning color grade, blurs/DoF, bloom/HDR, screen-space 3D, anti-aliasing, film/stylize, lens, accessibility, and a `CustomShader` escape hatch. 10 recipe math modules with reference-grade, zero-alloc implementations (Gaussian, Oklab, ACES/Hable/AgX/Reinhard tone maps, Sobel, thin-lens CoC, Halton SSAO, Kuwahara, god-rays, LUT, stylize). Pipeline-support layer: per-kind metadata (defaults, required render inputs, field roles for interpolation), effect-stack validation, and descriptor interpolation for animation.

It does not execute — pixel work lives in `effects-gl` / `effects-wgpu` / `effects-canvas`. Sole runtime dependency is `@flighthq/types`.

Effects and filters are genuinely separate domains. Filters (`@flighthq/filters`) are per-display-object bitmap filter descriptors. Effects are full-frame post-processing pipeline passes. An effect may compose filters internally (bloom uses blur), but the type hierarchies (`BitmapFilter` vs `RenderEffect`), application models (per-object vs render pipeline), and dependencies are distinct.

## North star

1. **Descriptors are plain data; execution lives elsewhere.** An effect is a `{ kind, ...options }` value with no runtime behavior, no hidden state, and no backend coupling. The package is a catalog of intents plus shared math, never a renderer.
2. **Per-kind handler registration, not central tables.** Per-kind metadata (defaults, render input requirements, field roles for interpolation) registers on pipeline state via `register*Effect(state)`, matching the renderer registration pattern (`registerRenderer(state, FooKind, renderer)`). The kind string is the intent vocabulary; registration is the opt-in that brings handler code into the pipeline. Tree-shakes naturally — unused effects' metadata isn't in your bundle.
3. **Reference-grade, deterministic, alias-safe math.** Each recipe module is named to its published reference (Ottosson Oklab, Narkowicz/Hable/Uchimura/AgX tone maps, Papari/Petkov Kuwahara, Duda/Nunnally god-rays), writes to `out` parameters, allocates nothing in hot paths, and is safe when `out` aliases an input.
4. **AAA post-process coverage, keep growing.** The catalog aims at the full vocabulary a mature post-process stack exposes. No ceiling — growth is organic and welcome. Breadth is a feature, not scope creep.
5. **Wasm-mixable leaf.** Value-in / value-out descriptors and math — a candidate for single-crate Rust→wasm drop-in.

## Boundaries

**In scope:**

- Effect descriptor factories (`create*Effect`) over `@flighthq/types` interfaces.
- Substrate-agnostic recipe math shared by all backends (Gaussian, tone-map, color science, depth, edge detection, god-rays, Kuwahara, LUT, stylize, bloom, CDL, color temperature).
- Per-kind handler registration: defaults, required render inputs, field-role metadata (color vs scalar vs array vs enum), interpolation behavior. Registered on pipeline state.
- Pipeline-support functions: `normalizeRenderEffect`, `lerpRenderEffect`, `validateRenderEffectList`, `canLerpRenderEffects` — all dispatching through registered handlers.
- Effect-stack introspection: `getRenderEffectInputs`, `getRenderEffectKinds`.

**Non-goals:**

- Backend execution (GL/WGPU/Canvas passes) — owned by `effects-*` packages.
- Per-object filter descriptors — owned by `@flighthq/filters`.
- Importing `@flighthq/sdk` or any renderer package.
- Serialization/versioning — deferred to SDK-wide serialization story.

## Decisions

- **[2026-07-02] Effects owns intents + math; backends own pixels.** Recipe math stays in effects permanently. Same dependency direction as filters: effects owns the contract and recipe, effects-* backends consume it. Inverting the dependency direction would mean big switch statements or closed dispatch in render-adjacent code.

  **Why:** The math is substrate-agnostic — every backend derives identical parameters from the same functions. Centralizing it here prevents N backends from re-deriving the same math and drifting.

- **[2026-07-02] Per-kind handler registration on pipeline state, dissolving central tables.** The three parallel hand-maintained tables (`RENDER_EFFECT_KINDS`, `RENDER_EFFECT_INPUTS`, `DEFAULTS`) dissolve into per-kind handler companions co-located with each `create*Effect` factory. Generic pipeline functions (`normalizeRenderEffect`, `lerpRenderEffect`, `validateRenderEffectList`) dispatch through handlers registered on pipeline state via `register*Effect(state)`, matching the renderer registration pattern. The kind string is the intent identifier; calling `register*Effect` is the opt-in that brings the handler code into the pipeline.

  **Why:** Central tables are closed switches over 52+ string kinds — they don't tree-shake (importing `getRenderEffectDefaults` pulls all 52 defaults), they drift (ChannelMixer already missing from DEFAULTS), and they violate the "assembly never costs more than its parts" invariant. Per-kind registration tree-shakes naturally: unused effects' metadata isn't in the bundle. The `canAddChild` callback-binding pattern applies — behavior travels with registration, not in central dispatch.

- **[2026-07-02] Effects owns interpolation via registered field-role metadata.** Each effect kind registers how its fields should be interpolated: `'color'` (unpack RGBA channels → lerp per-channel → repack), `'scalar'` (lerp normally), `'array'` (element-wise or snap), `'enum'` (snap at t ≈ 0.5). `lerpRenderEffect` consults registered handlers. Fixes the packed-color corruption bug (`VignetteEffect.color`, `OutlineEffect.color`, `ColorGrade.shadows/midtones/highlights` all lerped as scalar integers) structurally.

  **Why:** The bug is a symptom of missing per-kind metadata, not a standalone fix. Co-locating field roles with the factory (via registration) means one file = one effect = all its behavior. Custom effects register their own field roles identically to built-ins.

- **[2026-07-02] `enabled`/`intensity` — backends must honor.** The base contract defines these fields; the charter states that backends must honor `enabled === false` (skip the pass) and `intensity` (dry-wet mix). This is a tracked obligation for AAA completeness, not an open TODO.

  **Why:** The fields exist on `RenderEffect` and `validateRenderEffectList` already honors `enabled`. No backend reading them makes the contract inert end-to-end. Supporting them is expected AAA behavior.

- **[2026-07-02] Serialization deferred to SDK-wide story.** Effects does not own `serializeRenderEffect`/`deserializeRenderEffect` in isolation. The SDK needs a broader serialization/versioning posture that spans effects, filters, scene graph, and the migration model in `conventions/types-layout.md`.

  **Why:** Structural clone suffices for the current descriptor shape. Solving serialization per-package produces inconsistent seams. This is an SDK-level design decision.

- **[2026-07-02] Catalog keeps growing — no ceiling.** 52 effects is not a cap. Canonical-but-missing pieces (histogram eye-adaptation, parameterized filmic/AgX, etc.) are in scope as the catalog matures. Growth is organic.

  **Why:** AAA completeness is the target. A scope ceiling would require per-effect debates; "keep growing" settles the completeness question once.

- **[2026-07-02] Add Package Map entry for effects.** `@flighthq/effects` and the `effects-*` backends are absent from the codebase map. A 52-effect, 260+ test package should be listed.

  **Why:** The Package Map is the orientation surface for agents and contributors.

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.

## Open directions

1. **Registration migration scope and shape.** Which functions become registration-dispatched (`normalizeRenderEffect`, `lerpRenderEffect`, `validateRenderEffectList`, `getRenderEffectInputs`)? What does the handler interface look like? Does each effect factory file export a `register*Effect(state)` function, or a handler object that a batch `registerAllEffects(state)` convenience iterates? How does the pipeline state type relate to render state?

2. **FilmicToneMapOptions / AgxToneMapOptions.** Both operators bake their parameter sets. Promoting constants to optional defaulted option structs is additive. Worth doing for colorist/TD use cases.

3. **ColorGrade vs LiftGammaGain unification.** Both exist as separate descriptors consuming CDL math (`computeCdlFromLiftGammaGain` provides the bridge). Decide whether to deprecate one or keep both as separate artistic intents with shared math.

4. **`AutoExposureEffect` vs `EyeAdaptationEffect` distinction.** Currently only `AutoExposureEffect` exists. A dedicated histogram-bin eye-adaptation effect may be a separate kind if the use cases diverge (still-frame auto-exposure vs temporal eye-adaptation simulation).

5. **Backend math migration.** `effects-gl`/`effects-wgpu`/`effects-canvas` duplicate ~150 lines of blur/temperature/bloom math that now exists as shared helpers in effects. Cross-package coordination.
