---
package: '@flighthq/lighting'
role: package
crate: flighthq-lighting
draft: false
lastDirection: 2026-07-31
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# lighting — Charter


## What it is

`@flighthq/lighting` is the **data layer of a 3D lighting system** — plain-entity descriptors for every punctual and ambient light type a real-time renderer consumes, plus the value-level analysis a scene culler needs. It owns the six light types (`AmbientLight`, `HemisphereLight`, `DirectionalLight`, `PointLight`, `SpotLight`, `AreaLight`), the IBL `Environment` (cubemap, alias-shared for GPU upload), generic `LightUnit` normalization/exposure helpers, and descriptor-side culling/luminance primitives.

It is explicitly **a descriptor + analysis package, not a shading or solving package.** It defines _what_ a light is and the cheap value math over it; it does _not_ evaluate attenuation per fragment, pack `SceneLightBlock` GPU buffers, or run any shading pass — those belong to `render` / `scene-*`. Lighting ends where the renderer's per-frame solver begins; it ends where IBL _baking_ (cube→spherical-harmonics projection) begins (a `materials`/render or future-probe concern); and the sRGB→linear / tonemapping seam is routed through `materials`, not here.

Part of the in-scope 3D pipeline (structural fork G, decided 2026-06-24) alongside `scene`, `mesh`, `camera`, `texture`, and `materials`.

## North star

1. **Descriptors and value analysis only — never a solver.** Every export is a plain entity, a value-level accessor/mutator over one, or cheap analysis math (influence bounds, luminance, sphere-overlap culling). The moment a function would evaluate per-fragment attenuation, pack a GPU light buffer, or run a shading pass, it has left this package. This is the boundary the whole package is judged against.

2. **Types-first, against `@flighthq/types`.** Light fields, `LightUnit`, and `SceneLightBlock` live in the header layer; `lighting` implements against them. The full light data shape should be navigable from `@flighthq/types` alone.

3. **Explicit photometric normalization.** `convertLightIntensity` and `getLightLinearIntensity` state their reference normalization and geometry-free candela↔lumen assumption. Geometry-aware per-light conversion is not implied by those generic helpers.

4. **Explicit allocation, alias-safe out-params, sentinels not throws.** `create*`/`clone*` allocate (and deep-clone vectors); mutators/analysis write to `out` having read inputs into locals first; expected failures return sentinels (`radius = -1` for non-spatial influence, swap-clamp rather than throw on inverted cones). The convention rules are the floor, not the ceiling.

5. **Strictly additive to a 2D bundle.** As a 3D package, `lighting` must never move a 2D example's `npm run size` baseline; nothing here may reach into the 2D path (fork G's binding constraint).

## Boundaries

**In scope**

- The six punctual/ambient light-type descriptors + `Environment` (IBL source), with `create*`/`clone*`.
- Per-type mutators/accessors (cone, blend, direction/target, area orientation) with reciprocal round-trips.
- The photometric-unit seam: `LightUnit`, generic unit conversion, linear normalization, and exposure.
- Descriptor-side analysis/culling: influence bounds, luminance, sphere-overlap influence test, shadow-casting query.

**Non-goals (today)**

- Per-fragment shading, attenuation evaluation, or any solver — owned by `render` / `scene-*`.
- `SceneLightBlock` packing and the `enabled`-skipping packer — `lighting` adds the fields; the packer lives in `render`/`scene-*`.
- IBL _baking_ (cube→SH projection), tone mapping, and applying exposure in a render chain —
  `materials`/render, not here. The generic `applyLightExposure` authoring helper remains value math.
- Color-temperature authoring — `colorFromKelvin` lives in `@flighthq/color`.
- IES profiles / cookies / gobo textures — out of package (candidate `-formats` neighbor, see Open directions).
- Rendering of any kind; no renderer registration; no top-level side effects.

## Decisions

- **2026-07-03 — Shadow descriptor expansion in scope.** shadowMapSize, near/far, strength, CSM cascades.
- **2026-07-03 — Forward-budget selection in scope.** `selectScene3DForwardLights` ranks
  shader-equivalent contribution against the fixed per-family budget.
- **2026-07-03 — Light-probe / SH irradiance descriptor in scope.**
- **2026-07-03 — TS-leads, Rust conforms later.**

