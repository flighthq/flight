# Depth Review: @flighthq/particles-formats

**Domain:** Import/export of particle-emitter configurations to and from third-party authoring formats (Particle Designer plist, Spine particle JSON, Unity Shuriken JSON), bridging external assets into Flight's `ParticleEmitterConfig`.

**Verdict:** solid — **68/100**

This is a genuinely well-built format-conversion layer, not a stub. It covers the three most-requested particle authoring tools, each with a full round-trip (parse → config, config → serialize), a preserved raw-document model for lossless round-tripping of fields the common config cannot carry, an explicit `warnings[]` channel that names dropped features, defensive JSON/plist parsing with actionable errors, and curve-baking for multi-stop color/alpha/size timelines. The reason it lands at "solid" rather than "authoritative" is breadth of formats and a couple of fidelity gaps in the formats it does support — not shallowness of execution. The execution quality per format is high.

## Present capabilities

Three formats, each with the full quartet of parse-to-config, parse-to-document, serialize, and a typed schema:

- **Particle Designer (.plist)** — `parseParticleDesignerPlist`, `parseParticleDesignerPlistDocument`, `serializeParticleDesignerPlist`, plus `ParticleDesignerDocument`/`ParticleDesignerParseOptions`/`ParticleDesignerSerializeOptions`. Hand-rolled minimal plist XML reader (no dependency), handles `<integer>/<real>/<string>/<true>/<false>`, XML escape/unescape, GL blend-func decode (`blendFuncSource`/`Destination` → `add`/`normal`), gravity-vs-radial emitter detection, degree→radian and pixel→scale (`textureSize`) normalization, NaN-rejection on malformed numeric fields.
- **Spine particle JSON** — `parseSpineParticle`, `parseSpineParticleDocument`, `serializeSpineParticle`, `SpineParticleDocument`. Handles `{low, high}` range objects, `tint`/`alpha` keyframe timelines, hex color decode, `spawnShape` ellipse→circle/rect mapping, `continuous`/`duration` looping, additive/multiply/screen/normal blend.
- **Unity Shuriken JSON** — `parseUnityParticle`, `parseUnityParticleDocument`, `serializeUnityParticle`, `UnityParseOptions`/`UnitySerializeOptions`, full `unitySchema`. The most ambitious of the three: `minMaxCurve` modes (`constant`/`twoConstants`/`twoCurves`), shape module (Cone/Sphere/Hemisphere/Circle/Box/Rectangle), `emission` with `rateOverTime` + bursts, `colorOverLifetime` gradient, `sizeOverLifetime` AnimationCurve, `rotationOverLifetime`, `gravityModifier × physicsGravity × pixelsPerUnit` conversion, and an explicit `UNSUPPORTED_UNITY_MODULES` table (velocity/force/limit-velocity/inherit-velocity/noise/collision/sub-emitters/trails/texture-sheet/external-forces/lights) that emits a named warning per enabled-but-dropped module.

Cross-cutting strengths worth crediting:

- **Lossless round-trip via `existing` document merge.** Every `serialize*` accepts a `Partial<*Document>` so fields the common `ParticleEmitterConfig` cannot express (texture filename, radial-mode radii, premultiply flag, prewarm, color variances) survive a parse→edit→serialize cycle.
- **Curve baking.** Multi-stop gradients/timelines (>2 stops) are baked into `ParticleCurve` via `particleColorCurveFromKeyframes`/`particleCurveFromKeyframes` and serialized back out, so the full timeline shape survives rather than collapsing to endpoints. This is a meaningfully better fidelity story than most format bridges.
- **Honest lossiness.** The `warnings[]` channel is the right design: instead of silently degrading, it names every dropped feature for an asset pipeline to surface.
- **Defensive parsing.** Format-tagged errors on non-object roots; NaN/finite guards so a corrupt field falls back to a default instead of poisoning the simulation.
- Colocated tests for all three parse paths (273/285/324 lines).

## Gaps vs an authoritative particle-format library

Breadth of formats — the single largest gap:

- **No libGDX 2D Particle Editor (`.p`) format.** This is arguably _the_ canonical open-source 2D particle format and is the native sibling of the Spine format already supported (same Esoteric/libGDX lineage). Its omission is the most surprising for a library that already does Spine.
- **No Starling / Sparrow (.pex) explicit support.** PEX is Particle Designer's own XML variant widely used in the Starling/OpenFL world that Flight targets; the plist reader may catch some of it incidentally, but there is no PEX-aware path.
- **No Effekseer, no Phaser/Pixi particle JSON, no after-effects/Lottie-style, no PopcornFX.** An authoritative bridge would cover the dominant web (Pixi/Phaser) emitter JSON shapes, given Flight is a web-first SDK.

Fidelity gaps within supported formats:

- **Particle Designer radial emitters are dropped, not simulated.** `emitterType=1` (radial), `radialAcceleration`, and `tangentialAcceleration` only produce warnings. Radial motion is a first-class Particle Designer mode; an authoritative importer would map it (the parent `@flighthq/particles` exposes `applyParticleForces`, so the target representation may exist).
- **Only the first emission burst is imported** (Unity). Multi-burst is common; the rest warn and drop.
- **No serialize-side warnings.** Parsing reports lossy conversions; serialization (config→format) does not report when a config feature has no representation in the target format (e.g. a Flight feature Spine cannot express). The asymmetry means export lossiness is silent.
- **Texture/atlas references are passed through as strings only** — no resolution, validation, or linkage to `@flighthq/resources`. Reasonable as a boundary, but an authoritative pipeline tool would at least surface them structurally.

API-surface gaps:

- **No format auto-detection / dispatch.** There is no `detectParticleFormat(text)` or unified `parseParticleConfig(text)` that sniffs plist-vs-JSON-vs-shape and routes. Callers must know the format a priori.
- **No batch / multi-emitter handling.** Several of these formats can carry multiple emitters or an effect bundle; the API is single-emitter per call.
- **No version negotiation.** Spine and Unity formats are versioned; there is no version field read or schema-version branching, so a future format revision parses on a best-effort basis.

## Naming / API-shape notes

- Naming is canonical and follows house rules precisely: full unabbreviated type words (`parseParticleDesignerPlist`, `serializeUnityParticle`), `parse*`/`serialize*` verb pairs, `*Document` for the round-trip model, `*ParseOptions`/`*SerializeOptions` for the option bags. Globally self-identifying — `parseSpineParticle` leads straight to the domain.
- The two-tier parse API (`parseXParticle` → config directly, single-pass no-alloc; `parseXParticleDocument` → `{config, document, warnings}`) is a clean, well-documented separation of the fast path from the round-trip path. Good design.
- Pure data in / string out, free functions, `Readonly<>` inputs, `sideEffects: false`, no registration or hidden state — fully aligned with the tree-shakable free-function style. No entity/runtime concern applies here (this is a stateless codec layer), so nothing is missing-by-style.
- The package is **not listed in the Package Map** in `tools/agents/docs/index.md`; as a focused neighbor of `@flighthq/particles` it likely warrants a one-line entry there (consistent with the `spritesheet-formats`/`spritesheet` precedent the docs cite).
- One naming nit: `parse*ParticleDocument` returns a `*Parsed` wrapper (`{config, document, warnings}`), not a bare `*Document`; the function name reads as "parse the document" but returns the parse _result_. Minor, but `parse*ParticleEffect` or a `*ParseResult` type name would read truer.

## Recommendation

Treat as **solid and shippable for its current three formats** — the per-format depth, round-trip fidelity, curve baking, and honest warning channel are above the bar for a bridge library. To reach **authoritative** for the "particle formats" domain:

1. **Add libGDX `.p` and Starling `.pex`** — the two highest-value missing formats given Flight's Spine support and OpenFL/Starling heritage. These two alone would move the verdict toward authoritative.
2. **Add `detectParticleFormat` + a unified `parseParticleConfig` dispatcher** so callers need not know the format up front.
3. **Close the in-format fidelity gaps**: simulate (not drop) Particle Designer radial/radial-accel/tangential-accel via the parent's force model; import all Unity bursts; add a serialize-side warnings channel for export lossiness.
4. Add a Package Map entry, and consider a Pixi/Phaser web-emitter JSON path given the web-first target.

Items 1 and 2 are within scope for a depth-completeness session; the radial-acceleration simulation (item 3) touches the parent `@flighthq/particles` representation and should be surfaced as a cross-package suggestion rather than done autonomously.
