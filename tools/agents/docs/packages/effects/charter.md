---
package: '@flighthq/effects'
crate: flighthq-effects
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# effects — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

Full-frame / post-process render effects: the catalog of substrate-agnostic effect _intents_ (plain-data descriptors) plus the deterministic recipe math that turns those intents into the exact parameters a per-backend pass needs. One `create<Name>Effect` factory per kind over a `@flighthq/types` interface (`{ kind, ...options }`), backed by a deep bench of reference-grade, zero-alloc math modules (Gaussian, Oklab/Rec.709, ACES/Hable/AgX/Reinhard tone maps, Sobel, thin-lens CoC, Halton SSAO kernel, CDL, LUT, Kuwahara, god-rays, stylize).

Where it ends and a neighbor begins: `effects` owns **what** an effect is and the **math** every backend shares; it does **not** execute. Screen-space passes are run by the `effects-gl` / `effects-wgpu` / `effects-canvas` backends, and the dry-wet/skip wiring lives in `@flighthq/render`. It is the post-process sibling of `@flighthq/filters` (per-object filter descriptors); both are plain-data descriptor catalogs, not OpenFL-style filter objects.

## North star (proposed)

_Proposed, not blessed — edit or move any of these to Open directions._

- **Descriptors are plain data; execution lives elsewhere.** An effect is a `{ kind, ...options }` value with no runtime behavior, no hidden state, and no backend coupling. The package is a catalog of intents plus shared math, never a renderer. This is the data-vs-execution line that keeps every backend deriving identical parameters from one source.
- **Open base contract, not a closed union.** `RenderEffect` (`kind` + optional `enabled`/`intensity`) is an open contract: a new effect extends the base and registers a runner, with no central `switch(kind)` to edit. This is fork B (registry/open-contract by default) applied to the catalog. (Whether the _support_ tables follow this same rule is an Open direction below.)
- **Reference-grade, deterministic, alias-safe math.** Each recipe module is named to its published reference (Ottosson Oklab, Narkowicz/Hable/Uchimura/AgX tone maps, Papari/Petkov Kuwahara, Duda/Nunnally god-rays), writes to `out` parameters, allocates nothing in hot paths, and is safe when `out` aliases an input. The determinism is also what makes this the SDK's easiest Rust↔TS conformance target.
- **AAA post-process coverage.** The catalog aims at the full vocabulary a mature post-process stack exposes — color grade, blurs/DoF, bloom/HDR, screen-space 3D, anti-aliasing, film/stylize, lens — with an explicit `CustomShader` escape hatch. Breadth is a feature, not scope creep.

## Boundaries (proposed)

_Proposed in scope / non-goals — edit freely._

**In scope:**

- Effect descriptor factories (`create<Name>Effect`) over `@flighthq/types` interfaces.
- Substrate-agnostic recipe math shared by all backends.
- The pipeline-support data layer: effect input/resource requirements (`[HDR]/[DEPTH]/[MOTION]/[TEMPORAL]`), defaults/normalization, list validation, and descriptor interpolation for tween/timeline animation.

**Non-goals:**

- Backend execution (GL/WGPU/Canvas passes) — owned by the `effects-*` packages.
- Per-object filter descriptors — owned by `@flighthq/filters`.
- Importing `@flighthq/sdk` or any renderer package.

**Undecided boundaries** (see Open directions): whether descriptor interpolation and serialization/versioning belong here or in a lower-level helper / generic scene serializer; whether the recipe math is permanently homed here or partly `render`-adjacent.

## Decisions

None blessed yet.

## Open directions

Every candidate question the review surfaced, plus the structural forks that touch this package. These need your direction before anything here is blessed.

1. **Where does the effects boundary end (data vs. execution)?** `effects` holds intents + recipe math but no backend execution. Is the math layer permanently in `effects` (shared substrate), or does some of it belong in a `render`-adjacent home? State the data-vs-execution line as a Boundary.
2. **Central support tables vs. per-kind co-location (fork B, applied internally).** The base type is open, but `RENDER_EFFECT_KINDS` (52), `RENDER_EFFECT_INPUTS`, and `DEFAULTS` (50) are three parallel hand-maintained `kind`-keyed tables — the exact closed-table drift fork B warns about, already drifting (`ChannelMixer`/`CustomShader` missing from `DEFAULTS`). Should per-kind metadata (defaults, inputs) co-locate with each `create*Effect` factory so adding an effect touches one file, or stay in central tables? This is a design fork, not a sweep.
3. **Color-aware interpolation as a stated requirement.** `lerpRenderEffect` treats every `number` as a scalar and corrupts packed-RGBA fields (e.g. `VignetteEffect.color`, `ColorGrade.shadows`) by lerping the integer across byte boundaries — a behavioral violation of the packed-color convention. Does `effects` own correct animated interpolation of its descriptors (requiring per-channel unpack/lerp/repack and field-role metadata distinguishing color from scalar), or is interpolation a tween/timeline concern consuming a lower-level helper? The bug is a symptom of this being undecided.
4. **`enabled`/`intensity` ownership of the dry-wet contract.** The base contract defines them and `validateRenderEffectList` honors them, but no backend reads them yet, so the dry-wet mix and skip flag are inert end-to-end. Should the charter state that backends _must_ honor them and that `effects` owns the contract (making the cross-package wiring a tracked obligation, not an open TODO)?
5. **Serialization / versioning posture.** No `serializeRenderEffect`/`deserializeRenderEffect` tied to the scene-migration model. Does `effects` own serialization against that model, or defer to a generic scene serializer? A Boundary call.
6. **Catalog scope ceiling — "what AAA means here."** Is 52 the intended ceiling, or are canonical-but-missing pieces in scope: a distinct `EyeAdaptationEffect` (histogram eye-adaptation) vs `AutoExposure`, parameterized filmic/AgX (`FilmicToneMapOptions`/`AgxToneMapOptions`, full matrix+curve AgX rather than the scalar-sigmoid approximation), interpolation of readonly arrays like `BloomEffect.mipWeights`? A North-star "what AAA means here" line would settle the completeness nits without a per-effect debate.
7. **Rust mirror (`flighthq-effects`) priority.** The crate was not touched; the deterministic math is the easiest conformance target in the SDK (no GPU, headlessly fingerprintable). Is it the next conformance beachhead, and does the charter commit to 1:1 Rust↔TS conformance for the math layer?
8. **Package Map entry (doc gap).** `tools/agents/docs/index.md` does not list `@flighthq/effects` (or the `effects-*` backends) in its Package Map at all. A 52-effect, 291-test package is missing — a candidate Map addition for the user to confirm.
