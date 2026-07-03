---
package: '@flighthq/lighting'
crate: flighthq-lighting
draft: false
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# lighting — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/lighting` is the **data layer of a 3D lighting system** — plain-entity descriptors for every punctual and ambient light type a real-time renderer consumes, plus the value-level analysis a scene culler needs. It owns the six light types (`AmbientLight`, `HemisphereLight`, `DirectionalLight`, `PointLight`, `SpotLight`, `AreaLight`), the IBL `Environment` (cubemap, alias-shared for GPU upload), a photometric-unit seam (`LightUnit` + per-type lux/candela/lumen conversions), a Kelvin→sRGB color helper, and descriptor-side culling/luminance primitives.

It is explicitly **a descriptor + analysis package, not a shading or solving package.** It defines _what_ a light is and the cheap value math over it; it does _not_ evaluate attenuation per fragment, pack `SceneLightBlock` GPU buffers, or run any shading pass — those belong to `render` / `scene-*`. Lighting ends where the renderer's per-frame solver begins; it ends where IBL _baking_ (cube→spherical-harmonics projection) begins (a `materials`/render or future-probe concern); and the sRGB→linear / tonemapping seam is routed through `materials`, not here.

Part of the in-scope 3D pipeline (structural fork G, decided 2026-06-24) alongside `scene`, `mesh`, `camera`, `texture`, and `materials`.

## North star (proposed)

1. **Descriptors and value analysis only — never a solver.** Every export is a plain entity, a value-level accessor/mutator over one, or cheap analysis math (influence bounds, luminance, sphere-overlap culling). The moment a function would evaluate per-fragment attenuation, pack a GPU light buffer, or run a shading pass, it has left this package. This is the boundary the whole package is judged against.

2. **Types-first, against `@flighthq/types`.** Light fields, `LightUnit`, and `SceneLightBlock` live in the header layer; `lighting` implements against them. The full light data shape should be navigable from `@flighthq/types` alone.

3. **Canonical, industry-recognized photometry.** Units, conversions, and color follow the references real engines use — glTF `KHR_lights_punctual` for the stored-author-value/convert-in-`get*` photometric model, the Tanner-Helland Kelvin approximation (Blender/three.js/Filament). A light descriptor should read as something a renderer engineer would have reached for unprompted.

4. **Explicit allocation, alias-safe out-params, sentinels not throws.** `create*`/`clone*` allocate (and deep-clone vectors); mutators/analysis write to `out` having read inputs into locals first; expected failures return sentinels (`radius = -1` for non-spatial influence, swap-clamp rather than throw on inverted cones). The convention rules are the floor, not the ceiling.

5. **Strictly additive to a 2D bundle.** As a 3D package, `lighting` must never move a 2D example's `npm run size` baseline; nothing here may reach into the 2D path (fork G's binding constraint).

## Boundaries (proposed)

**In scope**

- The six punctual/ambient light-type descriptors + `Environment` (IBL source), with `create*`/`clone*`.
- Per-type mutators/accessors (cone, blend, direction/target, area orientation) with reciprocal round-trips.
- The photometric-unit seam: `LightUnit` and lux/candela/lumen get/set conversions.
- Kelvin→packed-sRGB color authoring (`createColorFromKelvin`).
- Descriptor-side analysis/culling: influence bounds, luminance, sphere-overlap influence test, shadow-casting query.

**Non-goals (today)**

- Per-fragment shading, attenuation evaluation, or any solver — owned by `render` / `scene-*`.
- `SceneLightBlock` packing and the `enabled`-skipping packer — `lighting` adds the fields; the packer lives in `render`/`scene-*`.
- IBL _baking_ (cube→SH projection) and tonemapping/exposure — `materials`/render, not here.
- IES profiles / cookies / gobo textures — out of package (candidate `-formats` neighbor, see Open directions).
- Rendering of any kind; no renderer registration; no top-level side effects.

## Decisions

None blessed yet.

