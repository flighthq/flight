---
package: '@flighthq/effects'
updated: 2026-06-24
basedOn: ./review.md
---

# effects — Assessment

The package surveys as **solid — 90/100**: the Bronze/Silver/Gold maturation roadmap is, in substance, already landed (open base contract, gaussian/temperature/tone-map/CDL/LUT/depth math, introspection via `getRenderEffectInputs` / `validateRenderEffectList` / `getRenderEffectDefaults`, `lerpRenderEffect`, a 52-effect catalog). What remains is not a build-out; it is a short set of correctness and structural sharp edges plus a cluster of genuine design forks. The forks (color-aware interpolation, central-tables-vs-registry, serialization posture, catalog ceiling) are routed to the charter's Open directions, not into Recommended — the charter is an empty stub, so those are exactly the calls it needs to make.

The maturation roadmap (`reviews/maturation/depth/effects.md`) is absorbed here and can be removed as seed: nearly every Bronze/Silver item it lists is verified-present in the review; its remaining live items are the Gold-tier ones captured below.

## Recommended

Sweep-safe: within `@flighthq/effects`, additive or correctness-only, no cross-package coupling, no open design decision.

- **Add `ChannelMixerEffect` to the `DEFAULTS` table.** The review names it as drift — present in the catalog (a `create*Effect` factory and a `RENDER_EFFECT_KINDS` entry) but missing its default record, where `CustomShader`'s omission is documented as intentional and ChannelMixer's reads as a plain oversight. A one-file additive fix that makes `getRenderEffectDefaults` / `normalizeRenderEffect` total over the catalog again. (review.md#gaps)
- **Add `FilmicToneMapOptions` / `AgxToneMapOptions` and thread them through `computeFilmicToneMap` / `computeAgxToneMap`.** Both operators currently bake their parameter sets with honest "approximate / hardcoded" comments. Promoting the constants to optional, defaulted option structs is purely additive (existing callers keep today's behavior) and within-package — it tunes existing math, adds no kind, and touches no backend. Surfaces the parameters a colorist/TD expects without committing to the full ACES-grade matrix+curve rewrite (which stays out of scope here). (review.md#gaps)

## Backlog

Parked: each waits on a cross-package coordination, a charter Open direction, or is larger than a within-package sweep. Reason given per item.

- **Fix `lerpRenderEffect` corrupting packed-color fields.** The most consequential correctness gap: it lerps packed-RGBA integers as scalars, bleeding channels across byte boundaries (`VignetteEffect.color`, `OutlineEffect.color`, `ColorGrade.shadows/midtones/highlights`, `LiftGammaGain.*`, `VolumetricLight.lightColor`). **Parked on a design decision, not effort:** the _fix shape_ is the open fork — per-field role metadata (color vs scalar) vs a per-kind hand-written lerp vs unpack-all-`number`s-heuristically. That is charter Open direction #3 (color-aware interpolation ownership). Once the charter rules the approach, the implementation becomes a within-package sweep. Routed to the charter; do not pick a mechanism unilaterally.
- **Collapse the three parallel hand-maintained kind tables** (`RENDER_EFFECT_KINDS`, `RENDER_EFFECT_INPUTS`, `DEFAULTS`) into per-kind metadata co-located with each factory. **Parked as a fork-B (closed-table vs open-registry) design decision** — the structural-forks "closed switch that should be a registry" pattern applied inside the package. The ChannelMixer drift above is a symptom; the structural fix (a small per-kind descriptor record the factory and all three tables derive from, so adding an effect touches one file) is the charter call. Charter Open direction #2.
- **Honor `enabled` / `intensity` in the backends.** The base-contract fields exist and `validateRenderEffectList` respects `enabled`, but no recipe in `@flighthq/render` or the `effects-*` backends reads them, so the dry-wet mix and skip flag are inert end-to-end. **Parked as cross-package** — the wiring lands in `render` / `effects-gl|wgpu|canvas`, not here. Charter Open direction #4 should record it as a tracked obligation (effects owns the contract; backends must honor it).
- **Serialization / versioning** (`serializeRenderEffect` / `deserializeRenderEffect` against the scene-migration model). **Parked on a charter Boundary call** (Open direction #5): whether effects owns descriptor serialization or defers to a generic scene serializer. Structural clone likely suffices today, so no urgency.
- **Mirror the new surface into `crates/flighthq-effects`.** The deterministic math is the easiest conformance target in the SDK (GPU-free, headlessly fingerprintable) and the obvious next conformance beachhead. **Parked as cross-worktree** — the Rust crate lives outside this package's source tree and is governed by the conformance map, not a within-package edit.
- **Catalog-completeness nits.** A distinct histogram-based `EyeAdaptationEffect` vs the existing `AutoExposureEffect`, and interpolating readonly-array fields (`BloomEffect.mipWeights`, documented by-design as non-interpolated). **Parked on the catalog-ceiling charter call** (Open direction #6: "what AAA means here") — adding either is a scope decision, not a sweep.
- **Stale Package Map line.** `tools/agents/docs/index.md` omits `@flighthq/effects` (and the `effects-*` backends) from its Package Map despite this being a 52-effect, 291-test package. **Parked as a cross-cell doc edit** — it touches the codebase map, not this package; surfaced for the user as a Map addition.

## Approved

_None. Approval is the user's verbal gate; nothing frozen yet._