- **[2026-09-02] Closure state of the 2026-07-03 rulings, after the descriptor deepening landed in `f2f8d7750`.** The four entries above are append-only and unchanged; this records where each now stands.

  - *Shadow descriptor expansion in scope* — **CLOSED at the descriptor layer.** Flat `shadowMapSize` / `shadowNear` / `shadowFar` / `shadowStrength` fields on shadow-capable lights, plus `cascadeCount` / `cascadeSplits` on `DirectionalLight`. Render consumption and cascade math remain renderer-owned and were **not** added to `Scene3DLightBlock`.
  - *Forward-budget selection in scope* — **CLOSED / PRESERVED.** The existing selector now excludes disabled lights and ranks using per-light decay through `getLightContributionAtBoundingSphere`.
  - *Light-probe / SH irradiance descriptor in scope* — **REMAINS OPEN, untouched.** Probe work was not commissioned in this pass.
  - *TS-leads, Rust conforms later* — **PRESERVED.** This pass changes the authoritative TypeScript descriptor/analysis surface only and leaves Rust conformance for the recorded later phase.

  **Implementation note:** `Environment` receives `enabled` but intentionally no `intensityUnit`, preserving the charter/architecture contract that its intensity is a unitless cubemap multiplier; the six emitting descriptors receive `LightUnit`-backed `intensityUnit` with `Unitless` defaults.

  **Mechanism worth knowing, since "excludes disabled lights" does not appear in the selector itself:** the exclusion is not a separate filter. `getLightContributionAtBoundingSphere` returns `0` for a disabled light, and the selector skips any candidate whose score is not `> 0`. One gate, in the analysis function, which is why a custom kind that omits `enabled` keeps the historical enabled-by-default behaviour rather than being silently dropped.

## Open directions

Every candidate question from `review.md`, plus the structural forks that touch this package. These are unresolved — an agent must **ask**, not assume.

1. **Shadow-config ownership and shape.** Does the richer shadow descriptor — `shadowMapSize`, `shadowNear`/`shadowFar`, `shadowStrength`, and directional CSM cascades (`cascadeCount`/`cascadeSplits`) — live as flat fields _here_, or does `SceneLightBlock`/render own the cascade math? This is the largest remaining real-time-shadow hole and is a cross-package layout decision (Silver Wave B is explicitly gated on it), not a lighting-only one. **Resolved — see Decision [2026-09-02]:** both, split at the seam. The descriptor fields live here as flat fields; `Scene3DLightBlock` was not widened and the cascade math stays renderer-owned.

2. **Forward-budget policy beyond contribution ranking.** `selectScene3DForwardLights` already chooses the strongest point and spot contributors against `MAX_FORWARD_LIGHTS`. Should punctual descriptors additionally carry explicit priority/layer masks, and if so should those filters precede contribution ranking here or remain caller policy?

3. **Probe scope.** Are `LightProbe` (9-coeff L2 SH irradiance + position) and `ReflectionProbe` (local cubemap + box bounds) in-scope for `lighting`, or do they belong to a future `probe`/IBL-baking neighbor? They are additive-within-package as _descriptors_ today, but their _baking_ inputs (cube→SH projection) brush against `materials`/render.

4. **Sun/sky model placement.** Generic stops-based light authoring is settled here through `applyLightExposure`, while tone mapping and render-chain exposure remain in `materials`/render and color-temperature conversion lives in `@flighthq/color`. Decide whether a physical sun/sky generator belongs in `lighting`, `materials`, or a dedicated environment-authoring package.

5. **Area-light photometry source of truth.** The generic light-unit converters do not encode emitting geometry. A future area-light luminance conversion would need an explicit source of emitting area: should the `right`/`up` half-extent length be authoritative, or should width/height be modeled separately? Settle the descriptor contract before naming per-light conversion helpers.

6. **A `@flighthq/lighting-formats` neighbor for IES (structural-forks: the subject triad + plurality guard).** Does an IES photometric-profile / cookie codec warrant a `-formats` cell, and is IES alone enough _plurality_ (≥2 formats) to justify the split, or does it stay folded in until a second format appears? Apply the bedrock test (substantial-and-irreducible / well-homed / honest-naming).

7. **Rust-parity cadence (structural-forks: TS-authoritative ↔ Rust-conformant).** The maturation roadmap says "ship each TS addition with its Rust twin in the same pass," but the `builder-67dc46d64` pass shipped a large TS surface with no `flighthq-lighting` twin in the bundle — the parity claim is now stale. Does the charter hold `lighting` to lock-step TS↔Rust parity, or accept a trailing Rust-conformance follow-up (recorded in the conformance/divergence map)?

8. **Closed discriminated-union vs. registry dispatch in analysis (structural-fork B).** `getLightLuminance` / `getLightInfluenceBounds` use structural casts rather than dispatching on `kind`, and `getLightLuminance` returns 0 for `Environment`. As the light family grows, should analysis dispatch move to a `kind`-switch or a typed colored-light subset — and does the registry-by- default fork apply to descriptor analysis, or is a closed light set a legitimate exception?

9. **Photometric conversion contract.** `convertLightIntensity` deliberately uses reference normalization and the geometry-free candela↔lumen identity; it is not a cone-aware spot-light converter. Decide whether geometry-aware per-light conversion belongs here only when light descriptors carry the required geometry and unit metadata. `hasLightInfluenceOnBounds` is now allocation-free and re-entrant.

10. **Package-map first-class entry (doc revision; the user's gate).** `lighting` is described only in `rust/index.md`'s 3D paragraph, not given its own line in the main `index.md` Package Map. As a now- substantial in-scope 3D package, should it get a first-class Package Map entry alongside `scene`/`mesh`/`camera`/`materials`?