## Open directions

Every candidate question from `review.md`, plus the structural forks that touch this package. These are unresolved — an agent must **ask**, not assume.

1. **Shadow-config ownership and shape.** Does the richer shadow descriptor — `shadowMapSize`, `shadowNear`/`shadowFar`, `shadowStrength`, and directional CSM cascades (`cascadeCount`/`cascadeSplits`) — live as flat fields _here_, or does `SceneLightBlock`/render own the cascade math? This is the largest remaining real-time-shadow hole and is a cross-package layout decision (Silver Wave B is explicitly gated on it), not a lighting-only one.

2. **Forward-budget selection ownership.** Should punctual lights carry `priority`/`layerMask` and should a `selectForwardLights(...)` chooser against `MAX_FORWARD_LIGHTS` live here? `enabled` exists but is currently inert from this package's view (its only consumer is the `SceneLightBlock` packer in `render`/`scene-*`). Tied to the `SceneLightBlock` layout coordination.

3. **Probe scope.** Are `LightProbe` (9-coeff L2 SH irradiance + position) and `ReflectionProbe` (local cubemap + box bounds) in-scope for `lighting`, or do they belong to a future `probe`/IBL-baking neighbor? They are additive-within-package as _descriptors_ today, but their _baking_ inputs (cube→SH projection) brush against `materials`/render.

4. **The `lighting` ↔ `materials` exposure/tonemapping boundary.** The codebase map routes sRGB→linear through `materials`. Where do EV100/exposure helpers and a sun/sky color-temperature model live — `lighting` (color authoring) or `materials` (tonemapping)? Gold photometry needs this line drawn.

5. **Area-light photometry source of truth.** `intensityUnit: 'Lumen'` is settable on `AreaLight` but inert — there is no `getAreaLightLuminance`/`setAreaLightLuminance`. The conversion needs the emitting area: is the `right`/`up` half-extent length the source of truth, or a separate width/height field? Settle before adding the conversion.

6. **A `@flighthq/lighting-formats` neighbor for IES (structural-forks: the subject triad + plurality guard).** Does an IES photometric-profile / cookie codec warrant a `-formats` cell, and is IES alone enough _plurality_ (≥2 formats) to justify the split, or does it stay folded in until a second format appears? Apply the bedrock test (substantial-and-irreducible / well-homed / honest-naming).

7. **Rust-parity cadence (structural-forks: TS-authoritative ↔ Rust-conformant).** The maturation roadmap says "ship each TS addition with its Rust twin in the same pass," but the `builder-67dc46d64` pass shipped a large TS surface with no `flighthq-lighting` twin in the bundle — the parity claim is now stale. Does the charter hold `lighting` to lock-step TS↔Rust parity, or accept a trailing Rust-conformance follow-up (recorded in the conformance/divergence map)?

8. **Closed discriminated-union vs. registry dispatch in analysis (structural-fork B).** `getLightLuminance` / `getLightInfluenceBounds` use structural casts rather than dispatching on `kind`, and `getLightLuminance` returns 0 for `Environment`. As the light family grows, should analysis dispatch move to a `kind`-switch or a typed colored-light subset — and does the registry-by- default fork apply to descriptor analysis, or is a closed light set a legitimate exception?

9. **Photometric round-trip sharp edges (settle the documented contract).** `setSpotLightCandela`↔ `getSpotLightLumens` only round-trips when the cone is unchanged (cone-coupled glTF semantic); `hasLightInfluenceOnBounds` is non-re-entrant (module `scratchSphere`). Are these blessed as the intended (documented) contract, or worth reshaping before they bite a future parallel/inspector path?

10. **Package-map first-class entry (doc revision; the user's gate).** `lighting` is described only in `rust/index.md`'s 3D paragraph, not given its own line in the main `index.md` Package Map. As a now- substantial in-scope 3D package, should it get a first-class Package Map entry alongside `scene`/`mesh`/`camera`/`materials`?
